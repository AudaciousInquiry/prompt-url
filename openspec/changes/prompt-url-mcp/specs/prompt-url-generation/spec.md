---
schema_version: '1.0'
created:
  date: '2026-07-19T14:26:20.193Z'
  user: boonek
  agent:
    name: github-copilot
    version: '1.0'
  llm:
    name: claude-sonnet-4.6
    version: '4.6'
  prompt_uri: >-
    prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:26:20.194Z
  summary: Add prompt-url-generation capability spec
updated:
  - date: '2026-07-19T18:28:06.079Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:28:06.080Z
    summary: Add Purpose section naming the generate_prompt_url MCP tool
---
## Purpose

Defines the behavior of the **`generate_prompt_url`** MCP tool, which constructs a
`prompt://` URL from an agent name, session ID, and optional prompt reference.

## ADDED Requirements

### Requirement: URL construction
The MCP server SHALL construct a `prompt://` URL from three inputs: agent name,
session ID, and an optional prompt reference. The resulting URL SHALL conform to the
syntax defined in `draft-boone-prompt-uri-scheme-00`.

When a prompt reference is supplied and begins with `~`, it SHALL be used as-is
(canonical form). When no prompt reference is supplied, the server SHALL substitute
the current UTC timestamp in RFC 3339 format with millisecond precision.

#### Scenario: Canonical form generated when promptId provided
- **WHEN** agent=`claude-code`, session_id=`<uuid>`, prompt_ref=`~<promptId>`
- **THEN** the returned URL SHALL be `prompt://claude-code/<uuid>/~<promptId>`

#### Scenario: Timestamp form generated when no prompt_ref supplied
- **WHEN** agent and session_id are provided and prompt_ref is omitted
- **THEN** the returned URL SHALL be `prompt://<agent>/<session_id>/<current-timestamp>`
- **AND** the timestamp SHALL be in RFC 3339 UTC format with millisecond precision

#### Scenario: Timestamp form generated when prompt_ref is a timestamp
- **WHEN** prompt_ref is an RFC 3339 timestamp string (no `~` prefix)
- **THEN** the returned URL SHALL be `prompt://<agent>/<session_id>/<timestamp>`

### Requirement: Agent name validation
The server SHALL accept `claude-code` and `github-copilot` as valid agent names.
Unrecognized agent names SHALL be rejected.

#### Scenario: Valid agent name accepted
- **WHEN** agent is `claude-code` or `github-copilot`
- **THEN** the URL SHALL be generated successfully

#### Scenario: Invalid agent name rejected
- **WHEN** agent is an unrecognized string
- **THEN** the tool SHALL return a validation error before generating any URL

### Requirement: Embeddability
The generated URL SHALL be a plain string suitable for embedding in YAML front matter,
JSON fields, git commit trailers, and plain-text documents without escaping.

#### Scenario: URL embeds cleanly in YAML front matter
- **WHEN** the URL is placed in a YAML `prompt_uri:` field
- **THEN** it SHALL parse as a valid YAML string scalar without quoting
