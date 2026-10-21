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

A Thread's opening post MAY declare one `attached_to: <type>:<id>` typed link, capturing what the Thread grew out of at birth. The type namespace is open, not a protocol-defined list. For example, `note:@<root>//<position>`, `repo:n_…`, `change:chg_…` and unfamiliar types are kept and shown; readers and listeners interpret what they recognise. Only `post:msg_…` or `post:_threads/<thread>/<post>.md` establishes an edge in the Thread tree. Bare `msg_…` post ids and canonical post paths are accepted as aliases. Absent means the Thread starts independently from nothing.

**One relation, one parent:** A Thread's parent and what it is about are unified in `attached_to`. A Thread has at most one parent. When a Thread starts from multiple points of context across threads or notes, `attached_to` names the primary parent, while the opening post's `map` block carries pointers in time to all cited posts and notes.

**Precedence and legacy:** Posts are immutable, whereas an Agreement can change over time. Writing `attached_to` on the opening post anchors the Thread's origin immutably. Legacy Thread Agreements declaring `attached_to` as a bare `msg_…` id or canonical post path remain readable; when both are present, a reader MUST prefer the opening post's `attached_to`. The ordinary Note frontmatter JSON Schema does not govern `_threads/` Agreements; the separate [`thread-agreement.schema.json`](thread-agreement.schema.json) tolerates optional legacy fields rather than rejecting the entire Agreement. A malformed legacy `attached_to` loses only that field, warns `invalid_attached_to`, and establishes no parent. A malformed YAML block still cannot be read as an Agreement.

**Rejected alternative — cross-Thread `in_reply_to`:** An `in_reply_to` field on the opening post pointing to another Thread is rejected because it would conflate within-Thread timeline DAG ancestry with the Thread tree hierarchy. `in_reply_to` is reserved for replies within the same Thread's timeline.

The path form of a post attachment has exactly three segments: `_threads/`, a nonempty thread name not beginning with `.`, and a nonempty `.md` post filename not beginning with `.` and not `README.md`; `.`/`..` segments, absolute paths and extra segments are invalid. An id starts `msg_` followed by an ASCII letter or digit, then zero or more ASCII letters, digits, `_` or `-` (`^msg_[A-Za-z0-9][A-Za-z0-9_-]*$`).

A reader resolves a `post:` attachment using **only** root snapshots explicitly supplied or authorized by its caller. A path matches that exact canonical post position within a supplied root; an id matches the post's authored `id` within those roots. A unique match reports both the original authored value and the parent root, pin, Thread and post; no match is `unresolved`, and multiple matches are `ambiguous` with **no chosen parent**. Both forms produce the same reverse child-Thread link. A reader MUST NOT scan arbitrary filesystem roots, pick the first match, or substitute working-tree HEAD when an authored pin lacks the post. Non-post attachments (`note:`, `repo:`, `change:`, or custom types) do not establish edges in the Thread tree and resolve as `unresolved` parent edges while remaining preserved as metadata for listeners.

### Immutable posts and field tolerance

Every post is an immutable Markdown file with a YAML frontmatter metalayer. Once written and committed, a post is never edited in place; updates and corrections are appended as new posts.

A post MUST declare valid leading YAML frontmatter containing at least a non-empty `id`:

| Field | Shape | Meaning |
|---|---|---|
| `id` | Non-empty string | Globally unique post identifier minted by the writer (e.g. `msg_...` or timestamp-prefixed id). |
| `date` | Calendar-valid ISO instant: `YYYY-MM-DDTHH:mm:ss[.sss]Z` or `YYYY-MM-DDTHH:mm:ss[.sss]±HH:mm` (fraction 1–3 digits); legacy `YYYY-MM-DD` | Optional for old posts; new writers record the instant used in the filename stamp. Readers prefer the authored date: an instant normalizes to UTC `Z`, a date-only value stays a day with no instant. Treat a YAML-coerced timestamp as that same ISO instant; implementations read the scalar without rejecting the post due to YAML timestamp typing. With no field, a valid filename stamp supplies UTC instant; an unstamped name supplies no time. Malformed authored date yields diagnostic `dateWarning: invalid_date`, never invalidates the post and never falls back silently. |
| `in_reply_to` | String or string array | Optional parent post id(s). Absent for the initial thread post; a string for a single parent reply; an array of 2+ ids for a multi-parent join (merge). |
| `references` | Array of strings | Optional ancestor chain of post ids, ordered from oldest ancestor to immediate parent. |
| `kind` | String | Role of the post: standard `post` (default), `snapshot`, `reframe`, `correction`, `closure`, `mark`, or any open custom kind. Unknown kinds are valid and preserved in the DAG. |
| `mark` | String | Open mark value when `kind` is `mark` (e.g. `claimed`, `done`, `+1`). |
| `attached_to` | String (`<type>:<id>`) | Optional open typed link on the opening post; only `post:` (or a bare post alias) has tree-edge semantics. |
| `supersedes` | String | Optional post id being superseded when `kind` is `correction` or when retracting a mark. |
| `map` | Object | Optional Map block (`roots`, `members`) capturing cited coordinates and selections. |
| `name` | String | Optional title or subject line. |
| `summary` | String | Optional dense summary for search and orientation. |
| `tags` | Array of strings | Optional retrieval tags. |
| `actor_ref` / `author` | String | Optional author identity or human-readable author attribution. |

