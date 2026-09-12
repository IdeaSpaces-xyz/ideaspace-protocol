# The `_agent/` contract

> The checkable form of selectable Foundation and Agreement context. Normative prose is [`../SPEC.md`](../SPEC.md). **Provisional** — the base repository boundary keeps Markdown knowledge, exact `_agent`, ordinary paths, and opaque extensions distinct; named extension semantics remain separate.

## Positions and content

Every content directory is a **position**. Leading-underscore extension containers belong to their
containing position rather than creating content positions. At each position, repository content has
these roles:

| Role | What | Where | Searchable? |
|---|---|---|---|
| **Knowledge** | what we know — accumulates and travels | `.md` outside extension containers | yes |
| **Agent context** | offered terms and working practices | exact `_agent/` | no — loaded by the selected frame |
| **Position identity** | what this place is, for everyone | `README.md` outside extensions | loaded by position |
| **Ordinary material** | legal repository content with no universal interpretation | other files and directories | no protocol behavior |
| **Extension payload** | semantics defined only by an aware reader | descendants of any other `_`-prefixed directory | no — opaque to the base reader |

`README.md` describes the position and exact `_agent/` offers agent context. Markdown beneath an
extension remains payload, not a Note or surface. A named extension such as `_assets` may define a
separate aware-reader role without changing the base categories.

A folder with neither contract entrypoint remains valid at the **floor**: bounded Content orientation
with no agent terms. `_agent/` is therefore optional for base Content conformance.

## Selectable entrypoints

During the Agreement migration, `_agent/` has two alternative entrypoints:

| File | Meaning | Loading |
|---|---|---|
| `foundation.md` | frozen five-file compatibility handshake | current five-file behavior |
| `agreement.md` | standing meaning and terms sufficient for the next move | every applicable Agreement in full |

A caller MAY request `foundation` or `agreement`. Exactly one available source selects
automatically. If both resolve and no source is supplied, assembly returns
`contract_choice_required`; it MUST NOT merge them or choose precedence. Requesting an absent source
returns `contract_source_unavailable`. The unselected entrypoint contributes neither body nor
summary. Selecting Agreement is a loading decision, not proof of consent, access, or authority.

A habitat may set its own explicit policy above the protocol. The CLI prefers Agreement when both
exist unless a caller explicitly selects Foundation. That policy does not change protocol behavior.

## Foundation compatibility

Foundation mode preserves the five names and their current composition:

| File | Says | Scope |
|---|---|---|
| `foundation.md` | what this place is + what's here | **space root only** |
| `guide.md` | how agent and human work together here | any position |
| `purpose.md` | why this space exists | any position |
| `now.md` | what's active | any position |
| `next.md` | what's queued | any position |

The four fractal files layer; the nearest instruction wins while every ancestor remains in the
stack. `foundation.md` scopes: a deeper Foundation starts another Space. Foundation-mode readers keep
this behavior and rendered awareness byte-for-byte while consumers migrate.

Named-but-absent `purpose.md` and `now.md` remain Foundation drift signals, not errors.

## Agreement loading

Agreement mode stops assigning protocol meaning to `guide`, `purpose`, `now`, or `next`:

- every `agreement.md` from the selected root to the position loads in full, root-first;
- every other direct `_agent/*.md` file loads at summary by default;
- `_agent/skills/` entries load as name plus description, with a deeper same-named skill shadowing
  its ancestor;
- the unselected `foundation.md` is omitted;
- deeper content loads only on demand or by an Agreement declaration.

An Agreement MAY declare direct sibling Markdown files for full loading:

```yaml
---
context:
  full:
    - purpose.md
---
```

`context.full` MUST be an array of unique direct Markdown basenames relative to that Agreement's
`_agent/`. Absolute paths, traversal, nested paths, directories, globs, URLs, `agreement.md`, and
`foundation.md` are invalid. Every declared file MUST exist as a regular file. Invalid declarations
fail Agreement assembly as `contract_invalid`; readers MUST NOT return a partial frame.

