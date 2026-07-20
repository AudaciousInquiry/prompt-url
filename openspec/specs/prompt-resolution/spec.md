# prompt-resolution Specification

## Purpose
Defines how the `prompt-url-mcp` server resolves a `prompt://` URI back to the original human prompt that it identifies. Resolution involves parsing the URI into its components (agent, session ID, prompt reference), locating the corresponding session log file, and returning the matching prompt record. This enables consumers of a `Prompt-URL:` trailer (e.g., in a git commit) to retrieve the original user message that initiated the work.
## Requirements
### Requirement: URI parsing
The MCP server SHALL parse a `prompt://` URI into its three components — agent name,
session ID, and prompt reference — before attempting resolution. A prompt reference
beginning with `~` SHALL be treated as a canonical prompt ID; any other value SHALL
be treated as an RFC 3339 timestamp.

#### Scenario: Valid canonical URI parsed correctly
- **WHEN** the URI is `prompt://claude-code/<session-id>/~<promptId>`
- **THEN** the resolver SHALL extract agent=`claude-code`, sessionId, and isPromptId=true

#### Scenario: Valid timestamp URI parsed correctly
- **WHEN** the URI is `prompt://github-copilot/<session-id>/2026-07-19T14:00:00.000Z`
- **THEN** the resolver SHALL extract agent=`github-copilot`, sessionId, and isPromptId=false

#### Scenario: Malformed URI rejected
- **WHEN** the URI is missing the session ID or prompt reference component
- **THEN** the resolver SHALL return an error with code `INVALID_URI`

### Requirement: Claude Code resolution
The MCP server SHALL resolve a `prompt://claude-code/...` URI by searching the JSONL
session log at `~/.claude/projects/<project>/<session-id>.jsonl`.

When the prompt reference is a canonical prompt ID (`~<id>`), the resolver SHALL find
the entry whose `promptId` field matches. When it is a timestamp, the resolver SHALL
find entries within ±1000 ms of the target time and walk `parentUuid` chain to reach
a human-authored turn if needed.

#### Scenario: Canonical ID resolves to human turn
- **WHEN** a valid `~<promptId>` is given and a matching entry exists
- **THEN** the resolver SHALL return the `message.content` of the human-authored turn

#### Scenario: Timestamp resolves with 1-second window
- **WHEN** a timestamp URI is given and one human turn falls within ±1000 ms
- **THEN** the resolver SHALL return that turn's content and canonical URI

#### Scenario: Session log not found
- **WHEN** no JSONL file exists for the given session ID
- **THEN** the resolver SHALL return an error with code `SESSION_NOT_FOUND`

#### Scenario: Ambiguous resolution
- **WHEN** multiple human turns fall within the ±1000 ms resolution window
- **THEN** the resolver SHALL return an error with code `AMBIGUOUS`

### Requirement: GitHub Copilot resolution
The MCP server SHALL resolve a `prompt://github-copilot/...` URI by reading
`~/.copilot/session-state/<session-id>/events.jsonl` and matching `type: "user.message"`
events. If `events.jsonl` is absent, the server SHALL fall back to querying
`~/.copilot/session-store.db` using the timestamp form only.

#### Scenario: Canonical ID resolves from events.jsonl
- **WHEN** `events.jsonl` exists and contains a `user.message` event with matching `id`
- **THEN** the resolver SHALL return the event's `data.content` as the user message

#### Scenario: Timestamp resolves from events.jsonl
- **WHEN** `events.jsonl` exists and one `user.message` event falls within ±1000 ms
- **THEN** the resolver SHALL return that event's content and canonical URI

#### Scenario: Fallback to session-store.db
- **WHEN** `events.jsonl` is absent and `session-store.db` exists
- **THEN** the resolver SHALL query the `turns` table by timestamp and return the match

#### Scenario: Canonical ID not resolvable via DB fallback
- **WHEN** `events.jsonl` is absent and the URI uses the `~<id>` form
- **THEN** the resolver SHALL return an error with code `UNRESOLVABLE`

### Requirement: Resolution result format
The resolver SHALL return a JSON object containing: `user_message` (string),
`agent` (string), `session_id` (string), `timestamp` (RFC 3339 string),
`canonical_uri` (the `~<promptId>` form when available, otherwise timestamp form),
and `source` (the backend used: `claude-code`, `copilot`, or `session-store-db`).

#### Scenario: Successful resolution returns all fields
- **WHEN** a URI resolves successfully
- **THEN** all six fields SHALL be present and non-empty in the returned object

