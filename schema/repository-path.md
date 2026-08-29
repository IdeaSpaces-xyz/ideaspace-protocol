# Repository path classification

> Language-neutral base boundary for repository ownership. **Provisional, v0.11.0.**

Repository path classification is the base protocol's pure lexical boundary between Content, core agent context, opaque extensions, and untyped repository files. It lets independent readers stop at the same first owner without knowing any named extension.

## Input

The operation receives:

- `path` — a non-empty portable repository-relative path using `/`; and
- `kind` — `file` or `directory`, supplied by the caller.

Target kind is explicit because extension ownership belongs to directories. A file literally named `_assets` is ordinary, `_assets.md` is Markdown knowledge, and a directory named `_assets` is an extension container.

Paths are invalid when they are absolute, empty, end in `/`, contain an empty segment, `.` or `..` segment, backslash, or NUL. Classification performs no normalization, filesystem lookup, existence check, symlink walk, Git query, or mutation.

## Result

A valid path has one role:

| Role | Meaning |
|---|---|
| `knowledge` | A `.md` file outside agent context, extensions, and reserved Git state. |
| `agent-context` | The first owning special directory is exact, case-sensitive `_agent`. |
| `extension` | The first owning special directory starts with `_` and is not exact `_agent`; the result carries that segment's name. |
| `reserved` | The first owning special directory is `.git`, compared case-insensitively for safe lexical exclusion. |
| `ordinary` | A directory or non-Markdown file with no owner above. It remains legal but has no base protocol role. |

An invalid input reports `invalid_path` or `invalid_kind` rather than guessing.

## First owner

Examine directory segments from left to right and stop at the first `_`-prefixed or `.git` segment. Descendants cannot change that role:

- `_agent/_assets/x.png` is agent context;
- `_assets/_agent/x.md` is owned by extension `_assets`;
- `_scratch/_assets/x.png` is owned by extension `_scratch`; and
- `.git/_assets/x.png` is reserved Git state.

Unknown extensions are opaque and quiet. Generic Content readers do not descend into them, validate their Markdown, search them, summarize them, or load them ambiently. A named extension may define separate semantics for an aware reader without changing this base operation.

## Mutation boundary

Classification reports role only. It does not decide whether a path is ignored, tracked, selected, staged, committed, copied, or published. Those decisions remain with effective Git ignore rules, tracked history, and explicit caller-owned path selection.

The language-neutral vectors are [`../conformance/extensions/manifest.json`](../conformance/extensions/manifest.json).
