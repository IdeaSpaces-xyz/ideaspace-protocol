# The `_agent/` contract

> The checkable form of the space contract. Normative prose is [`../SPEC.md`](../SPEC.md); this is the enumeration tooling validates against. **Provisional** — the base repository boundary keeps Markdown knowledge, exact `_agent`, ordinary paths, and opaque extensions distinct; named extension semantics remain separate.

## Positions and content

Every content directory is a **position**. Leading-underscore extension containers belong to their
containing position rather than creating content positions. At each position, repository content has
these roles:

| Role | What | Where | Searchable? |
|---|---|---|---|
| **Knowledge** | what we know — accumulates and travels | `.md` outside extension containers | yes |
| **Agent context** | how to work here | exact `_agent/` | no — always loaded by position |
| **Position identity** | what this place is, for everyone | `README.md` outside extensions | loaded by position |
| **Ordinary material** | legal repository content with no universal interpretation | other files and directories | no protocol behavior |
| **Extension payload** | semantics defined only by an aware reader | descendants of any other `_`-prefixed directory | no — opaque to the base reader |

`README.md` describes the position and exact `_agent/` instructs the agent. Markdown beneath an
extension remains payload, not a Note or surface. A named extension such as `_assets` may define a
separate aware-reader role without changing the base categories.

## The five-file contract

An `_agent/` folder may carry:

| File | Says | Scope |
|---|---|---|
| `foundation.md` | what this place is + what's here (the handshake) | **space root only** |
| `guide.md` | how agent and human work together here | any position |
| `purpose.md` | why this space exists (the North Star) | any position |
| `now.md` | what's active | any position |
| `next.md` | what's queued | any position |

Optional: `schema.md` (the shape of Notes in this folder — guidance, not validation), and subfolders `skills/` (how to do — flat `<name>.md` files or Agent Skills-style `<name>/SKILL.md` directories, so existing skills can be copied in unchanged), `perspectives/` (how to see), `<agent-id>/` (per-agent records, gitignored).

A skill's entry id (`<name>`) and frontmatter `name` MUST be identical. The id is 1–64 lowercase ASCII letters, digits, or single hyphens, with no leading, trailing, or consecutive hyphen (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Human-readable capitalization and spaces belong in the Markdown heading, not the machine id.

The root `foundation.md` MAY declare the Space's optional `root_node_id` in frontmatter. Missing identity remains valid. A declared value MUST use the current or legacy form in [`root-identity.md`](root-identity.md). This field belongs to the foundation handshake, not the knowledge-Note frontmatter schema; a nested foundation starts a new Space with its own optional identity.

- **Nothing is strictly required.** A branch may carry only `now.md`.
- **A named-but-absent file is a drift signal, not an error** — surface the gap, don't silently fill it.
- **Keep `_agent/` small** — it is always loaded. Knowledge carries weight in `.md` files.
- **Skill ids are portable** — validators report an invalid entry id, invalid frontmatter `name`, or a mismatch between them as an error.

## Fractal composition

`_agent/` may appear at any position. Reading **composes along the path** — the reader assembles the full stack from the space root down to the position, root first. Every level's contract stays in the assembled view; a deeper level narrows or overrides same-named files for its branch, and on conflict the **nearest instruction wins**. Refinement never deletes ancestor context. A branch with no `_agent/` inherits its ancestors'. `skills/` compose the same way: the available set is the union along the path, with a deeper same-named skill shadowing its ancestor's.

The contract holds two kinds of thing: the four fractal files **layer** (positions, deeper narrows), while `foundation.md` **scopes** (one per space, defining the whole branch beneath it and how to interpret the rest of `_agent/` there). A deeper foundation does not refine the space — it ends it and starts a new one. Branches refine, they do not re-declare.

## Surface, and collections vs elaborations

Every position presents as **summary → surface → children**. The surface is the position's one Note: a directory's `README.md`, a repo's root `README.md`, a lone `.md` file itself. Depth is elaboration — a child answers "what do you mean?" about the surface above it.

Two parent→child relations read differently: **elaboration** (heterogeneous children deepening the surface — "what do you mean?") and **collection** (homogeneous children instancing one kind — "such as?"). An optional `_agent/schema.md` lets a collection declare its instance shape, path-scoped and composing along the path like `.gitattributes`. It is **guidance, not validation**: it shapes how an agent writes and reads the folder's Notes but never gates a write. A mismatch is a drift signal about the writing agent, and a Note outgrowing its folder's shape is a promotion signal — never a rejection.

## Underscore extension point

Exact `_agent/` is core ambient context. Every other `_`-prefixed directory is a non-knowledge
extension container, including case lookalikes; the first such directory owns its entire subtree.
The rule applies to directories, not similarly named files. **An agent quietly ignores any extension
it does not understand** (skip, never error or warn solely because its name is unknown). This is the
portability guarantee. The pure classifier is [`repository-path.md`](repository-path.md).

Exact `_assets/` is the first optional standard extension. Its aware-reader relative-reference
contract is [`assets.md`](assets.md); base readers need only apply the generic opaque boundary.

## Shared vs local

`.gitignore` is the allowlist splitting **shared** (committed, travels) from **local** (gitignored: code repos, drafts, per-agent records under `_agent/<agent-id>/`). Awareness is local; only content travels. Never commit gitignored paths into the space.

## Conformance checks (for a validator)

A conformant space / tool:

1. reads `README.md` and `_agent/` files along the path before acting at a position;
2. treats `_agent/foundation.md` as the space-root handshake (root only);
3. treats `.md` outside extension containers as knowledge and exact `_agent/` as instruction;
4. treats every other `_`-prefixed directory as an opaque extension owned by its first underscore-prefixed segment, never positions, Notes, surfaces, search input, summaries, or ambient context;
5. composes the full `_agent/` stack along the path (root → branch; ancestors retained, nearest instruction wins, skills union with deeper shadowing);
6. surfaces a named-but-absent contract file as drift, not error;
7. quietly ignores unknown extensions without warning solely because their names are unknown;
8. never commits gitignored paths;
9. treats `_agent/schema.md` as instance-shape guidance and a schema mismatch as drift, never a write rejection;
10. accepts a missing root identity and validates a declared `root_node_id` without minting, migrating, or rebinding during a read.

See [`../SPEC.md#conformance`](../SPEC.md#conformance) for the MUST/SHOULD this expands.
