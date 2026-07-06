# The `_agent/` contract

> The checkable form of the space contract. Normative prose is [`../SPEC.md`](../SPEC.md); this is the enumeration tooling validates against. **Provisional, v0.1.**

## Positions and content

Every directory is a **position**. At each position, content splits in two:

| Role | What | Where | Searchable? |
|---|---|---|---|
| **Knowledge** | what we know — accumulates and travels | any non-underscore file (`.md`) | yes |
| **Agent context** | how to work here | the `_agent/` folder | no — always loaded by position |
| **Position identity** | what this place is, for everyone | `README.md` | loaded by position |

Rule: everything not underscore-prefixed is knowledge. `README.md` describes the position; `_agent/` instructs the agent.

## The five-file contract

An `_agent/` folder may carry:

| File | Says | Scope |
|---|---|---|
| `foundation.md` | what this place is + what's here (the handshake) | **space root only** |
| `guide.md` | how agent and human work together here | any position |
| `purpose.md` | why this space exists (the North Star) | any position |
| `now.md` | what's active | any position |
| `next.md` | what's queued | any position |

Optional: `schema.md` (the shape of Notes in this folder — guidance, not validation), and subfolders `skills/` (how to do), `perspectives/` (how to see), `<agent-id>/` (per-agent records, gitignored).

- **Nothing is strictly required.** A branch may carry only `now.md`.
- **A named-but-absent file is a drift signal, not an error** — surface the gap, don't silently fill it.
- **Keep `_agent/` small** — it is always loaded. Knowledge carries weight in `.md` files.

## Fractal composition

`_agent/` may appear at any position. Reading **composes along the path** — root first, then each branch, specificity sharpening as you descend. A branch with no `_agent/` inherits its ancestors'. `foundation.md` lives only at a space root; branches refine, they do not re-declare.

## Surface, and collections vs elaborations

Every position presents as **summary → surface → children**. The surface is the position's one Note: a directory's `README.md`, a repo's root `README.md`, a lone `.md` file itself. Depth is elaboration — a child answers "what do you mean?" about the surface above it.

Two parent→child relations read differently: **elaboration** (heterogeneous children deepening the surface — "what do you mean?") and **collection** (homogeneous children instancing one kind — "such as?"). An optional `_agent/schema.md` lets a collection declare its instance shape, path-scoped and composing along the path like `.gitattributes`. It is **guidance, not validation**: it shapes how an agent writes and reads the folder's Notes but never gates a write. A mismatch is a drift signal about the writing agent, and a Note outgrowing its folder's shape is a promotion signal — never a rejection.

## Underscore extension point

Any `_`-prefixed folder is infrastructure — loaded by position, not search. `_agent/` is the one every agent MUST understand. Others (`_access/`, `_conversations/`, …) are optional and platform-defined. **An agent gracefully ignores any `_`-folder it does not understand** (skip, never error). This is the portability guarantee.

## Shared vs local

`.gitignore` is the allowlist splitting **shared** (committed, travels) from **local** (gitignored: code repos, drafts, per-agent records under `_agent/<agent-id>/`). Awareness is local; only content travels. Never commit gitignored paths into the space.

## Conformance checks (for a validator)

A conformant space / tool:

1. reads `README.md` and `_agent/` files along the path before acting at a position;
2. treats `_agent/foundation.md` as the space-root handshake (root only);
3. treats `.md` as knowledge, `_agent/` as instruction;
4. composes `_agent/` along the path (root → branch);
5. surfaces a named-but-absent contract file as drift, not error;
6. gracefully ignores unknown `_`-prefixed folders;
7. never commits gitignored paths;
8. treats `_agent/schema.md` as instance-shape guidance and a schema mismatch as drift, never a write rejection.

See [`../SPEC.md#conformance`](../SPEC.md#conformance) for the MUST/SHOULD this expands.
