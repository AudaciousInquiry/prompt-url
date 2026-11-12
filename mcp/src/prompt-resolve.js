'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── URI parsing ───────────────────────────────────────────────────────────────

/**
 * Parse a prompt URI into its components.
 *
 * Supports two forms:
 *   Local-only:  prompt:/<agent>/<session-ref>/<prompt-ref>
 *   Remote:      prompt://[username@]host[:port]/<agent>/<session-ref>/<prompt-ref>
 *
 * Returns:
 *   {
 *     isRemote,         // boolean
 *     host,             // string|null   — DNS name or IP from authority
 *     port,             // number|null   — explicit port, or null (default 7560)
 *     username,         // string|null   — userinfo from authority
 *     agent,            // string
 *     sessionId,        // string
 *     promptRef,        // string
 *     isPromptId,       // boolean       — true when promptRef starts with '~'
 *   }
 *
 * Throws { code: 'INVALID_URI' } on malformed input.
 */
function parsePromptUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('prompt:')) {
    throw Object.assign(new Error(`Not a prompt: URI: ${uri}`), { code: 'INVALID_URI' });
  }

  let isRemote = false;
  let host = null;
  let port = null;
  let username = null;
  let pathPart;  // the part after the authority (or after "prompt:/")

  if (uri.startsWith('prompt://')) {
    // Remote form: prompt://[user@]host[:port]/agent/session/ref
    isRemote = true;
    const afterScheme = uri.slice('prompt://'.length); // "[user@]host[:port]/agent/..."
    const slashIdx = afterScheme.indexOf('/');
    if (slashIdx === -1) {
      throw Object.assign(new Error(`Malformed remote prompt URI (no path): ${uri}`), { code: 'INVALID_URI' });
    }
    const authorityStr = afterScheme.slice(0, slashIdx);
    pathPart = afterScheme.slice(slashIdx + 1); // "agent/session/ref"

    if (!authorityStr) {
      throw Object.assign(new Error(`Malformed remote prompt URI (empty authority): ${uri}`), { code: 'INVALID_URI' });
    }

    // Split userinfo from host[:port]
    const atIdx = authorityStr.indexOf('@');
    const hostPort = atIdx === -1 ? authorityStr : authorityStr.slice(atIdx + 1);
    if (atIdx !== -1) {
      username = decodeURIComponent(authorityStr.slice(0, atIdx));
      if (!username) {
        throw Object.assign(new Error(`Empty username in prompt URI: ${uri}`), { code: 'INVALID_URI' });
      }
    }

    // Split host from port
    // Handle IPv6 literals: [::1]:port
    const ipv6Match = hostPort.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (ipv6Match) {
      host = ipv6Match[1];
      port = ipv6Match[2] ? parseInt(ipv6Match[2], 10) : null;
    } else {
      const colonIdx = hostPort.lastIndexOf(':');
      if (colonIdx !== -1) {
        const maybePort = hostPort.slice(colonIdx + 1);
        if (/^\d+$/.test(maybePort)) {
          host = hostPort.slice(0, colonIdx);
          port = parseInt(maybePort, 10);
        } else {
          host = hostPort;
        }
      } else {
        host = hostPort;
      }
    }

    if (!host) {
      throw Object.assign(new Error(`Empty host in prompt URI: ${uri}`), { code: 'INVALID_URI' });
    }
  } else if (uri.startsWith('prompt:/')) {
    // Local form: prompt:/agent/session/ref
    isRemote = false;
    pathPart = uri.slice('prompt:/'.length); // "agent/session/ref"
  } else {
    throw Object.assign(new Error(`Malformed prompt URI (unrecognised hier-part): ${uri}`), { code: 'INVALID_URI' });
  }

  // pathPart = "agent/session/ref"
  const parts = pathPart.split('/');
  if (parts.length < 3) {
    throw Object.assign(new Error(`Malformed prompt URI (expected agent/session/ref in path): ${uri}`), { code: 'INVALID_URI' });
  }
  const agent     = decodeURIComponent(parts[0]);
  const sessionId = decodeURIComponent(parts[1]);
  const promptRef = parts.slice(2).join('/'); // allow slashes inside prompt-ref if ever needed

  if (!agent || !sessionId || !promptRef) {
    throw Object.assign(new Error(`Malformed prompt URI (empty path component): ${uri}`), { code: 'INVALID_URI' });
  }

  return { isRemote, host, port, username, agent, sessionId, promptRef, isPromptId: promptRef.startsWith('~') };
}