The nearest Agreement carrying a valid `root_node_id` starts a Space. Otherwise the Git repository
root is the ceiling. Outside Git, the outermost Agreement on the ancestor path is the ceiling. An
Agreement without identity refines the current Space; one with identity re-roots it.

## Representation, placement, and revision

These dimensions are distinct:

- `summary | full` is the representation actually loaded from one agent-context file;
- `head | history | tail` is prompt placement;
- Map depth is a disclosure ceiling, not loaded representation;
- actual runtime residency is private Process state.

Prompt placement belongs to awareness, not portable Map members. It is named `placement` because the
legacy field `level` already means filesystem composition position. Every loaded agent-context entry
records its source position, representation, placement, and a revision derived from the exact bytes
read. Activity, Git state, and drift belong to the tail; active authority context belongs to the
head; a later focus read belongs to history.

## Root identity

Either root entrypoint MAY carry optional `root_node_id` frontmatter. Missing identity remains valid.
A declared value MUST use the current or legacy form in [`root-identity.md`](root-identity.md). If
Foundation and Agreement at the same boundary declare different identities, validation returns
`root-node-id-conflict`; frame selection never changes one repository's identity silently.

## Skills and optional context

Optional direct files include `schema.md` and any other Markdown primitive an Agreement describes.
Optional subfolders include `skills/`, `perspectives/`, and local per-agent records. A skill's entry
id and frontmatter `name` MUST be identical. The id is 1–64 lowercase ASCII letters, digits, or single
hyphens, with no leading, trailing, or consecutive hyphen
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Human-readable titles belong in Markdown headings.

## Surface, and collections vs elaborations

Every position presents as **summary → surface → children**. The surface is the position's one Note:
a directory's `README.md`, a repo's root `README.md`, a lone `.md` file itself. Depth is elaboration —
a child answers "what do you mean?" about the surface above it.

Two parent→child relations read differently: **elaboration** (heterogeneous children deepening the
surface) and **collection** (homogeneous children instancing one kind). An optional
`_agent/schema.md` provides instance-shape guidance. It is guidance, not validation: mismatch is
drift, never a rejected write.

## Underscore extension point

Exact `_agent/` is core ambient context. Every other `_`-prefixed directory is a non-knowledge
extension container, including case lookalikes; the first such directory owns its entire subtree.
The rule applies to directories, not similarly named files. An agent quietly ignores an extension it
does not understand. The pure classifier is [`repository-path.md`](repository-path.md).

Exact `_assets/` is the first optional standard extension. Its aware-reader relative-reference
contract is [`assets.md`](assets.md); base readers need only apply the generic opaque boundary.

## Shared vs local

`.gitignore` is the allowlist splitting **shared** (committed, travels) from **local** (gitignored:
code repos, drafts, per-agent records). Awareness is local; only content travels. Never commit
gitignored paths into the Space.

## Conformance checks

A conformant reader or validator:

1. returns bounded floor orientation when neither entrypoint exists;
2. selects one entrypoint by the rules above and never merges Foundation with Agreement;
3. preserves Foundation composition and rendering while compatibility remains;
4. loads every selected Agreement root-first, direct sibling Markdown at summary, declared files in
   full, and skills as name plus description;
5. refuses malformed or unsafe `context.full` declarations without partial loading;
6. records exact source, representation, revision, and prompt placement;
7. validates root identity from either entrypoint and reports conflicting declarations;
8. treats every other `_`-prefixed directory as opaque and unknown extensions quietly;
9. never commits gitignored paths and treats `_agent/schema.md` as guidance, not write validation.

Runtime Agreement diagnostics use snake-case issue codes such as `root_node_id_conflict`. The
repository validator exposes its existing hyphenated rule vocabulary, including
`root-node-id-conflict`; these are separate result surfaces, not interchangeable identifiers.

See [`../SPEC.md#conformance`](../SPEC.md#conformance) and the language-neutral awareness vectors in
[`../conformance/awareness/manifest.json`](../conformance/awareness/manifest.json).
