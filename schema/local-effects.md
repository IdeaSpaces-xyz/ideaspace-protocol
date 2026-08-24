# Local repository effects

**Status:** normative operation contract, provisional before 1.0. This document refines the local-effect requirements in [`../SPEC.md`](../SPEC.md). It defines behavior, not a transport or programming-language API.

The protocol defines two effects — `write_markdown` and `commit_paths` — and one read-only fact, `path_revision`. Implementations may expose different ergonomic function or tool names, but a conformant local-effect surface MUST be reducible to these requests, results, and phases.

## Boundary

The caller supplies:

- one canonical absolute Git worktree `root`;
- explicit repository-relative paths;
- reviewed path revisions;
- commit message, identity, and structured trailer values;
- a stock-Git capability that executes argument arrays in `root` without a shell.

The implementation MUST NOT authenticate, discover a platform account, call a remote API, read session/Change caches, inspect credentials, mutate Git configuration, or invoke a network Git verb. Harnesses own confirmation and capture-ledger persistence. The CLI owns terminal, auth, remote, and platform behavior.

The package-root TypeScript API remains mutation-free. Pure contract values, validators, and `pathRevision` may be exported there. A TypeScript effect implementation MUST require an explicit effect subpath.

## Shared vocabulary

### Root and path

`root` is the authority boundary and MUST resolve to the canonical toplevel of one non-bare Git worktree. A symlink spelling of the root is not canonical.

A request path is a non-empty `/`-separated file path relative to `root`:

- absolute paths, backslashes, NUL, empty segments, `.` segments, and `..` segments are invalid;
- `.git`, with any ASCII casing, and everything beneath it are reserved;
- directories are never expanded into a path set, and Git pathspec metacharacters are interpreted literally;
- `write_markdown` paths end in the lowercase suffix `.md`; `commit_paths` may select any committable file path;
- each existing component beneath `root` is inspected without following links. A symlink target or ancestor refuses the whole request.

Implementations translate `/` to the host separator only after validating this portable form.

### Path revision

A path revision is an opaque snapshot of one selected path in three places:

```json
{
  "worktree": "<blob-object-id> | null",
  "index": "<blob-object-id> | null",
  "head": "<blob-object-id> | null"
}
```

`null` means absent at that location. Object ids come from the supplied Git and MUST NOT be constrained to SHA-1 length. `worktree` is the object id Git computes for the current regular-file bytes without writing an object; `index` is the stage-0 blob; `head` is the blob at `HEAD`. An unresolved index or a selected directory is uncommittable rather than flattened into this triple.

`path_revision(root, path, git)` returns either:

```json
{
  "status": "ok",
  "operation": "path_revision",
  "path": "notes/a.md",
  "revision": { "worktree": "…", "index": "…", "head": "…" }
}
```

or the `error` form below with phase `preflight` or `revision_check`. It is read-only, symlink-safe, and uses the caller-supplied Git capability. The TypeScript spelling is `pathRevision`.

The triple is a same-path concurrency boundary. Movement on an unrelated path does not invalidate it. Implementations compare all three values exactly:

- `write_markdown` requires an exact expected revision, except that the literal `"any"` is an explicit destructive override after the caller reconciles divergent content;
- every `commit_paths` entry requires an exact expected revision; commit has no force form;
- every selected revision is re-read immediately before the first mutation and again at the commit boundary when the Git sequence requires it;
- one mismatch refuses the whole request. An implementation never substitutes the bytes that happen to be current.

Harness `all` means the caller-supplied set of session-owned, reviewed path revisions. There is no protocol `all` mode.

### Git capability

The capability receives `(root, argv[])`, invokes a caller-chosen stock Git executable directly, and returns exit status, stdout, and stderr separately. It MUST NOT invoke a shell. Local effects use only local plumbing/porcelain; `clone`, `fetch`, `pull`, `push`, and all other network-capable verbs are forbidden.

## `write_markdown`

### Request

```json
{
  "operation": "write_markdown",
  "root": "/canonical/worktree",
  "path": "notes/a.md",
  "expected_revision": {
    "worktree": null,
    "index": null,
    "head": null
  },
  "frontmatter": {
    "mode": "preserve",
    "set": { "name": "A" },
    "remove": ["obsolete"]
  },
  "body": "# A\n",
  "stage": true
}
```

`mode` is `preserve` by default or `replace`. `set` is a string-keyed map of finite JSON/YAML values; `remove` is a duplicate-free list of keys. A key MUST NOT appear in both. `body` is a UTF-8 Markdown body and is never parsed as frontmatter.

### Semantics

