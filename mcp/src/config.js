'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CONFIG_DIR = path.join(os.homedir(), '.mcp', 'prompt-url-mcp');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  port: 7560,
  claude_sessions_dir: path.join(os.homedir(), '.claude', 'projects'),
  copilot_sessions_dir: path.join(os.homedir(), '.copilot', 'session-state'),
  pid_path: path.join(CONFIG_DIR, 'server.pid'),
};

function loadConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2), 'utf8');
    return { ...DEFAULTS };
  }
  const stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return { ...DEFAULTS, ...stored };
}

function saveConfig(updates) {
  const current = loadConfig();
  const next = { ...current, ...updates };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = { loadConfig, saveConfig, CONFIG_DIR, CONFIG_PATH, DEFAULTS };
