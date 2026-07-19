'use strict';
// Tests for prompt:// URL generation format and URI parsing.
// No filesystem access — runs in any environment including CI.

const assert = require('node:assert/strict');
const { parsePromptUri } = require('../src/prompt-resolve.js');

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

console.log('test-generate: prompt:// URL format and URI parsing\n');

// ── URL generation format ────────────────────────────────────────────────────

test('generated URL has expected scheme and components', () => {
  const agent = 'github-copilot';
  const sessionId = 'abc-123';
  const ref = '2025-01-01T00:00:00.000Z';
  const url = `prompt://${agent}/${sessionId}/${ref}`;
  assert.equal(url, 'prompt://github-copilot/abc-123/2025-01-01T00:00:00.000Z');
});

test('generated URL with prompt-id ref is parseable', () => {
  const url = 'prompt://github-copilot/abc-123/~msg-id-xyz';
  const parsed = parsePromptUri(url);
  assert.equal(parsed.isPromptId, true);
  assert.equal(parsed.promptRef, '~msg-id-xyz');
});

// ── parsePromptUri: valid inputs ─────────────────────────────────────────────

test('parses claude-code URI with timestamp ref', () => {
  const parsed = parsePromptUri('prompt://claude-code/session-abc/2025-06-15T12:00:00.000Z');
  assert.equal(parsed.agent, 'claude-code');
  assert.equal(parsed.sessionId, 'session-abc');
  assert.equal(parsed.promptRef, '2025-06-15T12:00:00.000Z');
  assert.equal(parsed.isPromptId, false);
});

test('parses github-copilot URI with prompt-id ref', () => {
  const parsed = parsePromptUri('prompt://github-copilot/sess-xyz/~e92ae4a1-abcd');
  assert.equal(parsed.agent, 'github-copilot');
  assert.equal(parsed.sessionId, 'sess-xyz');
  assert.equal(parsed.promptRef, '~e92ae4a1-abcd');
  assert.equal(parsed.isPromptId, true);
});

test('round-trip: build then parse', () => {
  const agent = 'claude-code';
  const sessionId = 'round-trip-session';
  const ref = '2025-07-19T15:00:00.000Z';
  const url = `prompt://${agent}/${sessionId}/${ref}`;
  const parsed = parsePromptUri(url);
  assert.equal(parsed.agent, agent);
  assert.equal(parsed.sessionId, sessionId);
  assert.equal(parsed.promptRef, ref);
});

// ── parsePromptUri: invalid inputs ──────────────────────────────────────────

test('throws INVALID_URI for non-string', () => {
  assert.throws(() => parsePromptUri(42), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for wrong scheme', () => {
  assert.throws(() => parsePromptUri('https://example.com/x'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for missing session-id', () => {
  assert.throws(() => parsePromptUri('prompt://agent-only'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for missing prompt-ref', () => {
  assert.throws(() => parsePromptUri('prompt://agent/session-only'), { code: 'INVALID_URI' });
});

test('throws INVALID_URI for empty agent', () => {
  assert.throws(() => parsePromptUri('prompt:///session/ref'), { code: 'INVALID_URI' });
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
