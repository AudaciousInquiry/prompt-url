'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── URI parsing ───────────────────────────────────────────────────────────────

// Parse a prompt:// URI into { agent, sessionId, promptRef, isPromptId }.
// Throws { code: 'INVALID_URI' } on malformed input.
function parsePromptUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('prompt://')) {
    throw Object.assign(new Error(`Not a prompt:// URI: ${uri}`), { code: 'INVALID_URI' });
  }
  // body = <agent>/<session-id>/<prompt-ref>
  const body = uri.slice('prompt://'.length);
  const firstSlash  = body.indexOf('/');
  if (firstSlash === -1) throw Object.assign(new Error(`Malformed prompt:// URI (no session-id): ${uri}`), { code: 'INVALID_URI' });
  const agent = body.slice(0, firstSlash);
  const rest  = body.slice(firstSlash + 1);
  const secondSlash = rest.indexOf('/');
  if (secondSlash === -1) throw Object.assign(new Error(`Malformed prompt:// URI (no prompt-ref): ${uri}`), { code: 'INVALID_URI' });
  const sessionId = rest.slice(0, secondSlash);
  const promptRef = rest.slice(secondSlash + 1);
  if (!agent || !sessionId || !promptRef) {
    throw Object.assign(new Error(`Malformed prompt:// URI (empty component): ${uri}`), { code: 'INVALID_URI' });
  }
  return { agent, sessionId, promptRef, isPromptId: promptRef.startsWith('~') };
}

// ── JSONL helpers ─────────────────────────────────────────────────────────────

function readJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const entries = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { entries.push(JSON.parse(t)); } catch { /* skip malformed lines */ }
  }
  return entries;
}

// Known harness-injected XML patterns (community-documented via claude-code-log).
// Entries whose string content contains any of these are NOT kind:"human".
// isMeta:true (slash-command expansions) is intentionally NOT excluded — a
// slash command can generate .md files and must be traceable to its prompt.
const HARNESS_PATTERNS = [
  '<bash-input>',
  '<bash-stdout>',
  '<bash-stderr>',
  '<command-name>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  '<local-command-caveat>',
  '<task-notification>',
  '<user-memory-input>',
  '<system-reminder>',
  'This session is being continued from a previous conversation', // compacted summary
];

// Best-effort kind:"human" using community-documented harness-pattern exclusion.
// Use kind:"human" directly once the Claude Code JSONL format provides it.
function isHumanTurn(entry) {
  if (entry.type !== 'user') return false;
  if (entry.message?.role !== 'user') return false;
  if (typeof entry.message?.content !== 'string') return false;
  return !HARNESS_PATTERNS.some(p => entry.message.content.includes(p));
}

// Walk parentUuid chain from startEntry until a human-authored turn is found.
function walkToHuman(startEntry, entryMap) {
  let current = startEntry;
  const visited = new Set();
  while (current) {
    if (isHumanTurn(current)) return current;
    const next = current.parentUuid;
    if (!next || visited.has(next)) break;
    visited.add(next);
    current = entryMap.get(next);
  }
  return null;
}

// ── Claude Code backend ───────────────────────────────────────────────────────

function resolveClaudeCode(sessionId, promptRef, isPromptId) {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  let jsonlPath = null;

  try {
    for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(projectsDir, entry.name, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) { jsonlPath = candidate; break; }
    }
  } catch { /* projectsDir absent */ }

  if (!jsonlPath) {
    throw Object.assign(
      new Error(`No Claude Code session log for session: ${sessionId}`),
      { code: 'SESSION_NOT_FOUND' }
    );
  }

  const entries = readJsonl(jsonlPath);
  const entryMap = new Map(entries.filter(e => e.uuid).map(e => [e.uuid, e]));

  let candidates;

  if (isPromptId) {
    const rawId = decodeURIComponent(promptRef.slice(1));
    candidates = entries.filter(e => e.promptId === rawId);
    if (candidates.length === 0) {
      throw Object.assign(new Error(`No entry with promptId: ${rawId}`), { code: 'UNRESOLVABLE' });
    }
  } else {
    const target = new Date(promptRef).getTime();
    if (isNaN(target)) {
      throw Object.assign(new Error(`Invalid timestamp in URI: ${promptRef}`), { code: 'INVALID_URI' });
    }
    candidates = entries.filter(e => {
      if (!e.timestamp) return false;
      return Math.abs(new Date(e.timestamp).getTime() - target) <= 1000;
    });
  }

  const humanCandidates = candidates.filter(isHumanTurn);

  let resolved;
  if (humanCandidates.length === 1) {
    resolved = humanCandidates[0];
  } else if (humanCandidates.length > 1) {
    throw Object.assign(new Error('Multiple human turns within resolution window'), { code: 'AMBIGUOUS' });
  } else if (candidates.length > 0) {
    // No human turn directly in window — walk parentUuid from the closest non-human entry.
    const target = isPromptId ? null : new Date(promptRef).getTime();
    const base = isPromptId
      ? candidates[0]
      : candidates.reduce((a, b) =>
          Math.abs(new Date(a.timestamp).getTime() - target) <=
          Math.abs(new Date(b.timestamp).getTime() - target) ? a : b
        );
    resolved = walkToHuman(base, entryMap);
    if (!resolved) {
      throw Object.assign(new Error('Could not reach a human-authored turn via parentUuid'), { code: 'UNRESOLVABLE' });
    }
  } else {
    throw Object.assign(new Error('No entries within ±1000 ms resolution window'), { code: 'UNRESOLVABLE' });
  }

  return {
    user_message: resolved.message.content,
    agent: 'claude-code',
    session_id: sessionId,
    timestamp: resolved.timestamp,
    canonical_uri: resolved.promptId
      ? `prompt://claude-code/${sessionId}/~${resolved.promptId}`
      : `prompt://claude-code/${sessionId}/${resolved.timestamp}`,
    source: 'claude-code',
  };
}

