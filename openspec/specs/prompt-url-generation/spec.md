# prompt-url-generation Specification

## Purpose
Defines how the `prompt-url-mcp` server constructs `prompt://` URIs. A prompt URL uniquely identifies a specific user prompt within an AI agent session by encoding the agent name, session ID, and a prompt reference (either a canonical prompt ID or a UTC timestamp). This spec covers the URL construction rules and the format of the resulting URI.
## Requirements
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

