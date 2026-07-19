'use strict';
// Local test: prompt search (find_prompt) with real session data.
// Verifies that searchPrompts() returns correctly-shaped results, that
// time-range filtering works, and that the until cursor paginates correctly.
// Also tests commitToTimeRange() against the current git repo.
//
// Skips gracefully if no sessions or prompts are found on this machine.

const assert = require('node:assert/strict');
const path = require('node:path');
const { searchPrompts, commitToTimeRange } = require('../../src/search.js');
const { listSessions } = require('../../src/session-list.js');

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

console.log('test-local-search: find_prompt / searchPrompts with real data\n');

// ── Baseline search: last 7 days ──────────────────────────────────────────────

const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const until7d = new Date().toISOString();
const recent = searchPrompts({ since: since7d, until: until7d, limit: 20 });
console.log(`  Found ${recent.length} prompt(s) in the last 7 days.\n`);

// ── Shape tests ───────────────────────────────────────────────────────────────

test('searchPrompts returns an array', () => {
  assert.ok(Array.isArray(recent));
});

test('each result has required fields', () => {
  if (recent.length === 0) skip('no prompts found in last 7 days');
  for (const r of recent) {
    assert.ok(typeof r.prompt_url === 'string' && r.prompt_url.startsWith('prompt://'),
      `prompt_url invalid: ${r.prompt_url}`);
    assert.ok(typeof r.user_message === 'string', 'user_message must be a string');
    assert.ok(r.agent === 'claude-code' || r.agent === 'github-copilot',
      `unexpected agent: ${r.agent}`);
    assert.ok(typeof r.session_id === 'string', 'session_id missing');
    assert.ok(typeof r.timestamp === 'string',  'timestamp missing');
    assert.ok(!isNaN(new Date(r.timestamp).getTime()), `invalid timestamp: ${r.timestamp}`);
  }
});

test('results are sorted timestamp ascending', () => {
  if (recent.length < 2) skip('need at least 2 results');
  for (let i = 1; i < recent.length; i++) {
    assert.ok(
      recent[i - 1].timestamp <= recent[i].timestamp,
      `out of order at index ${i}: ${recent[i-1].timestamp} > ${recent[i].timestamp}`
    );
  }
});

test('all results fall within the requested time range', () => {
  if (recent.length === 0) skip('no prompts found');
  const sinceMs = new Date(since7d).getTime();
  const untilMs = new Date(until7d).getTime();
  for (const r of recent) {
    const ts = new Date(r.timestamp).getTime();
    assert.ok(ts > sinceMs, `timestamp ${r.timestamp} is not after since=${since7d}`);
    assert.ok(ts <= untilMs, `timestamp ${r.timestamp} is after until=${until7d}`);
  }
});

// ── Limit ─────────────────────────────────────────────────────────────────────

test('limit is respected', () => {
  if (recent.length < 5) skip('need at least 5 prompts to test limit');
  const limited = searchPrompts({ since: since7d, until: until7d, limit: 3 });
  assert.ok(limited.length <= 3, `got ${limited.length} results with limit=3`);
});

// ── Pagination via since cursor (ascending) ───────────────────────────────────

test('since cursor pages correctly (no overlap)', () => {
  if (recent.length < 4) skip('need at least 4 prompts to test pagination');
  const page1 = searchPrompts({ since: since7d, until: until7d, limit: 2 });
  const cursor = page1[page1.length - 1].timestamp;
  const page2 = searchPrompts({ since: cursor, until: until7d, limit: 2 });
  const urls1 = new Set(page1.map(r => r.prompt_url));
  for (const r of page2) {
    assert.ok(!urls1.has(r.prompt_url),
      `prompt_url ${r.prompt_url} appears on both pages`);
    assert.ok(r.timestamp > cursor,
      `page-2 timestamp ${r.timestamp} <= cursor ${cursor}`);
  }
});

// ── Agent filter ──────────────────────────────────────────────────────────────

test('agent:"claude-code" filter returns only claude-code results', () => {
  const cc = searchPrompts({ since: since7d, until: until7d, agent: 'claude-code', limit: 10 });
  for (const r of cc) assert.equal(r.agent, 'claude-code');
});

test('agent:"github-copilot" filter returns only github-copilot results', () => {
  const gcp = searchPrompts({ since: since7d, until: until7d, agent: 'github-copilot', limit: 10 });
  for (const r of gcp) assert.equal(r.agent, 'github-copilot');
});

// ── commitToTimeRange ─────────────────────────────────────────────────────────

const REPO_ROOT = path.join(__dirname, '..', '..', '..'); // prompt-url repo root

test('commitToTimeRange returns ISO timestamps for HEAD', () => {
  let head;
  try {
    const { execSync } = require('node:child_process');
    head = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    skip('git not available or not a git repo');
  }
  const range = commitToTimeRange(head, REPO_ROOT);
  assert.ok(typeof range.since === 'string', 'since must be a string');
  assert.ok(typeof range.until === 'string', 'until must be a string');
  assert.ok(!isNaN(new Date(range.since).getTime()), `invalid since: ${range.since}`);
  assert.ok(!isNaN(new Date(range.until).getTime()), `invalid until: ${range.until}`);
  assert.ok(range.since <= range.until, `since (${range.since}) must be <= until (${range.until})`);
});

test('commitToTimeRange throws on unknown commit', () => {
  assert.throws(
    () => commitToTimeRange('0000000000000000000000000000000000000000', REPO_ROOT),
    /git log failed/
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
if (recent.length > 0) {
  console.log('Most recent prompt found:');
  const r = recent[0];
  console.log(`  agent:       ${r.agent}`);
  console.log(`  timestamp:   ${r.timestamp}`);
  console.log(`  prompt_url:  ${r.prompt_url}`);
  console.log(`  message:     ${r.user_message.replace(/\n/g, ' ').slice(0, 80)}...`);
  console.log('');
}
if (failed > 0) process.exit(1);
