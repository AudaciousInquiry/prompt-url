'use strict';
// Tests for prompt: URL generation format and URI parsing (local and remote forms).
// No filesystem access — runs in any environment including CI.

const assert = require('node:assert/strict');
const os = require('node:os');
const { parsePromptUri, resolvePromptUri } = require('../src/prompt-resolve.js');

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

console.log('test-generate: prompt: URL format and URI parsing (local + remote forms)\n');

// ── URL generation format ────────────────────────────────────────────────────

test('generated local-form URL has expected scheme and components', () => {
  const agent = 'github-copilot';
  const sessionId = 'abc-123';
  const ref = '2025-01-01T00:00:00.000Z';
  const url = `prompt:/${agent}/${sessionId}/${ref}`;
  assert.equal(url, 'prompt:/github-copilot/abc-123/2025-01-01T00:00:00.000Z');
});

test('generated local-form URL with prompt-id ref is parseable', () => {
  const url = 'prompt:/github-copilot/abc-123/~msg-id-xyz';
  const parsed = parsePromptUri(url);
  assert.equal(parsed.isRemote, false);
  assert.equal(parsed.isPromptId, true);
  assert.equal(parsed.promptRef, '~msg-id-xyz');
});

// ── parsePromptUri: local-form valid inputs ──────────────────────────────────

test('parses local-form claude-code URI with timestamp ref', () => {
  const parsed = parsePromptUri('prompt:/claude-code/session-abc/2025-06-15T12:00:00.000Z');
  assert.equal(parsed.isRemote, false);
  assert.equal(parsed.agent, 'claude-code');
  assert.equal(parsed.sessionId, 'session-abc');
  assert.equal(parsed.promptRef, '2025-06-15T12:00:00.000Z');
  assert.equal(parsed.isPromptId, false);
});

test('parses local-form github-copilot URI with prompt-id ref', () => {
  const parsed = parsePromptUri('prompt:/github-copilot/sess-xyz/~e92ae4a1-abcd');
  assert.equal(parsed.isRemote, false);
  assert.equal(parsed.agent, 'github-copilot');
  assert.equal(parsed.sessionId, 'sess-xyz');
  assert.equal(parsed.promptRef, '~e92ae4a1-abcd');
  assert.equal(parsed.isPromptId, true);
});

test('round-trip: build then parse (local form)', () => {
  const agent = 'claude-code';
  const sessionId = 'round-trip-session';
  const ref = '2025-07-19T15:00:00.000Z';
  const url = `prompt:/${agent}/${sessionId}/${ref}`;
  const parsed = parsePromptUri(url);
  assert.equal(parsed.isRemote, false);
  assert.equal(parsed.agent, agent);
  assert.equal(parsed.sessionId, sessionId);
  assert.equal(parsed.promptRef, ref);
});

// ── parsePromptUri: remote-form valid inputs ─────────────────────────────────

test('parses remote-form URI with bare host', () => {
  const parsed = parsePromptUri('prompt://myhost.example.com/claude-code/sess-xyz/~abc123');
  assert.equal(parsed.isRemote, true);
  assert.equal(parsed.host, 'myhost.example.com');
  assert.equal(parsed.port, null);
  assert.equal(parsed.username, null);
  assert.equal(parsed.agent, 'claude-code');
  assert.equal(parsed.sessionId, 'sess-xyz');
  assert.equal(parsed.promptRef, '~abc123');
});

test('parses remote-form URI with username and port', () => {
  const parsed = parsePromptUri('prompt://keith@myhost.example.com:7561/github-copilot/sess-xyz/~abc123');
  assert.equal(parsed.isRemote, true);
  assert.equal(parsed.host, 'myhost.example.com');
  assert.equal(parsed.port, 7561);
  assert.equal(parsed.username, 'keith');
});

test('rejects bracketed IPv6 host literal', () => {
  assert.throws(() => parsePromptUri('prompt://[::1]:7561/claude-code/sess-xyz/~abc123'), { code: 'INVALID_URI' });
});

test('rejects unbracketed IPv6 host literal', () => {
  assert.throws(() => parsePromptUri('prompt://::1/claude-code/sess-xyz/~abc123'), { code: 'INVALID_URI' });
});

test('rejects IPv4 dotted-quad host literal', () => {
  assert.throws(() => parsePromptUri('prompt://127.0.0.1/claude-code/sess-xyz/~abc123'), { code: 'INVALID_URI' });
});

test('rejects IPv4 dotted-quad host literal with port', () => {
  assert.throws(() => parsePromptUri('prompt://127.0.0.1:7561/claude-code/sess-xyz/~abc123'), { code: 'INVALID_URI' });
});

test('round-trip: build then parse (remote form)', () => {
  const url = 'prompt://myhost.example.com/claude-code/round-trip-session/2025-07-19T15:00:00.000Z';
  const parsed = parsePromptUri(url);
  assert.equal(parsed.isRemote, true);
  assert.equal(parsed.host, 'myhost.example.com');
  assert.equal(parsed.agent, 'claude-code');
  assert.equal(parsed.sessionId, 'round-trip-session');
  assert.equal(parsed.promptRef, '2025-07-19T15:00:00.000Z');
});

// ── parsePromptUri: invalid inputs ──────────────────────────────────────────

test('throws INVALID_URI for non-string', () => {
  assert.throws(() => parsePromptUri(42), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for wrong scheme', () => {
  assert.throws(() => parsePromptUri('https://example.com/x'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for missing session-id (local form)', () => {
  assert.throws(() => parsePromptUri('prompt:/agent-only'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for missing prompt-ref (local form)', () => {
  assert.throws(() => parsePromptUri('prompt:/agent/session-only'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for empty agent (local form)', () => {
  assert.throws(() => parsePromptUri('prompt://session/ref'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for remote form with no path after authority', () => {
  assert.throws(() => parsePromptUri('prompt://myhost.example.com'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for remote form with empty authority', () => {
  assert.throws(() => parsePromptUri('prompt:///agent/session/ref'), { code: 'INVALID_URI' });
});

// ── resolvePromptUri: authority validation (no filesystem access needed — ────
// ── these fail validation before any session log is ever read) ──────────────

test('resolvePromptUri throws WRONG_HOST for a non-matching remote host', () => {
  assert.throws(
    () => resolvePromptUri('prompt://definitely-not-this-host.example.com/claude-code/sess-xyz/~abc123'),
    { code: 'WRONG_HOST' }
  );
});

test('resolvePromptUri throws WRONG_USER for a non-matching remote username', () => {
  const localHost = os.hostname();
  assert.throws(
    () => resolvePromptUri(`prompt://definitely-not-a-real-user@${localHost}/claude-code/sess-xyz/~abc123`),
    { code: 'WRONG_USER' }
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