// ── Copilot backend ───────────────────────────────────────────────────────────

function resolveCopilot(sessionId, promptRef, isPromptId) {
  const home = os.homedir();
  const eventsPath = path.join(home, '.copilot', 'session-state', sessionId, 'events.jsonl');
  const dbPath     = path.join(home, '.copilot', 'session-store.db');

  const hasEvents = fs.existsSync(eventsPath);
  const hasDb     = !hasEvents && fs.existsSync(dbPath);

  if (!hasEvents && !hasDb) {
    throw Object.assign(
      new Error(`No Copilot session log for session: ${sessionId}`),
      { code: 'SESSION_NOT_FOUND' }
    );
  }

  if (hasEvents) {
    const entries = readJsonl(eventsPath);
    let candidates;

    if (isPromptId) {
      const rawId = decodeURIComponent(promptRef.slice(1));
      candidates = entries.filter(e => e.type === 'user.message' && e.id === rawId);
    } else {
      const target = new Date(promptRef).getTime();
      if (isNaN(target)) {
        throw Object.assign(new Error(`Invalid timestamp in URI: ${promptRef}`), { code: 'INVALID_URI' });
      }
      candidates = entries.filter(e =>
        e.type === 'user.message' &&
        Math.abs(new Date(e.timestamp).getTime() - target) <= 1000
      );
    }

    if (candidates.length === 0) throw Object.assign(new Error('No user.message event within window'), { code: 'UNRESOLVABLE' });
    if (candidates.length  > 1) throw Object.assign(new Error('Multiple user.message events within window'), { code: 'AMBIGUOUS' });

    const ev = candidates[0];
    return {
      user_message: ev.data?.content ?? '',
      agent: 'github-copilot',
      session_id: sessionId,
      timestamp: ev.timestamp,
      canonical_uri: `prompt://github-copilot/${sessionId}/~${ev.id}`,
      source: 'copilot',
    };
  }

  // Fallback: session-store.db — timestamp-form only (no event-level IDs available).
  if (isPromptId) {
    throw Object.assign(
      new Error('Prompt-id form cannot be resolved via session-store.db fallback (events.jsonl absent)'),
      { code: 'UNRESOLVABLE' }
    );
  }
  const target = promptRef;
  const Database = require('better-sqlite3');
  let db;
  try { db = new Database(dbPath, { readonly: true }); }
  catch (err) {
    throw Object.assign(new Error(`Cannot open session-store.db: ${err.message}`), { code: 'SESSION_NOT_FOUND' });
  }
  try {
    const row = db.prepare(`
      SELECT user_message, timestamp FROM turns
      WHERE session_id = ?
      ORDER BY ABS(julianday(timestamp) - julianday(?))
      LIMIT 1
    `).get(sessionId, target);

    if (!row) {
      throw Object.assign(new Error(`No turns in session-store.db for session: ${sessionId}`), { code: 'SESSION_NOT_FOUND' });
    }
    if (Math.abs(new Date(row.timestamp).getTime() - new Date(target).getTime()) > 1000) {
      throw Object.assign(new Error('Nearest turn in session-store.db is outside ±1000 ms window'), { code: 'UNRESOLVABLE' });
    }
    return {
      user_message: row.user_message,
      agent: 'github-copilot',
      session_id: sessionId,
      timestamp: row.timestamp,
      canonical_uri: `prompt://github-copilot/${sessionId}/${row.timestamp}`,
      source: 'copilot',
    };
  } finally {
    db.close();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

function resolvePromptUri(uri) {
  const { agent, sessionId, promptRef, isPromptId } = parsePromptUri(uri);
  switch (agent) {
    case 'claude-code':                return resolveClaudeCode(sessionId, promptRef, isPromptId);
    case 'github-copilot': case 'copilot': return resolveCopilot(sessionId, promptRef, isPromptId);
    default: throw Object.assign(new Error(`Unknown agent: ${agent}`), { code: 'UNKNOWN_AGENT' });
  }
}

module.exports = { parsePromptUri, resolvePromptUri };
