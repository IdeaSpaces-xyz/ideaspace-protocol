# Workspace handles

Workspace handles are portable, read-only facts that let a local harness present
thin roots without routing filesystem/git reads through a platform executable.
They complement the Content awareness manifest: Content awareness describes one
focused ideaspace position; workspace handles describe roots that a harness may
choose to place around that focus.

The protocol does **not** assign harness roles such as home, mount, reference, or
point of view. It does not render a working set or repository catalog, fetch a
remote tier, prescribe clone language, or mutate lifecycle state. Those choices
remain with the consuming harness.

## Root handle

A root handle contains:

| Field | Meaning |
|---|---|
| `root` | Absolute caller-visible root path. Path normalization does not replace a symlink with its target. |
| `summary` | Summary from `_agent/now.md`, falling back to `README.md`; absent when neither yields content. |
| `directoryCount` | Number of immediate non-noise directories; absent when the root cannot be read. |

Summary selection prefers Layer-1 `summary` frontmatter. An imperfect file may
fall back to its first meaningful non-heading body line. Whitespace is collapsed
so the value remains a one-line handle.

Directory counting excludes implementation noise (`.git`, `node_modules`,
`backups`, `.pi`, `.claude`). `_agent/` is part of the ideaspace shape and is
therefore counted.

## Workspace repositories

Workspace repository discovery examines immediate child directories only. A
child qualifies when resolving its git toplevel returns that child itself after
canonical path comparison. This rule:

- includes ordinary repositories and linked worktrees (`.git` may be a file),
- includes a symlink that points directly to a repository root,
- excludes plain folders,
- excludes a child that merely inherits a parent repository, and
- excludes a symlink to a subdirectory inside a repository.

Each result combines the root handle with raw local git state. Results are sorted
by caller-visible child path. Discovery is unbounded; a harness owns display
caps and priority ordering because those depend on session roles.

All failures are best-effort: an unreadable workspace yields an empty list, and
an unreadable root yields null summary/count facts. No operation contacts a
remote or writes to the filesystem or git.

This schema describes reference-library interchange data; it adds no repository
conformance requirement to [`../SPEC.md`](../SPEC.md).
