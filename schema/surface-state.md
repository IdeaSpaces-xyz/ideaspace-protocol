# Shared surface state — the interop conventions

> The checkable, language-neutral form of the state that conformant **surfaces** (a Claude Code plugin, a Pi extension, a CLI, another runtime) share to coexist. It is neither content nor shape — it is the coordination state two tools must derive **identically** or they silently split. Normative rationale is [`../SPEC.md`](../SPEC.md) invariant 6 (the underscore extension point), generalized out of the tree. **Provisional, v0.4.2.**

## The namespace move, twice more

[SPEC.md](../SPEC.md) invariant 6 reserves the underscore namespace **inside** a space: any `_`-prefixed folder is infrastructure, loaded by position, and a conformant agent gracefully ignores one it doesn't understand. The same move applies in two namespaces that live **outside** the content tree, where surfaces keep per-user and per-repo coordination state:

| Namespace | Where | Holds |
|---|---|---|
| `~/.ideaspaces/` | user home | per-project caches — the session-id bridge, the open-Change record |
| `refs/ideaspaces/` | git refs | per-repo markers — the last-seen ref |

The reservations carry the same guarantees as the underscore rule: a surface **owns writes** to these; the protocol library **derives and reads** (never writes — the read-only shape-primitive rule); and a surface gracefully ignores a key it doesn't understand. A surface that gets the derivation wrong doesn't corrupt anything — it just fails to see what another surface wrote, which the golden values below exist to prevent.

## Per-project cache key

Both `~/.ideaspaces/` caches are keyed per project directory:

```
key = sha256(resolve(projectDir)).hexdigest()[:16]
path = <home>/.ideaspaces/<kind>/<key>
```

- **Resolve first.** The dir is absolutized before hashing, so `/w/a`, `/w/./a`, and `/w/b/../a` key identically.
- **Keyed by dir, not session.** The reader (an MCP server) only knows the project dir, never the session id. Consequence: two sessions in the *same* dir share one file (last write wins); distinct dirs — including git worktrees — are isolated.
- **Golden value (cross-implementation lock).** `home=/home/u`, `projectDir=/work/a` →
  - `sessions/`: `/home/u/.ideaspaces/sessions/d7f9747246691548`
  - `changes/`: `/home/u/.ideaspaces/changes/d7f9747246691548`

  Any implementation — this reference lib or a third-party one — MUST reproduce these paths, or it cannot read what another surface wrote.

### `sessions/<key>` — the Conversation bridge

Plain text: the host session id, one line. A surface that can observe its host's session id (e.g. a Claude Code SessionStart hook) writes it; a surface that cannot (the MCP server, which sees only the project dir) reads it to stamp the `Conversation` trailer ([`trailers.md`](trailers.md)). Absent → the trailer is omitted, never faked.

### `changes/<key>` — the open-Change record

JSON, one object. The open [Change](trailers.md) ([`trailers.md`](trailers.md) defines the `Change-Id` it carries), persisted so it survives a surface restart and is **visible across surfaces**:

```json
{
  "change_id": "chg_token-bucket-a3f9",
  "handle": "token bucket",
  "opened_at": 1768600000000,
  "session_id": "019f6fa6-bce0-7313-af58-d3cb1aa94f55"
}
```

| Field | Type | Meaning |
|---|---|---|
| `change_id` | string, matches `Change-Id` format | the open Change |
| `handle` | string, optional | the decision handle it was minted from |
| `opened_at` | number (epoch ms), tolerated-missing | when it opened — feeds "opened Nd ago" surfacing; a missing or non-number value defaults to `0` (not treated as malformed) |
| `session_id` | string, optional | the session that opened it — the arming discriminator |

A malformed record, or one whose `change_id` is invalid, is treated as **no open Change** (fail open), never an error.

**The arming rule.** On resolving the record for a session, a surface decides:

- **arm** — `record.session_id` equals the current session id → a same-session restart; re-arm silently.
- **surface** — any other or unknown session → show it, require an explicit resume; never stamp automatically.
- **none** — no record.

If either side lacks a session id, the outcome is **surface**, never arm. Because session ids never collide across surfaces, a record written by one surface always **surfaces** (never silently arms) in another — this is what makes cross-surface silent stamping impossible by construction, while a genuine same-session restart still re-arms.

## Per-repo marker: `refs/ideaspaces/seen`

A git ref pointing at HEAD as of a surface's last session — the baseline a "since last session" diff is computed against ([SKILLS.md](../SKILLS.md), the Arrive phase). A surface writes it (`git update-ref refs/ideaspaces/seen <sha>`) at session end or after orientation; the protocol library only reads it (`git rev-parse --verify --quiet refs/ideaspaces/seen`). Unset → a first session; the diff falls back to a bounded recent-commit window.

## Scope

This document defines the **derivation and shape** of shared surface state — the paths, the record, the ref, and the arming rule a conformant surface reads and writes. It does **not** define *when* a surface persists or clears these (that is surface behavior), nor add any requirement to bare git: like the underscore namespace and the Change layer, this is **opt-in and additive** — a repo and a home dir with none of these files are still fully conformant.