#### Field tolerance rule

A reader acts on what it recognises and keeps the rest. An invalid optional field (`map` or one member, `references`, `supersedes`, `attached_to`, `in_reply_to`, `date`) is dropped with a diagnostic warning naming the post and field; the post itself remains valid and readable.

#### Unreadable posts and repair

Only two flaws make a post completely unreadable:
1. Missing or unparseable YAML frontmatter.
2. Missing, non-string, or whitespace-only `id`.

When an ordinary post is unreadable, the reader skips and names it with diagnostic issues; the Thread still opens. However, if the **opening post** or a **closure post** is unreadable:
- The Thread lists and opens by its folder.
- Its parent reads `unknown` (not "none").
- Its closed status reads `unknown`.
- **Writes to the Thread are refused**, naming the unreadable post file to repair.

Repairing a post whose frontmatter never parsed is a supported workflow: commit a repair with a commit message stating why; once-valid posts remain immutable. This is not a license to silently edit authored history.

#### `kind: mark` folding

Posts with `kind: mark` attach open-ended status or reaction marks (e.g. `claimed`, `done`) to a target post:
- `mark` carries the string value.
- `in_reply_to` names exactly one target post id.
- A mark can be retracted or superseded by a `correction` post carrying `supersedes: <mark_post_id>`.
- In timeline reconstruction, marks are folded onto the target post's `marks` array and excluded from the linear post sequence.
- Fold rule: collect `(author, mark)` pairs on each target post, drop superseded marks, and deduplicate repeated marks by the same author so one author's repeat counts once.

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
   - Inspect caller-supplied post files without inferring the opening from surviving parsed posts. An unreadable opening means unknown parent and closed state; any unreadable file could have been a closure, so a writer conservatively refuses until repair, naming it. Look still reads the folder and surviving posts.
   - Reconstruct the reply DAG and topologically ordered timeline. Keep unknown kinds in the DAG. Fold `kind: mark` posts onto their target by `(author, mark)`, dropping those retracted by a correction and counting an author's repeat once; do not put marks in the linear timeline.

3. **`parse_thread_opening_post_attachment` (`parseThreadOpeningPostAttachment`), `parse_thread_agreement_attachment` (`parseThreadAgreementAttachment`) and `resolve_thread_parent` (`resolveThreadParent`)**:
   - Prefer the opening post's open typed attachment over a legacy Agreement attachment; only post targets are tree edges. Resolve a post edge against explicitly supplied pinned root snapshots. Report resolved, unresolved, or ambiguous without guessing or changing an ordinary Note's subject binding. `childThreadsOfPost` derives the reverse link using the same resolution.

4. **`resolve_thread_git_path` (`resolveThreadGitPath`)**:
   - Resolves an authored repository-relative `_threads/...` Map position against a pinned Git tree,
     transparently supporting both unified repository trees and dedicated worktree branch commit roots.

5. **`look` and `navigate` for Threads**:
   - `assembleContentLook` deepens Thread folders, READMEs, posts, and `_agent/` files at five canonical rungs (`name`, `summary`, `surface`, `children`, `full`).
   - `assembleContentFocus` assembles reference context for Thread folders, READMEs, posts, and `_agent/` positions, providing reference-frame Agreement and depth-1 post outline.
   - Pinned Map member addresses resolving to `_threads/...` or `_agent/...` positions resolve through the same canonical local contract after the authored tree is selected; Map membership is not filesystem authorization.
   - A Thread folder's `full` is one README surface plus a capped list of direct post handles, not the post bodies or a timeline. See [`content-look.md`](content-look.md) for the five rung and cap rules.

Language-neutral Thread-format vectors are published in [`../conformance/threads/manifest.json`](../conformance/threads/manifest.json), including field-tolerance, mark, and unreadable-post cases in `metalayer.json`, and separate Thread Agreement JSON Schema cases in `agreement-schema.json`. The five-rung reader and reference focus vectors are in [`../conformance/thread-reader/manifest.json`](../conformance/thread-reader/manifest.json).

## Format evolution

Format changes within `_threads/` are additive only:
- New `kind` values or frontmatter fields MUST be ignored by readers that do not recognize them.
- Posts remain plain Markdown with YAML frontmatter.
- Unlike `_assets/` (which holds non-text supporting assets), `_threads/` posts and READMEs are text
  and are indexed by thread-aware search.
