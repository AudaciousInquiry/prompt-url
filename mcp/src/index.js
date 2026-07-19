#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { loadConfig, saveConfig, DEFAULTS } = require('./config.js');
const { getHealth, listTools, callTool } = require('./cli-client.js');

const pkg = require('../package.json');

const doRestart = process.argv.includes('--restart');
const doStdio   = process.argv.includes('--stdio');
const doHelp    = process.argv.includes('--help') || process.argv.includes('-h');

const SUBCOMMANDS = ['health', 'list', 'call', 'init'];
const subcommand  = SUBCOMMANDS.includes(process.argv[2]) ? process.argv[2] : null;

const SERVER = path.join(__dirname, 'server.js');

const HELP_TEXT = `${pkg.name} v${pkg.version}

Usage:
  prompt-url-mcp                      Start the HTTP server (daemon mode)
  prompt-url-mcp --restart            Stop and restart the server
  prompt-url-mcp --stdio              Run MCP server on stdio (for agent registration)
  prompt-url-mcp --help, -h           Show this help

Commands (require the server to be running):
  prompt-url-mcp health               Print /health response as JSON
  prompt-url-mcp list                 List all MCP tools with parameters
  prompt-url-mcp call <tool> [json]   Call a tool and print the result
                                        Use @<path> instead of inline JSON to read
                                        arguments from a file (avoids shell quoting):
                                          prompt-url-mcp call find_prompt @args.json
  prompt-url-mcp init [json]          Configure prompt-url-mcp interactively, or
                                        supply JSON / @<path> to set non-interactively:
                                          prompt-url-mcp init '{"port":7561}'
                                          prompt-url-mcp init @config.json

MCP tools:
  resolve_prompt       Resolve a prompt:// URI to the original user message
  generate_prompt_url  Generate a prompt:// URL for the current session/turn
  find_prompt          Find the prompt that originated a git commit or time range
  list_sessions        List AI agent sessions available on this machine

Agent registration (stdio mode):
  Claude Code:   claude mcp add prompt-url-mcp -- node /path/to/index.js --stdio
  GitHub Copilot: add to .copilot/mcp.json:
    "prompt-url-mcp": { "type": "http", "url": "http://127.0.0.1:${DEFAULTS.port}" }

Config file: ~/.mcp/prompt-url-mcp/config.json  (default port: ${DEFAULTS.port})
`;

// ── init command ─────────────────────────────────────────────────────────────

