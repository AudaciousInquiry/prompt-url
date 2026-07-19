---
schema_version: '1.0'
created:
  date: '2026-07-19T14:26:20.180Z'
  user: boonek
  agent:
    name: github-copilot
    version: '1.0'
  llm:
    name: claude-sonnet-4.6
    version: '4.6'
  prompt_uri: >-
    prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:26:20.181Z
  summary: Add find-prompt capability spec (includes list_sessions)
updated:
  - date: '2026-07-19T18:43:33.472Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:43:33.473Z
    summary: Add since parameter to list_sessions for symmetric time range filtering
  - date: '2026-07-19T18:39:25.352Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:39:25.352Z
    summary: Add pagination scenarios to list_sessions requirement
  - date: '2026-07-19T18:39:08.670Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:39:08.671Z
    summary: Add mtime cursor pagination to list_sessions requirement
  - date: '2026-07-19T18:29:03.319Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:29:03.320Z
    summary: Add pagination requirement using limit and timestamp cursor
  - date: '2026-07-19T18:28:05.716Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T18:28:05.723Z
    summary: Add Purpose section naming find_prompt and list_sessions MCP tools
---
## Purpose

Defines the behavior of two MCP tools: **`find_prompt`**, which searches session logs
by time range or git commit to identify the originating user prompt for a piece of
work; and **`list_sessions`**, which enumerates available agent session logs on the
local machine.

## ADDED Requirements

### Requirement: Time-range prompt search
The MCP server SHALL search all available agent session logs for human-authored prompts
whose timestamps fall within a supplied `since`/`until` range (both RFC 3339, inclusive).
Results SHALL be returned sorted by timestamp descending (most recent first) and limited
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
The caller MAY restrict the search to a single agent (`claude-code` or `github-copilot`).
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

Callers MAY paginate through a large result set by using `limit` in combination with
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
