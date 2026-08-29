# Supporting material and `_assets/`

> Language-neutral contract for recognizing supporting payload and resolving one authored relative reference. **Provisional, v0.10.0.**

## Role

A content position MAY carry one child directory named exactly `_assets`. That directory and every
path beneath it are **supporting material** for the position:

- they travel as ordinary tracked repository files;
- they are not content positions, searchable knowledge, Notes, surfaces, or ambient agent context;
- a `README.md` or other `.md` beneath `_assets/` remains payload rather than becoming a Note;
- an asset-unaware reader skips the directory without failing the containing Space.

The name is exact and case-sensitive. Comparison is lexical over the repository path; a
case-insensitive host filesystem does not normalize `_Assets/` into the convention. `_Assets/`,
`_assets.md`, and `assets/` do not acquire this role. `_assets/` is a convention, not an exclusive
allowlist: other repository files and ordinary relative references remain valid.

The role is determined by the first extension/reserved directory segment in a normalized target
path: a segment beginning `_` or case-insensitive `.git`. It must be exactly `_assets`. Thus
`notes/_assets/x.png` is supporting material, while `_agent/_assets/x.png` remains agent context and `_scratch/_assets/x.png` remains unknown
infrastructure. Once `_assets` establishes the role, every descendant is payload regardless of its
name.

Public protocol implementations express only these portable roles. Whether a platform projects
content into graph objects or storage records is outside this contract.

## Authored references

Stored Markdown uses ordinary relative destinations. A tool adding new supporting material SHOULD
create or reuse `_assets/` beside the containing Markdown file and author `_assets/<name>`. This is an
authoring default, never validation: a different relative path remains valid.

A reference resolves from the containing Markdown file's directory. There is no nearest-ancestor
search and no root fallback. To choose a root asset from a nested Note, the author writes the
necessary parent segments explicitly. If root and nested `_assets/` folders contain the same name,
the authored destination selects one; availability never changes the result.

External, scheme-relative, root-relative, and fragment-only destinations remain ordinary Markdown
and are not local asset references. Rendering, MIME policy, serving, and authorization are consumer
concerns.

## `resolve_asset_reference`

The portable operation is pure and lexical.

### Input

| Field | Shape |
|---|---|
| `source_path` | Canonical repository-relative Markdown path. `/` separators; non-empty; no leading/trailing `/`, empty, `.` or `..` segment, backslash, or NUL; final name ends in `.md`; directory segments are content positions, not underscore infrastructure or case-insensitive `.git`. |
| `reference_path` | Already-extracted and decoded path component of one relative Markdown destination. `/` separators; non-empty; no leading/trailing `/`, empty segment, backslash, NUL, or URI scheme. `.` and `..` are permitted. Markdown syntax, titles, query strings, and fragments are removed by the caller. |

Portable paths use `/` on every host. The operation does not parse Markdown or URLs.

### Resolution

1. Begin with the directory segments of `source_path`.
2. Read `reference_path` left to right: ignore `.`, pop one segment for `..`, append any other
   segment.
3. If `..` would pop above the Space root, return `outside`.
4. Render the normalized repository-relative target with `/`; the root directory is `.`.
5. Examine target **directory** segments in order. If the first segment beginning `_` or equal to
   case-insensitive `.git` is exactly `_assets`, return `asset`. Otherwise return `other`.

The final target segment is a file/item name, not a directory for classification. A file literally
named `_assets` therefore remains `other`; `_assets/x` is `asset`.

### Result

| Status | Fields | Meaning |
|---|---|---|
| `asset` | `path` | The normalized in-Space target is supporting material. |
| `other` | `path` | The normalized in-Space target is not supporting material. It is not rejected. |
| `outside` | — | Lexical resolution escapes above the Space root. |
| `invalid` | `code` | Input does not match the portable operation grammar. Code is `invalid_source_path` or `invalid_reference_path`. |

The operation never reads the filesystem, checks existence, follows symlinks, searches ancestors,
falls back to another directory, or mutates state.

## Conformance

An assets-aware implementation executes every required coverage vector in
[`../conformance/assets/manifest.json`](../conformance/assets/manifest.json). Repository validators
also recognize `_assets/` as known supporting material: they skip it without an unknown-infrastructure
warning and never validate Markdown payload beneath it as knowledge. Unknown extensions remain
quietly opaque according to the base protocol: their name alone causes no error or warning.

Binary I/O, upload UX, filename collision policy, MIME/type and size limits, rendering, CSP/filesystem
capabilities, serving, access control, object storage, rename rewriting, and cross-Space references
are outside this contract.
