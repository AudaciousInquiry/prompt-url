'use strict';
// Prompt search utilities — extracted from server.js so they can be tested
// directly without starting the HTTP server.

const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { listSessions } = require('./session-list.js');

// Harness-injected XML patterns that are NOT human-authored prompts.
const HARNESS_PATTERNS = [
  '<bash-input>', '<bash-stdout>', '<command-name>',
  '<local-command-stdout>', '<system-reminder>',
  'This session is being continued',
];

// Search all session JSONL files for human-authored prompts in a time range.
// Returns results sorted by timestamp descending.
function searchPrompts({ since, until, agent = 'all', limit = 10 } = {}) {
  const sinceMs = since ? new Date(since).getTime() : 0;
  const untilMs = until ? new Date(until).getTime() : Date.now();
  const results = [];

  const sessions = listSessions({ agent, limit: 500 });

  for (const session of sessions) {
    if (!fs.existsSync(session.file_path)) continue;

    let raw;
    try { raw = fs.readFileSync(session.file_path, 'utf8'); } catch { continue; }

    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;

      let entry;
      try { entry = JSON.parse(t); } catch { continue; }

      let result = null;

      if (session.agent === 'claude-code') {
        if (entry.type !== 'user' || entry.message?.role !== 'user') continue;
        if (typeof entry.message?.content !== 'string') continue;
        if (HARNESS_PATTERNS.some(p => entry.message.content.includes(p))) continue;
        const ts = new Date(entry.timestamp).getTime();
        if (isNaN(ts) || ts < sinceMs || ts >= untilMs) continue;
        result = {
          prompt_url: entry.promptId
            ? `prompt://claude-code/${session.session_id}/~${entry.promptId}`
            : `prompt://claude-code/${session.session_id}/${entry.timestamp}`,
          user_message: entry.message.content,
          agent: 'claude-code',
          session_id: session.session_id,
          timestamp: entry.timestamp,
        };
      }

      if (session.agent === 'github-copilot') {
        if (entry.type !== 'user.message') continue;
        const ts = new Date(entry.timestamp).getTime();
        if (isNaN(ts) || ts < sinceMs || ts >= untilMs) continue;
        result = {
          prompt_url: entry.id
            ? `prompt://github-copilot/${session.session_id}/~${entry.id}`
            : `prompt://github-copilot/${session.session_id}/${entry.timestamp}`,
          user_message: entry.data?.content ?? '',
          agent: 'github-copilot',
          session_id: session.session_id,
          timestamp: entry.timestamp,
        };
      }

      if (result) {
        results.push(result);
        if (results.length >= limit) break;
      }
    }

    if (results.length >= limit) break;
  }

  results.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
  return results;
}

// Derive a [since, until] range from a git commit and its predecessor.
function commitToTimeRange(commit, cwd) {
  const opts = { cwd: cwd || process.cwd(), encoding: 'utf8', timeout: 5000 };
  let commitTime;
  try {
    commitTime = execSync(`git log ${commit} --format=%cI -1`, opts).trim();
    if (!commitTime) throw new Error(`commit not found: ${commit}`);
  } catch (err) {
    throw new Error(`git log failed for "${commit}": ${err.message}`);
  }

  let prevTime;
  try {
    prevTime = execSync(`git log ${commit}^ --format=%cI -1`, opts).trim();
  } catch {
    // Initial commit — use 24 h before commit as lower bound.
    prevTime = new Date(new Date(commitTime).getTime() - 86400000).toISOString();
  }

  return { since: prevTime, until: commitTime };
}

module.exports = { searchPrompts, commitToTimeRange, HARNESS_PATTERNS };
