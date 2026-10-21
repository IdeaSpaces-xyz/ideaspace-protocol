# Collaboration threads and `_threads/`

> Language-neutral contract for recognizing local collaboration threads, immutable posts, curated README lens, and root-relative Map pointers. **Provisional, v0.28.0.**

## Role, name, and placement

A directory carrying an Agreement (`_agent/agreement.md`), such as the repository root or a nested
subspace, MAY carry one child directory named exactly `_threads`. That directory and every path
beneath it are **collaboration threads**:

- they travel as tracked repository files;
- each immediate child directory under `_threads/` represents one distinct **Thread** (e.g.
  `_threads/2026-09-26-authorization/`);
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
   Moving content between tiers is an explicit user action.

## Payload

Each thread folder (e.g. `_threads/<thread>/`) contains:

1. `_agent/agreement.md` — standing terms and entry schema for the thread; optionally attaches this Thread to a parent post.
2. **Posts** — dated Markdown files (e.g. `2026-09-26-01-decision.md` or `2026-09-26T12-00-00Z.md`).
3. `README.md` — the curated lens for the thread.

### Parent attachment on a Thread's opening post (and legacy Agreement)

A Thread's opening post MAY declare one `attached_to: <type>:<id>` typed link, capturing what the Thread grew out of at birth. The type namespace is open, not a protocol-defined list. For example, `note:@<root>//<position>`, `repo:n_…`, `change:chg_…` and unfamiliar types are kept and shown; readers and listeners interpret what they recognise. Only `post:msg_…` or `post:_threads/<thread>/<post>.md` establishes an edge in the Thread tree. Bare `msg_…` post ids and canonical post paths are accepted as aliases. Typed `id:...` and `path:...` are *not* bare aliases: they are kept as non-post metadata with no tree edge, even if their value looks like a post target. The pure parser projects them as `kind: typed:id` and `kind: typed:path` with `raw` retaining the authored value; this internal distinction prevents the typed values from masquerading as the bare `kind: id` and `kind: path` aliases. Other open types retain their authored kind. Absent means the Thread starts independently from nothing.

**One relation, one parent:** A Thread's parent and what it is about are unified in `attached_to`. A Thread has at most one parent. When a Thread starts from multiple points of context across threads or notes, `attached_to` names the primary parent, while the opening post's `map` block carries pointers in time to all cited posts and notes.

**Precedence and legacy:** Posts are immutable, whereas an Agreement can change over time. Writing `attached_to` on the opening post anchors the Thread's origin immutably. Legacy Thread Agreements declaring `attached_to` as a bare `msg_…` id or canonical post path remain readable; when both are present, a reader MUST prefer the opening post's `attached_to`. The ordinary Note frontmatter JSON Schema does not govern `_threads/` Agreements. For **new authoring**, the separate [`thread-agreement.schema.json`](thread-agreement.schema.json) validates the optional legacy post-target grammar and rejects a malformed field before writing. A **reader** of an existing malformed legacy `attached_to` drops only that field, warns `invalid_attached_to`, and keeps the Agreement with no parent edge. This differs intentionally from an opening post: `note:@root//pos` (or any open type) is retained there and reports no *post* parent edge, but the same value on a legacy Agreement is outside its post-only grammar and yields absent plus a warning. The opening post is the new authoring location. A malformed YAML block still cannot be read as an Agreement.

**Rejected alternative — cross-Thread `in_reply_to`:** An `in_reply_to` field on the opening post pointing to another Thread is rejected because it would conflate within-Thread timeline DAG ancestry with the Thread tree hierarchy. `in_reply_to` is reserved for replies within the same Thread's timeline.

The path form of a post attachment has exactly three segments: `_threads/`, a nonempty thread name not beginning with `.`, and a nonempty `.md` post filename not beginning with `.` and not `README.md`; `.`/`..` segments, absolute paths and extra segments are invalid. An id starts `msg_` followed by an ASCII letter or digit, then zero or more ASCII letters, digits, `_` or `-` (`^msg_[A-Za-z0-9][A-Za-z0-9_-]*$`).

