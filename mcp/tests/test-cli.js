'use strict';
// CLI smoke tests — verifies the entry point starts and responds correctly.
// These tests do NOT start the HTTP server.

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let passed = 0;
let failed = 0;

const CLI = path.join(__dirname, '..', 'src', 'index.js');

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

console.log('test-cli: CLI entry point smoke tests\n');

test('--help exits with code 0', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}\nstderr: ${result.stderr}`);
});

test('--help output contains "Usage:"', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.ok(
    result.stdout.includes('Usage:'),
    `Expected "Usage:" in stdout.\nGot: ${result.stdout.slice(0, 200)}`
  );
});

test('--help output contains package name', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.ok(
    result.stdout.includes('prompt-url-mcp'),
    `Expected "prompt-url-mcp" in stdout.\nGot: ${result.stdout.slice(0, 200)}`
  );
});

test('--help output mentions --stdio', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.ok(result.stdout.includes('--stdio'), 'Expected --stdio flag documented in help');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
