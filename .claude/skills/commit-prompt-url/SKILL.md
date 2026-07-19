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
after the previous commit, sorted **oldest first** (`result[0]` is the earliest).

### Step 3 — Identify the root-cause prompt

Do not blindly take `result[0]`. The oldest prompt is only a starting point.
The agent must reason about which prompt in the list actually caused the code
changes being committed.

**Read the staged diff:**
```bash
git diff --cached --stat
git diff --cached
```

**Then examine each prompt's `user_message`** and ask: does this message plausibly
explain the files changed and the nature of the changes? Consider:

- A prompt asking to "update PiP" or "log the session" does NOT explain code changes.
- A prompt asking to "fix the authentication bug" DOES explain changes to `auth.js`.
- A prompt asking to "add tests" explains new test files but not production code changes.
- If multiple prompts each explain part of the diff, pick the one that best explains
  the primary intent of the commit (what you put in the commit message subject line).

**When the match is clear:** use that prompt's `prompt_url`.

**When it is ambiguous** (e.g., two prompts both plausibly explain the diff): pick
the earlier one — it is more likely to be the initiating request, with the later
one being a follow-up refinement.

**When no prompt clearly explains the diff** (e.g., purely mechanical follow-up
work): use the most recent prompt that was part of the same work context, even
if it was a refinement or follow-up rather than the original request. If truly
uncertain, ask the user which prompt to attribute before committing.

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
