---
schema_version: '1.0'
updated:
  - date: '2026-07-19T19:48:08.288Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:48:08.288Z
    summary: 'Remove IETF/Building sections from README, now in developer guide'
  - date: '2026-07-19T19:48:00.550Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:48:00.551Z
    summary: Add Learn More section linking to developer guide and npm package
  - date: '2026-07-19T19:47:13.880Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T19:47:13.881Z
    summary: Rewrite repo README to lead with usage story and MCP examples
  - date: '2026-07-19T14:06:15.634Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:06:15.635Z
    summary: Add provenance tracking to project README
created:
  date: '2026-07-19T13:11:26.000Z'
  user: Keith W. Boone
---
# prompt-url

**A `prompt://` URL scheme for AI agent session provenance — with a reference MCP implementation for GitHub Copilot and Claude Code.**

A `prompt://` URL is a stable, embeddable identifier for a specific user prompt within an AI agent session. This repository defines the URL scheme (as an IETF Internet-Draft) and provides `prompt-url-mcp`, a working MCP server that resolves and generates these URLs against real session logs on your machine.

## Why This Exists

AI agents produce artifacts — code commits, documents, generated files — but the prompts that caused them are hard to find later. A session ID tells you *which conversation*, but not *which turn* produced a given artifact. A `prompt://` URL encodes all three: the agent, the session, and the specific prompt, in a single embeddable string.

## Example: Commit Provenance

### Step 1 — Record the prompt that caused a commit

When committing AI-assisted work, use the MCP to generate a `Prompt-URL:` trailer that identifies the prompt responsible:

```
git commit -m "Add input validation to user registration

Prompt-URL: prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/~8e16a698-ab6a-45f7-be0b-7b9b98ec6329
```

The `~`-prefixed form uses the agent's internal prompt ID (preferred). A timestamp fallback is also supported:

```
Prompt-URL: prompt://claude-code/34d129b9-9dad-439d-92fa-8b9d2d3adb77/2026-07-19T14:22:05.000Z
```

### Step 2 — Resolve it later to understand what happened

Months later, a reviewer sees the `Prompt-URL:` trailer in the git log and wants to understand what was asked. With `prompt-url-mcp` installed:

```bash
prompt-url-mcp call resolve_prompt \
  '{"uri":"prompt://github-copilot/95602ecf-.../~8e16a698-..."}'
```

Returns:

```json
{
  "user_message": "Add validation so that email addresses must be unique at registration time. Throw a 409 if the address is already in use.",
  "agent": "github-copilot",
  "session_id": "95602ecf-b509-42b5-b5c4-cefb007525df",
  "timestamp": "2026-07-19T18:32:25.000Z",
  "canonical_uri": "prompt://github-copilot/95602ecf-.../~8e16a698-..."
}
```

The original prompt is recovered directly from the local session log — no server, no cloud storage.

### Step 3 — Find the prompt from a commit hash

Don't have the URL handy? Give `find_prompt` a commit hash and it derives the time range automatically:

```bash
prompt-url-mcp call find_prompt '{"commit":"a1b2c3d","cwd":"/path/to/repo"}'
```

## Installing the MCP Server

```bash
npm install -g @audaciousinquiry/prompt-url-mcp
prompt-url-mcp          # start the HTTP daemon on port 7560
```

See the [npm package](https://www.npmjs.com/package/@audaciousinquiry/prompt-url-mcp) for full registration and usage instructions.

## URL Syntax

```
prompt://<agent-name>/<session-id>/<prompt-ref>

agent-name   = github-copilot | claude-code
session-id   = UUID session identifier
prompt-ref   = ~<internal-prompt-id>  (canonical, preferred)
             | RFC 3339 timestamp     (fallback)
```

## Repository Contents

```
docs/
  draft-boone-prompt-uri-scheme-00.xml   RFC XML v3 source (IETF submission)
  draft-boone-prompt-uri-scheme-00.txt   Plain text (generated)
  draft-boone-prompt-uri-scheme-00.html  HTML (generated)
  draft-boone-prompt-uri-scheme-00.md    Markdown draft
mcp/
  src/                                   MCP server source (Node.js)
  tests/                                 CI and local integration tests
.claude/skills/
  prompt-url/SKILL.md                    Copilot/Claude skill for prompt URLs
```

## Learn More

- [Developer Guide](docs/prompt-url-guide.md) — URL syntax, embedding patterns, supported agents, IETF spec
- [npm package](https://www.npmjs.com/package/@audaciousinquiry/prompt-url-mcp) — full installation and CLI reference
- [IETF Internet-Draft](docs/draft-boone-prompt-uri-scheme-00.html) — formal scheme specification

## Author

Keith W. Boone — [Audacious Inquiry](https://ainq.com) — kboone@ainq.com
