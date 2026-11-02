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

## Focus result

`assembleContentFocus` reads another position without moving the caller or changing its authority
frame. It uses the same entrypoint selection and diagnostics as ambient assembly. A successful result
has `kind: content-focus` and fixed `contractRole: reference`: focus agreements are read, never
composed.

The result contains only:

| Field | Meaning |
|---|---|
| `kind` | Constant `content-focus`. |
| `contractRole` | Constant `reference`; the target contract never joins caller authority. |
| `contractSource` | The target's selected `foundation`, `agreement`, or floor source. It does not select caller authority. |
| `spaceRoot` | The root resolved inside the target frame. |
| `position` | The canonical target and its path context, at history placement. |
| `tree` | The target's Content handles at exactly depth one, at history placement. |
| `contract` | Target agent context at its selected representations, all at history placement. |
| `skills` | Target skill handles at summary representation and history placement. |

A focus request MAY carry `agreement: summary | full`; the default is `summary`.

- `summary`: every selected Agreement in the target stack loads at summary representation, and no
  `context.full` declaration expands. Other agent-context files stay at summary.
- `full`: the nearest Agreement (the deepest selected level that declares one, normally the
  target's own) and that level's `context.full` declarations load in full. Ancestor Agreements and
  their declared loads stay at summary.

Selection, validation and diagnostics are unchanged: an invalid `context.full` declaration still
returns `contract_invalid` at either representation. Revisions hash the exact file bytes at either
representation. The canonical render of a summary Agreement entry is its usual summary line
followed by one line, `    summary only — read <path> in full before writing here`, where `<path>`
is the Agreement path relative to the target's space root with `/` separators. Ambient
`assembleContentAwareness` is unaffected: the caller's own Agreements always load in full.

`assembleContentReference(position, { contractSource?, summaryExcerptLength?, agreement? })` returns
the same focus result with its tree removed (`tree: null`). It is the frame a Content look carries,
for a caller that attaches it to its own read (a Thread open, one post read) instead of a look.

Foundation
targets preserve the frozen summary representation; floor targets carry no contract or skills. The
focus result never includes activity, Git state, stale-document signals, direction warnings, or a
caller contract stack. `renderContentFocus` emits the canonical block beginning with `Focus:` and the
reference rule. Repeated reads of unchanged target bytes render identically.

## Foundation frame

Foundation preserves the existing five-file stack and canonical rendering. `foundation.md` scopes;
`guide.md`, `purpose.md`, `now.md`, and `next.md` layer with nearest-present effective values while
all ancestors remain visible. Skills compose by name with deeper shadowing. Missing Purpose and Now
remain structured drift signals.

This arm is frozen for reproducible comparison while Agreement is proved.

## Agreement frame

Agreement loading is generic. For the caller's own position (ambient awareness):

- every selected `_agent/agreement.md` from root to position loads in full, root-first;
- other direct `_agent/*.md` files load at summary;
- files declared through `context.full` load in full;
- `foundation.md` is absent;
- skills load as name plus description, with deeper same-named skills shadowing ancestors;
- Agreement mode does not assign special semantics to Purpose, Now, Guide, or Next.

A reference read of another position (Content focus, Content look) applies the representation rule
in "Focus result" on top of this stack.

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

`renderContentAwareness` accepts optional `placement: head | tail`. The renderer derives membership
from the manifest's typed placement rather than a caller-owned section list. Head and tail are
disjoint, activity renders only in tail, and canonical section order is preserved within each side.
With no placement or section filter, the compatibility full render is unchanged: non-empty head
followed by non-empty tail with the canonical section break. If `placement` and `sections` are both
supplied, the renderer applies their intersection. Selection changes only rendered output; it does
not claim or change runtime residency.

## Content tail

`assembleContentState(repoRoot)` reads local **State** at tail placement: the repository's Git facts
plus the staged Content and `_agent/` paths awaiting an explicit commit. `renderContentState` renders
one deterministic block:

```
State:
  branch: main                     # or: (detached)
  remote: ahead 1, behind 0        # or: no upstream
  working tree: dirty
  captures awaiting commit: 2
  untracked knowledge files: 1     # only when present
```

`renderContentTail(manifest, { state, handles, change, sections, maxDrift })` composes the volatile
register every local harness renders after the head, in fixed order: State, caller-owned handles in
producer order (a repository catalog, a floor hint), the manifest's tail sections, then the open
Change line. State supersedes the compact `git` section, so the same facts never render twice; without
State the compact line stays. Empty handles disappear; `manifest` may be `null` when no Content
position resolves. Handles and the Change line are harness-owned text the protocol orders but does not
define, and nothing here enters Map data or claims runtime residency. A CLI status command and an
agent runtime's post-breakpoint block render byte-identical tails for equal inputs.

## Tree behavior

Tree depth defaults to 1 and numeric probes clamp to 1..4. Level 1 carries summary-rung handles;
lower bounded levels carry names only. Per-directory caps are honest through omitted counts. Core
`_agent/`, extensions, reserved Git state, and build/local exclusions do not enter entries or counts.

An explicit standalone tree read MAY request one top-level `page` (`cursor`, `order: older|newer`,
optional README exclusion) with the existing `maxEntries` cap. It reports `total`, `shown`,
`order` and a last-shown-filename `nextCursor` when more entries remain. A missing cursor
refuses instead of restarting; nested levels and ambient awareness do not page or change order.
Content look uses this same tree seam for ordinary directory child pages; its paging vectors
are in `conformance/content-look/paging.json`.

The standalone tree assembler requires no contract. Its entries project through the shared
[`projectContentTreeMembers`](map-projection.md) operation: observed names/summaries become Map
member disclosure while placement, kind, counts, and omissions remain presentation facts. `depth:
full` is an explicit local diagnostic walk to leaves with summary handles, not ambient awareness and
not Map member `depth: full`.

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

A caller may select a subset without reordering it, select ambient `head | tail` placement, or apply
both filters as an intersection. Empty sections disappear. Full contract entries render their
complete bytes inside the contract section; Foundation summary rendering remains unchanged.
Selection diagnostics render actionable text without rendering either candidate.

## Compatibility and conformance

`assembleAwareness` remains a deprecated wrapper for the legacy
`now → tree → contract → skills → activity` block. Foundation rendering remains byte-identical.

Implementations claiming Content-awareness conformance execute every required coverage tag in
[`../conformance/awareness/manifest.json`](../conformance/awareness/manifest.json). The vectors cover
both single-source arms, explicit selection, choice and unavailable diagnostics, floor orientation,
declared full loading, unselected-source absence, exact revisions, prompt placement, deterministic
head/tail rendering, disjoint membership, activity confined to tail, and Content-tail composition with
State superseding the compact Git line and the Change line last. Its focus vectors cover reference
Agreements at summary by default, full on request for the nearest Agreement only, and the ambient
frame of the same position still loading its Agreement and declared loads in full.
