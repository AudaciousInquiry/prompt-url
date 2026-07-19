---
rfcxml:
  ipr: trust200902
  submissionType: independent
  title-abbrev: "prompt URI Scheme"
  area: "Applications and Real-Time"
  workgroup: agentproto
  keywords:
    - URI
    - AI
    - agent
    - prompt
    - provenance
  author:
    initials: K.
    surname: Boone
    organization: "Audacious Inquiry"
    email: kboone@ainq.com
---

# The `prompt` URI Scheme for AI Agent Sessions and Prompts

**Document:** draft-boone-prompt-uri-scheme-01  
**Category:** Informational  
**Author:** Keith W. Boone  
**Date:** 2026-07-19

---

## Abstract

This document defines the `prompt` Uniform Resource Identifier (URI) scheme for
identifying prompts within AI agent sessions.  A prompt URI encodes the agent
identity, session identifier, and a timestamp sufficient to locate the originating
prompt within an agent session log.  The scheme is intended for use in provenance
records, audit trails, and cross-agent references where a human-readable, stable
locator for a prompt interaction is required.

This document also addresses the conditions under which multiple URIs MAY resolve
to the same prompt and the conditions under which a single URI MAY be ambiguous
with respect to the prompt it identifies.

---

## Status of This Memo

This document is an Internet-Draft submitted for informational purposes.  It has
not been approved by the IETF and does not represent a consensus position of that
body.  Distribution of this document is unlimited.

---

## Copyright Notice

Copyright (c) 2026 Keith W. Boone.  All rights reserved.

---

## Table of Contents

1. Introduction
2. Terminology
3. URI Syntax
   - 3.1 Scheme Name
   - 3.2 Authority Component
   - 3.3 Path Component
   - 3.4 Query and Fragment Components
   - 3.5 Complete ABNF
4. URI Components and Semantics
   - 4.1 Agent Name
   - 4.2 Session Identifier
   - 4.3 Timestamp
   - 4.4 Session Aliases
   - 4.5 Canonical Prompt URI
5. Normalization and Comparison
6. Resolution
   - 6.1 Resolution Algorithm
   - 6.2 Alias Resolution
   - 6.3 Unresolvable URIs
7. Ambiguity: Multiple URIs for One Prompt
8. Ambiguity: One URI for Multiple Prompts
9. Security Considerations
10. IANA Considerations
11. Normative References
12. Informative References

---

## 1. Introduction

AI agent systems produce interactions — prompts from users, tool calls by agents,
responses, and observations — that generate artifacts (files, analyses, transformed
documents) whose provenance is difficult to trace after the fact.  Existing identifier
schemes are insufficient for this use case:

- A session identifier alone does not distinguish which prompt within a session
  produced a given artifact.
- A wall-clock timestamp alone does not identify the agent or session.
- An agent-internal correlation identifier (such as a `promptId` or `interactionId`)
  is not exposed to callers of agent tools at call time.

The `prompt` URI scheme addresses this gap by providing a stable, human-readable
identifier that encodes the three pieces of information consistently available to
any tool executing within an agent session: the agent identity, the session
identifier, and the approximate call time.

The resulting URI is suitable for embedding in file provenance metadata, log
cross-references, and audit records.  It is NOT a globally unique identifier in
the strict sense; see Sections 7 and 8 for a full treatment of ambiguity.

The scheme has been implemented and deployed as an open-source Model Context
Protocol (MCP) server [PROMPT-URL-MCP] that resolves, generates, and searches
`prompt` URIs against local agent session logs.  This implementation validates
the design under real-world agent workloads involving both Claude Code and
GitHub Copilot sessions.

Several proposals currently under active consideration in IETF AI-focused
forums address broader questions of AI agent accountability, transparency,
auditability, and interoperability.  The `prompt` URI scheme is intended as a
composable, low-level building block for those frameworks: any mechanism that
tracks, attests to, or makes claims about AI-generated artifacts needs a
stable, lightweight way to reference the specific agent interaction that
produced them.  This document defines that reference.

---

## 2. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when,
and only when, they appear in all capitals, as shown here.