A reader resolves a `post:` attachment using **only** root snapshots explicitly supplied or authorized by its caller. A path matches only that exact canonical post position within a supplied root; an id matches only the post's authored `id` within those roots. A post id that happens to equal another post's path does not make a path match ambiguous. A unique match reports both the original authored value and the parent root, pin, Thread and post; no match is `unresolved`, and multiple matches are `ambiguous` with **no chosen parent**. Both forms produce the same reverse child-Thread link. A reader MUST NOT scan arbitrary filesystem roots, pick the first match, or substitute working-tree HEAD when an authored pin lacks the post. Non-post attachments (`note:`, `repo:`, `change:`, or custom types) do not establish edges in the Thread tree. Report `status: none` (no parent edge), keeping the attachment as metadata for listeners; `unresolved` is reserved for a missing post edge.

### Immutable posts and field tolerance

Every post is an immutable Markdown file with a YAML frontmatter metalayer. Once written and committed, a post is never edited in place; updates and corrections are appended as new posts.

A post MUST declare valid leading YAML frontmatter containing at least a non-empty `id`:

| Field | Shape | Meaning |
|---|---|---|
| `id` | Non-empty string | Globally unique post identifier minted by the writer (e.g. `msg_...` or timestamp-prefixed id). |
| `date` | Calendar-valid ISO instant: `YYYY-MM-DDTHH:mm:ss[.sss]Z` or `YYYY-MM-DDTHH:mm:ss[.sss]±HH:mm` (fraction 1–3 digits); legacy `YYYY-MM-DD` | Optional for old posts; new writers record the instant used in the filename stamp. Readers prefer the authored date: an instant normalizes to UTC `Z`, a date-only value stays a day with no instant. Treat a YAML-coerced timestamp as that same ISO instant; implementations read the scalar without rejecting the post due to YAML timestamp typing. With no field, a valid filename stamp supplies UTC instant; an unstamped name supplies no time. Malformed authored date yields diagnostic `dateWarning: invalid_date`, never invalidates the post and never falls back silently. |
| `in_reply_to` | String or string array | Optional parent post id(s). Absent for the initial thread post; a string for a single parent reply; an array of 2+ ids for a multi-parent join (merge). |
| `references` | Array of strings | Optional ancestor chain of post ids, ordered from oldest ancestor to immediate parent. |
| `kind` | String | Role of the post: standard `post` (default), `snapshot`, `reframe`, `correction`, `closure`, `mark`, or any open custom kind. Unknown kinds are valid and preserved in the DAG. The raw nonempty string is kept; `"mark "` is an unknown kind, not normalized to `mark`. |
| `mark` | String | Open mark value when `kind` is `mark` (e.g. `claimed`, `done`, `+1`). The authored string is kept; whitespace-only or YAML-coerced non-string values warn and are not folded. |
| `attached_to` | String (`<type>:<id>`) | Optional open typed link on the opening post; only `post:` (or a bare post alias) has tree-edge semantics. |
| `supersedes` | String | Optional post id being superseded when `kind` is `correction` or when retracting a mark. |
| `map` | Object | Optional Map block (`roots`, `members`) capturing cited coordinates and selections. |
| `name` | String | Optional title or subject line. |
| `summary` | String | Optional dense summary for search and orientation. |
| `tags` | Array of strings | Optional retrieval tags. |
| `actor_ref` / `author` | String | Optional author identity or human-readable author attribution. |

#### Field tolerance rule

A reader acts on what it recognises and keeps the rest. An invalid optional field (`map` or one member, `references`, `supersedes`, `attached_to`, `in_reply_to`, `date`, `kind`, or `mark`) is dropped with a diagnostic warning naming the post and field; the post itself remains valid and readable. A numeric-looking mark such as `+1` MUST be quoted as a string in YAML (`mark: '+1'`); otherwise YAML may coerce it to a number and the parser warns `invalid_mark`.

#### Unreadable posts and repair

Only two flaws make a post completely unreadable:
1. Missing or unparseable YAML frontmatter.
2. Missing, non-string, or whitespace-only `id`.

When a post is unreadable, the reader skips and names it with diagnostic issues; the Thread still lists and opens by its folder.
- An empty Thread (no posts yet) has no broken opening: parent is absent, closed is false and creation of the first post is allowed.
- If an existing **opening post** is unreadable, its parent reads `unknown` (not "none") and **writes are refused**, naming that post and the repair step. Without its id, an untargeted reply has nowhere to branch from.
- Any **other** unreadable post warns but **does not block writes**. A malformed post may have been a closure, so closed state reads `unknown` unless a readable closure settles it. A visible misplaced write into a closed Thread is preferable to locking out every writer.

