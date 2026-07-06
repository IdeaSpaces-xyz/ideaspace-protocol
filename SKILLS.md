---
name: The Skills Layer
summary: >-
  The companion to SPEC.md: if the spec is awareness (perceive a space), skills are ability (work it). Skills are organized by the operating loop — the per-session cycle an agent runs: arrive → orient → inspect → act → capture → sync → reflect. Three layers, each disclosing the next: loop phase → skill (the obvious intent match) → MCP/CLI tool → SDK behavior. The space-specific skills cluster in the back half (capture, sync, reflect) plus orient; the front half (arrive, inspect, act) is generic agent work. This operating loop is distinct from the knowledge loop in loop.md (how understanding advances across people and turns) — they meet at capture, don't conflate them. Skill substance has one home: shared protocol (writing, capture, awareness, shaping) lives in the SDK canonical catalog and is generated into each surface; surface entrypoint skills stay thin. Canonical skills: is-orient, is-capture, is-sync, is-reflect (loop), is-shape (meta), is-setup, is-publish (lifecycle), is-space, is-writing (reference). pi-is-space is the reference implementation; the Claude plugin is being brought to parity.
---

# The Skills Layer

> SPEC.md is half the understanding layer — awareness, the shape you can *perceive*. This is the other half: **ability**, the verbs an agent installs to *work* a space. Skills are not optional polish; an agreement that's read but not maintained goes stale on contact.

## The operating loop

A skill matches an intent, and intents follow a cycle — the per-session loop an agent runs from the moment it arrives in a space:

**arrive → orient → inspect → act → capture → sync → reflect**

| Phase | What happens |
|---|---|
| **Arrive** | Session starts. Detect the space, position in the tree, git state. Automatic — a session-start hook, not a skill the agent picks. |
| **Orient** | Read `foundation` / `guide` / `purpose` / `now` / `next` along the path. Understand where we are and what's active. |
| **Inspect** | Explore the relevant knowledge, code, and state before acting. |
| **Act** | Do the work. Ordinary edits, research, code — may use domain skills. |
| **Capture** | The agreement moment: "what changed in shared understanding?" Write or update Notes. |
| **Sync** | Align local and remote — push committed captures, integrate others'. |
| **Reflect** | Check for drift: does `now`, the guide, the spec, or actual practice disagree? |

This is **not** the knowledge loop. The knowledge loop describes how shared understanding advances over time, across people and conversations (capture → read → question → discuss). This is the **operating loop** — how one agent runs a single session. They meet at **Capture**, where working state becomes shared understanding. Keep them distinct.

## Three layers: loop → skill → tool

The agent chooses *intent*; the skill chooses *mechanism*; the tool does the work.

```
loop phase  →  skill (the obvious pick)  →  MCP/CLI tool  →  SDK behavior
```

This is progressive disclosure of capability: you're in a phase, one skill is the natural match, the skill reaches for the tools. The agent never picks between equivalent backends — it names what it wants to do.

## The catalog

The space-specific skills cluster in the **back half** of the loop — the phases that touch shared understanding. The front half is generic agent work that needs no IdeaSpaces skill.

| Phase / role | Skill | Tools |
|---|---|---|
| Arrive | — (session-start hook) | git state, the `refs/ideaspaces/seen` marker |
| Orient | `is-space` (the reference) — largely front-loaded by the hook | read `_agent/` along the path |
| Inspect | — (generic) | Read, Grep, Glob, search |
| Act | — (domain skills) | Edit, Write, Bash |
| Capture | `is-capture` (when) + `is-writing` (how) | `is_write` → `is_commit` |
| Sync | `is-sync` | `is_sync` |
| Reflect | `is-reflect` | the doc-vs-code drift check |

Two skills sit *off* the loop, and that's correct:

- **`is-setup`** — the first-ever Arrive, when there's no space yet (scaffold the `_agent/` contract).
- **`is-shape`** — the meta-move: change *how* the loop works here by editing the contract, adding a skill, or codifying a perspective.

(`is-publish` is a lifecycle action — host the space at a remote — not a loop phase.)

## Skill names

The canonical name is `is-<verb>`, tracking the loop phase: `is-orient`, `is-capture`, `is-sync`, `is-reflect`. SPEC.md's "Two Layers" names the conceptual verbs — *orient, understand, capture, reflect, share*; `inspect`/`act` map to *understand*, and `is-sync` is *share*. The skill name tracks the loop phase, not the conceptual verb, so the intent → skill pick stays obvious.

## One home for skill substance

A skill has two parts, and they live in different places:

- **Shared protocol** — the substance of *how* to capture, write, reflect, shape, orient. This lives **once**, in the SDK canonical skill catalog, and is generated into each surface (`pi-is-space/reference/`, and the plugin's skill resources). Update the protocol in the SDK, regenerate — don't hand-edit each copy.
- **Surface entrypoint** — the thin, platform-specific skill file that points at the protocol and adapts to that surface's tools.

When surface entrypoints carry substance by hand, they drift. The live example: `is-space` taught a platform provenance field as frontmatter on one surface after the same claim had been corrected on another. The fix is structural — substance in the SDK, surfaces generated — not hand-fixing each copy forever.

## Reference implementation

`pi-is-space` is the reference implementation: the operating loop is its stated principle, it carries every loop skill including `is-orient` and `is-sync`, and it generates its `reference/` from the SDK catalog. The Claude plugin is being brought to parity — adding `is-orient` and `is-sync`, and moving surface-skill substance into the shared catalog.

---

**Related:** [SPEC.md](SPEC.md) — the awareness layer this completes.