The following terms are used throughout this document:

**Agent:** A software system that processes user prompts, invokes tools, and
produces responses.  Examples include Claude Code, GitHub Copilot, and similar
AI-assisted development tools.

**Session:** A bounded interaction context shared between a user and an agent,
identified by a session identifier assigned at session initiation.

**Prompt:** A single user message that initiates one or more agent actions within
a session.

**Session log:** A persistent record maintained by the agent of all interactions
within a session, including prompts, tool calls, and responses, together with
timestamps and internal correlation identifiers.

**Tool call:** An invocation of an external capability (such as a file write
operation) by the agent in response to a prompt.  The Model Context Protocol
[MCP] is one standardized mechanism by which agents invoke such capabilities.

**Provenance record:** Metadata attached to an artifact describing its origin,
including the agent, session, and prompt responsible for its creation.

**Prompt URI:** A URI conforming to this specification that identifies a prompt
within a specific agent session.

**Session alias:** A human-readable string registered by the user or agent as an
alternative identifier for a session, usable in place of the session identifier
in a prompt URI.  An alias is scoped to a single agent and MUST be unique within
that agent's alias registry.

**Alias registry:** A local store, maintained by an implementation, that maps
registered session aliases to their corresponding session identifiers.

---

## 3. URI Syntax

### 3.1 Scheme Name

The scheme name is `prompt`.  It SHALL be written in lowercase in all generated
URIs.  Implementations processing incoming URIs SHOULD treat the scheme name as
case-insensitive per [RFC3986] Section 6.2.2.1.

### 3.2 Authority Component

The authority component of a prompt URI identifies the agent that generated the
URI.  It consists solely of the agent name; no userinfo or port subcomponents are
defined.  The authority MUST be present and MUST NOT be empty.

### 3.3 Path Component

The path component SHALL consist of exactly two segments separated by a slash:

1. A session reference — either a session identifier (Section 4.2) or a
   registered session alias (Section 4.4)
2. The timestamp

The path MUST begin with a slash.  Both segments MUST NOT be empty.

### 3.4 Query and Fragment Components

This specification does not define semantics for query (`?`) or fragment (`#`)
components.  Implementations MAY append a fragment to a prompt URI as an
implementation-specific disambiguation hint (see Section 8), but SHALL NOT
rely on fragment processing in interoperable contexts.  The query component
SHOULD NOT be used; its presence does not affect identity or comparison.

### 3.5 Complete ABNF

The following grammar, expressed in Augmented Backus-Naur Form [RFC5234], defines
the syntax of a prompt URI.  Terms not defined here are imported from [RFC3986]
(`unreserved`, `pct-encoded`) and [RFC3339] (`date-time`).

```abnf
prompt-URI    =  "prompt://" agent-name "/" session-ref "/" prompt-ref

agent-name    =  1*agent-char
agent-char    =  unreserved / pct-encoded / "+" / "."

session-ref   =  session-id / session-alias
                 ; Parsers cannot distinguish the two forms syntactically;
                 ; the distinction is semantic (Section 4.2, Section 4.4)

session-id    =  1*( unreserved / pct-encoded )
                 ; Typically a UUID per RFC 9562

session-alias =  1*( unreserved / pct-encoded )
                 ; Special characters including SP (U+0020) MUST be
                 ; percent-encoded per [RFC3986] — see Section 4.4

prompt-ref    =  date-time / prompt-id
                 ; Either an RFC 3339 timestamp or a prompt identifier;
                 ; date-time always begins with a 4-digit year, so
                 ; the "~" prefix of prompt-id is unambiguous
                 ; See Sections 4.3 and 4.5

date-time     =  <date-time as defined in RFC 3339, Section 5.6>
                 ; Colons within date-time are valid in URI path
                 ; segments per RFC 3986 Section 3.3
                 ; Example: 2026-07-07T16:45:23.856Z

prompt-id     =  "~" 1*( unreserved / pct-encoded )
                 ; Agent-internal prompt correlation identifier;
                 ; "~" (U+007E, unreserved per RFC 3986) distinguishes
                 ; prompt-id from date-time in all syntactic contexts
                 ; Example: ~abc123, ~promptId%3Axyz
```

