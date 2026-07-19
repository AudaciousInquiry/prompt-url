---
schema_version: '1.0'
updated:
  - date: '2026-07-19T14:06:15.341Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:06:15.341Z
    summary: Add provenance tracking to OpenSpec proposal
created:
  date: '2026-07-19T13:33:40.000Z'
  user: Keith W. Boone
---
## Why

AI agents produce a growing volume of artifacts — source code, documents, skill
updates, OpenSpec proposals, analysis outputs — but the chain of custody from user
intent to artifact is invisible. Today, three pieces of information are needed to
trace any AI-assisted artifact back to its originating prompt: the agent identity,
the session identifier, and the approximate time of the interaction. None of the
existing identifier schemes capture all three in a single embeddable, resolvable
reference.

The `prompt://` URL scheme (draft-boone-prompt-uri-scheme-00, targeting the IETF
agentproto working group) was designed to fill this gap. But a scheme without a
resolver is a dead reference. This change builds the MCP server that gives prompt
URLs utility:

- **File provenance**: AI tools that write files can embed a `prompt_uri` field
  in the file's metadata at write time — for example, in YAML front matter for
  Markdown documents. Without a resolver, those URIs are unverifiable annotations.
  This MCP resolves them back to the exact user message that caused the file to
  be written.

- **Artifact traceability**: Agent-maintained records — skills, specifications,
  design documents, and similar structured artifacts — can carry a `prompt_uri`
  alongside each update entry. Resolving those URIs shows *why* an artifact was
  changed, enabling review and rollback decisions grounded in the original user
  intent rather than the agent's summary of it.

- **Git commit provenance**: AI-assisted commits can carry a `Prompt-URL:` trailer.
  The `find-prompt` capability formalizes the reverse: given a commit, identify
  the root-cause user prompt by searching the session log between the previous
  and current checkin timestamps.

- **Cross-agent handoff documentation**: When work moves between agents or agent
  sessions, prompt URLs provide stable references that survive the transition. An
  agent resuming a task can resolve earlier prompt URLs to recover the original
  user intent without re-reading full session transcripts.

- **Audit and compliance**: Organizations deploying AI agents for regulated work
  need tamper-evident provenance chains. Prompt URLs, embedded in artifacts at
  write time, form the lowest level of that chain — traceable to the human turn
  that initiated the work.

## What Changes

- New standalone MCP server (`prompt-url-mcp`) in this repository, exposing three
  tools: `resolve_prompt`, `generate_prompt_url`, and `find_prompt`
- New skill `prompt-url` (already drafted in `skills/prompt-url/SKILL.md`) governing
  when and how to generate and embed prompt URLs
- New skill `find-prompt` governing the commit-to-prompt traceability protocol
- Core resolver logic for Claude Code and GitHub Copilot session logs, with no
  external service dependencies
- Independently deployable; no dependency on any other MCP server

## Capabilities

### New Capabilities

- `prompt-resolution`: Parse and resolve a `prompt://` URL to the originating user
  message, for both Claude Code (JSONL session logs) and GitHub Copilot
  (events.jsonl and session-store.db fallback)
- `prompt-url-generation`: Generate a canonical `prompt://` URL from agent name,
  session ID, and an optional internal prompt ID or timestamp
- `find-prompt`: Given a git commit hash (or HEAD), locate the previous commit,
  query session logs for human-authored prompts between the two commit timestamps,
  and return candidates for the agent to identify as the root-cause prompt

### Modified Capabilities

*(none — this is a new standalone MCP with no dependency on existing specs)*

## Impact

- New Node.js package at `mcp/` in this repository (`@audaciousinquiry/prompt-url-mcp`)
- Dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3` (Copilot fallback only),
  `zod`
- Stdio transport — no port, no shared service; runs on demand per MCP client session
- Reads session logs at `~/.claude/projects/` and `~/.copilot/session-state/`
  (read-only, no writes to session log files)
- `mcp-config.json` entry needed to register with Copilot and Claude Code clients