Preflight validates the entire request, path boundary, symlink boundary, ignore state, expected revision, and frontmatter patch before mutation.

An untracked path matched by Git's effective ignore rules is local-only and MUST be refused before file creation. A tracked path remains shared and writable even if a later rule matches it.

In `preserve` mode:

1. parse an existing leading YAML frontmatter block;
2. refuse malformed YAML, duplicate keys, or a non-map root;
3. retain every key not named by `set` or `remove`;
4. remove named keys, then apply `set` values.

Preservation is semantic. Unknown scalar, list, and map values survive; comments, quoting, key order, anchors, and scalar style need not. In `replace` mode existing frontmatter is not parsed and the result contains only `set`; this is the explicit repair path.

The implementation renders exactly one leading frontmatter block and appends `body` unchanged. It atomically replaces the final file in the destination directory. A failed replacement MUST NOT expose a torn document. If `stage` is true, it then stages exactly `path`.

A completed atomic replacement followed by a staging failure is `partial`, not `error`. The implementation MUST NOT undo another writer's index state while attempting recovery.

## `commit_paths`

### Request

```json
{
  "operation": "commit_paths",
  "root": "/canonical/worktree",
  "paths": [
    {
      "path": "notes/a.md",
      "expected_revision": {
        "worktree": "…",
        "index": "…",
        "head": "…"
      }
    }
  ],
  "message": "Capture A",
  "trailers": {
    "op": "capture",
    "conversation": "session-id",
    "turn": 4,
    "co_authored_by": ["Keeper <agent:keeper@ideaspaces>"],
    "change_id": "chg_capture-a-3f9k"
  },
  "author": { "name": "Person", "email": "person@example.com" },
  "committer": { "name": "Person", "email": "person@example.com" }
}
```

`paths` is non-empty and duplicate-free. Every path has an exact expected revision. `message` contains non-whitespace text. Author and committer name/email are explicit request values; ambient Git config and platform identity are not inputs.

Trailer values obey [`trailers.md`](trailers.md). The implementation validates and merges the structured values before mutation. A protocol trailer already in `message` is allowed only when valid and non-conflicting. It does not mint a Change id or read conversation/session state.

### Semantics

Preflight validates the whole request, including ignore and symlink state, before mutation. One invalid or local-only path refuses every path.

The operation revalidates all selected revisions, stages only their current exact states (including plain and staged deletions), creates one commit whose changed-path membership is exactly the selected set, and returns the commit object id. A rename has no privileged representation: selecting both old and new paths commits the rename-equivalent pair; selecting one commits only that path's state.

Unselected worktree bytes and index entries MUST remain byte-for-byte/object-for-object unchanged on success and failure. Already staged unselected entries MUST NOT enter the commit. Unselected HEAD movement does not invalidate a selected path revision.

A path that is absent from worktree, index, and HEAD and therefore cannot produce a selected change is `uncommittable_path`. If the selected set produces no tree change, the result is `nothing_to_commit`; an implementation MUST NOT report `ok` without a new commit.

If selected index state became durable and a later commit phase fails, the result is `partial` with the current revisions. An implementation MUST NOT claim rollback unless it can prove ownership of every index value it would restore.

## Result contract

Every effect call returns exactly one top-level state.

### `ok`

The operation completed. Common fields are:

- `status: "ok"`;
- `operation`;
- `affected_paths`, in deterministic request order;
- `path_revisions`, the resulting selected revisions.

`commit_paths` also returns non-empty `commit_oid`. `affected_paths` is never a silently accepted subset.

### `partial`

At least one declared content/index effect completed before failure:

```json
{
  "status": "partial",
  "operation": "write_markdown",
  "affected_paths": ["notes/a.md"],
  "completed_phases": ["write"],
  "path_revisions": [{ "path": "notes/a.md", "revision": { "worktree": "…", "index": null, "head": null } }],
  "code": "stage_failed",
  "phase": "stage",
  "path": "notes/a.md",
  "message": "The document was written but could not be staged.",
  "detail": "implementation diagnostic, optional",
  "recovery_hint": "Review the current path revision before staging or retrying."
}
```

`completed_phases` uses `revision_check`, `write`, `stage`, and `commit` in execution order. The portable `message` and `recovery_hint` are distinct from optional implementation `detail`.

### `error`

No declared content/index/commit effect occurred:

```json
{
  "status": "error",
  "operation": "commit_paths",
  "affected_paths": [],
  "code": "revision_mismatch",
  "phase": "revision_check",
  "path": "notes/a.md",
  "message": "The reviewed path revision no longer matches.",
  "detail": "implementation diagnostic, optional"
}
```