The following prompt URIs are all syntactically valid.  The first uses a
session identifier with a timestamp; the second uses a session alias with a
timestamp; the third uses a session identifier with a prompt identifier
(the canonical preferred form; see Section 4.5):

```
prompt://claude-code/5674b542-0b94-4d12-bc05-d271a4131354/2026-07-07T16:45:23.856Z
prompt://claude-code/md-csv-mcp%20design/2026-07-07T16:45:23.856Z
prompt://claude-code/5674b542-0b94-4d12-bc05-d271a4131354/~abc123
```

Breaking the alias-based example into components:

```
prompt-URI = "prompt://"
             "claude-code"              ; agent-name
             "/"
             "md-csv-mcp%20design"     ; session-alias (space encoded as %20)
             "/"
             "2026-07-07T16:45:23.856Z" ; prompt-ref: timestamp form (RFC 3339)
```

Breaking the canonical prompt-id example into components:

```
prompt-URI = "prompt://"
             "claude-code"              ; agent-name
             "/"
             "5674b542-0b94-4d12-bc05-d271a4131354"  ; session-id
             "/"
             "~abc123"                  ; prompt-ref: prompt-id form (Section 4.5)
```

---

## 4. URI Components and Semantics

### 4.1 Agent Name

The agent name identifies the software agent that generated the URI.  It is
NOT a globally registered identifier; implementations SHOULD use a stable,
recognizable short name (e.g., `claude-code`, `github-copilot`, `cursor`).
Agents operated by different organizations SHOULD use distinct names to
avoid collision.

The agent name MAY include a dot-separated hierarchy for namespacing
(e.g., `anthropic.claude-code`), but this structure carries no defined semantics
in this specification.

The agent name SHALL remain constant across all sessions and versions of a given
agent implementation.  Including a version number in the agent name is NOT
RECOMMENDED, as it would render URIs from different versions incomparable even
when they refer to the same logical agent.

### 4.2 Session Identifier

The session identifier SHALL be an opaque string assigned by the agent at session
initiation.  Implementations SHOULD use a UUID [RFC9562] for the session
identifier to minimize collision probability across agents and deployments.
UUID version 7 [RFC9562] is RECOMMENDED over version 4 because its
monotonically increasing structure supports chronological ordering of sessions.

The session identifier SHALL be consistent throughout a session and SHALL NOT
change during a session's lifetime.

### 4.3 Timestamp

The timestamp SHALL be formatted as an RFC 3339 [RFC3339] `date-time` value and
SHALL use UTC (the `Z` suffix).  The timestamp records the wall-clock time at
which the tool call generating the URI was executed.

Implementations SHOULD include sub-second precision (milliseconds) in the
timestamp to reduce the probability of within-session collisions (see Section 8).
A timestamp with second-level precision is REQUIRED; millisecond precision is
RECOMMENDED; microsecond precision MAY be used.

The timestamp is NOT the time at which the originating prompt was submitted.
It is the time at which the tool call was executed.  For a given prompt, multiple
tool calls MAY be executed, potentially spanning multiple seconds.  Each tool call
produces a URI with its own timestamp; all such URIs are considered to refer to
the same prompt for resolution purposes (see Section 6).

When the agent maintains an internal prompt correlation identifier, the canonical
form of the URI SHOULD use that identifier in place of the timestamp (Section 4.5).

### 4.4 Session Aliases

A session alias is a human-readable string that a user or implementation MAY
register as an alternative to the session identifier in a prompt URI.  Aliases
improve legibility: `prompt://claude-code/md-csv-mcp-design/...` is more
immediately meaningful than `prompt://claude-code/5674b542-.../...`.

**Registration:** Aliases SHALL be registered in a local alias registry that maps
each alias to the session identifier it represents.  An alias is scoped to a
single agent name and MUST map to exactly one session within that agent's registry.
A session MAY have more than one alias registered to it.

