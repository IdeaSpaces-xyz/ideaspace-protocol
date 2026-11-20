# Collaboration threads and `_threads/`

> Language-neutral contract for recognizing local collaboration threads, their immutable posts, a Thread's `parent` and `about`, the README as a view of its state, root-relative Map pointers, and the current Thread Map. **Provisional, v0.33.0.** A Thread is a folder that keeps time by placement; what every such folder shares (entries, order, the DAG, corrections and marks, how entries set state, the current Map, `as_of`/`since`/`newest`) is in [`time.md`](time.md). This page adds what belongs to the Threads kind.

## Role, name, and placement

A directory carrying an Agreement (`_agent/agreement.md`), such as the repository root or a nested
subspace, MAY carry one child directory named exactly `_threads`. That directory and every path
beneath it are **collaboration threads**:

- they travel as tracked repository files;
- each immediate child directory under `_threads/` represents one distinct **Thread** (e.g.
  `_threads/2026-09-26-authorization/`), a folder that keeps time by placement ([`time.md`](time.md));
- they are not ordinary Content positions, surfaces, or ambient agent context;
- a thread-unaware reader skips the directory without failing the containing Space;
- a thread-aware reader interprets threads, indexes posts, and exposes them to search and timeline navigation.

The name is exact and case-sensitive. Comparison is lexical over repository paths; a case-insensitive
host filesystem does not normalize `_Threads/` into the convention. `_Threads/`, `_threads.md`, and
`threads/` do not acquire this role.

### Placement rules

1. **Independent worktree backing:** In a code repository or private workspace, the `_threads/`
   directory MAY be a Git worktree checked out from an independent branch (e.g. an orphan `threads`
   branch) and ignored by the main branch. In a knowledge repository or Home space, `_threads/` is
   typically committed directly in the main branch tree. A conformant reader MUST NOT require one
   layout over the other.
2. **Audience projection boundary:** A publication or sharing projection that omits `_threads/` for
   a given audience MUST also omit every Map member pointing into `_threads/`, so a public tree
   never carries a dangling pointer.
