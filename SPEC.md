---
name: The Ideaspace Spec
summary: >
  A simple, shareable, traceable piece of brain — and the fixed, platform-neutral
  shape that makes it so. Knowledge in `.md` files, how-to-work in `_agent/`, git
  carries identity and history. Any agent that knows the shape can inhabit any
  conformant space. The base layer gives awareness; skills give ability.
---

# The Ideaspace Spec

> **A simple, shareable, traceable piece of brain** — and the shape that makes it so. An agent that knows this shape can inhabit any conformant space: orient, navigate, work, with no bespoke instructions.

An ideaspace is a folder of markdown under git. Knowledge accumulates as `.md` files; how-to-work lives in `_agent/`; git makes it shareable and carries who-did-what. The shape is fixed so it is *predictable*: drop a conformant agent into a conformant space and it already knows where to look. This document names no platform — a Claude Code agent, a Pi agent, or a third-party tool all read the same shape.

Three properties, three pillars:

- **Simple** — one fixed shape, the same at every scale. Nothing new to learn as you go deeper. → [The Shape](#the-shape)
- **Shareable** — content travels, awareness stays local. The boundary is explicit. → [invariant 7](#the-shape)
- **Traceable** — every change carries who made it and when. → [Identity](#identity)

This is the **base layer**. Knowing the shape *is* awareness. Acting on it — capturing, reflecting, growing the space — is the job of [skills](#two-layers), which ride on the same shape.

---

## The Shape

**1. Position.** Every directory is a position, and every position presents the same way: **summary → surface → children.** The *surface* is the one Note that says what this place is, for everyone (human and agent) — a directory's surface is its `README.md`, a repo's is its root `README.md`, a lone `.md` file is its own surface. Reading surfaces along a path is how you orient: general at the root, specific as you descend.

**2. Two kinds of content** at every position:

- **Knowledge** — regular `.md` files. What we know. This is what accumulates and travels.
- **Agent context** — the `_agent/` folder. How to work here. Read by position, never searched — its surface always, its depth on demand.

Everything that is not underscore-prefixed is knowledge. `README.md` describes the position for everyone; `_agent/` instructs the agent.

**3. The `_agent/` contract.** An `_agent/` folder may carry:

| File | Says |
|---|---|
| `foundation.md` | What this place is + what's here. The handshake. **One per space, at its root.** |
| `guide.md` | How agent and human work together here. |
| `purpose.md` | Why this space exists. The North Star. |
| `now.md` | What's active. |
| `next.md` | What's queued. |

Optional: `schema.md` (the shape of Notes in this folder — guidance, not validation), `skills/` (how to do), `perspectives/` (how to see), `<agent-id>/` (per-agent records).

Not every position needs all of them — a branch might carry only `now.md`. **Give `_agent/` a good surface.** "Always loaded" means loaded at depth 0 — the surface — with depth disclosed on demand and closed again when it would overwhelm context. Small is the mindset, not a limit: `_agent/` can grow when there is need, and progressive disclosure keeps a rich one from flooding attention. Knowledge still carries weight in `.md` files; `_agent/` carries how-we-work.

**A named-but-absent file is a drift signal, not an error.** The contract names `purpose.md`; its absence means direction was never captured. Surface the gap.

**4. Fractal.** `_agent/` can appear at any position. Reading composes along the path — root, then each branch — specificity sharpening as you descend. A branch with no `_agent/` inherits its ancestors'. `foundation.md` lives only at a space root; branches refine, they do not re-declare.

**5. The handshake.** `foundation.md` orients anyone arriving: what this place is, what areas and agreements exist, where to go for what. It **points, it does not reproduce** — one line per area, links for depth. A space without a foundation is just folders; with it, it is a legible place an agent can self-direct through instead of being told where to look.

**6. Underscore is the extension point.** Any `_`-prefixed folder is infrastructure — loaded by position, not search. `_agent/` is the one every agent must understand. Others (`_access/`, `_conversations/`, …) are optional and platform-defined. **An agent gracefully ignores any `_`-folder it does not understand.** This is the portability guarantee: a space can carry features a given agent has never heard of, and that agent still inhabits it correctly.

**7. Awareness ⊋ content.** The working tree can hold more than the space commits — other repos (code), drafts, scratch. `.gitignore` is the allowlist that splits them:

- **Shared** — committed. Travels to anyone you share with.
- **Local** — gitignored. Private to this machine: code repos, drafts, work-in-progress.
- **Per-agent** — `_agent/<agent-id>/`, gitignored. What one agent noticed, learned, plans. Agents read each other's; each writes only its own.

**Awareness is local; only content travels.** A handshake can durably point only to *shared* content — a pointer into a gitignored code repo is real for you, dangling for whoever clones. Same brain, different peripheral vision.

---

## The model

The seven requirements above are all an agent needs to conform. This is the model that explains *why* they are enough — why it is **one** shape at every scale, not a pile of special cases. Rationale, not conformance; an agent that never reads it still inhabits any space correctly.

- **One shape, three stages.** A Note, a folder, and a repo are the same idea expanding, not three kinds of thing: a Note grows children into a folder; a folder earns its own sharing boundary as a repo. The shape — *summary → surface → children* — is identical at every stage.
- **Depth is elaboration.** A child answers "what do you mean?" about the surface above it; the tree is a crystallized conversation, depth the record of what's been asked and answered. Grow a layer only when someone needs to ask — disclose depth on demand, close it when it would crowd attention.
- **Collections vs elaborations.** Two parent→child relations read differently: *elaboration* — heterogeneous children each deepening the surface ("what do you mean?"); *collection* — homogeneous children each instancing one kind ("such as?"). An optional `_agent/schema.md` lets a collection declare its instance shape — the `.gitattributes` of the protocol: in-tree, path-scoped, composing along the path, gracefully ignored. It is **guidance, never validation** — a mismatch is a drift signal about the writer and a promotion signal for the Note, never a rejected write. Schema tends toward validation and validation toward rejection; refusing that slide keeps it an agreement, not a type system.

---

## Identity

Git already has the slots; use them, don't invent a store. This section is the canonical contract for identity and commit trailers — skills and tooling conform to it rather than restating it.

- **Author = the person.** Commits are authored by the space's owner, `person:<username>`. True even for autonomous agent runs — the agent acts under the owner's account. One rule, no special cases.
- **Agent = a `Co-authored-by:` trailer**, on every commit an agent made or assisted:

  ```
  Co-authored-by: Claude Code <agent:claude-code@ideaspaces>
  ```

Provenance lives in **git**, not in a Note's frontmatter. The commit author and the `Co-authored-by` trailer *are* the portable record of who produced what — they travel with history. The same `agent:<id>` / `person:<id>` strings also name per-agent record folders, `_agent/<agent-id>/`.

A platform may *project* these trailers into a queryable provenance index, rebuildable from git — that projection is platform-specific and outside this spec.

Don't conflate provenance with **subject**. *Who produced* a Note rides in git (above); *what a Note is about* rides in its frontmatter — `attached_to`, a single typed `<type>:<id>` link to the entity it describes. The type namespace is platform-defined (the same open-vocabulary rule as the underscore extension point). So `attached_to: agent:x` is a Note *about* an agent, while a commit co-author is the agent that *wrote* it — different layers. Subject travels in the file, provenance in history; internal platform handles live in neither. Field detail is in [`schema/frontmatter.schema.json`](schema/frontmatter.schema.json).

Attribution travels with the content in git history. Per-agent working records do not. Set the person's git identity when the space is created, not when it is published, so attribution is correct from the first commit. *Resolution* of these strings to accounts and profiles (login, identity providers) is a platform concern, outside this spec.

**Traceability — the Change layer.** Identity is the floor: who authored, who co-authored. The full record of *who did what, where, when, and why* — grouped by decision and queryable across repos — is the **Change** layer, carried in commit trailers:

- `Op:` — what kind of change
- `Conversation:` — why (the session that produced it)
- `Change-Id:` — which decision; the **same value across every commit in every repo** it touched. Format `chg_<slug>-<suffix>`, minted locally and offline.

The checkable form of all five trailers — keys, values, the `Change-Id` format, the not-a-superproject stance, and the MUST/SHOULD a tool stamps and reads — is [`schema/trailers.md`](schema/trailers.md).

Plus a diff-as-Note: the interpretation of a change, captured as a searchable Note linked back by `Change-Id`. Like the underscore namespace, Change is **opt-in and additive** — `Change-Id` is just a trailer; repos that don't use it ignore it, and bare git still works. With it, `git log --grep="Change-Id: …"` traces one decision across a codebase, a docs repo, and a private context repo at once — including private repos, which the `Change-Id` links to shared outputs without exposing their content.

---

## Two Layers

The spec is the **base layer** — a fixed, readable shape an agent *perceives*: where it is, what's declared here, what the contract says. The **skills layer** is ability: the verbs to *work* a space — orient, understand, capture, reflect, share — standardized and platform-neutral like the spec. Skills aren't polish: the agreement is *maintained, not declared* — a space that can be read but not maintained goes stale on contact, and the skill layer is what keeps it alive. Skills are their own document — [SKILLS.md](SKILLS.md).

---

## Conformance

A tool or agent that claims to inhabit ideaspaces:

**MUST**
- Read `README.md` and `_agent/` files along the path before acting at a position.
- Treat `_agent/foundation.md` as the space-root handshake.
- Treat `.md` files as knowledge and `_agent/` as instruction.
- Gracefully ignore any `_`-prefixed folder it does not understand (skip, never error).
- Never commit gitignored paths into the space.

**SHOULD**
- Surface a named-but-absent `_agent/` file as a drift signal rather than silently filling it.
- Author commits as the person and append a `Co-authored-by: <agent>` trailer when an agent drove the commit.
- Keep `_agent/`'s surface tight and disclose depth on demand; let `.md` files carry the weight of what is known.
- Treat `_agent/schema.md` as instance-shape guidance, and a schema mismatch as a drift signal — never a write rejection.
- Write per-agent records only under its own `_agent/<agent-id>/`.

---

The philosophy behind the shape — why shared understanding, why agreements, why this compounds — is documented separately in the IdeaSpaces concept material. This document is only the shape.
