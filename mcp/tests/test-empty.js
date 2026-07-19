'use strict';
// Tests for graceful no-data behavior.
// Verifies that resolve and session-list functions fail safely when no session
// logs are present — exactly the condition in a fresh CI environment.

const assert = require('node:assert/strict');
const { resolvePromptUri } = require('../src/prompt-resolve.js');
const { listSessions } = require('../src/session-list.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log('test-empty: graceful behavior on an empty machine\n');

// ── listSessions ─────────────────────────────────────────────────────────────

test('listSessions() returns an array (does not throw)', () => {
  const sessions = listSessions();
  assert.ok(Array.isArray(sessions), 'expected an array');
});

test('listSessions({ agent: "claude-code" }) returns an array', () => {
  const sessions = listSessions({ agent: 'claude-code' });
  assert.ok(Array.isArray(sessions));
});

test('listSessions({ agent: "github-copilot" }) returns an array', () => {
  const sessions = listSessions({ agent: 'github-copilot' });
  assert.ok(Array.isArray(sessions));
});

test('listSessions with since/until filter returns an array', () => {
  const sessions = listSessions({
    since: '2020-01-01T00:00:00.000Z',
    until: '2020-01-02T00:00:00.000Z',
  });
  assert.ok(Array.isArray(sessions));
});

test('listSessions with limit returns at most limit results', () => {
  const sessions = listSessions({ limit: 3 });
  assert.ok(sessions.length <= 3);
});

// ── resolvePromptUri: error codes ────────────────────────────────────────────

test('invalid URI (non-prompt://) throws INVALID_URI', () => {
  assert.throws(
    () => resolvePromptUri('https://not-a-prompt-url'),
    (err) => { assert.equal(err.code, 'INVALID_URI'); return true; }
  );
});

test('unknown agent throws UNKNOWN_AGENT', () => {
  assert.throws(
    () => resolvePromptUri('prompt://unknown-agent/some-session/some-ref'),
    (err) => { assert.equal(err.code, 'UNKNOWN_AGENT'); return true; }
  );
});

test('nonexistent claude-code session throws SESSION_NOT_FOUND', () => {
  assert.throws(
    () => resolvePromptUri('prompt://claude-code/ci-no-such-session-abc123/2024-01-01T00:00:00.000Z'),
    (err) => { assert.equal(err.code, 'SESSION_NOT_FOUND'); return true; }
  );
});

test('nonexistent github-copilot session throws SESSION_NOT_FOUND', () => {
  assert.throws(
    () => resolvePromptUri('prompt://github-copilot/ci-no-such-session-abc123/2024-01-01T00:00:00.000Z'),
    (err) => { assert.equal(err.code, 'SESSION_NOT_FOUND'); return true; }
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