**Anyone who may write in the Thread may repair an unreadable post** whose frontmatter never parsed (or whose id was never valid). Commit the repair with a message stating why; once-valid posts remain immutable. This is not a license to silently edit authored history.

#### `kind: mark` folding

Posts with `kind: mark` attach open-ended status or reaction marks (e.g. `claimed`, `done`) to a target post:
- `mark` carries the string value.
- `in_reply_to` names exactly one target post id.
- A mark can be retracted or superseded by a `correction` post carrying `supersedes: <mark_post_id>`.
- In timeline reconstruction, valid marks are folded onto the target post's `marks` array and excluded from the linear post sequence. A malformed mark (missing value, other than exactly one target, or target missing in the selected snapshot or itself a mark) stays visible as a post with a field warning; it is not silently erased. The missing/mark-target warning requires a selected Thread snapshot and appears in `inspectThreadPosts` and timeline reconstruction, not in a standalone post look without its neighbours.
- Fold rule: collect `(author, mark)` pairs on each target post, drop marks superseded **only by `kind: correction`**, and deduplicate repeated marks by the same named author so one author's repeat counts once. Missing author does not identify a person: anonymous marks remain distinct by post id. This is a projection rule, not an authorship/authorization policy; the protocol imposes no same-author condition on a correction. A writing surface applies its own access policy.
- Timeline reconstruction MUST NOT mutate the caller's parsed posts or carry a previous fold into a later reconstruction. The opening is the earliest direct post filename in code-unit order, not whichever parsed post happens to be the first DAG root. A writer leaves `in_reply_to` absent on that opening; in a conforming Thread it is also a DAG root. Timeline ties use code-unit order of authored paths, then ids (not host locale), so implementations choose the same opening.

The Markdown body follows the frontmatter and contains the message text. The reader also exposes optional derived `fileDate`: the valid filename instant **or day**, independent of the authored `date`. It recognizes `YYYY-MM-DDTHH-mm-ss[-SSS]Z-…`, minute-precision `YYYY-MM-DDTHHmm-…`, and day-only `YYYY-MM-DD-…` (or a `.md` terminator for timestamp forms); invalid calendar/time stamps supply no `fileDate`. An authored or filename-only day displays as `YYYY-MM-DD`, never as an invented midnight instant. Consumers order date-only authored `date` by `fileDate` when present, otherwise by that day; other valid authored instants normalize to UTC before time comparison. This is a consumer ordering rule, not a change to the timeline DAG's topological order.

### The curated lens (`README.md`)

`README.md` in a thread folder is the **curated lens**:
- It provides a human-written story of what the thread has become, kept current by its owner or participating agents.
- It MAY carry a `map` frontmatter block whose members reference key milestone posts in the timeline at chosen representation rungs (`name`, `summary`, `full`), branch points, and the active frame.
- The `README.md` is the pinned summary; no separate pin field exists.
- The index of posts in timeline order is derived by readers from post headers, never stored as a generated index file.

Only two files change over time: `_agent/agreement.md` and `README.md`, tracked by Git history. Posts remain strictly immutable.

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
conversations continue to use the open address `thread:x_<24hex>`.

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

Independent implementations share these portable operations:

1. **`parse_thread_post` (`parseThreadPost`)**:
   - Extracts frontmatter and body. Only unparseable frontmatter or an invalid `id` makes a post unreadable.
   - Keeps unknown `kind` values and tolerates optional fields with post-and-field warnings. A bad Map member is dropped without erasing good members. Invalid authored dates retain `dateWarning: invalid_date`.

2. **`inspect_thread_posts` (`inspectThreadPosts`) and `reconstruct_thread_timeline` (`reconstructThreadTimeline`)**:
   - Inspect caller-supplied direct, canonical `_threads/<thread>/<post>.md` files only (not `README.md`, `_agent/`, or other nested payload) without inferring the opening from surviving parsed posts. An unreadable opening means unknown parent and refuses writes, naming the file and repair step. Later unreadable posts warn but do not block writes; closure reads unknown unless a readable closure settles it. Look still reads the folder and surviving posts.
   - Reconstruct the reply DAG and topologically ordered timeline. Keep unknown kinds in the DAG. Fold `kind: mark` posts onto their target by `(author, mark)`, dropping those retracted by a correction and counting an author's repeat once; do not put marks in the linear timeline.

