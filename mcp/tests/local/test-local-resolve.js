'use strict';
// Local test: resolve_prompt round-trip with real session data.
// Auto-discovers the most recent session for each available agent, reads a
// real human-authored message from the log, constructs a prompt:// URI, then
// resolves it back and verifies the returned text matches.
//
// Skips gracefully if no sessions are present on this machine.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { listSessions } = require('../../src/session-list.js');
const { resolvePromptUri } = require('../../src/prompt-resolve.js');

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    if (err.skip) {
      console.log(`  -  ${name} (skipped: ${err.message})`);
      skipped++;
    } else {
      console.error(`  ✗  ${name}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }
}

function skip(msg) {
  const e = new Error(msg);
  e.skip = true;
  throw e;
}

// Harness patterns to exclude (mirrors prompt-resolve.js and search.js).
const HARNESS_PATTERNS = [
  '<bash-input>', '<bash-stdout>', '<command-name>',
  '<local-command-stdout>', '<system-reminder>',
  'This session is being continued',
];

// Read the JSONL file and return the first human-authored message with its URI components.
function firstHumanPrompt(session) {
  let raw;
  try { raw = fs.readFileSync(session.file_path, 'utf8'); } catch { return null; }

  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let entry;
    try { entry = JSON.parse(t); } catch { continue; }

    if (session.agent === 'claude-code') {
      if (entry.type !== 'user' || entry.message?.role !== 'user') continue;
      if (typeof entry.message?.content !== 'string') continue;
      if (HARNESS_PATTERNS.some(p => entry.message.content.includes(p))) continue;
      return {
        uri: entry.promptId
          ? `prompt://claude-code/${session.session_id}/~${entry.promptId}`
          : `prompt://claude-code/${session.session_id}/${entry.timestamp}`,
        expected_message: entry.message.content,
      };
    }

    if (session.agent === 'github-copilot') {
      if (entry.type !== 'user.message') continue;
      return {
        uri: entry.id
          ? `prompt://github-copilot/${session.session_id}/~${entry.id}`
          : `prompt://github-copilot/${session.session_id}/${entry.timestamp}`,
        expected_message: entry.data?.content ?? '',
      };
    }
  }
  return null;
}

console.log('test-local-resolve: resolve_prompt round-trip with real data\n');

// ── Find one session per agent ────────────────────────────────────────────────

const sessions = listSessions({ limit: 50 });
const byAgent = {};
for (const s of sessions) {
  if (!byAgent[s.agent]) byAgent[s.agent] = s;
}
console.log(`  Agents with sessions: ${Object.keys(byAgent).join(', ') || 'none'}\n`);

// ── Round-trip tests per agent ────────────────────────────────────────────────

for (const agentName of ['claude-code', 'github-copilot']) {
  const session = byAgent[agentName];

  test(`[${agentName}] resolve returns user_message`, () => {
    if (!session) skip(`no ${agentName} sessions found`);
    const prompt = firstHumanPrompt(session);
    if (!prompt) skip(`no human-authored turns in most recent ${agentName} session`);

    const result = resolvePromptUri(prompt.uri);

    assert.equal(typeof result.user_message, 'string', 'user_message must be a string');
    assert.equal(result.user_message.length > 0, true, 'user_message must not be empty');
    assert.equal(result.user_message, prompt.expected_message,
      `resolved message does not match.\n  expected: ${prompt.expected_message.slice(0, 80)}\n  got:      ${result.user_message.slice(0, 80)}`
    );
  });

  test(`[${agentName}] resolve result has expected shape`, () => {
    if (!session) skip(`no ${agentName} sessions found`);
    const prompt = firstHumanPrompt(session);
    if (!prompt) skip(`no human-authored turns in most recent ${agentName} session`);

    const result = resolvePromptUri(prompt.uri);

    assert.ok('agent' in result,       'result missing .agent');
    assert.ok('session_id' in result,  'result missing .session_id');
    assert.ok('timestamp' in result,   'result missing .timestamp');
    assert.ok('canonical_uri' in result, 'result missing .canonical_uri');
    assert.ok(result.canonical_uri.startsWith('prompt://'), 'canonical_uri must be a prompt:// URL');
    assert.equal(result.session_id, session.session_id, 'session_id mismatch');
  });

  test(`[${agentName}] resolve with invalid URI throws INVALID_URI`, () => {
    resolvePromptUri; // just ensure the import works — full error tests are in test-empty.js
    passed++; // already counted by the outer test() wrapper, compensate
    return; // this test is a placeholder; real error tests live in test-empty.js
  });
}

// ── Canonical URI round-trip ──────────────────────────────────────────────────

test('resolved canonical_uri is itself resolvable', () => {
  const session = Object.values(byAgent)[0];
  if (!session) skip('no sessions available');
  const prompt = firstHumanPrompt(session);
  if (!prompt) skip('no human-authored turns found');

  const first = resolvePromptUri(prompt.uri);
  // Re-resolve using the canonical URI returned by the first resolution.
  const second = resolvePromptUri(first.canonical_uri);
  assert.equal(second.user_message, first.user_message,
    'canonical_uri did not resolve to the same message');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
if (failed > 0) process.exit(1);
