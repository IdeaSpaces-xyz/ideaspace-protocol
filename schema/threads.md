# Collaboration threads and `_threads/`

> Language-neutral contract for recognizing local collaboration threads, immutable posts, curated README lens, and root-relative Map pointers. **Provisional, v0.16.0.**

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

1. `_agent/agreement.md` — standing terms and entry schema for the thread.
2. **Posts** — dated Markdown files (e.g. `2026-09-26-01-decision.md` or `2026-09-26T12-00-00Z.md`).
3. `README.md` — the curated lens for the thread.

### Immutable posts

Every post is an immutable Markdown file. Once written and committed, a post is never edited in place;
updates and corrections are appended as new posts.

A post MUST declare valid leading YAML frontmatter containing at least a non-empty `id`:

| Field | Shape | Meaning |
|---|---|---|
| `id` | Non-empty string | Globally unique post identifier minted by the writer (e.g. `msg_...` or timestamp-prefixed id). |
| `date` | Calendar-valid ISO 8601 instant string: `YYYY-MM-DDTHH:mm:ss[.sss]Z` or `YYYY-MM-DDTHH:mm:ss[.sss]±HH:mm` (fraction 1–3 digits) | Optional for old posts; every new writer MUST record the instant used in its file-name stamp. Readers prefer the authored string unchanged (including offsets) and fall back to a UTC-normalized filename stamp if absent. A day-only legacy filename resolves to midnight UTC; a filename without a valid stamp supplies no date. Invalid authored values yield `invalid_date`, never filename fallback. |
| `in_reply_to` | String or string array | Optional parent post id(s). Absent for the initial thread post; a string for a single parent reply; an array of 2+ ids for a multi-parent join (merge). |
| `references` | Array of strings | Optional ancestor chain of post ids, ordered from oldest ancestor to immediate parent. |
| `kind` | Enum string | Role of the post: `post` (default), `snapshot`, `reframe`, `correction`, or `closure`. |
| `supersedes` | String | Optional post id being superseded when `kind` is `correction`. |
| `map` | Object | Optional Map block (`roots`, `members`) capturing cited coordinates and selections. |
| `name` | String | Optional title or subject line. |
| `summary` | String | Optional dense summary for search and orientation. |
| `tags` | Array of strings | Optional retrieval tags. |
| `actor_ref` / `author` | String | Optional author identity or human-readable author attribution. |

The Markdown body follows the frontmatter and contains the message text.

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

Independent implementations share three portable operations:

1. **`parse_thread_post` (`parseThreadPost`)**:
   - Extracts frontmatter and body.
   - Validates required `id`, optional ISO `date` (invalid values report `invalid_date`), `kind` (`post`, `snapshot`, `reframe`, `correction`, `closure`),
     `in_reply_to`, `references`, and `supersedes`; projects `date` from an old post's filename when absent.
   - Parses embedded `map` when present.

2. **`reconstruct_thread_timeline` (`reconstructThreadTimeline`)**:
   - Reconstructs a thread DAG and topologically ordered timeline from an unordered set of posts.
   - Correctly orders out-of-order posts based on `in_reply_to` and `references`.
   - Handles multi-parent joins (merges) where a post replies to multiple parent posts.
   - Handles corrections (`kind: "correction"`, `supersedes: "<id>"`) and closures (`kind: "closure"`).

3. **`resolve_thread_git_path` (`resolveThreadGitPath`)**:
   - Resolves an authored repository-relative `_threads/...` Map position against a pinned Git tree,
     transparently supporting both unified repository trees and dedicated worktree branch commit roots.

Language-neutral test vectors are published in [`../conformance/threads/manifest.json`](../conformance/threads/manifest.json).

## Format evolution

Format changes within `_threads/` are additive only:
- New `kind` values or frontmatter fields MUST be ignored by readers that do not recognize them.
- Posts remain plain Markdown with YAML frontmatter.
- Unlike `_assets/` (which holds non-text supporting assets), `_threads/` posts and READMEs are text
  and are indexed by thread-aware search.