async function runInit(argJson) {
  // Non-interactive: JSON string or @path provided
  if (argJson) {
    const raw = argJson.startsWith('@') ? fs.readFileSync(argJson.slice(1), 'utf8') : argJson;
    let updates;
    try { updates = JSON.parse(raw); }
    catch (err) { throw new Error(`init arguments must be valid JSON: ${err.message}`); }
    const config = saveConfig(updates);
    console.log('Configuration updated:');
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // Interactive mode
  const current = loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log(`\nprompt-url-mcp configuration (press Enter to keep current value)\n`);

  const portInput = await ask(`  HTTP server port [${current.port}]: `);
  const claudeInput = await ask(`  Claude Code sessions dir [${current.claude_sessions_dir}]: `);
  const copilotInput = await ask(`  GitHub Copilot sessions dir [${current.copilot_sessions_dir}]: `);

  rl.close();

  const updates = {};
  if (portInput.trim()) {
    const p = parseInt(portInput.trim(), 10);
    if (isNaN(p) || p < 1 || p > 65535) throw new Error(`Invalid port: ${portInput.trim()}`);
    updates.port = p;
  }
  if (claudeInput.trim()) updates.claude_sessions_dir = claudeInput.trim();
  if (copilotInput.trim()) updates.copilot_sessions_dir = copilotInput.trim();

  const config = saveConfig(updates);
  console.log('\nConfiguration saved:');
  console.log(JSON.stringify(config, null, 2));
  console.log('\nNext steps:');
  console.log('  Start the server:  prompt-url-mcp');
  console.log(`  Register (stdio):  claude mcp add prompt-url-mcp -- node ${__filename} --stdio`);
  console.log(`  Register (HTTP):   add to .copilot/mcp.json:`);
  console.log(`    "prompt-url-mcp": { "type": "http", "url": "http://127.0.0.1:${config.port}" }`);
}

// ── CLI subcommands ───────────────────────────────────────────────────────────

async function runSubcommand(subcommand, port) {
  if (subcommand === 'health') {
    const health = await getHealth(port);
    console.log(JSON.stringify(health, null, 2));
    return;
  }

  if (subcommand === 'list') {
    const tools = await listTools(port);
    for (const t of tools) {
      console.log(`${t.name}${t.description ? ' \u2014 ' + t.description : ''}`);
      for (const p of t.parameters) {
        const req = p.required ? 'required' : 'optional';
        const desc = p.description ? ` \u2014 ${p.description}` : '';
        console.log(`    ${p.name} (${p.type}, ${req})${desc}`);
      }
      console.log('');
    }
    return;
  }

  if (subcommand === 'call') {
    const toolName = process.argv[3];
    const argsJson  = process.argv[4];
    if (!toolName) {
      console.error('usage: prompt-url-mcp call <tool> [json-args | @path]');
      process.exit(1);
    }
    const result = await callTool(port, toolName, argsJson);
    console.log(result.text);
    if (result.isError) process.exitCode = 1;
    return;
  }

  if (subcommand === 'init') {
    await runInit(process.argv[3]);
    return;
  }
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

function healthCheck(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/health`, res => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function killAndWait(pid, timeoutMs = 10000) {
  try { process.kill(pid, 'SIGTERM'); } catch { return; }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    try { process.kill(pid, 0); } catch { return; }
  }
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}

async function ensureServerRunning(config) {
  const { port, pid_path: pidPath } = config;

  if (fs.existsSync(pidPath)) {
    const raw = fs.readFileSync(pidPath, 'utf8').trim();
    const existingPid = parseInt(raw, 10);
    if (!isNaN(existingPid)) {
      try {
        process.kill(existingPid, 0);
        if (doRestart) {
          console.log(`prompt-url-mcp stopping PID ${existingPid}...`);
          await killAndWait(existingPid);
          try { fs.unlinkSync(pidPath); } catch { /* removed by server */ }
          console.log('stopped, starting new version...');
        } else {
          return 'already-running';
        }
      } catch {
        fs.unlinkSync(pidPath);
      }
    }
  }

  if (await healthCheck(port)) {
    if (doRestart) {
      throw new Error('server is running but no PID file found — stop it manually before restarting');
    }
    return 'already-running';
  }

  const child = spawn(process.execPath, [SERVER], {
    detached: true,
    stdio: 'ignore',
  });

  const POLL_MS = 200;
  const TIMEOUT_MS = 10000;
  const deadline = Date.now() + TIMEOUT_MS;

  await new Promise((resolve, reject) => {
    let exited = false;
    child.on('exit', code => {
      exited = true;
      reject(new Error(`server process exited prematurely (code ${code})`));
    });
    async function poll() {
      if (exited) return;
      if (await healthCheck(port)) { child.unref(); resolve(); return; }
      if (Date.now() >= deadline) {
        child.kill();
        reject(new Error(`server did not become healthy within ${TIMEOUT_MS}ms`));
        return;
      }
      setTimeout(poll, POLL_MS);
    }
    poll();
  });

  console.log(`prompt-url-mcp server started (PID ${child.pid})`);
  return 'started';
}

// ── stdio mode ────────────────────────────────────────────────────────────────

async function runStdio() {
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { registerTools } = require('./server.js');

  const server = new McpServer({ name: pkg.name, version: pkg.version });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive until the transport closes
  await new Promise(resolve => transport.onclose = resolve);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (doHelp) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (subcommand === 'init') {
    await runInit(process.argv[3]);
    return;
  }

  if (subcommand) {
    const config = loadConfig();
    await runSubcommand(subcommand, config.port);
    return;
  }

  if (doStdio) {
    await runStdio();
    return;
  }

  const config = loadConfig();
  const result = await ensureServerRunning(config);
  if (result === 'already-running') {
    console.log(`prompt-url-mcp already running on port ${config.port}, nothing to do`);
  }
}

main().catch(err => {
  console.error(`prompt-url-mcp error: ${err.message}`);
  process.exit(1);
});