Stable failure codes:

| Code | Meaning |
|---|---|
| `invalid_request` | request shape, empty path set, duplicate path, or unsupported value |
| `invalid_root` | root is absent, non-canonical, bare, or outside the supplied worktree boundary |
| `not_git_repository` | root is not a Git worktree |
| `invalid_path` | path grammar or selected file kind is invalid |
| `path_escape` | absolute or traversal path |
| `reserved_git_path` | `.git` or a descendant |
| `symlink_refused` | target or existing ancestor beneath root is a symlink |
| `ignored_local_path` | untracked selected path matches effective ignore rules |
| `revision_mismatch` | any selected worktree/index/HEAD value changed |
| `malformed_frontmatter` | preserve mode found malformed, duplicate-key, or non-map YAML |
| `invalid_frontmatter_patch` | patch mode/key/value conflict |
| `atomic_write_failed` | final atomic replacement did not complete |
| `stage_failed` | exact-path staging failed |
| `invalid_message` | base commit message is empty or malformed |
| `invalid_identity` | explicit author or committer is missing/invalid |
| `invalid_trailers` | trailer value is invalid or conflicts with the base message |
| `uncommittable_path` | selected state cannot be represented as one committable file path |
| `nothing_to_commit` | exact selected set produces no commit |
| `git_unavailable` | supplied executable/capability could not run |
| `git_executor_failed` | a required Git read/preflight command failed |
| `commit_failed` | commit creation failed after preflight |

A failure uses the phase where it occurred: `preflight`, `revision_check`, `write`, `stage`, or `commit`. The same code may be `error` or `partial` depending on whether a declared durable effect already completed.

## Conformance fixture manifest

[`../conformance/local-effects/manifest.json`](../conformance/local-effects/manifest.json) is the language-neutral PF0 vector set. It is data, not a TypeScript API or Rust trait.

A manifest has:

- `format: "ideaspaces-local-effects/v1"`;
- `contents`, named UTF-8 payloads reused by vectors;
- `required_coverage`, the behavior tags every runner must execute;
- `vectors`, each with a unique `id`, `covers`, `initial`, `request`, and `expected`.

A vector may carry a non-empty `cases` array for a strict input matrix. Each case is materialized independently; a string value of the form `$CASE.<field>` in `initial`, `request`, or `expected` is replaced by that case's field. There is no inheritance between cases or vectors.

`initial.head`, `initial.index`, and `initial.worktree` are complete logical path maps for the fixture repository. A path value is `{ "content": "<contents key>" }`; worktree may also use `{ "symlink": "target" }`. `ignore` carries effective ignore patterns. A runner materializes HEAD, then the exact index, then the exact worktree without normalizing them together.

Each request uses `root: "$ROOT"`. A fixture-only expected revision value has this form:

```json
{ "$revision": "reviewed", "path": "notes/a.md" }
```

The runner records the revision of every request path after `initial`, calls that checkpoint `reviewed`, applies ordered `before_request` actions, replaces each fixture reference with the recorded triple, and only then invokes the operation. The literal `"any"` passes through unchanged. Actions are `write_worktree`, `remove_worktree`, `stage`, `commit`, and `add_ignore`.

`fault` optionally injects one deterministic failure at `stage` or `commit`, before or after the named durable phase as declared. The runner supplies explicit identity and a local Git capability; it MUST run with isolated HOME/config and no credentials or network.

`expected.result` gives status and, when applicable, code, phase, completed phases, exact affected paths, and exact commit membership. `expected.facts` gives final worktree/index/HEAD content keys or `null` for selected paths; it may instead give a semantic `frontmatter` map, `frontmatter_absent` keys, and `body_exact` for rendered Markdown. `unchanged` lists bystanders that must remain identical at all three locations. Frontmatter expectations are semantic unless `body_exact` is present.

A runner MUST reject an unknown manifest format, action, fault, operation, result state, or required coverage tag rather than silently skipping it.

## Conformance checklist

An implementation conforms to the local-effect contract when it:

1. consumes every required manifest vector without language-specific fields;
2. compares worktree/index/HEAD revisions per selected path;
3. confines paths and refuses symlinks before mutation;
4. preserves unknown frontmatter semantically and makes replacement explicit;
5. refuses untracked ignored paths while allowing already-tracked ignored paths;
6. commits exactly the selected set and preserves every unselected index/worktree value;
7. reports durable partial effects honestly with current revisions and recovery guidance;
8. uses explicit identity and a caller-supplied, non-network Git capability;
9. leaves its package-root/default API mutation-free.