Attempting to register an alias that is already registered to a different session
SHALL be rejected with a conflict error.  Attempting to register an alias that is
already registered to the same session is idempotent and SHALL succeed without
modifying the registry.

**Case insensitivity:** Alias lookup SHALL be case-insensitive.  The alias
`MD-CSV-MCP-Design`, `md-csv-mcp-design`, and `Md-Csv-Mcp-Design` MUST all
resolve to the same session.  Implementations SHOULD store aliases in normalized
lowercase and normalize incoming aliases to lowercase before lookup.

**Canonical URI form:** In a prompt URI, an alias SHALL appear in its canonical
URI form, which is the percent-encoded representation of the alias string with
all characters encoded per [RFC3986] as required.

**Handling of spaces and special characters:** Spaces (U+0020) and any other
characters not permitted in a URI path segment by [RFC3986] MUST be
percent-encoded in the canonical URI form of an alias.  The alias
`md-csv-mcp design` is canonically encoded as `md-csv-mcp%20design` in a prompt
URI.  Hyphens and spaces remain distinct: the alias `md-csv-mcp design` and the
alias `md-csv-mcp-design` are different aliases and resolve to different sessions
(if both are registered).

Implementations that accept prompt URIs as input MAY repair aliases containing
unencoded special characters by applying percent-encoding before lookup, in the
same manner that web browsers such as Chrome and Edge correct malformed URIs.

Implementations MUST preserve the original human-readable alias string (as
supplied at registration time, before percent-encoding) in the alias registry.
This allows the original label to be displayed in user interfaces without loss
of information.

**Alias persistence:** Alias registries are implementation-defined and may not
persist indefinitely.  Agents are not required to maintain alias registries
across restarts, updates, or deployments.  Users and systems requiring
long-term, portable provenance references SHOULD use the session-identifier
form of the prompt URI rather than the alias form, since session identifiers
are generated by the agent and stored in its session log independently of any
alias registry.  Prompt URIs using an alias remain valid provenance references
as long as the alias registry is intact, but are subject to becoming
unresolvable (Section 6.3) if the registry is lost or unavailable.

**Alias-to-session-id URIs:** When a session has both a registered alias and a
session identifier, both forms of prompt URI are valid and refer to the same
session.  Implementations MAY use the alias form in newly generated provenance
records when an alias is registered, as it improves human readability.

### 4.5 Canonical Prompt URI

A prompt URI is *canonical* if its `prompt-ref` component is the most specific
and stable identifier available for the prompt it represents.  The canonical
form determines which URI SHOULD be stored in provenance records.

**Prompt identifier form (preferred):** When the agent maintains an internal
correlation identifier for each prompt (for example, `promptId` in Claude Code
session logs [CLAUDE-SESSIONS] or `interactionId` in Copilot session logs
[COPILOT-SESSIONS]), the canonical URI SHOULD use the `prompt-id` form
(Section 3.5) with a leading `~` character:

```
prompt://claude-code/5674b542-0b94-4d12-bc05-d271a4131354/~abc123
```

A canonical prompt-id URI uniquely identifies the prompt regardless of when
tool calls execute within the prompt's processing.  Because all tool calls from
the same prompt share the same prompt identifier, two prompt-id URIs with the
same `session-ref` and `prompt-id` components can be detected as equivalent
by string comparison, without consulting the session log.

**Timestamp form (fallback):** When no prompt identifier is available, the
canonical URI SHOULD use the timestamp at which the originating prompt was
submitted by the user — not the timestamp of any particular tool call within
the prompt's processing.  An implementation that records prompt-submission
timestamps MAY use that timestamp in the canonical URI even if individual
tool calls use their own tool-call timestamps (Section 4.3).

Tool-call timestamp URIs (those generated at the time a tool call executes)
are valid provenance references but are not canonical: multiple such URIs from
the same prompt are not equivalent by comparison (Section 5), even though they
resolve to the same prompt (Section 6).

**Normalizing to canonical form:** Implementations SHOULD normalize all prompt
URI references for a given prompt to the canonical URI before writing provenance
records.  Normalizing to the prompt-id form, when available, enables
deduplication of provenance entries across the tool calls of a single prompt
without requiring session log access.

