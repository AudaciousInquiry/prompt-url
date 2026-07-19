---
schema_version: '1.0'
updated:
  - date: '2026-07-19T14:11:36.296Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:11:36.297Z
    summary: Generalize privacy policy — remove internal tool names from public repo
  - date: '2026-07-19T14:06:15.032Z'
    user: boonek
    agent:
      name: github-copilot
      version: '1.0'
    llm:
      name: claude-sonnet-4.6
      version: '4.6'
    prompt_uri: >-
      prompt://github-copilot/95602ecf-b509-42b5-b5c4-cefb007525df/2026-07-19T14:06:15.032Z
    summary: Add provenance tracking to project instructions file
created:
  date: '2026-07-19T13:33:40.000Z'
  user: Keith W. Boone
---
# prompt-url Project Instructions

## Privacy Policy

This repository is **public**. Do not reference internal proprietary tools, private
repositories, or internal implementations in any committed content. Use generic
descriptions when describing provenance or tooling use cases.

The `prompt-url-mcp` server must be self-contained and independently deployable.
Its specs, design, and tasks must not assume or describe any other MCP server.

## General

- All specs go in `openspec/changes/<change-name>/specs/<capability>/spec.md`
- Skills go in `.claude/skills/<skill-name>/SKILL.md` (read by both Claude Code and GitHub Copilot)
- MCP server source goes in `mcp/src/`
- RFC draft documents go in `docs/`
