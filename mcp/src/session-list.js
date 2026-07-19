'use strict';

// Minimal session discovery — finds session log files for Claude Code and
// GitHub Copilot without requiring SQLite or a full index rebuild.

const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');

// ── Claude Code session discovery ────────────────────────────────────────────

function discoverClaudeCodeSessions() {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const sessions = [];
  try {
    for (const d of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const subdir = path.join(projectsDir, d.name);
      try {
        for (const f of fs.readdirSync(subdir)) {
          if (!f.endsWith('.jsonl')) continue;
          const filePath = path.join(subdir, f);
          let stat;
          try { stat = fs.statSync(filePath); } catch { continue; }
          sessions.push({
            session_id: path.basename(f, '.jsonl'),
            agent:      'claude-code',
            file_path:  filePath,
            mtime:      stat.mtime.toISOString(),
            project:    d.name,
          });
        }
      } catch { /* skip unreadable subdir */ }
    }
  } catch { /* projectsDir absent */ }
  return sessions;
}

// ── GitHub Copilot session discovery ─────────────────────────────────────────

function discoverCopilotSessions() {
  const stateDir = path.join(os.homedir(), '.copilot', 'session-state');
  const sessions = [];
  try {
    for (const d of fs.readdirSync(stateDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const eventsPath = path.join(stateDir, d.name, 'events.jsonl');
      let stat;
      try { stat = fs.statSync(eventsPath); } catch { continue; }
      sessions.push({
        session_id: d.name,
        agent:      'github-copilot',
        file_path:  eventsPath,
        mtime:      stat.mtime.toISOString(),
        project:    null,
      });
    }
  } catch { /* stateDir absent */ }
  return sessions;
}

// ── List sessions ─────────────────────────────────────────────────────────────

// Returns sessions sorted by mtime descending (most recent first).
// agent: 'all' | 'claude-code' | 'github-copilot'
// since: ISO timestamp — only sessions with mtime at or after this value
// until: ISO timestamp cursor — only sessions with mtime strictly before this value
function listSessions({ agent = 'all', limit = 50, since, until } = {}) {
  let results = [];
  if (agent === 'all' || agent === 'claude-code') {
    results = results.concat(discoverClaudeCodeSessions());
  }
  if (agent === 'all' || agent === 'github-copilot' || agent === 'copilot') {
    results = results.concat(discoverCopilotSessions());
  }
  results.sort((a, b) => (b.mtime > a.mtime ? 1 : b.mtime < a.mtime ? -1 : 0));
  if (since) results = results.filter(s => s.mtime >= since);
  if (until) results = results.filter(s => s.mtime < until);
  return limit ? results.slice(0, limit) : results;
}

module.exports = { listSessions, discoverClaudeCodeSessions, discoverCopilotSessions };