3. **`parse_thread_post` (`parseThreadPost`), `parse_thread_agreement_attachment` (`parseThreadAgreementAttachment`) and `resolve_thread_parent` (`resolveThreadParent`)**:
   - Read `attachedTo` from the parsed opening post, preferring it over a legacy Agreement attachment. The resolver understands `post:` and bare `id`/`path` post aliases only; all other open types return `none` with the attachment preserved. An invalid Agreement `attached_to` returns absent plus warning rather than rejecting the Agreement; consumers must show that warning. Only post targets are tree edges. Resolve a post edge against explicitly supplied pinned root snapshots. Report resolved, unresolved, or ambiguous for a post edge; return `none` for a non-post attachment while keeping its metadata. Never guess or change an ordinary Note's subject binding. `childThreadsOfPost` derives the reverse link using the same resolution.

4. **`resolve_thread_git_path` (`resolveThreadGitPath`)**:
   - Resolves an authored repository-relative `_threads/...` Map position against a pinned Git tree,
     transparently supporting both unified repository trees and dedicated worktree branch commit roots.

5. **`look` and `navigate` for Threads**:
   - `assembleContentLook` deepens Thread folders, READMEs, posts, and `_agent/` files at five canonical rungs (`name`, `summary`, `surface`, `children`, `full`).
   - `assembleContentFocus` assembles reference context for Thread folders, READMEs, posts, and `_agent/` positions, providing reference-frame Agreement and depth-1 post outline.
   - Pinned Map member addresses resolving to `_threads/...` or `_agent/...` positions resolve through the same canonical local contract after the authored tree is selected; Map membership is not filesystem authorization.
   - A Thread folder's `full` is one README surface plus a capped list of direct post handles, not the post bodies or a timeline. See [`content-look.md`](content-look.md) for the five rung and cap rules.

Language-neutral Thread-format vectors are published in [`../conformance/threads/manifest.json`](../conformance/threads/manifest.json), including field-tolerance, mark, and unreadable-post cases in `metalayer.json`, and separate Thread Agreement JSON Schema cases in `agreement-schema.json`. The five-rung reader and reference focus vectors are in [`../conformance/thread-reader/manifest.json`](../conformance/thread-reader/manifest.json).

## Consumer migration: 0.27.0 → 0.28.0

This pre-1.0 update changes the **reader API**, not the files already on disk:
- `ThreadPost.kind` is now an open string. Unknown values remain readable; do not exhaustively switch over the old fixed enum. `kind: mark` is folded only when it has a string value and one readable post target.
- `ThreadAttachment` widens from the `path | id` union to an open `{ kind, value, raw? }`. `resolveThreadParent` returns `none` (with the attachment preserved) for non-post types; `unresolved` now means a **post** edge was missing. Typed `id:` and `path:` have no parent-edge meaning; bare `msg_…` and `_threads/…md` aliases retain theirs.
- A malformed legacy Agreement `attached_to` reads as `absent` with `warning: invalid_attached_to`, rather than `invalid`. New authors still validate against the strict Agreement JSON Schema. Optional post-field failures now live on `post.warnings`; only unreadable frontmatter or id returns `invalid`.
- `reconstructThreadTimeline` returns copied post objects, not caller-owned references. Do not compare them to the inputs by object identity. Filename tie-breaking is code-unit rather than locale-aware, so non-ASCII paths may sort differently. Marks are rederived per call.
- `inspectThreadPosts` takes canonical direct post files; an empty Thread can be started, an unreadable opening blocks writes with an actionable refusal, and later unreadable posts never block writes. Content look may return `target.warnings` on post targets and Thread-folder `children`/`full` reads.

## Format evolution

Format changes within `_threads/` are additive only:
- New `kind` values or frontmatter fields MUST be ignored by readers that do not recognize them.
- Posts remain plain Markdown with YAML frontmatter.
- Unlike `_assets/` (which holds non-text supporting assets), `_threads/` posts and READMEs are text
  and are indexed by thread-aware search.
