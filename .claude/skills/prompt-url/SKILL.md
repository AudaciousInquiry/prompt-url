---
schema_version: '1.0'
name: prompt-url
description: >-
  Rules for generating, embedding, and resolving prompt: URLs in AI agent
  workflows — git commit trailers, file provenance metadata, MCP tool stamps,
  and cross-agent references.
license: Apache-2.0
compatibility: Requires prompt-url-mcp for resolution.
updated:
  - date: '2026-07-19T20:03:05.750Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T20:03:05.751Z
    summary: Correct SKILL.md license from MIT to Apache-2.0
  - date: '2026-07-19T14:05:42.886Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:05:42.886Z
    summary: Update resolver reference to prompt-url-mcp
  - date: '2026-07-19T14:05:38.745Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:05:38.746Z
    summary: Generalize MCP tool provenance description
  - date: '2026-07-19T14:03:53.654Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:03:53.660Z
    summary: Add skill YAML front matter and provenance tracking to SKILL.md
created:
  date: '2026-07-19T13:33:40.000Z'
  user: Keith W. Boone
---
# Skill: prompt-url

**Purpose:** Rules for generating, embedding, and resolving `prompt:` URLs in AI agent
workflows — covering git commit trailers, file provenance metadata, MCP tool stamps,
and cross-agent references.

---

## What Is a Prompt URL?

A `prompt:` URL is a stable locator for a specific user prompt within an AI agent
session. It uniquely identifies the turn that caused a given artifact to be created.

```
prompt://<agent-name>/<session-id>/<prompt-ref>
```

Examples:
```
prompt://claude-code/34d129b9-9dad-439d-92fa-8b9d2d3adb77/~2e150465-a33e-4354-929c-fa2347c8bd00
prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T08:34:49.255Z
```

The `prompt-ref` component is either:
- A `~`-prefixed internal prompt ID (canonical, preferred — stable across all tool calls
  in the same turn)
- An RFC 3339 UTC timestamp (fallback — the time the tool call executed)

---

## When to Generate a Prompt URL

Generate a prompt URL whenever an agent:

1. **Writes or modifies a file** with lasting significance (skills, specs, designs,
   documents, source code)
2. **Creates a git commit** that was AI-assisted
3. **Updates structured metadata** (SKILL.md `updated:` blocks, YAML front matter,
   OpenSpec artifacts)
4. **Makes a decision** that should be traceable for future audit or review

Do NOT generate prompt URLs for ephemeral actions: reading files, running searches,
or producing output that is immediately displayed and not persisted.

---

## Agent-Specific Prompt ID Fields

| Agent | Internal prompt field | Session log location |
|---|---|---|
| Claude Code | `promptId` | `~/.claude/projects/{project}/{session-id}.jsonl` |
| GitHub Copilot CLI | `interactionId` | `~/.copilot/session-state/{session-id}/events.jsonl` |

When operating as either agent, use the internal prompt ID for the canonical
`~`-prefixed form. When the internal ID is unavailable, use the timestamp of the
tool call execution in RFC 3339 UTC format with millisecond precision.

---

## Git Commit Trailers

A git commit generated with AI assistance **SHOULD** include a `Prompt-URL:` trailer
identifying the prompt that produced the change. This creates a traceable link from
the commit back to the exact conversational turn.

### Format

Place `Prompt-URL:` after `Co-authored-by:` in the commit message trailer block:

```
feat: implement session alias registry for prompt URL resolution

Add alias registration, lookup, and conflict detection to the
MCP resolver. Aliases are stored case-normalized (lowercase)
and support multi-alias-per-session binding.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Prompt-URL: prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T08:34:49.255Z
```

### Rules

- **One URL per commit** — use the prompt that produced the majority of the change.
  If a commit spans multiple prompts, use the last one.
- **Use canonical form** — prefer `~promptId` over timestamp when the agent exposes
  the internal ID.
- **Do not include `Prompt-URL:` for commits that are entirely human-authored** —
  the trailer signals AI involvement.
- The `Prompt-URL:` trailer is a convention, not enforced by git. It is parsed by
  tooling that understands the `prompt:` scheme.

---

## File Metadata (SKILL.md and Structured Documents)

When updating a SKILL.md `updated:` block or any YAML metadata field that records
a change, include the `prompt_uri` field:

```yaml
updated:
  - date: '2026-07-19T09:00:00.000Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4-6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T09:00:00.000Z
    summary: >-
      Brief description of what changed and why.
```

The `prompt_uri` field uses the timestamp form when `interactionId` is not available
at the time of writing. When `promptId` or `interactionId` is known, use the
canonical `~`-prefixed form.

---

## MCP Tool Provenance

When using an MCP tool that writes files (e.g., `mcp_write`, `mcp_edit`,
`mcp_append`), include the prompt URL in the provenance metadata if the tool
supports it. An MCP file-writing tool that supports provenance tracking may accept
a `prompt_uri` parameter for exactly this purpose.

If the tool does not support a `prompt_uri` parameter, embed the URL as a
comment or metadata field in the written file where appropriate (e.g., YAML
front matter, a `<!-- prompt-url: ... -->` HTML comment, or a
`# prompt-url: ...` header comment in code).

---

## Resolving a Prompt URL

Use the `prompt-url-mcp` server's `mcp_resolve_prompt` tool to resolve a `prompt:`
URL back to the original user message:

```
mcp_resolve_prompt(uri="prompt://claude-code/34d129b9-.../~2e150465-...")
```

Returns: the original user message text, agent name, session ID, and timestamp.

For GitHub Copilot sessions, the resolver queries the session-state events store
at `~/.copilot/session-state/{session-id}/events.jsonl` using the `interactionId`
field.

For Claude Code sessions, the resolver queries the JSONL session log at
`~/.claude/projects/{project}/{session-id}.jsonl` using the `promptId` field.

---

## Cross-Agent References

A prompt URL is agent-agnostic — a Claude Code session can reference a Copilot
prompt and vice versa. This supports:

- Handoff documentation: "This design was initiated in Copilot session X, continued
  in Claude Code session Y."
- Peer review provenance: an `ai-peer-review` artifact can cite the prompt URLs of
  both agents' originating turns.
- OpenSpec change artifacts: a `proposal.md` updated by one agent can cite the
  prompt URL of the user request that triggered the update.

When embedding a cross-agent reference, always use the full canonical form
(including `~promptId` when available) so the URL remains resolvable by any
agent that has access to the source agent's session logs.

---

## Spec Reference

The `prompt:` URL scheme is formally specified in:

```
draft-boone-prompt-uri-scheme-00
```

Available at:
[github.com/AudaciousInquiry/prompt-url](https://github.com/AudaciousInquiry/prompt-url)

The scheme is targeting the IETF `agentproto` working group (BoF at IETF 126,
Vienna, July 2026) for formal standardization.
