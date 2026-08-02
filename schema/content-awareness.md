# Content awareness manifest

The Content awareness manifest is the portable, read-only result of orienting at
one directory in a cloned ideaspace. It separates **facts** from **placement**:
the protocol assembles local markdown/git facts and defines their canonical text;
a harness decides where that text enters its own context.

This is the filesystem/git **Content adapter**. It is not a graph-wide manifest
for conversations, spaces, actors, access, mounts, or remote repositories. Those
concepts require a vantage outside a cloned content tree and remain platform or
harness concerns.

## Resolution

Assembly starts from a directory position:

1. Canonicalize the position so symlinked ancestors and git's reported toplevel
   share one coordinate system.
2. Compose the effective `_agent/` contract up to the nearest
   `foundation.md` boundary.
3. If no foundation-marked space resolves, return no Content manifest.
4. Read the root-to-position path context, local tree, effective contract
   summaries, operating-skill summaries, git state, previous-session activity,
   and opted-in stale-doc signals.
5. Report absent `purpose.md` and `now.md` as structured direction drift.

All operations are local reads. Assembly does not update the seen ref, write
session state, mutate the working tree, or contact a remote.

## Shape

A manifest carries:

| Field | Meaning |
|---|---|
| `kind` | Constant `content`; distinguishes this adapter from future vantage types. |
| `spaceRoot` | Absolute root selected by the nearest foundation boundary. |
| `position` | Focus path, display base, optional git root, and structured root-to-focus path context. |
| `now` | First meaningful line of effective `now.md`, plus its source path; absent when no Now resolves. |
| `tree` | Bounded top-level map: total markdown count and directory/markdown entries; absent when empty or unreadable. |
| `contract` | Effective contract files in foundation/guide/purpose/now/next order, each with source path, optional composing level, and summary. |
| `skills` | Local `_agent/skills/*.md` names, source paths, and summaries. |
| `activity` | Total changed paths since the seen baseline, a bounded retained prefix, and omitted count; absent without a baseline or changes. |
| `git` | Local branch/head/upstream/dirty/untracked facts; absent outside git. |
| `staleDocs` | Raw stale or broken-reference signals from opted-in `code_paths`. |
| `missingDirection` | Ordered subset of `purpose`, `now`. |

The manifest contains structured values, not rendered section strings. It is
bounded at assembly where unbounded history would otherwise enter context;
rendering may apply a further display cap to stale-doc signals.

## Canonical sections

The renderer recognizes these stable section ids, in this fixed order:

1. `position`
2. `now`
3. `tree`
4. `contract`
5. `skills`
6. `activity`
7. `git`
8. `stale-docs`
9. `direction-drift`

A caller may select any subset. Selection filters the canonical order; caller
order does not reorder output. Empty sections disappear. Selecting all sections
produces the standard local navigation block.

This lets one harness emit a single SessionStart block while another places
stable and volatile subsets separately, without either reimplementing shared
wording. Placement, cadence, provider payloads, Change/session lines, seen-ref
writes, mounts, workspace roles, and remote tiers stay outside this schema.

## Compatibility

The original `assembleAwareness` block is the subset `now → tree → contract →
skills → activity`. Reference implementations may retain that API as a wrapper
while consumers migrate to structured assembly and selective rendering.

This schema describes a reference-library interchange shape; it does not add a
new repository-conformance requirement to `SPEC.md`.
