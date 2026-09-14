# Map projection

Map projection is the pure adapter from local Content handles to the provisional
Map member language. It lets a tree, working set, and repository catalog share
one ordered item shape without treating local checkout state as portable data.
It performs no filesystem, Git, platform, or network reads.

## Content tree projection

`projectContentTreeMembers(tree, root = 0)` accepts an already-read Content tree
and returns a flat depth-first list. Each entry pairs:

- a repository-position Map member; and
- presentation-only tree facts retained outside that member.

The member position uses `/` relative to the selected root ordinal. Its observed
file or directory name is `disclosure.name`. When the tree reader observed a
summary, that summary is `disclosure.summary` and the member ceiling is
`summary`; otherwise the ceiling is `name`. A bounded tree reader therefore
produces summary-or-name members at level one and name-only members below it.
An explicit local `full` diagnostic may supply summaries at deeper levels, but
this does not change the meaning of Map member `depth: full`.

Producer order is preserved exactly. The reference Content reader supplies
directories before Markdown files lexically at each level and descends depth
first. The projector does not apply another sort.

Prompt placement, entry kind, nesting level, recursive Markdown count, and
omitted-child counts are not Map semantics. They remain in the presentation
sidecar. Top-level omission and total Markdown counts remain projection facts.
`renderContentTreeProjection` uses these facts to reproduce the canonical
Content tree text.

## Root-handle projection

`projectRootMapMembers(inputs)` preserves caller order and assigns no role. A
caller may supply one of three reference states:

- `root` — an ordinal into a caller-held root list, producing position `.`;
- `address` — an existing address such as a canonical repository URL; or
- neither — no honest reference is available, so no member is produced.

Name and optional summary are observed disclosure. A root ordinal may resolve
through a private ordinal-to-checkout binding for local rendering. It becomes a
portable position only when a consumer encloses it in a valid Map with the
corresponding exact pinned root. An online-only handle without an exact position
may use an existing address; the projector never invents one.

Harness labels, private display paths, directory counts, sync state, mount or
point-of-view roles, authority, prompt placement, and runtime residency stay in
the presentation sidecar. `renderRootMapMembers` renders ordered working-set or
catalog rows from that sidecar and the member disclosure. The protocol does not
assign those labels or facts; callers do.

## Portability boundary

A projection is not itself a portable Map and makes no export claim. To expose a
`map` block, a producer must:

1. supply roots with stable identity and exact commit pins;
2. pass the projected members and roots through strict `buildMap`/`parseMap`;
3. verify that selected observations describe that pin rather than dirty or
   local-only bytes; and
4. remove presentation sidecars and all private bindings.

Missing identity, unborn HEAD, dirt, unavailable remotes, invalid positions, or
unresolved handles never trigger identity minting, upload, publication, fetch,
or repinning. They may still render as useful local handles, but cannot be
mistaken for a portable Map.

Language-neutral vectors are in
[`../conformance/map-projection/manifest.json`](../conformance/map-projection/manifest.json).
