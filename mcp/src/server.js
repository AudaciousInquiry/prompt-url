'use strict';

const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { loadConfig } = require('./config.js');
const { resolvePromptUri } = require('./prompt-resolve.js');
const { listSessions } = require('./session-list.js');
const { searchPrompts, commitToTimeRange } = require('./search.js');

const HOST = '127.0.0.1';

// ── Tool registration ────────────────────────────────────────────────────────

function registerTools(mcpServer) {
  mcpServer.tool(
    'resolve_prompt',
    'Resolve a prompt:// URI to the original user message that caused an AI-generated artifact.',
    {
      uri: z.string().min(1).describe(
        'prompt:// URI to resolve, e.g. prompt://claude-code/<session-id>/~<promptId> ' +
        'or prompt://github-copilot/<session-id>/<timestamp>'
      ),
    },
    async ({ uri }) => {
      try {
        const result = resolvePromptUri(uri);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  mcpServer.tool(
    'generate_prompt_url',
    'Generate a prompt:// URL for a specific agent session and turn. ' +
    'Use when creating artifacts, commits, or metadata that should carry prompt provenance.',
    {
      agent: z.enum(['claude-code', 'github-copilot']).describe('Agent name'),
      session_id: z.string().min(1).describe('Session UUID'),
      prompt_ref: z.string().optional().describe(
        'Prompt reference: ~<promptId> (canonical form, preferred) or RFC 3339 timestamp (fallback). ' +
        'Omit to use the current UTC timestamp.'
      ),
    },
    async ({ agent, session_id, prompt_ref }) => {
      const ref = prompt_ref || new Date().toISOString();
      const url = `prompt://${agent}/${session_id}/${ref}`;
      return { content: [{ type: 'text', text: url }] };
    }
  );

  mcpServer.tool(
    'find_prompt',
    'Find the AI agent prompt(s) that originated a piece of work, by searching session logs ' +
    'within a time range. Provide a git commit hash to automatically derive the range, or ' +
    'supply explicit since/until timestamps.',
    {
      commit: z.string().optional().describe(
        'Git commit hash (short or full). When provided, the time range is derived from this ' +
        'commit timestamp and its predecessor. Requires git to be available in PATH.'
      ),
      cwd: z.string().optional().describe(
        'Working directory for git commands (defaults to process.cwd()). Only used with commit.'
      ),
      since: z.string().optional().describe(
        'RFC 3339 start timestamp (inclusive). Used when commit is not provided.'
      ),
      until: z.string().optional().describe(
        'RFC 3339 end timestamp (exclusive). Used when commit is not provided.'
      ),
      agent: z.enum(['all', 'claude-code', 'github-copilot']).optional().default('all')
        .describe('Restrict search to a specific agent.'),
      limit: z.number().int().positive().optional().default(10)
        .describe('Maximum number of results to return.'),
    },
    async ({ commit, cwd, since, until, agent, limit }) => {
      try {
        let sinceTime = since;
        let untilTime = until;

        if (commit) {
          const range = commitToTimeRange(commit, cwd);
          sinceTime = range.since;
          untilTime = range.until;
        }

        if (!sinceTime && !untilTime) {
          return {
            content: [{ type: 'text', text: 'Provide either a commit hash or a since/until time range.' }],
            isError: true,
          };
        }

        const results = searchPrompts({ since: sinceTime, until: untilTime, agent, limit });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ count: results.length, since: sinceTime, until: untilTime, results }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  mcpServer.tool(
    'list_sessions',
    'List AI agent session logs available on this machine, sorted by last-modified time ' +
    'descending. Use since/until with limit to paginate: set until to the mtime of the ' +
    'last session from the previous page to retrieve the next page.',
    {
      agent: z.enum(['all', 'claude-code', 'github-copilot']).optional().default('all')
        .describe('Filter to a specific agent.'),
      limit: z.number().int().positive().optional().default(20)
        .describe('Maximum number of sessions to return.'),
      since: z.string().optional().describe(
        'ISO timestamp — only sessions with mtime at or after this value are returned.'
      ),
      until: z.string().optional().describe(
        'ISO timestamp cursor for pagination. Only sessions with mtime strictly before ' +
        'this value are returned. Set to the mtime of the last session from the previous page.'
      ),
    },
    async ({ agent, limit, since, until }) => {
      try {
        const sessions = listSessions({ agent: agent || 'all', limit: limit || 20, since, until });
        return { content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}

// ── HTTP server ──────────────────────────────────────────────────────────────

async function startServer() {
  const config = loadConfig();
  const { port, pid_path: pidPath } = config;
  const pkg = require('../package.json');

  if (fs.existsSync(pidPath)) {
    const raw = fs.readFileSync(pidPath, 'utf8').trim();
    const existingPid = parseInt(raw, 10);
    if (!isNaN(existingPid)) {
      try {
        process.kill(existingPid, 0);
        console.log(`prompt-url-mcp already running on port ${port} (PID ${existingPid}), nothing to do`);
        process.exit(0);
      } catch {
        fs.unlinkSync(pidPath);
      }
    }
  }

  const sessions = new Map();
  const startTime = Date.now();
  const activeConnections = new Set();

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        server: pkg.name,
        version: pkg.version,
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
        active_sessions: sessions.size,
      }));
      return;
    }

    if (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE') {
      let rawBody = '';
      req.on('data', chunk => { rawBody += chunk; });
      req.on('end', async () => {
        let parsedBody;
        if (rawBody) {
          try { parsedBody = JSON.parse(rawBody); } catch { /* let transport reject */ }
        }

        const sessionId = req.headers['mcp-session-id'];

        try {
          if (sessionId && sessions.has(sessionId)) {
            await sessions.get(sessionId).handleRequest(req, res, parsedBody);
          } else if (!sessionId && req.method === 'POST') {
            const sessionServer = new McpServer({ name: pkg.name, version: pkg.version });
            registerTools(sessionServer);
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
              onsessioninitialized: (id) => sessions.set(id, transport),
            });
            transport.onclose = () => {
              if (transport.sessionId) sessions.delete(transport.sessionId);
            };
            await sessionServer.connect(transport);
            await transport.handleRequest(req, res, parsedBody);
          } else if (sessionId) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session not found' }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing mcp-session-id header' }));
          }
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  httpServer.on('connection', socket => {
    activeConnections.add(socket);
    socket.on('close', () => activeConnections.delete(socket));
  });

  httpServer.on('error', async err => {
    if (err.code === 'EADDRINUSE') {
      try {
        const body = await new Promise((resolve, reject) => {
          const req = http.get(`http://${HOST}:${port}/health`, { timeout: 2000 }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        const json = JSON.parse(body);
        if (json.status === 'ok' && json.server === pkg.name) {
          console.log(`prompt-url-mcp already running on port ${port}, nothing to do`);
          process.exit(0);
        }
        throw new Error(`unexpected occupant: ${body}`);
      } catch (healthErr) {
        console.error(`Port ${port} is in use by another process: ${healthErr.message}`);
        process.exit(1);
      }
    } else {
      console.error('HTTP server error:', err);
      process.exit(1);
    }
  });

  await new Promise(resolve => {
    httpServer.listen(port, HOST, () => {
      fs.writeFileSync(pidPath, String(process.pid), 'utf8');
      console.log(`prompt-url-mcp listening on http://${HOST}:${port}`);
      resolve();
    });
  });

  function shutdown(signal) {
    console.log(`\nprompt-url-mcp received ${signal}, shutting down...`);
    for (const socket of activeConnections) socket.destroy();
    httpServer.close(() => {
      try { fs.unlinkSync(pidPath); } catch { /* ignore */ }
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { startServer, registerTools };
