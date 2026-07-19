'use strict';

const fs = require('node:fs');
const http = require('node:http');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const pkg = require('../package.json');

function notRunningError(port) {
  return new Error(
    `prompt-url-mcp is not reachable on port ${port}. Start it first with "prompt-url-mcp" (no arguments).`
  );
}

async function getHealth(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`health endpoint returned status ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(new Error(`health endpoint returned invalid JSON: ${err.message}`)); }
      });
    });
    req.setTimeout(2000, () => { req.destroy(); reject(notRunningError(port)); });
    req.on('error', () => reject(notRunningError(port)));
  });
}

// Flatten a tool's JSON-Schema inputSchema into a simple parameter list for display.
function describeParameters(inputSchema) {
  if (!inputSchema || !inputSchema.properties) return [];
  const required = new Set(inputSchema.required || []);
  return Object.entries(inputSchema.properties).map(([name, schema]) => {
    let type = schema.type || 'any';
    if (Array.isArray(schema.enum)) type = `enum(${schema.enum.join('|')})`;
    else if (type === 'array' && schema.items?.type) type = `${schema.items.type}[]`;
    return {
      name,
      type,
      required: required.has(name),
      description: schema.description || '',
    };
  });
}

async function connectClient(port) {
  const client = new Client({ name: 'prompt-url-mcp-cli', version: pkg.version });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/`));
  try {
    await client.connect(transport);
  } catch {
    throw notRunningError(port);
  }
  return client;
}

async function listTools(port) {
  const client = await connectClient(port);
  try {
    const { tools } = await client.listTools();
    return tools.map(t => ({
      name: t.name,
      description: t.description || '',
      parameters: describeParameters(t.inputSchema),
    }));
  } finally {
    await client.close();
  }
}

async function callTool(port, name, argsJson) {
  let args = {};
  if (argsJson) {
    // @<path> reads arguments from a file — avoids shell quoting issues on Windows.
    const raw = argsJson.startsWith('@') ? fs.readFileSync(argsJson.slice(1), 'utf8') : argsJson;
    try { args = JSON.parse(raw); }
    catch (err) { throw new Error(`arguments must be valid JSON: ${err.message}`); }
  }

  const client = await connectClient(port);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content || [])
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
    return { text, isError: !!result.isError };
  } finally {
    await client.close();
  }
}

module.exports = { getHealth, listTools, callTool };
