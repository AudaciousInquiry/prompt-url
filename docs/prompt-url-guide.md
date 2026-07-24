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
    prompt:/github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:47:52.891Z
  summary: Create developer guide from recast README content
updated:
  - date: '2026-07-21T00:00:00.000Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt:/github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-21T00:00:00.000Z
    summary: Update for draft-01 URI syntax (local/remote forms, host, port, git hook)
---
# The `prompt:` URL Scheme — Developer Guide

## What Is a `prompt:` URL?

A `prompt:` URL is a stable, embeddable identifier for a specific user prompt within an AI agent session. It encodes the agent identity, session identifier, and prompt reference needed to locate the originating prompt in the agent's session log.

There are two forms:

```
; Local-only — resolvable on the machine that generated it
prompt:/claude-code/34d129b9-9dad-439d-92fa-8b9d2d3adb77/~2e150465-a33e-4354-929c-fa2347c8bd00
prompt:/github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T08:34:49.255Z

; Remote — resolvable via an MCP server at the named host (default port 7560)
prompt://myhost.example.com/claude-code/34d129b9-.../~2e150465-...
prompt://kboone@myhost.example.com/github-copilot/95602ecf-.../2026-07-19T08:34:49.255Z
```

The **single-slash** (`prompt:/`) form is local-only: it can only be resolved by a
`prompt-url-mcp` server running on the machine that generated the URI.

The **double-slash** (`prompt://`) form includes an authority (host, optional user,
optional port) identifying the machine where the agent client application stores its
session logs.  If that machine runs a `prompt-url-mcp` server accessible over the
network, the URI can be resolved remotely.

## Why "URL" and Not "URI"?

A `prompt:` URL is a **locator** — it points to a resolvable resource (the prompt text and context in a session log). It is therefore more precisely a URL than a bare URI. However, the IETF registers schemes under the "URI Schemes" registry (RFC 7595), so the formal IETF submission uses "URI scheme" terminology. In everyday use, "prompt URL" is the preferred term.

## What It Solves

AI agents produce artifacts — code changes, documents, analysis outputs — whose provenance is difficult to trace after the fact:

- **Session IDs** identify a conversation but not which turn produced a given artifact.
- **Timestamps** are available but don't encode the agent or session.
- **Internal prompt IDs** aren't exposed to tool callers at the time of the call.

A `prompt:` URL combines all three into a single embeddable reference, suitable for:

- **Git commit trailers** — `Prompt-URL: prompt:/claude-code/...`
- **File metadata** — YAML front matter, update records in generated files
- **Audit trails** — cross-agent provenance chains
- **MCP tool provenance** — stamped into any file written by an MCP tool

## URL Syntax

```
prompt:[//[username@]host[:port]]/agent-name/session-id/prompt-ref

agent-name   = stable short name for the agent (e.g. claude-code, github-copilot)
session-id   = UUID session identifier
prompt-ref   = ~<internal-prompt-id>  (canonical, preferred when available)
             | RFC 3339 timestamp     (fallback)
port         = TCP port of MCP server (default: 7560 when authority is present)
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
Prompt-URL: prompt:/github-copilot/95602ecf-.../~8e16a698-...
```

### Automatic Trailer via Git Hook

The repository ships a `prepare-commit-msg` hook at `hooks/prepare-commit-msg`
that automatically appends a `Prompt-URL:` trailer to commits initiated by the
GitHub Copilot CLI.

**How it works:** The hook checks for the `COPILOT_CLI` environment variable,
which Copilot CLI sets automatically when it drives a commit. If the variable is
not set (human-authored or a different agent), the hook exits immediately without
touching the commit message. When `COPILOT_CLI` is set and no `Prompt-URL:` trailer
is already present, the hook constructs a local-form prompt URI from the
`COPILOT_AGENT_SESSION_ID` environment variable and the current UTC timestamp, then
appends it as a trailer.

```sh
#!/bin/sh
# Only enforce Prompt-URL: trailer for Copilot-initiated commits
if [ -z "$COPILOT_CLI" ]; then
  exit 0
fi

commit_msg_file="$1"
if ! grep -q "^Prompt-URL:" "$commit_msg_file"; then
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  printf "\nPrompt-URL: prompt:/github-copilot/%s/%s\n" \
    "$COPILOT_AGENT_SESSION_ID" "$timestamp" >> "$commit_msg_file"
fi
```

**Per-repository installation:**

```bash
cp hooks/prepare-commit-msg .git/hooks/prepare-commit-msg
chmod +x .git/hooks/prepare-commit-msg
```

**Global installation (all repositories for the current user):**

```bash
git config --global core.hooksPath ~/.git-hooks
mkdir -p ~/.git-hooks
cp hooks/prepare-commit-msg ~/.git-hooks/prepare-commit-msg
chmod +x ~/.git-hooks/prepare-commit-msg
```

The recommended global location is `~/.git-hooks/`. On Windows, run `chmod` in
Git Bash or WSL; Git for Windows treats copied files as executable by default.
No additional dependencies are required — the hook is pure POSIX shell.

## Embedding in File Metadata

For files that carry YAML front matter, the prompt URL can be recorded in a `prompt_uri` field:

```yaml
---
created:
  date: '2026-07-19T14:22:05.000Z'
  prompt_uri: prompt:/claude-code/34d129b9-.../~2e150465-...
  summary: Initial draft of the data model
---
```

## Resolving a `prompt:` URL

With `prompt-url-mcp` installed and the daemon running:

```bash
prompt-url-mcp call resolve_prompt '{"uri":"prompt:/github-copilot/<session-id>/~<prompt-id>"}'
```

Returns:

```json
{
  "user_message": "Add validation so that email addresses must be unique at registration time. Throw a 409 if the address is already in use.",
  "agent": "github-copilot",
  "session_id": "95602ecf-b509-42b5-b5c4-cefb007525df",
  "timestamp": "2026-07-19T18:32:25.000Z",
  "canonical_uri": "prompt:/github-copilot/95602ecf-.../~8e16a698-...",
  "source": "copilot"
}
```

For a remote URI (`prompt://hostname/...`), the resolver validates that `hostname`
matches the current machine's hostname (case-insensitively) and, if a username is
present, that it matches the current OS user.  Remote URIs that fail either check
are rejected with a clear error message.

Resolution reads the local session log file for the named agent. No network access is required for local URIs. See the [MCP server README](../mcp/README.md) for installation and registration instructions.

## Supported Agents

| Agent identifier | Session log location |
|---|---|
| `github-copilot` | `~/.copilot/session-state/<session-id>/events.jsonl` |
| `claude-code` | `~/.claude/projects/<project>/<session-id>.jsonl` |

## IETF Specification

The formal scheme definition is `draft-boone-prompt-uri-scheme-01`, targeting the
[agentproto BoF](https://datatracker.ietf.org/doc/bofreq-krishnan-agent-communication-protoco)
at IETF 126 (Vienna, July 2026). The scheme requests provisional registration in
the IANA URI Schemes registry under RFC 7595.

To regenerate the RFC output files from source, install [xml2rfc](https://github.com/ietf-tools/xml2rfc):

```bash
pip install xml2rfc
xml2rfc docs/draft-boone-prompt-uri-scheme-01.xml --text --html
```