---

## 5. Normalization and Comparison

Two prompt URIs SHOULD be considered equivalent if and only if all of the
following hold after applying the normalization rules in [RFC3986] Section 6:

1. Their scheme components are identical (case-insensitively).
2. Their agent-name components are identical (case-insensitively).
3. Their session-ref components identify the same session, determined as follows:
   - If both are session identifiers: they are identical after percent-decoding
     (case-sensitive).
   - If both are session aliases: they are identical after percent-decoding and
     case-folding to lowercase.
   - If one is a session identifier and the other a session alias: they are
     equivalent if and only if the alias resolves to the same session identifier
     per the alias registry (Section 6.2).
4. Their `prompt-ref` components identify the same prompt reference, as
   determined by the following rules:
   - If both are timestamps (`date-time`): they represent the same instant
     in time, after normalizing to UTC and applying the date-time comparison
     rules of [RFC3339].
   - If both are prompt identifiers (`prompt-id`): they are identical after
     percent-decoding (case-sensitive, following percent-decoding).
   - If one is a timestamp and the other is a prompt identifier: they are
     NOT equivalent; resolution (Section 6) is required to determine whether
     they refer to the same prompt.

Timestamps that differ by any amount of time, however small, are NOT equivalent
and SHALL NOT be treated as identifying the same prompt URI.  Equivalence and
resolution are distinct concepts: two non-equivalent URIs MAY nonetheless resolve
to the same prompt (Section 7), and a single URI MAY be ambiguous (Section 8).
Two URIs that differ only in their `prompt-ref` form (one using a timestamp,
one using a prompt identifier) are likewise non-equivalent by this definition,
even if they identify the same underlying prompt.

---

## 6. Resolution

### 6.1 Resolution Algorithm

Resolution is the process of mapping a prompt URI to one or more candidate
prompts in an agent's session log.  Resolution is OPTIONAL; a prompt URI
is valid and useful as a provenance reference even when the referenced session
log is unavailable.

A conformant resolver SHALL apply the following steps:

1. Parse the prompt URI and extract `agent-name`, `session-ref`, and `prompt-ref`.
   If `session-ref` is an alias, resolve it per Section 6.2 to obtain the
   session identifier.

2. Locate the session log associated with the session identifier for the agent
   identified by `agent-name`.  If no such log is accessible, the URI is
   unresolvable (Section 6.3).

3. If `prompt-ref` is a `prompt-id` (begins with `~`): strip the `~` prefix,
   percent-decode the remainder, and locate all session log entries whose
   prompt correlation identifier matches.  If exactly one entry is found, the
   URI resolves to that prompt.  Proceed to step 5.

   If `prompt-ref` is a `date-time`: convert the timestamp to UTC milliseconds
   and identify all session log entries whose recorded timestamp falls within a
   resolution window centered on the URI timestamp.  The RECOMMENDED resolution
   window is ±1 second; resolvers MAY use a narrower window when the URI
   timestamp has sub-second precision and the session log records sub-second
   timestamps.

4. From the candidate entries, identify those that are prompt-type entries
   (user messages that initiated a turn), as opposed to tool call or response
   entries.

5. If exactly one prompt-type candidate is found, the URI resolves to that
   prompt.

6. If multiple prompt-type candidates are found, the URI is ambiguous
   (Section 8).  The resolver SHOULD report all candidates and SHOULD NOT
   silently select one.

7. If the session log records an agent-internal correlation identifier
   (e.g., `promptId` in Claude Code session logs [CLAUDE-SESSIONS],
   `interactionId` in Copilot session logs [COPILOT-SESSIONS]),
   implementations MAY use that identifier to narrow candidate selection
   to a single result.

### 6.2 Alias Resolution

When the session-ref component of a prompt URI does not parse as a UUID and is
not otherwise recognizable as a session identifier, the resolver SHALL treat it
as a session alias and apply the following steps before proceeding with
Section 6.1:

1. Normalize the alias: percent-decode, then fold to lowercase.

2. Look up the normalized alias in the alias registry for the agent identified
   by `agent-name`.

