'use strict';
// Local test: session listing with real data.
// Verifies that listSessions() returns correctly-shaped objects, that
// pagination (since/until) filters work, and that limit is respected.
//
// Skips gracefully if no sessions are present on this machine.

const assert = require('node:assert/strict');
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

console.log('test-local-sessions: session listing with real data\n');

// ── Collect real sessions once ────────────────────────────────────────────────

const allSessions = listSessions({ limit: 100 });
console.log(`  Found ${allSessions.length} session(s) on this machine.\n`);

// ── Shape tests ───────────────────────────────────────────────────────────────

test('listSessions() returns an array', () => {
  assert.ok(Array.isArray(allSessions));
});

test('each session has required fields', () => {
  if (allSessions.length === 0) skip('no sessions available');
  for (const s of allSessions) {
    assert.ok(typeof s.session_id === 'string' && s.session_id.length > 0,
      `session_id missing or empty: ${JSON.stringify(s)}`);
    assert.ok(s.agent === 'claude-code' || s.agent === 'github-copilot',
      `unexpected agent value: ${s.agent}`);
    assert.ok(typeof s.file_path === 'string', 'file_path missing');
    assert.ok(typeof s.mtime === 'string',     'mtime missing');
    // mtime must be a valid ISO timestamp
    assert.ok(!isNaN(new Date(s.mtime).getTime()),
      `mtime is not a valid ISO timestamp: ${s.mtime}`);
  }
});

test('sessions are sorted mtime descending', () => {
  if (allSessions.length < 2) skip('need at least 2 sessions');
  for (let i = 1; i < allSessions.length; i++) {
    assert.ok(
      allSessions[i - 1].mtime >= allSessions[i].mtime,
      `sessions out of order at index ${i}: ${allSessions[i-1].mtime} < ${allSessions[i].mtime}`
    );
  }
});

// ── Limit ──────────────────────────────────────────────────────────────────────

test('limit is respected', () => {
  if (allSessions.length < 3) skip('need at least 3 sessions to test limit');
  const limited = listSessions({ limit: 2 });
  assert.equal(limited.length, 2);
});

// ── Agent filter ──────────────────────────────────────────────────────────────

test('agent:"claude-code" returns only claude-code sessions', () => {
  const cc = listSessions({ agent: 'claude-code' });
  for (const s of cc) {
    assert.equal(s.agent, 'claude-code');
  }
});

test('agent:"github-copilot" returns only github-copilot sessions', () => {
  const gcp = listSessions({ agent: 'github-copilot' });
  for (const s of gcp) {
    assert.equal(s.agent, 'github-copilot');
  }
});

// ── Since / until pagination ──────────────────────────────────────────────────

test('since filter excludes sessions before cutoff', () => {
  if (allSessions.length < 2) skip('need at least 2 sessions');
  const cutoff = allSessions[0].mtime; // most recent
  const page2 = listSessions({ until: cutoff });
  for (const s of page2) {
    assert.ok(s.mtime < cutoff,
      `session with mtime ${s.mtime} should be before cutoff ${cutoff}`);
  }
});

test('until cursor pages correctly (no overlap)', () => {
  if (allSessions.length < 4) skip('need at least 4 sessions to test pagination');
  const page1 = listSessions({ limit: 2 });
  const cursor = page1[page1.length - 1].mtime;
  const page2 = listSessions({ limit: 2, until: cursor });
  const ids1 = new Set(page1.map(s => s.session_id));
  for (const s of page2) {
    assert.ok(!ids1.has(s.session_id),
      `session ${s.session_id} appears in both page 1 and page 2`);
    assert.ok(s.mtime < cursor,
      `page-2 session mtime ${s.mtime} >= cursor ${cursor}`);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
if (allSessions.length > 0) {
  console.log('Sample (most recent session):');
  const { session_id, agent, mtime, project } = allSessions[0];
  console.log(`  session_id: ${session_id}`);
  console.log(`  agent:      ${agent}`);
  console.log(`  mtime:      ${mtime}`);
  if (project) console.log(`  project:    ${project}`);
  console.log('');
}
if (failed > 0) process.exit(1);
