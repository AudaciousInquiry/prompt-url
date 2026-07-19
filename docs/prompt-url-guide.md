---
schema_version: '1.0'
created:
  date: '2026-07-19T19:47:52.890Z'
  user: boonek
  agent:
    name: github-copilot
    version: '1.0'
  llm:
    name: claude-sonnet-4.6
    version: '4.6'
  prompt_uri: >-
    prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:47:52.891Z
  summary: Create developer guide from recast README content
updated:
  - date: '2026-07-19T19:57:08.634Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:57:08.635Z
    summary: Add example response to resolve_prompt CLI example
  - date: '2026-07-19T19:55:32.602Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:55:32.602Z
    summary: >-
      Fix commit example to put Prompt-URL after Co-authored-by, matching the
      recommendation
---
# The `prompt://` URL Scheme — Developer Guide

## What Is a `prompt://` URL?

A `prompt://` URL is a stable, embeddable identifier for a specific user prompt within an AI agent session. It encodes the agent identity, session identifier, and prompt reference needed to locate the originating prompt in the agent's session log.

```
prompt://claude-code/34d129b9-9dad-439d-92fa-8b9d2d3adb77/~2e150465-a33e-4354-929c-fa2347c8bd00
prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T08:34:49.255Z
```

## Why "URL" and Not "URI"?

A `prompt://` URL is a **locator** — it points to a resolvable resource (the prompt text and context in a session log). It is therefore more precisely a URL than a bare URI. However, the IETF registers schemes under the "URI Schemes" registry (RFC 7595), so the formal IETF submission uses "URI scheme" terminology. In everyday use, "prompt URL" is the preferred term.

## What It Solves

AI agents produce artifacts — code changes, documents, analysis outputs — whose provenance is difficult to trace after the fact:

- **Session IDs** identify a conversation but not which turn produced a given artifact.
- **Timestamps** are available but don't encode the agent or session.
- **Internal prompt IDs** aren't exposed to tool callers at the time of the call.

A `prompt://` URL combines all three into a single embeddable reference, suitable for:

- **Git commit trailers** — `Prompt-URL: prompt://claude-code/...`
- **File metadata** — YAML front matter, update records in generated files
- **Audit trails** — cross-agent provenance chains
- **MCP tool provenance** — stamped into any file written by an MCP tool

## URL Syntax

```
prompt://<agent-name>/<session-id>/<prompt-ref>

agent-name   = stable short name for the agent (e.g. claude-code, github-copilot)
session-id   = UUID session identifier
prompt-ref   = ~<internal-prompt-id>  (canonical, preferred when available)
             | RFC 3339 timestamp     (fallback)
```

The `~`-prefixed form is canonical when the agent exposes an internal prompt correlation ID (Claude Code `promptId`, GitHub Copilot event `id`). The timestamp form is a fallback for agents or sessions where no ID is available; it carries a ±1 second ambiguity window.

## Prompt Reference Forms

| Form | Example | When to Use |
|---|---|---|
| `~<promptId>` | `~2e150465-a33e-4354-929c-fa2347c8bd00` | Preferred — unambiguous, stable |
| RFC 3339 timestamp | `2026-07-19T08:34:49.255Z` | Fallback — use when no internal ID is available |

## Embedding in Git Commits

The recommended placement is a trailer line at the end of the commit message, after any `Co-authored-by:` lines:

```
feat: add user registration validation

Implement unique-email check at registration time. Returns 409
if the email address is already in use.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Prompt-URL: prompt://github-copilot/95602ecf-.../~8e16a698-...
```

## Embedding in File Metadata

For files that carry YAML front matter, the prompt URL can be recorded in a `prompt_uri` field:

```yaml
---
created:
  date: '2026-07-19T14:22:05.000Z'
  prompt_uri: prompt://claude-code/34d129b9-.../~2e150465-...
  summary: Initial draft of the data model
---
```

## Resolving a `prompt://` URL

With `prompt-url-mcp` installed and the daemon running:

```bash
prompt-url-mcp call resolve_prompt '{"uri":"prompt://github-copilot/<session-id>/~<prompt-id>"}'
```

Returns:

```json
{
  "user_message": "Add validation so that email addresses must be unique at registration time. Throw a 409 if the address is already in use.",
  "agent": "github-copilot",
  "session_id": "95602ecf-b509-42b5-b5c4-cefb007525df",
  "timestamp": "2026-07-19T18:32:25.000Z",
  "canonical_uri": "prompt://github-copilot/95602ecf-.../~8e16a698-...",
  "source": "copilot"
}
```

Resolution reads the local session log file for the named agent. No network access is required. See the [MCP server README](../mcp/README.md) for installation and registration instructions.

## Supported Agents

| Agent identifier | Session log location |
|---|---|
| `github-copilot` | `~/.copilot/session-state/<session-id>/events.jsonl` |
| `claude-code` | `~/.claude/projects/<project>/<session-id>.jsonl` |

## IETF Specification

The formal scheme definition is `draft-boone-prompt-uri-scheme-00`, targeting the
[agentproto BoF](https://datatracker.ietf.org/doc/bofreq-krishnan-agent-communication-protoco)
at IETF 126 (Vienna, July 2026). The scheme requests provisional registration in
the IANA URI Schemes registry under RFC 7595.

To regenerate the RFC output files from source, install [xml2rfc](https://github.com/ietf-tools/xml2rfc):

```bash
pip install xml2rfc
xml2rfc docs/draft-boone-prompt-uri-scheme-00.xml --text --html
```
