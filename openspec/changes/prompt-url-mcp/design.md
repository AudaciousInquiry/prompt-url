---
schema_version: '1.0'
created:
  date: '2026-07-19T18:30:40.583Z'
  user: boonek
  agent:
    name: github-copilot
    version: '1.0'
  llm:
    name: claude-sonnet-4.6
    version: '4.6'
  prompt_uri: >-
    prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:30:40.584Z
  summary: >-
    Write design.md — transport, scan strategy, git integration, and risk
    mitigations
updated:
  - date: '2026-07-19T18:38:25.685Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:38:25.686Z
    summary: >-
      Close list_sessions pagination open question — resolved to add mtime
      cursor
---
## Context

The `prompt-url-mcp` server implements resolution and generation of `prompt://` URLs
as defined in `draft-boone-prompt-uri-scheme-00`. It runs entirely on the local machine,
reading session log files written by Claude Code (`~/.claude/projects/`) and GitHub
Copilot (`~/.copilot/session-state/`). No network access, no shared service, no
external dependencies beyond the local filesystem and optionally `git`.

The proposal described a stdio-transport MCP server. During implementation, an HTTP
daemon mode and CLI were added to support interactive testing and direct tool invocation
without an active agent session. Both modes are supported; see Decisions below.

## Goals / Non-Goals

**Goals:**
- Resolve `prompt://` URIs to the originating user message for both Claude Code and
  GitHub Copilot sessions
- Generate well-formed `prompt://` URLs from agent identity, session ID, and prompt
  reference
- Search session logs by time range or git commit to identify root-cause prompts
- Provide a CLI for testing (`health`, `list`, `call`, `init`) without requiring an
  active agent session
- Remain independently deployable with no dependency on any other MCP server

**Non-Goals:**
- Writing or modifying session log files
- Indexing session logs (all queries are live filesystem scans)
- Resolving `prompt://` URIs from remote or cloud-hosted sessions
- Supporting agents other than Claude Code and GitHub Copilot in this version

## Decisions

### Transport: HTTP daemon + stdio bridge (not stdio-only)

**Decision:** Run as an HTTP daemon (port 7560, localhost only) with a `--stdio` flag
that serves MCP directly on stdin/stdout without the HTTP layer.

**Rationale:** Pure stdio-only servers cannot be queried from the command line without
an active agent session. Adding HTTP daemon mode enables `prompt-url-mcp call`,
`health`, and `list` subcommands that work independently of any agent. The `--stdio`
flag satisfies the original proposal requirement and is the mode used when registering
with agents (Claude Code `claude mcp add`, Copilot `mcp.json`).

**Alternative considered:** stdio-only (original proposal). Rejected because it makes
interactive testing and debugging much harder — every test requires an agent session.

### Session log access: filesystem scan per request (no index)

**Decision:** Read session JSONL files on each tool invocation. No persistent index.

**Rationale:** The session logs are append-only and relatively small (typically < 1 MB
per session). Scanning at request time avoids index staleness, startup cost, and the
operational complexity of maintaining a background indexer. `find_prompt` limits
exposure by scanning sessions sorted by mtime and stopping at `limit` results.

**Alternative considered:** SQLite-backed full-text index. Rejected for this version —
adds significant complexity and a background process requirement that conflicts with the
"independently deployable, minimal footprint" goal. Can be added in a future version if
scan latency proves problematic on machines with many large sessions.

### Git integration: child_process (not a git library)

**Decision:** Invoke `git log` via `child_process.execSync` to derive commit timestamps
for `find_prompt`. No git library dependency.

**Rationale:** The required git operations are minimal (two `git log` calls). Adding
`simple-git` or `isomorphic-git` would increase install size and introduce a dependency
that only one tool uses. `execSync` with a 5-second timeout is sufficient; git failures
surface as clean error messages.

**Risk:** Requires `git` in PATH. Documented in `--help` output. `find_prompt` with
explicit `since`/`until` works without git.

### Copilot fallback: better-sqlite3 (optional)

**Decision:** `better-sqlite3` is listed as a dependency but used only when
`events.jsonl` is absent and `session-store.db` exists. It is never required for
Claude Code sessions.

**Rationale:** Older Copilot CLI versions wrote sessions to a shared SQLite database
rather than per-session JSONL files. The fallback ensures compatibility. On machines
where `better-sqlite3` fails to build (no native toolchain), the rest of the server
still works for Claude Code and modern Copilot sessions.

### JSONL parsing: line-by-line, skip malformed lines

**Decision:** Parse JSONL by splitting on newlines and calling `JSON.parse` per line,
skipping any line that throws. No streaming JSONL parser dependency.

**Rationale:** Session files are well-formed in practice. Skipping malformed lines
(truncated final line during active session write, encoding issues) is safer than
failing the entire query. The additional dependency cost of a JSONL streaming library
is not justified.

### Harness-injection filtering: pattern matching (not schema field)

**Decision:** Exclude Claude Code `user` entries that contain known harness-injected
XML patterns (`<bash-input>`, `<system-reminder>`, etc.) using string inclusion checks.

**Rationale:** The Claude Code JSONL format does not yet provide a reliable `kind:
"human"` field that cleanly separates human turns from tool-harness injections.
Pattern matching on a documented exclusion list is the community-accepted approach
until the format provides a first-class field.

## Risks / Trade-offs

- **Scan latency on large session stores** → Mitigated by sorting sessions by mtime
  descending and stopping at `limit` results. Users with thousands of sessions may
  experience slow `find_prompt` calls; pagination via the timestamp cursor is the
  intended workaround.

- **Timestamp-form URIs have ±1000 ms ambiguity window** → Mitigated by preferring
  the canonical `~<promptId>` form whenever the internal ID is available. Timestamp
  form is documented as a fallback.

- **git availability** → `find_prompt` with a `commit` parameter fails cleanly if
  `git` is not in PATH. Explicit `since`/`until` always works.

- **better-sqlite3 native build failure** → The server starts successfully without it;
  only the Copilot DB fallback path is affected. Logged at startup if the module fails
  to load.

- **Session log format changes** → Both Claude Code and GitHub Copilot JSONL formats
  are undocumented and subject to change. The resolver is isolated in `prompt-resolve.js`
  and `session-list.js` to minimize the blast radius of format changes.

## Migration Plan

This is a new server with no prior version. No migration needed.

**Registration (one-time, per machine):**
1. `npm install -g @audaciousinquiry/prompt-url-mcp` (or `npm install` in `mcp/`)
2. `prompt-url-mcp init` — configure port and session paths interactively
3. `prompt-url-mcp` — start the HTTP daemon
4. Register with agents:
   - Claude Code: `claude mcp add prompt-url-mcp -- prompt-url-mcp --stdio`
   - Copilot: add `"prompt-url-mcp": { "type": "http", "url": "http://127.0.0.1:7560" }`
     to `.copilot/mcp.json`

## Open Questions

- **Session path configurability**: `prompt-resolve.js` currently hardcodes
  `os.homedir()`-based paths. `config.json` stores `claude_sessions_dir` and
  `copilot_sessions_dir` but they are not yet threaded through to the resolver.
  Future version should honour config values.

- **Windows path handling in git CWD**: `find_prompt`'s `cwd` parameter is passed
  directly to `execSync`. Needs validation on Windows paths with spaces.
