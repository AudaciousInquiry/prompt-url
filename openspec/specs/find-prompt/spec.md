# find-prompt Specification

## Purpose
Defines the `find_prompt` MCP tool, which searches AI agent session logs for human-authored prompts by time range. It enables callers to retrieve the set of prompts that occurred in a given window — the primary use case being identifying which prompt initiated a code change (for use in git commit `Prompt-URL:` trailers). Results are returned sorted oldest-first to support root-cause identification and forward-pagination.
## Requirements
### Requirement: Time-range prompt search
The MCP server SHALL search all available agent session logs for human-authored prompts
whose timestamps fall within a supplied `since`/`until` range (both RFC 3339, inclusive).
Results SHALL be returned sorted by timestamp ascending (oldest first) and limited
to a caller-specified maximum count (default 10).

#### Scenario: Prompts found within range
- **WHEN** `since` and `until` are provided and matching human prompts exist
- **THEN** the tool SHALL return a list of matches, each containing `prompt_url`,
  `user_message`, `agent`, `session_id`, and `timestamp`

#### Scenario: No prompts found
- **WHEN** no human prompts fall within the supplied range
- **THEN** the tool SHALL return an empty results list with `count: 0`

#### Scenario: Neither commit nor time range provided
- **WHEN** `commit`, `since`, and `until` are all omitted
- **THEN** the tool SHALL return an error indicating that at least one is required

### Requirement: Git commit time range derivation
When a `commit` parameter is provided, the server SHALL invoke `git log` to determine
the commit's timestamp and the timestamp of its immediate predecessor. These SHALL be
used as `until` and `since` respectively. If the commit has no predecessor (initial
commit), the server SHALL use a 24-hour window ending at the commit timestamp.

The `cwd` parameter SHALL control the working directory for git invocations; it SHALL
default to the server process's working directory when omitted.

#### Scenario: Commit resolves to time range
- **WHEN** a valid commit hash is provided and git is available
- **THEN** `since` SHALL equal the predecessor commit timestamp and `until` the commit timestamp

#### Scenario: Initial commit uses 24-hour fallback
- **WHEN** the provided commit is the repository's first commit
- **THEN** `since` SHALL be 24 hours before the commit timestamp

#### Scenario: Invalid commit hash
- **WHEN** `git log` fails for the supplied commit hash
- **THEN** the tool SHALL return an error describing the git failure

### Requirement: Agent filtering
The server SHALL support optional filtering by agent type. The caller MAY restrict the search to a single agent (`claude-code` or `github-copilot`).
When `agent` is `all` or omitted, all agents SHALL be searched.

#### Scenario: Agent filter applied
- **WHEN** agent=`claude-code` and matching prompts exist for both agents
- **THEN** only Claude Code session results SHALL be returned

### Requirement: Harness-injection exclusion
The search SHALL exclude entries that are tool-harness injections rather than authentic
human turns. Known harness patterns (bash I/O wrappers, system-reminder blocks,
continuation summaries) SHALL be filtered out before results are returned.

#### Scenario: Harness-injected content excluded
- **WHEN** a Claude Code session entry contains `<bash-input>` or `<system-reminder>`
- **THEN** that entry SHALL NOT appear in find_prompt results

### Requirement: Pagination via limit and timestamp cursor

The server SHALL support cursor-based pagination. Callers MAY paginate through a large result set by using `limit` in combination with
the `timestamp` of the last result as the next `until` value. Because results are
returned sorted by timestamp descending, each successive call with `until` set to the
previous page's oldest timestamp will return the next page of results.

#### Scenario: First page retrieved
- **WHEN** `find_prompt` is called with a time range and `limit=10`
- **THEN** at most 10 results SHALL be returned, sorted newest-first

#### Scenario: Subsequent page retrieved using cursor
- **WHEN** `find_prompt` is called again with `until` set to the `timestamp` of the
  last result from the previous call, and the same `since` and `limit`
- **THEN** results SHALL begin immediately before that timestamp, providing the next page

#### Scenario: End of results detected
- **WHEN** the number of results returned is less than `limit`
- **THEN** the caller SHALL treat this as the final page (no more results exist)

### Requirement: Session listing
The MCP server SHALL expose a `list_sessions` tool that returns available agent session
log paths, sorted by last-modified time descending. It SHALL support filtering by agent,
a caller-specified limit (default 20), and `since`/`until` timestamp cursors for
pagination consistent with `find_prompt`. When `since` is provided, only sessions with
an `mtime` at or after that value SHALL be returned. When `until` is provided, only
sessions with an `mtime` strictly before that value SHALL be returned.

#### Scenario: Sessions listed for all agents
- **WHEN** `list_sessions` is called with no filter
- **THEN** sessions from both Claude Code and GitHub Copilot SHALL be returned, sorted by mtime

#### Scenario: Sessions filtered by agent
- **WHEN** `list_sessions` is called with agent=`github-copilot`
- **THEN** only Copilot session entries SHALL be returned

#### Scenario: Pagination via mtime cursor
- **WHEN** `list_sessions` is called with `until` set to the `mtime` of the last session
  from the previous page, and the same `limit`
- **THEN** results SHALL begin immediately before that mtime, providing the next page

#### Scenario: End of results detected
- **WHEN** the number of sessions returned is less than `limit`
- **THEN** the caller SHALL treat this as the final page