3. If a matching entry is found, substitute the corresponding session identifier
   into the resolution process and continue with Section 6.1 step 2.

4. If no matching entry is found, the URI is unresolvable (Section 6.3).
   Implementations SHOULD report "alias not registered" as a distinct
   unresolvable condition, separate from "session log not found."

### 6.3 Unresolvable URIs

A prompt URI is unresolvable if any of the following conditions hold:

- The `session-ref` is a session alias that is not registered in the alias
  registry.
- The session log for the resolved session identifier is not accessible to
  the resolver.
- The session log has been deleted, expired, or is otherwise unavailable.
- The `agent-name` is not recognized by the resolver.
- No session log entries fall within the resolution window.

An unresolvable URI is NOT invalid.  The URI remains a valid provenance
identifier and SHALL be preserved in provenance records even when the
referenced session is no longer accessible.  Resolvers SHOULD distinguish
between "unresolvable" and "invalid" when reporting resolution status.

---

## 7. Ambiguity: Multiple URIs for One Prompt

A single prompt MAY be the source of multiple tool calls, each of which
produces a prompt URI with a distinct timestamp.  This is the common case
in agent workflows, where a single user message triggers a sequence of file
reads, web fetches, and file writes, each implemented as a separate tool call.

All prompt URIs generated within the same session from the same originating
prompt refer to that same prompt, even though their `prompt-ref` components
differ.  Implementations SHOULD treat these URIs as semantically equivalent
for provenance purposes, even though they are not syntactically equivalent
(Section 5) and will not compare as equal.

When the agent provides a prompt correlation identifier, implementations SHOULD
normalize all such URIs to the canonical prompt-id form (Section 4.5) before
writing provenance records.  This eliminates the proliferation of distinct URIs
for the same prompt and enables deduplication by string comparison, without
session log access.

Additionally, the same prompt may be identifiable by URIs with different
timestamp precision:

```
prompt://claude-code/5674b542.../2026-07-07T16:45:23Z
prompt://claude-code/5674b542.../2026-07-07T16:45:23.856Z
```

Both of the above URIs identify the same instant in time at different
precision levels.  Per Section 5, these URIs are NOT equivalent.  Per
Section 6.1, they SHOULD resolve to the same candidate when the resolution
window is applied.  Implementations that store provenance records SHOULD
use a consistent timestamp precision to minimize the proliferation of
distinct URIs for the same prompt.

---

## 8. Ambiguity: One URI for Multiple Prompts

A single prompt URI MAY be ambiguous when multiple distinct prompts occur
within the resolution window of its timestamp.  This arises in the following
conditions:

**Within-session collision:** Two or more distinct user prompts within the
same session are submitted and processed within the same second (or within
the resolution window of a sub-second timestamp).  This is uncommon in
interactive agent sessions, where user prompts are typically separated by
seconds to minutes, but MAY occur in automated pipelines where prompts are
submitted programmatically without human pacing.

**Cross-session collision:** Two sessions with different session identifiers
are not a source of ambiguity for a given URI, since the session identifier
is a URI component.  However, if a resolver has access to session logs from
multiple agents with the same `agent-name`, and two such logs share a
`session-id` value (which SHOULD NOT occur when UUIDs are used), a cross-log
collision is possible.

### 8.1 Mitigation

Implementations SHOULD use millisecond-precision timestamps (rather than
second-precision) to reduce the probability of within-session collisions.
With millisecond precision, a collision requires two distinct prompts to
arrive within the same millisecond, which is negligible in interactive use.

Implementations MAY append a fragment identifier to a prompt URI to encode
an agent-internal correlation identifier when that identifier is known at
call time:

```
prompt://claude-code/5674b542.../2026-07-07T16:45:23.856Z#promptId=abc123
```

Fragment identifiers used for this purpose are implementation-specific and
are NOT REQUIRED for interoperability.  Resolvers that do not recognize a
fragment identifier SHOULD ignore it and apply the standard resolution
algorithm.

### 8.2 Disclosure Requirement

