---
schema_version: '1.0'
name: commit-prompt-url
description: >-
  Finds the correct Prompt-URL: trailer to include in a git commit message.
  Identifies the root-cause prompt that initiated the work being committed
  by querying the prompt-url-mcp MCP server for prompts since the last commit.
license: Apache-2.0
compatibility: Requires prompt-url-mcp MCP server to be running.
---

# commit-prompt-url

## When to Use

Invoke this skill **before every `git commit`** to find the `Prompt-URL:` trailer
that identifies the prompt that initiated the work being committed.

## How to Use

### Step 1 — Get the previous commit timestamp

```bash
git log -1 --format=%cI HEAD
```

This returns the ISO 8601 timestamp of the most recent commit on the current
branch. If there are no commits yet (initial commit), use the session start time.

### Step 2 — Find prompts since the last commit

Call the `find_prompt` MCP tool (from `prompt-url-mcp`):

```json
{
  "since": "<ISO-timestamp-from-step-1>"
}
```

This returns all prompts from the current user's AI agent sessions that occurred
after the previous commit, sorted **newest first**.

### Step 3 — Identify the root-cause prompt

The root-cause prompt is the **oldest** prompt in the result set — the user message
that originally initiated the work now being committed.

- If the result set fits in one page: take the **last item** in the list.
- If pagination is needed (result count equals the `limit`): call `find_prompt`
  again with `until` set to the `timestamp` of the last result, repeat until the
  final page, then take the last item on that page.

Use the `prompt_url` field from that item as the trailer value.

### Step 4 — Add the trailer to the commit message

Place `Prompt-URL:` as the **last trailer line**, after any `Co-authored-by:` lines:

```
feat: add user registration validation

Implement unique-email check at registration time. Returns 409
if the email address is already in use.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Prompt-URL: prompt://github-copilot/95602ecf-.../~8e16a698-...
```

## Notes

- If multiple unrelated tasks were completed since the last commit, use the
  prompt closest in time to the actual code change, not the absolute oldest.
- If no prompts are found in the time range (e.g., manual code changes with no
  agent involvement), omit the `Prompt-URL:` trailer entirely.
- The `prompt_url` returned by `find_prompt` is already in canonical form
  (uses `~<prompt-id>` when available) and can be used directly.
