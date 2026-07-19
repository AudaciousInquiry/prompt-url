---
schema_version: '1.0'
created:
  date: '2026-07-19T19:44:18.685Z'
  user: boonek
  agent:
    name: github-copilot
    version: '1.0'
  llm:
    name: claude-sonnet-4.6
    version: '4.6'
  prompt_uri: >-
    prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:44:18.686Z
  summary: Write npm package README for @audaciousinquiry/prompt-url-mcp
updated:
  - date: '2026-07-19T20:00:05.495Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T20:00:05.496Z
    summary: 'Clarify list_sessions description: current user sessions'
---
# @audaciousinquiry/prompt-url-mcp

MCP server for resolving and generating `prompt://` URLs — stable identifiers for AI agent session provenance.

A `prompt://` URL encodes the agent name, session ID, and prompt reference needed to locate the originating user message in an agent's session log:

```
prompt://claude-code/34d129b9-9dad-439d-92fa-8b9d2d3adb77/~2e150465-a33e-4354-929c-fa2347c8bd00
prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T08:34:49.255Z
```

These URLs can be embedded in Git commit trailers (`Prompt-URL:`), file metadata (YAML front matter), or any artifact that should carry a traceable link back to the prompt that produced it.

**GitHub repository:** [AudaciousInquiry/prompt-url](https://github.com/AudaciousInquiry/prompt-url)

---

## Installation

```bash
npm install -g @audaciousinquiry/prompt-url-mcp
```

Requires Node.js 22 or later.

## Quick Start

```bash
# Start the HTTP daemon (port 7560, localhost only)
prompt-url-mcp

# Check it's running
prompt-url-mcp health

# List available MCP tools
prompt-url-mcp list
```

## Registering with Your Agent

### Claude Code

```bash
claude mcp add prompt-url-mcp -- prompt-url-mcp --stdio
```

### GitHub Copilot

Add to `.copilot/mcp.json`:

```json
{
  "servers": {
    "prompt-url-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:7560"
    }
  }
}
```

Start the daemon first with `prompt-url-mcp`.

## MCP Tools

### `resolve_prompt`

Resolves a `prompt://` URI to the original user message that caused an AI-generated artifact.

```json
{ "uri": "prompt://github-copilot/<session-id>/~<prompt-id>" }
```

Returns the user message text, agent, session ID, timestamp, and canonical URI.

### `generate_prompt_url`

Generates a `prompt://` URL for a specific agent session and turn.

```json
{
  "agent": "github-copilot",
  "session_id": "<session-uuid>",
  "prompt_ref": "~<prompt-id>"
}
```

Omit `prompt_ref` to use the current UTC timestamp as a fallback reference.

### `find_prompt`

Finds the prompt(s) that originated a piece of work by searching session logs within a time range. Provide a git commit hash to automatically derive the range:

```json
{ "commit": "a1b2c3d", "cwd": "/path/to/repo" }
```

Or supply explicit timestamps:

```json
{ "since": "2026-07-01T00:00:00Z", "until": "2026-07-19T00:00:00Z", "limit": 10 }
```

Use `limit` with `until` set to the last result's timestamp to paginate through results.

### `list_sessions`

Lists AI agent session logs for the current user available on this machine, sorted by last-modified time descending.

```json
{ "agent": "github-copilot", "limit": 20 }
```

Use `since` / `until` with `limit` to paginate: set `until` to the `mtime` of the last session from the previous page.

## CLI Reference

| Command | Description |
|---|---|
| `prompt-url-mcp` | Start the HTTP daemon on port 7560 |
| `prompt-url-mcp --stdio` | Run MCP server on stdio (for agent registration) |
| `prompt-url-mcp --restart` | Stop and restart the daemon |
| `prompt-url-mcp health` | Print `/health` response as JSON |
| `prompt-url-mcp list` | List all MCP tools with parameters |
| `prompt-url-mcp call <tool> [json\|@file]` | Call a tool and print the result |
| `prompt-url-mcp init [json\|@file]` | Configure interactively or from JSON |
| `prompt-url-mcp --help` | Show full help |

## Supported Agents

| Agent | Session log location |
|---|---|
| Claude Code | `~/.claude/projects/<project>/<session-id>.jsonl` |
| GitHub Copilot | `~/.copilot/session-state/<session-id>/events.jsonl` |

## Configuration

Run `prompt-url-mcp init` to configure port and session paths. Settings are stored at `~/.mcp/prompt-url-mcp/config.json`. Default port is 7560.

## License

Apache-2.0 — see [LICENSE](https://github.com/AudaciousInquiry/prompt-url/blob/main/LICENSE) in the GitHub repository.
