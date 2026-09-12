# Content awareness manifest

The Content awareness adapter is the portable, read-only result of orienting at one local directory.
It separates selected authority, loaded representation, prompt placement, and private runtime
residency rather than collapsing them into one notion of context.

This is the filesystem/Git **Content adapter**. It is not a graph-wide manifest for conversations,
actors, access, mounts, or remotes. Selecting a contract source does not prove consent or grant
execution authority.

## Selection result

`assembleContentAwareness` accepts optional `contractSource: foundation | agreement` and returns one
of:

| Status | Meaning |
|---|---|
| `ok` | a successful manifest, including floor orientation |
| `contract_choice_required` | both entrypoints resolve and the caller supplied no source |
| `contract_source_unavailable` | the caller explicitly selected an entrypoint that does not resolve |
| `contract_invalid` | selected Agreement frontmatter, identity, or `context.full` is malformed or unsafe |

A directory inside exact `_agent/`, another underscore extension, or reserved Git state is not a
Content position and returns no result. This is distinct from `ok` floor orientation.

Exactly one available entrypoint selects automatically. If both exist, the protocol does not choose
or merge them. The unselected entrypoint contributes neither body nor summary. A habitat may make an
explicit policy choice; the CLI prefers Agreement unless explicitly overridden.

## Resolution

Assembly starts from a canonical directory position:

1. Resolve the Git root when present and reject extension/core payload positions.
2. Discover Foundation and Agreement candidates independently.
3. Apply explicit selection or return a typed choice diagnostic.
4. Resolve the selected ceiling:
   - Foundation: the current nearest-Foundation rule;
   - Agreement: nearest Agreement carrying `root_node_id`, otherwise Git root, otherwise the
     outermost Agreement on the ancestor path;
   - floor: Git root, otherwise the requested position.
5. Read path context, bounded local tree, selected agent context, skills, Git state, prior-session
   activity, and stale-doc signals.

All operations are local reads. Assembly does not update the seen ref, persist frame selection,
mutate the working tree, or contact a remote.

## Foundation frame

Foundation preserves the existing five-file stack and canonical rendering. `foundation.md` scopes;
`guide.md`, `purpose.md`, `now.md`, and `next.md` layer with nearest-present effective values while
all ancestors remain visible. Skills compose by name with deeper shadowing. Missing Purpose and Now
remain structured drift signals.

This arm is frozen for reproducible comparison while Agreement is proved.

## Agreement frame

Agreement loading is generic:

- every selected `_agent/agreement.md` from root to position loads in full, root-first;
- other direct `_agent/*.md` files load at summary;
- files declared through `context.full` load in full;
- `foundation.md` is absent;
- skills load as name plus description, with deeper same-named skills shadowing ancestors;
- Agreement mode does not assign special semantics to Purpose, Now, Guide, or Next.

A full-load declaration is:

```yaml
context:
  full:
    - purpose.md
```

Entries are unique direct Markdown basenames relative to the declaring `_agent/`. Paths may not be
absolute, nested, traversing, globbed, remote, entrypoints, directories, or symlinks. Every target
must exist as a direct regular file checked without following symlinks. Any violation returns `contract_invalid` with stable issue codes; no partial Agreement frame is
returned.

## Shape

An `ok` manifest carries:

| Field | Meaning |
|---|---|
| `status` | Constant `ok`. |
| `kind` | Constant `content`. |
| `contractSource` | `foundation`, `agreement`, or `null` at floor. |
| `spaceRoot` | Absolute root selected by the active frame, or floor orientation base. |
| `position` | Focus path, display base, optional Git root, root-to-focus path context, and `head` placement. |
| `now` | Foundation-only first meaningful line of effective `now.md`, exact-byte revision, summary representation, and head placement. |
| `tree` | Bounded position map. Root and entries carry head placement. |
| `contract` | Selected agent-context entries with source path, source position, summary, `summary | full` representation, exact-byte revision, head placement, and exact content when full. Legacy `level` remains a deprecated alias for the composition source position. |
| `skills` | Composed skill handles with name, source path/position, description-first summary, exact-byte revision when readable, summary representation, and head placement. |
| `activity` | Bounded changed-path facts at tail placement. |
| `git` | Local branch/head/upstream/dirty/untracked facts at tail placement; absent outside Git. |
| `staleDocs` | Raw stale/broken signals at tail placement. |
| `missingDirection` | Foundation-only ordered subset of `purpose`, `now`. |

Revisions use `sha256:` plus the lowercase SHA-256 digest of the exact UTF-8 bytes read. A dirty file
therefore has a distinct observable revision without pretending repository HEAD contains those bytes.

## Representation, placement, depth, and residency

- `summary | full` is the representation actually loaded.
- `head | history | tail` is prompt placement.
- Map depth is the maximum representation a reader may disclose.
- Actual context-window residency is private Process state.

These fields are not interchangeable. Prompt placement is not added to portable Map members. It is
named `placement` because the compatibility field `level` already means filesystem composition
position. This adapter emits active position context in the head and volatile Git/activity/drift in
the tail. `history` is reserved for an explicit reference/focus operation; this ambient operation
does not emit it.

## Tree behavior

Tree depth defaults to 1 and numeric probes clamp to 1..4. Level 1 carries summary-rung handles;
lower bounded levels carry names only. Per-directory caps are honest through omitted counts. Core
`_agent/`, extensions, reserved Git state, and build/local exclusions do not enter entries or counts.

The standalone tree assembler requires no contract. `depth: full` is an explicit local diagnostic
walk to leaves with summary handles, not ambient awareness and not Map member `depth: full`.

## Canonical sections

Rendering keeps this fixed order:

1. `position`
2. `now`
3. `tree`
4. `contract`
5. `skills`
6. `activity`
7. `git`
8. `stale-docs`
9. `direction-drift`

A caller may select a subset without reordering it. Empty sections disappear. Full contract entries
render their complete bytes inside the contract section; Foundation summary rendering remains
unchanged. Selection diagnostics render actionable text without rendering either candidate.

## Compatibility and conformance

`assembleAwareness` remains a deprecated wrapper for the legacy
`now → tree → contract → skills → activity` block. Foundation rendering remains byte-identical.

Implementations claiming Content-awareness conformance execute every required coverage tag in
[`../conformance/awareness/manifest.json`](../conformance/awareness/manifest.json). The vectors cover
both single-source arms, explicit selection, choice and unavailable diagnostics, floor orientation,
declared full loading, unselected-source absence, exact revisions, and prompt placement.