Implementations that generate prompt URIs SHOULD document the timestamp
precision they use and the conditions under which within-session collisions
are possible, so that consumers of provenance records can assess the
reliability of URI-based prompt identification in their deployment context.

---

## 9. Security Considerations

**Confidentiality:** A prompt URI encodes the agent identity, session
identifier, and approximate timestamp of a tool call.  This information
MAY be sensitive in deployments where session identifiers are treated as
access credentials or where the existence of a particular agent interaction
is confidential.  Implementors SHOULD treat prompt URIs with the same
access controls applied to session logs.

**Spoofability:** Prompt URIs are not cryptographically signed.  Any party
with knowledge of a valid agent name, session identifier, and approximate
timestamp can construct a syntactically valid URI.  Resolvers SHALL NOT
treat a prompt URI as proof of authenticity; they SHOULD verify that the
referenced session log actually contains a prompt at the indicated time.

**Log availability:** Resolution depends on the availability of session
logs, which are typically stored on the client machine.  Logs may be
deleted, corrupted, or unavailable to the resolver.  Provenance systems
SHALL NOT treat an unresolvable URI as evidence of tampering; unresolvability
is an expected operational condition.

**Session identifier reuse:** If an agent implementation reuses session
identifiers across sessions (which SHOULD NOT occur when UUIDs are used),
URIs from different sessions would become ambiguous.  Implementations SHALL
use session identifiers with negligible collision probability.

---

## 10. IANA Considerations

This document requests registration of the `prompt` URI scheme in the IANA
Uniform Resource Identifier (URI) Schemes registry, established by [RFC7595].

**Scheme name:** `prompt`  
**Status:** Provisional  
**Applications/protocols that use this scheme:** AI agent provenance metadata,
session log indexers, agent tool frameworks.  
**Contact:** Keith W. Boone  
**Change controller:** Keith W. Boone  
**References:** This document.

Pending IANA registration, implementations SHALL treat the `prompt` scheme
as an unregistered provisional scheme per [RFC7595] Section 3.3.

---

## 11. Normative References

**[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate Requirement
Levels", BCP 14, RFC 2119, March 1997.

**[RFC3339]** Klyne, G. and C. Newman, "Date and Time on the Internet:
Timestamps", RFC 3339, July 2002.

**[RFC3986]** Berners-Lee, T., Fielding, R., and L. Masinter, "Uniform Resource
Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005.

**[RFC5234]** Crocker, D. and P. Overell, "Augmented BNF for Syntax
Specifications: ABNF", STD 68, RFC 5234, January 2008.

**[RFC7595]** Thaler, D., Ed., Hansen, T., and T. Hardie, "Guidelines and
Registration Procedures for URI Schemes", BCP 35, RFC 7595, June 2015.

**[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
Words", BCP 14, RFC 8174, May 2017.

**[RFC9562]** Davis, K., Peabody, B., and P. Leach, "Universally Unique
IDentifiers (UUIDs)", RFC 9562, May 2024.

---

## 12. Informative References

**[MCP]** Anthropic, "Model Context Protocol Specification", 2024.
Available at: https://modelcontextprotocol.io/

**[PROMPT-URL-MCP]** Boone, K., "prompt-url-mcp: MCP Server for prompt:// URI
Resolution and Generation", 2026.
Available at: https://github.com/AudaciousInquiry/prompt-url and
https://www.npmjs.com/package/@audaciousinquiry/prompt-url-mcp

**[CLAUDE-SESSIONS]** Anthropic, "Claude Code Session Log Format".
Internal format; session logs stored at
`~/.claude/projects/{project}/{session-id}.jsonl`.
Timestamp format: locale-dependent (Windows: MM/dd/YYYY HH:mm:ss).
Prompt correlation field: `promptId`.

**[COPILOT-SESSIONS]** GitHub, "Copilot Session State Format".
Internal format; session events stored at
`~/.copilot/session-state/{session-id}/events.jsonl`.
Timestamp format: ISO 8601 UTC with milliseconds.
Prompt correlation field: `interactionId`.

---

*End of draft-boone-prompt-uri-scheme-01*