3. **Collaboration tiers:**
   - **Team:** `_threads/` committed in-tree or pushed on the `threads` branch, reaching collaborators
     with access to that remote.
   - **Public:** a filtered fork or main code branch omitting `_threads/`, reaching public readers
     without private discussion.
   - **Beyond the repository:** hosted Threads (`thread:x_...`) with explicit platform access grants.
   Moving content between tiers is an explicit user action; a Thread's move to a host is specified
   below ([Moving a Thread to a host](#moving-a-thread-to-a-host)).

## Payload

Each thread folder (e.g. `_threads/<thread>/`) contains:

1. `_agent/agreement.md` — standing terms for the thread, the one hand-kept file; during the
   compatibility window it may carry the fallback `parent` (legacy `attached_to`).
2. **Posts** — the Thread's entries: dated Markdown files (e.g. `2026-09-26-01-decision.md` or
   `2026-09-26T12-00-00Z.md`), immutable, as [`time.md`](time.md#entries) defines them. In a Thread
   every direct Markdown file except `README.md` is a post, and one that cannot be read as a post is
   unreadable and named: the stricter rule of a folder that keeps time by placement.
3. `README.md` — a view of the Thread's current state (below).
4. `notes/` — optional: Notes about the Thread, such as the one it was opened from. They are
   ordinary Notes, never posts. Only a Thread's direct Markdown files are posts, so a reader of posts
   skips every folder in it. A writer puts a Note it keeps inside a Thread here, not loose beside the
   posts, where it would be read as an unreadable post.

### Where a Thread sits and what it is about: `parent` and `about`

Two fields on posts carry two relations. Both follow the state rule in
[`time.md`](time.md#entries-set-state): a post sets a value, and the Thread's current value is the
newest readable post's.

**`parent` is the Thread's place in the tree: one post reference.** The opening post's `parent` is
the Thread's **origin**, where it started, immutable with the post. A later post that carries
`parent` moves the Thread; a writer records a move as a `kind: reframe` post whose body says why, so
the reason travels with the Thread. The **current parent** is the `parent` of the newest post after
the opening that carries a valid one, whatever its kind: `reframe` is the kind writers use, and a
`correction` that carries `parent` puts the Thread back. Newest is code-unit filename order, as for
every state field; an authored `date` does not reorder it. When no later post carries one, the Thread
Agreement's `parent` (or its legacy `attached_to`) is the current parent; when the Agreement declares
none, the origin is. A reader reports where the value came from (`source`: `post`, `agreement` or
`origin`) and the post it came from, and shows the origin beside a current parent that differs from
it. The parent is `unknown` only when no later post sets it, the Agreement declares none, and the
opening post cannot be read; that unreadable opening still refuses writes. An unreadable post newer
than the one that set the parent may have moved the Thread: a reader names it in its unreadable
list and never guesses.

**`about` is what the Thread is about or grew out of: any number of typed links.** Each is
`<type>:<id>` in the open namespace (`note:@<root>//<position>`, `repo:n_…`, `web:https://…`,
`change:chg_…`, or a type the reader has never seen, kept and shown). A `post:` link in `about`
cites a post without sitting under it. `about` never establishes an edge in the Thread tree. The
Thread's `about` is the `about` of the newest post that carries the field; `about: []` clears it.
Listeners read `about`; the tree reads `parent`. Absent both, the Thread starts independently from
nothing. When a Thread starts from several points of context, `parent` names the one it sits under,
`about` names the rest, and the opening post's `map` block pins them all in time.

**A post reference** has three forms, and bare aliases of the first two:

- `post:msg_…` — a post by id, resolved in the roots the caller supplies;
- `post:_threads/<thread>/<post>.md` — a canonical post path in the same root;
- `post:@<root>//<selector>` — an **addressed post** in a named root: `<root>` is a root identity
  `n_…` or a Map root name, and `<selector>` is a canonical post path or a folder's `msg_…` id
  (`_threads/<thread>/msg_…`, or `msg_…` at the root, as the entry look in `time.md` defines). The
  reader's own root (`//…`) is not a parent form; a post in the same root uses the plain forms.

A bare `msg_…` id and a bare canonical post path are accepted as aliases. Typed `id:…` and
`path:…` are *not* aliases: they are kept as non-post metadata with no tree edge, even if their value
looks like a post target. The pure parser projects them as `kind: typed:id` and `kind: typed:path`
with `raw` retaining the authored value; this internal distinction prevents the typed values from
masquerading as the bare `kind: id` and `kind: path` aliases. The path form of a post has exactly
three segments: `_threads/`, a nonempty thread name not beginning with `.`, and a nonempty `.md`
post filename not beginning with `.` and not `README.md`; `.`/`..` segments, absolute paths and
extra segments are invalid. An id starts `msg_` followed by an ASCII letter or digit, then zero or
more ASCII letters, digits, `_` or `-` (`^msg_[A-Za-z0-9][A-Za-z0-9_-]*$`).

**Resolution.** A reader resolves a post reference using **only** root snapshots explicitly supplied
or authorized by its caller. A path matches only that exact canonical post position within a
supplied root; an id matches only the post's authored `id` within those roots. An addressed post
matches only in the supplied root whose label is the address's root identity or name: by exact path,
or by id among the posts of the named folder (an id at the root matches in any folder of that root).
A post id that happens to equal another post's path does not make a path match ambiguous. A unique
match reports both the authored value and the parent root, pin, Thread and post; no match is
`unresolved`, and multiple matches are `ambiguous` with **no chosen parent**. Every form produces
the same reverse child-Thread link. A reader MUST NOT scan arbitrary filesystem roots, pick the first
match, or substitute working-tree HEAD when an authored pin lacks the post. `about` links are not
resolved by this contract: a reader reports `status: none` for them and keeps them as metadata for
listeners; `unresolved` is reserved for a missing post edge.

**The legacy field, `attached_to`.** Before 0.33.0 one field carried both relations, and existing
Threads keep it for good. A reader reads a post's `attached_to` as `parent` when it is a post
reference (or bare alias) and as `about`, one link, otherwise. It fills in only when the post
carries no new field: a post that carries `parent` is read by `parent` alone, and one that carries
`about` by `about` alone, even when the new field is malformed and dropped with its warning; the
legacy value is kept as authored and never substitutes for a bad new one. So an opening post with a
malformed `parent` has no origin, whatever its `attached_to` says. A Thread Agreement's
`attached_to` keeps its post-only grammar and reads as the Agreement's `parent`.

**Writers during the compatibility window.** Until every reader a Thread reaches reads `parent` and
`about`, a writer writes both: an opening post carries `parent` and an `attached_to` with the same
post value, or `about` and an `attached_to` with its first link when there is no parent; a move is a
`reframe` carrying `parent`, and the writer sets the Agreement's `attached_to` to the same value.
After the window a writer writes `parent` and `about` only, and never the Agreement field. The
window is a consumer decision, named where each reader ships; the protocol does not date it.

**The Agreement's grammar.** The ordinary Note frontmatter JSON Schema does not govern `_threads/`
Agreements. For **new authoring**, the separate
[`thread-agreement.schema.json`](thread-agreement.schema.json) validates the Agreement's `parent` and
`attached_to` as a post in the same root (the addressed form belongs on posts) and rejects a
malformed value before writing. A **reader** of an existing malformed value drops only that field,
warns `invalid_parent` or `invalid_attached_to`, and falls back to the next source. So
`note:@root//pos` on an opening post is `about`, but the same value on an Agreement is outside its
post-only grammar and yields absent plus a warning. A malformed YAML block still cannot be read as
an Agreement.

A hosted Thread's parent has the same shape: a post reference whose current value comes from the
newest entry that set it, then the Thread's Agreement where one exists, then the origin; how a host
stores it is the host's.

**Rejected alternative — cross-Thread `in_reply_to`:** An `in_reply_to` field on the opening post pointing to another Thread is rejected because it would conflate within-Thread timeline DAG ancestry with the Thread tree hierarchy. `in_reply_to` is reserved for replies within the same Thread's timeline.

### Immutable posts and field tolerance

A post is an entry: its fields, the field-tolerance rule, the two flaws that make it unreadable, the
repair rule, code-unit order and the opening, the reply DAG, `correction` with `supersedes` and
`mark` folding are all in [`time.md`](time.md#entries) and are not restated here. What the Threads
kind adds:

- **The standard kinds a reader acts on** are `post`, `snapshot`, `reframe`, `correction`, `closure`
  and `mark` (`THREAD_KINDS`). A writer uses `post`, `reframe`, `correction` and `mark`; `snapshot`
  and `closure` are legacy forms of the `map` and `closed` fields, read as `time.md` says and no
  longer written. A reader keeps tolerating any other value.
- **A Thread's `name` and `summary`** are the newest readable `reframe`'s, as `time.md` says; when no
  reframe carries them, they are the opening post's.
- **`closed`** is the field, `true` or `false`, with `kind: closure` reading as `closed: true`, and
  the one named exception: an unreadable post newer than the one that settled it makes `closed`
  `unknown`, and the Thread stays writable.
- **A snapshot is a post that carries a Map.** A writer no longer refuses or requires anything of a
  `kind: snapshot`; it writes the Map on a `post`. A reader keeps a legacy Map-less snapshot and
  warns `snapshot_requires_map`, naming the post; no warning rewrites, hides or blocks anything.

#### Unreadable posts and repair

As in [`time.md`](time.md#unreadable-entries-and-repair). In a Thread a post without an `id` is
unreadable (`invalid_id`), not a Note: every direct Markdown file but `README.md` is a post. An
unreadable opening post makes `origin` `unknown` and refuses writes, naming the post and the repair
step; any other unreadable post warns, is named by the state rule, and does not block writes.

#### Post-id look and child pages

As in [`time.md`](time.md#entry-look-and-paging): one post by full `msg_…` id or a unique eight-hex
shorthand within a caller-selected Thread folder, `_threads/`, or the selected root; folder pages at
`children` and `full` with `total`, `nextCursor`, `order` and exclusive `since`. A Map address ending
`_threads/<thread>/msg_…` is a **read-time selector** inside that named Thread; it does not create
an actual `.md` path or grant access. Its reference frame is the selected post's Thread frame.

### The README: a view of the Thread's state

`README.md` in a thread folder is a **view** of the Thread's current state, as
[`time.md`](time.md#a-view-of-the-state) defines it: the Thread's name and summary (the newest
reframe's, else the opening's), where it sits (`parent`, with the origin beside it when they differ),
whether it is `closed`, and its current Map. A writer rewrites it from the posts; a reader never needs
it to know the state, and a README that disagrees with the posts is stale, not authoritative. It MAY
carry a `map` frontmatter block of its own, the curator's lens over key posts at chosen rungs; that Map
is not the current Thread Map. The index of posts in timeline order is derived by readers from post
headers, never stored as a generated index file.

Only `_agent/agreement.md` is hand-kept and changes over time, tracked by Git history. `README.md`
changes as a view of the posts. Posts remain strictly immutable.

### The current Thread Map

The current Thread Map is the current Map of [`time.md`](time.md#the-current-map): the Map of the
newest post that carries one, whatever its kind; an absent or empty `map:` never replaces it; a Map
with no roots and no members clears it; a malformed Map is skipped and named; a capped or partial read
falls back to the opening post's Map and reports `stopped`; no Map is a state with a reason. It is the
Thread's frame and carries no access. The `README.md` view's own `map` is the curator's lens, not the
current Thread Map.

## Authored references and Map pointers

### Root-relative Map positions

A Map member pointing to a local thread or post uses the pinned root index and a canonical
root-relative position under `_threads/`:

```yaml
map:
  roots:
    - repo: https://ideaspaces.example/repos/n_0123456789abcdef01234567
      sha: 1111111111111111111111111111111111111111
  members:
    - root: 0
      position: _threads/2026-09-26-authorization/README.md
      depth: summary
    - root: 0
      position: _threads/2026-09-26-authorization/2026-09-26-01-decision.md
      depth: full
```

`_threads/` names the extension directly; no new local URI scheme is introduced. Hosted twin
conversations continue to use the open address `thread:x_<id>`.

### Hosted Thread ids

A hosted Thread id is `x_` followed by one or more of `A-Z a-z 0-9 _ -`, as a pattern
`^x_[A-Za-z0-9_-]+$`. The id is opaque in length: consumers check the prefix and the characters,
which keep it safe in a URL and an argument, and MUST NOT test its length or read anything from its
form. A host MAY bound the ids it mints; that bound is the host's, not part of this grammar. Vectors
are in [`../conformance/threads/hosted-ids.json`](../conformance/threads/hosted-ids.json).

### Moving a Thread to a host

A Thread moves from this computer to a host **once**, by the person's explicit act, on the first
invite: a Thread stays on this computer until someone is invited, and it never moves on its own.
The move has three parts, and each is a requirement on the writer and the host:

1. **The local Thread's last post names where it went.** The writer appends one post carrying
   `moved_to: thread:x_<id>`, the hosted Thread's address ([Hosted Thread ids](#hosted-thread-ids));
   its body may say why. `moved_to` is a state field under the one rule of
   [`time.md`](time.md#entries-set-state): the newest readable entry that carries it sets it, and it
   is final, never unset. From that post on the folder accepts no entry: a writer refuses and names
   the hosted address, and a verb answers `moved` with the `post` to the hosted Thread as `next`
   ([`verbs.md`](verbs.md)). The local posts stay as they are, immutable and readable, and the local
   Thread stays where Maps point at it.
2. **Every post keeps what it claims.** The host takes every readable post as written: `id`,
   `date`, `kind`, `in_reply_to`, `references`, `supersedes`, `mark`, `map`, `parent`, `about`,
   `closed`, `name`, `summary`, `tags`, `author`, `actor_ref` and the body. It does not re-date,
   re-author, renumber or reorder them, and it does not replay them as replies by the person who
   moved the Thread. Beside each post's claimed `date` and `author` the host records its own fact,
   `received_at`, once per post, and who moved the Thread once, on the Thread, never on a post. A
   reader shows the claim as a claim and `received_at` as the host's fact: an `author` on a local
   post was never a verified identity, and the move does not make it one. An unreadable post does
   not move; the host names it and the person decides.
3. **The hosted Thread names where it came from.** It carries `moved_from`: the local Thread's
   address when its root has identity (`@<root_node_id>//_threads/<thread>`), else its folder name,
   and the id of the post that carried `moved_to`. A Thread moves once: a second `moved_to`, or a
   move of a Thread that is already hosted, is refused.

What the host does with the request, who may then read the hosted Thread, and how an invite reaches
a person are the host's contract; this page fixes only what moves and what each side records. The
state rule, the write refusal and the vectors are in [`time.md`](time.md) and
[`../conformance/time/state.json`](../conformance/time/state.json).

### Map position validation

Map member position validation (`isMapPosition`) permits paths containing the exact segment `_threads`
(e.g. `_threads/...`), while continuing to refuse `_agent/`, `_assets/`, and unknown underscore-prefixed
directories (`_scratch/`, etc.) as Content positions.

A generic Map reader preserves `_threads/...` member positions without descending into them. A
thread-aware reader interprets the position and resolves the thread or post.

### Separate worktree pin and path resolution

When `_threads/` in a code repository is backed by a separate `threads` worktree branch:

1. A Map member pointing to the thread carries a root entry pinned to that separate branch's commit
   SHA, rather than the repository's `main` pin or working-tree HEAD.
2. In such an orphan or separate worktree branch, files in the commit tree are often stored at
   `<thread>/<post>.md` (since the root of the branch was mounted at the `_threads/` folder).
3. A conformant resolver resolving `position: "_threads/<thread>/<post>.md"` against a root pin
   applies the following two-step resolution:
   - Check if `_threads/<thread>/<post>.md` exists in the pinned Git tree.
   - If not found and the position starts with `_threads/`, strip the leading `_threads/` prefix and
     check if `<thread>/<post>.md` exists in that pinned Git tree.
   - Return the matching tree path, or null if neither matches.

No reader may substitute working-tree HEAD for an unavailable commit pin.

## Unaware readers

A thread-unaware reader follows the base protocol's extension rules:
- It skips `_threads/` quietly without error or warning.
- It does not parse posts beneath `_threads/` as ordinary knowledge Notes or ambient context.
- It preserves `_threads/...` Map member positions without attempting to interpret them as Content.

## Portable operations and conformance

Independent implementations share these portable operations. The time operations are defined in
[`time.md`](time.md#portable-operations-and-conformance) and keep their Thread names here:

1. **`parse_thread_post` (`parseThreadPost`)**: `parse_entry` on a Thread post: only unparseable
   frontmatter or an invalid `id` makes a post unreadable; unknown `kind` values kept; optional fields
   tolerated with post-and-field warnings; a bad Map member dropped without erasing good members;
   `closed` read from the field or the legacy kind; invalid authored dates retain
   `dateWarning: invalid_date`.

2. **`inspect_thread_posts` (`inspectThreadPosts`) and `reconstruct_thread_timeline` (`reconstructThreadTimeline`)**:
   `inspect_entries` and `reconstruct_timeline` over caller-supplied direct, canonical
   `_threads/<thread>/<post>.md` files only (not `README.md`, `_agent/`, or other nested payload),
   without inferring the opening from surviving parsed posts. The inspection returns `origin` (the
   opening post's `parent`, or `unknown` when the opening is unreadable), `parent` (the newest later
   post's, else a valid Agreement field, else `origin`), `source` (`post`, `agreement`, `origin` or
   `null`) with `parentPost`, `about` with `aboutPost`, `closed` with `closedPost`, `name` and
   `summary` with `namePost`, the superseded ids, and `writable` with the refusal. An unreadable
   opening means unknown origin and refuses writes, naming the file and repair step; later unreadable
   posts warn, are named by the state rule, and do not block writes. Timeline reconstruction keeps
   unknown kinds in the DAG, folds marks by `(author, mark)`, drops those retracted by a correction,
   counts an author's repeat once, and keeps marks out of the linear timeline.

3. **`parse_thread_attachment` (`parseThreadAttachment`), `parse_thread_agreement_attachment` (`parseThreadAgreementAttachment`) and `resolve_thread_parent` (`resolveThreadParent`)**:
   `parseThreadPost` sets `post.parent` from `parent` (else, when the post has no `parent` field, a legacy post `attached_to`) and `post.about` from `about` (else, when it has no `about` field, a legacy non-post `attached_to` as one link), keeping `attachedTo` as authored. `inspectThreadPosts(sources, agreementAttachment)` orders the supplied canonical post files by code-unit comparison of their paths, the same order that selects the opening and the current Map, and never by authored `date` or the order supplied. The resolver understands `post:` (including the addressed form) and bare `id`/`path` aliases only; all other open types return `none` with the link preserved. An invalid Agreement `parent` or `attached_to` returns absent plus warning rather than rejecting the Agreement; consumers must show that warning. Only post references are tree edges; `isPostReference` is that test. Resolve a post edge against explicitly supplied pinned root snapshots; an addressed post resolves only in the supplied root whose label is the address's root. Report resolved, unresolved, or ambiguous for a post edge; return `none` for a non-post link while keeping its metadata. Never guess or change an ordinary Note's subject binding. `childThreadsOfPost` derives the reverse link using the same resolution.

4. **`resolve_thread_git_path` (`resolveThreadGitPath`)**:
   - Resolves an authored repository-relative `_threads/...` Map position against a pinned Git tree,
     transparently supporting both unified repository trees and dedicated worktree branch commit roots.

5. **`look` and `navigate` for Threads**:
   - `assembleContentLook` deepens Thread folders, READMEs, posts, and `_agent/` files at five canonical rungs (`name`, `summary`, `surface`, `children`, `full`), and does the same for any folder whose Agreement keeps time.
   - `assembleContentFocus` assembles reference context for Thread folders, READMEs, posts, and `_agent/` positions, providing reference-frame Agreement and depth-1 post outline.
   - Pinned Map member addresses resolving to `_threads/...` or `_agent/...` positions resolve through the same canonical local contract after the authored tree is selected; Map membership is not filesystem authorization.
   - A Thread folder's `full` is one README surface plus a capped list of direct post handles, not the post bodies or a timeline. See [`content-look.md`](content-look.md) for the five rung and cap rules.

6. **`current_thread_map` (`currentThreadMap`)**: `current_map` over caller-supplied canonical direct
   post files, in any order, with the optional `complete: false`, separately read `opening` and
   positive `lookback` cap; returns `status`, the chosen post, the Map, the Map's field warnings,
   `skipped` newest first, `lookback` and `reason`. Pure.

Language-neutral Thread-format vectors are published in [`../conformance/threads/manifest.json`](../conformance/threads/manifest.json), including hosted Thread ids in `hosted-ids.json`, field-tolerance, mark and unreadable-post cases in `metalayer.json`, `parent` and `about` cases in `parent.json`, post-id resolution cases in `post-selection.json`, current Thread Map cases in `current-map.json`, and separate Thread Agreement JSON Schema cases in `agreement-schema.json`. Every one of them also passes through the time operations, and again on a folder that is not `_threads/`; that rule and the state, selection and memory vectors are in [`../conformance/time/manifest.json`](../conformance/time/manifest.json). The five-rung reader and reference focus vectors are in [`../conformance/thread-reader/manifest.json`](../conformance/thread-reader/manifest.json).

## Consumer migration: parent from the Agreement

This pre-1.0 update changes which attachment a reader reports as the current parent, not the files on disk:
- `inspectThreadPosts` reports a valid Thread Agreement `attached_to` as `parent`, where it used to prefer the opening post's. A Thread whose Agreement and opening post name different parents now reports the Agreement's.
- `ThreadPostInspection` gains `origin`, the opening post's attachment. Show it next to `parent` when they differ.
- An unreadable opening post no longer hides a valid Agreement parent: `parent` resolves while `origin` is `unknown` and writes stay refused.
- The second parameter of `inspectThreadPosts` is renamed `agreementAttachment`; its type and positional use are unchanged.

## Consumer migration: 0.27.0 → 0.28.0

This pre-1.0 update changes the **reader API**, not the files already on disk:
- `ThreadPost.kind` is now an open string. Unknown values remain readable; do not exhaustively switch over the old fixed enum. `kind: mark` is folded only when it has a string value and one readable post target.
- `ThreadAttachment` widens from the `path | id` union to an open `{ kind, value, raw? }`. `resolveThreadParent` returns `none` (with the attachment preserved) for non-post types; `unresolved` now means a **post** edge was missing. Typed `id:` and `path:` have no parent-edge meaning; bare `msg_…` and `_threads/…md` aliases retain theirs.
- A malformed legacy Agreement `attached_to` reads as `absent` with `warning: invalid_attached_to`, rather than `invalid`. New authors still validate against the strict Agreement JSON Schema. Optional post-field failures now live on `post.warnings`; only unreadable frontmatter or id returns `invalid`.
- `reconstructThreadTimeline` returns copied post objects, not caller-owned references. Do not compare them to the inputs by object identity. Filename tie-breaking is code-unit rather than locale-aware, so non-ASCII paths may sort differently. Marks are rederived per call.
- `inspectThreadPosts` takes canonical direct post files; an empty Thread can be started, an unreadable opening blocks writes with an actionable refusal, and later unreadable posts never block writes. Content look may return `target.warnings` on post targets and Thread-folder `children`/`full` reads.

## Consumer migration: 0.28.0 → 0.29.0

Directory Content look at `children`/`full` now returns `target.page` (`total`, `shown`, `order`,
optional `nextCursor`) and pages in filename order with `limit`, `since` and
`order: older|newer`. The first-page display remains bounded at 50, but its representation
revision changes because page facts are returned. `_agent/` directory child ties previously
used locale-aware sorting and now use code-unit order, matching Thread and generic Content handles;
non-ASCII `_agent/` filenames may move between pages. Consumers should follow `nextCursor`, not
infer the next page from a filename or silently restart after a stale cursor. A post-id look
returns the selected post's normal target (or an explicit `unresolved`/`ambiguous` diagnostic),
not the folder body. The Map address ending in `msg_…` is a read-time selector at its selected
commit and does not add a real `.md` file.

## Consumer migration: 0.29.0 → 0.30.0

The parent change above ships in this version. Also in it:

- **Hosted Thread ids are opaque.** Use `HOSTED_THREAD_ID` (`^x_[A-Za-z0-9_-]+$`). Remove any check of `x_` and 24 or 32 hex: a closed length refuses the next id a host mints.
- **`kind` and `tags`.** A writer uses the standard kinds, and a label goes in `tags`. A reader still keeps every existing kind, known or not.

The ladder's change, `copy` leaving it for an option, is in [`maps.md`](maps.md#capability-options).

## Consumer migration: 0.31.0 → 0.32.0

Additive. No file on disk changes meaning.

- **`currentThreadMap` names the rule.** A client that picked "the newest snapshot that carries a
  Map, else the opening post's" in its own code should switch to the reader. Its answer changes in
  Threads where a later post of another kind carries a Map: that Map is now the current one. Newest
  is filename order, not timeline order or `date`. A post whose Map fails to parse is passed over
  and named, where a client may have used it or stopped.
- **Show `stopped` and `skipped`.** A capped or partial read that falls back to the opening post's
  Map should say so, and a passed-over post should be named where the Map is shown.

## Consumer migration: 0.32.0 → 0.33.0

Additive for files on disk: no field is removed, and an existing post or Agreement changes meaning
only as the legacy reading says.

- **`parent` and `about` take over `attached_to`'s two jobs.** A post's `parent` is one post
  reference; `about` is any number of typed links. A reader derives both from a legacy
  `attached_to`: a post reference is `parent`, anything else is `about`. A consumer that showed a
  non-post `attached_to` as the parent now shows it under `about`, and the Thread's `origin` is
  `null` unless the opening names a post.
- **The current parent moves with posts.** `inspectThreadPosts` takes the newest later post that
  carries `parent`, then the Agreement's `parent` or `attached_to`, then the origin. A Thread whose
  Agreement was edited to move it reads the same as before until a post moves it again. The result
  gains `source` (`post` | `agreement` | `origin` | `null`), `parentPost`, `about` and `aboutPost`.
- **Addressed posts.** `post:@<root>//<selector>` is a valid `parent` on a post. `resolveThreadParent`
  resolves it only in the supplied root whose label is the address's root identity or name; a
  consumer that labels its roots otherwise reports `unresolved`, which is honest, not a defect. The
  Agreement's fallback field does not take the addressed form.
- **New warnings:** `invalid_parent` on a post or an Agreement, `invalid_about` on a post. Show them
  where `invalid_attached_to` is shown.
- **Writers write both during the window:** `parent` or `about` beside `attached_to` on the opening
  post, and the Agreement's `attached_to` beside a `reframe`'s `parent` on a move. A writer stops
  writing `attached_to` once every reader its Threads reach is on this version or later.
- **`isPostReference(link)`** is exported: the test a reader applies before treating a link as a tree
  edge.

**Time and state, in the same version.** The generic part of this page moved to
[`time.md`](time.md) and the functions to `src/time.ts`, behind re-exports; every name a consumer
imports from `@ideaspaces/protocol` or `@ideaspaces/protocol/threads` stays.

- **A folder keeps time by its Agreement.** `keeps_time: true` on a folder's `_agent/agreement.md`
  makes its direct Markdown files with an `id` entries and the rest ordinary Notes. `_threads/` keeps
  time by placement, unchanged. A reader (Content look, a CLI) that pages posts or selects one by id
  in a Thread does the same in such a folder.
- **`closed` is a field.** A post carrying `closed: true` closes the Thread and `closed: false`
  reopens it; `kind: closure` reads as `closed: true`. `inspectThreadPosts` keeps `closed` as
  `true | false | "unknown"` and gains `closedPost`. The reading changes in one case: a Thread with a
  readable closure *and* a newer unreadable post read `true` before and reads `unknown` now, because
  the unreadable post may have reopened it. New warning `invalid_closed`.
- **A snapshot is a post that carries a Map.** A writer stops offering or requiring
  `kind: snapshot`: `threads post --map <note>` on a `post` is the snapshot. The reader keeps legacy
  snapshots and the `snapshot_requires_map` warning. `THREAD_KINDS` still lists all six kinds a reader
  acts on; `ENTRY_KINDS` (`post`, `reframe`, `correction`, `mark`) are the ones a writer offers. The
  legacy reads go only when no writer produces the kinds and one release of each reader has shipped
  after that, no earlier than 1.0 ([`time.md`](time.md#entries-set-state), "When the legacy kinds go").
- **A `reframe` renames.** The Thread's `name` and `summary` are the newest readable reframe's, else
  the opening post's; `inspectThreadPosts` gains `name`, `summary`, `namePost` and `summaryPost`. A writer that moves
  without renaming leaves `name` and `summary` off the reframe. Legacy move-reframes that carried a
  descriptive title ("Moved under …") now read as the Thread's name until a reframe with the right one
  is appended; a consumer may show the README's name beside it meanwhile and say which is which.
- **The README is a view.** A writer that closes, renames, moves or snapshots a Thread rewrites
  `README.md` from the posts; nothing reads the README for state.
- **Selections.** `selectEntries` with `as_of`, `since` and `newest`; `inspectEntries` takes an
  `asOf` cursor. New result fields: `notes` (declared folders), `superseded`.
- **New result fields on `ThreadPostInspection`:** `closedPost`, `name`, `summary`, `namePost`,
  `summaryPost`, `superseded`, `notes`, and `asOf` when a cursor was given. Additive.

## Format evolution

Format changes within `_threads/` are additive only:
- New `kind` values or frontmatter fields MUST be ignored by readers that do not recognize them.
- Posts remain plain Markdown with YAML frontmatter.
- Unlike `_assets/` (which holds non-text supporting assets), `_threads/` posts and READMEs are text
  and are indexed by thread-aware search.