// ── Authority validation ──────────────────────────────────────────────────────

/**
 * For a remote URI, validate that the host and username (if present) match
 * this machine's hostname and current OS user.  Throws if they do not.
 *
 * The spec (Section 4.1) says the host identifies the machine where the agent
 * client application stores its session logs — i.e. this machine.  If it
 * identifies a different machine the resolver cannot fulfil the request.
 */
function validateAuthority({ isRemote, host, username }) {
  if (!isRemote) return; // local form — no authority to validate

  const localHostname = os.hostname();
  if (host.toLowerCase() !== localHostname.toLowerCase()) {
    throw Object.assign(
      new Error(
        `URI host "${host}" does not match this machine's hostname "${localHostname}". ` +
        `Remote prompt URIs can only be resolved on the machine they were generated on.`
      ),
      { code: 'WRONG_HOST' }
    );
  }

  if (username !== null) {
    const localUser = os.userInfo().username;
    if (username.toLowerCase() !== localUser.toLowerCase()) {
      throw Object.assign(
        new Error(
          `URI username "${username}" does not match the current OS user "${localUser}". ` +
          `Prompt URIs with a username can only be resolved by that user.`
        ),
        { code: 'WRONG_USER' }
      );
    }
  }
}

// ── Canonical URI builder ─────────────────────────────────────────────────────

/**
 * Build a canonical prompt URI in the same resolution form (local or remote)
 * as the original URI that was resolved.
 */
function makeCanonicalUri({ isRemote, host, port, username }, agent, sessionId, ref) {
  if (!isRemote) {
    return `prompt:/${agent}/${sessionId}/${ref}`;
  }
  const userPart = username ? `${encodeURIComponent(username)}@` : '';
  const portPart = (port !== null && port !== 7560) ? `:${port}` : '';
  return `prompt://${userPart}${host}${portPart}/${agent}/${sessionId}/${ref}`;
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

function resolveClaudeCode(authority, sessionId, promptRef, isPromptId) {
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

  const canonicalRef = resolved.promptId ? `~${resolved.promptId}` : resolved.timestamp;
  return {
    user_message: resolved.message.content,
    agent: 'claude-code',
    session_id: sessionId,
    timestamp: resolved.timestamp,
    canonical_uri: makeCanonicalUri(authority, 'claude-code', sessionId, canonicalRef),
    source: 'claude-code',
  };
}

// ── Copilot backend ───────────────────────────────────────────────────────────

function resolveCopilot(authority, sessionId, promptRef, isPromptId) {
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
      canonical_uri: makeCanonicalUri(authority, 'github-copilot', sessionId, `~${ev.id}`),
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
      canonical_uri: makeCanonicalUri(authority, 'github-copilot', sessionId, row.timestamp),
      source: 'copilot',
    };
  } finally {
    db.close();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

function resolvePromptUri(uri) {
  const parsed = parsePromptUri(uri);
  validateAuthority(parsed);
  const { agent, sessionId, promptRef, isPromptId } = parsed;

  // authority shape passed to backends so canonical_uri mirrors the input form
  const authority = {
    isRemote: parsed.isRemote,
    host:     parsed.host,
    port:     parsed.port,
    username: parsed.username,
  };

  switch (agent) {
    case 'claude-code':
      return resolveClaudeCode(authority, sessionId, promptRef, isPromptId);
    case 'github-copilot':
    case 'copilot':
      return resolveCopilot(authority, sessionId, promptRef, isPromptId);
    default:
      throw Object.assign(new Error(`Unknown agent: ${agent}`), { code: 'UNKNOWN_AGENT' });
  }
}

module.exports = { parsePromptUri, resolvePromptUri };
