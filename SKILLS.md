---
name: The Skills Layer
summary: >-
  The companion to SPEC.md: the spec gives an agent awareness of an ideaspace;
  skills give it the ability to work there. The per-session loop is arrive →
  orient → inspect → act → capture → push/pull → reflect. Shared skill substance
  lives in this protocol's skills/ catalog and is distributed to each surface;
  thin surface entrypoints adapt it to their native tools. Daily intent skills
  are is-orient, is-capture, is-push, is-pull, and is-reflect, with lifecycle,
  shaping, and reference skills alongside them.
---

# The Skills Layer

> SPEC.md is half the understanding layer — awareness, the shape an agent can *perceive*. This is the other half: **ability**, the verbs an agent uses to *work* a space. Skills are not optional polish; an agreement that is read but not maintained goes stale on contact.

## The operating loop

A skill matches an intent, and intents follow a per-session cycle:

**arrive → orient → inspect → act → capture → push/pull → reflect**

| Phase | What happens |
|---|---|
| **Arrive** | Detect the space, position, and git state. Automatic session-start behavior, not a skill the agent picks. |
| **Orient** | Read the effective `foundation` / `guide` / `purpose` / `now` / `next` contract and position surfaces. |
| **Inspect** | Explore the relevant knowledge, code, and state before acting. |
| **Act** | Do the work: ordinary edits, research, code, or domain-specific procedures. |
| **Capture** | Reach agreement on what changed in shared understanding, then write and commit it deliberately. |
| **Push/pull** | Push committed captures outward or pull others' committed captures inward. The directions stay separate. |
| **Reflect** | Check declared understanding against reality and propose a concrete recalibration when they differ. |

This is **not** the knowledge loop. The knowledge loop describes how shared understanding advances across people and conversations. This is the **operating loop** for one agent session. They meet at Capture, where working state becomes shared understanding.

## Intent → skill → tool

The agent chooses the intent; the skill chooses the mechanism; the tool performs the operation.

```text
loop phase → intent skill → native or is_* tool → CLI / protocol implementation
```

The user should not have to choose between equivalent backends. They ask to capture, push, pull, or reflect; the surface adapts that intent to its native tools.

## The surface skill set

The IdeaSpaces-specific skills cluster around the phases that touch shared understanding. Inspect and Act remain generic agent work.

| Phase / role | Skill | Typical mechanism |
|---|---|---|
| Arrive | — | session-start awareness, git state, `refs/ideaspaces/seen` |
| Orient | `is-orient` | composed `_agent/` contract, position surfaces, `is_status` when needed |
| Inspect | — | native read/search tools |
| Act | — | native edit/write/shell tools and domain skills |
| Capture | `is-capture` + `is-writing` | `is_write` for Notes or native edits for existing docs, then `is_commit` |
| Push | `is-push` | `is_push` |
| Pull | `is-pull` | `is_pull` |
| Reflect | `is-reflect` | compare declarations with reality; capture an agreed update |

Skills outside the daily loop:

- **`is-setup`** — scaffold the seed `_agent/` contract when no ideaspace exists yet.
- **`is-publish`** — host a local ideaspace at a remote.
- **`is-shape`** — change how work happens by evolving the contract, a reusable primitive, or a perspective.
- **`is-space`** — compatibility and contract reference.
- **`is-writing`** — the Note-writing standard used during capture.

## One home for shared substance

A skill has two layers with different homes:

- **Shared protocol substance** lives once in [`skills/`](skills/). The build embeds that catalog into the reference library; the SDK re-exports it for compatibility; surfaces generate their committed `reference/` copies from it.
- **Surface entrypoints** live in each adapter. They stay thin, match user intent, and translate the shared protocol into native tool names, commands, confirmation flows, and runtime constraints.

Update shared awareness, capture, writing, or shaping guidance here first, release the protocol, bump downstream dependencies, then regenerate surface references. Do not hand-edit generated copies.

Surface entrypoints need semantic parity, not byte identity. Pi and Claude Code expose different native tools and UI flows, but the same intent should reach the same agreement boundary and produce the same portable result.

## Conformance posture

A conformant surface:

- exposes the daily intents without collapsing push and pull into an ambiguous sync operation;
- keeps capture deliberate: preview or agreement before persistence, explicit commit afterward;
- uses native tools for generic inspection and action instead of duplicating them behind protocol-specific wrappers;
- reads shared protocol substance from the protocol-owned catalog;
- keeps surface-only mechanics out of the shared skill text.

---

**Related:** [SPEC.md](SPEC.md) — the awareness layer this completes.
