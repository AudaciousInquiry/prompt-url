---
schema_version: '1.0'
created:
  date: '2026-07-19T19:22:19.241Z'
  user: boonek
  agent:
    name: github-copilot
    version: '1.0'
  llm:
    name: claude-sonnet-4.6
    version: '4.6'
  prompt_uri: >-
    prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:22:19.246Z
  summary: Write tasks.md — retrofitted implementation checklist for prompt-url-mcp
updated:
  - date: '2026-07-19T19:32:04.891Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:32:04.891Z
    summary: Fix task numbering after inserting Trusted Publishing step
  - date: '2026-07-19T19:31:48.891Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:31:48.892Z
    summary: Replace NPM_TOKEN task with Trusted Publishing steps
  - date: '2026-07-19T19:25:20.242Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:25:20.243Z
    summary: >-
      Remove open items group — future work belongs in a new CR, not this
      tasks.md
change_request: prompt-url-mcp
---
## 1. Package Setup

- [x] 1.1 Initialize `mcp/package.json` (`@audaciousinquiry/prompt-url-mcp`, bin, engines)
- [x] 1.2 Configure dual publish: npmjs.com (default) and GitHub Packages
- [x] 1.3 Add `files` field to exclude tests from published package
- [x] 1.4 Add `test` and `test:local` npm scripts

## 2. Core Resolution (`resolve_prompt`)

- [x] 2.1 Implement `parsePromptUri` — validate scheme, extract agent/sessionId/promptRef
- [x] 2.2 Implement Claude Code JSONL resolver (`resolveClaudeCode`)
- [x] 2.3 Implement Copilot events.jsonl resolver (`resolveCopilot`)
- [x] 2.4 Implement `better-sqlite3` fallback for older Copilot (`session-store.db`)
- [x] 2.5 Implement harness-injection filtering (HARNESS_PATTERNS exclusion list)
- [x] 2.6 Implement `parentUuid` chain walk to reach human-authored turns
- [x] 2.7 Export `parsePromptUri` and `resolvePromptUri` from `src/prompt-resolve.js`

## 3. Session Discovery (`list_sessions`)

- [x] 3.1 Implement Claude Code session discovery (scan `~/.claude/projects/`)
- [x] 3.2 Implement Copilot session discovery (scan `~/.copilot/session-state/`)
- [x] 3.3 Sort sessions by mtime descending
- [x] 3.4 Add `since` / `until` cursor pagination (exclusive `until`, consistent with search)
- [x] 3.5 Add `agent` filter and `limit`

## 4. Prompt Search (`find_prompt`)

- [x] 4.1 Extract `searchPrompts` and `commitToTimeRange` into `src/search.js`
- [x] 4.2 Implement time-range scan across all session JSONL files
- [x] 4.3 Use exclusive `until` to enable overlap-free pagination
- [x] 4.4 Implement `commitToTimeRange` via `git log` (with initial-commit fallback)

## 5. URL Generation (`generate_prompt_url`)

- [x] 5.1 Implement `generate_prompt_url` tool — `prompt://${agent}/${session_id}/${ref}`
- [x] 5.2 Default `ref` to current UTC timestamp when omitted

## 6. MCP Server and HTTP Daemon

- [x] 6.1 Implement `registerTools(mcpServer)` with all four tools (Zod schemas)
- [x] 6.2 Implement StreamableHTTP server on port 7560, localhost only
- [x] 6.3 Implement `/health` endpoint returning `{status, server, version, uptime_seconds}`
- [x] 6.4 Implement per-request MCP session management (Map keyed by session ID)
- [x] 6.5 Implement PID file management (detect existing daemon, clean stale PID)
- [x] 6.6 Implement graceful shutdown on SIGTERM / SIGINT

## 7. CLI (`src/index.js`)

- [x] 7.1 Implement `--stdio` mode using `StdioServerTransport` (no HTTP required)
- [x] 7.2 Implement `--help` / `-h` output with all commands documented
- [x] 7.3 Implement `health` subcommand — print `/health` response as JSON
- [x] 7.4 Implement `list` subcommand — list MCP tools with parameters
- [x] 7.5 Implement `call <tool> [json|@path]` subcommand
- [x] 7.6 Implement `init [json|@path]` — interactive readline + non-interactive JSON modes
- [x] 7.7 Implement `--restart` flag — kill existing daemon and restart

## 8. Configuration (`src/config.js`)

- [x] 8.1 Load/save config from `~/.mcp/prompt-url-mcp/config.json`
- [x] 8.2 Provide defaults: port 7560, pid path, session dirs

## 9. CI Tests (run in GitHub Actions)

- [x] 9.1 `tests/test-generate.js` — URL format + `parsePromptUri` error cases
- [x] 9.2 `tests/test-empty.js` — graceful no-session behavior (SESSION_NOT_FOUND, UNKNOWN_AGENT)
- [x] 9.3 `tests/test-cli.js` — `--help` exits 0, expected output present

## 10. Local Integration Tests (developer machine only)

- [x] 10.1 `tests/local/test-local-sessions.js` — real session shape, sort, filter, pagination
- [x] 10.2 `tests/local/test-local-resolve.js` — round-trip resolve against real session logs
- [x] 10.3 `tests/local/test-local-search.js` — searchPrompts shape, pagination, commitToTimeRange

## 11. CI/CD Workflows

- [x] 11.1 `.github/workflows/test.yml` — run on push to any branch, PR, and `workflow_call`
- [x] 11.2 `.github/workflows/publish.yml` — publish to npmjs.com and GitHub Packages on tag `v*.*.*`

## 12. Commit and Ship

- [ ] 12.1 Commit all uncommitted source files with Prompt-URL trailer
- [ ] 12.2 First publish: run `npm publish --access public` manually from `mcp/` (creates the package on npmjs.com so Trusted Publishing can be configured)
- [ ] 12.3 Configure npm Trusted Publishing: npmjs.com → `@audaciousinquiry` org → Publishing → Add Trusted Publisher → GitHub / `AudaciousInquiry` / `prompt-url` / `.github/workflows/publish.yml`
- [ ] 12.4 Push to `main`
- [ ] 12.5 Push `agent-skillz` (Prompt-URL rule commit, blocked pending testing)

