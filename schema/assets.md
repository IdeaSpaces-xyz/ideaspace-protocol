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

## Identity image

A repository MAY name one picture of itself, its identity image: a knowledge or code repo's icon, an
agent repo's avatar, a person repo's portrait. It is the single optional field `image` in the front
matter of the repository root's `README.md`, and nowhere else:

```yaml
---
name: Field notes
summary: What we learned on the survey.
image: _assets/icon.png
---
```

A `README.md` below the root, a Thread README, an Agreement or a Foundation carrying `image` names
nothing; readers ignore it there. Without the field a reader shows its own default (an icon for the
repo's kind, an avatar glyph, initials). Absence is valid and is not drift.

### Resolution and checks

A reader resolves the value with `resolve_asset_reference`, `source_path` `README.md`, and then
checks the file. It stops at the first check that fails and reports that code:

| Order | Check | Code when it fails |
|---|---|---|
| 1 | The value is a string. An absent or null value is no image, not a problem. | `not_a_string` |
| 2 | The value is a portable relative reference path: no URL or scheme, no leading `/`, no backslash, no empty segment. A remote picture is never fetched. | `invalid_reference` |
| 3 | Resolution does not escape above the repository root (`outside`). | `outside_root` |
| 4 | Resolution returns `asset`: the target is in an `_assets/` folder. | `not_in_assets` |
| 5 | The file name's extension, compared case-insensitively, is `png`, `jpg`, `jpeg`, `webp` or `svg`. | `unsupported_type` |
| 6 | The target exists, after symlinks; a symlink loop is `missing` too. | `missing` |
| 7 | The target's real path, after every symlink, is inside the repository root's real path. | `outside_root` |
| 8 | The target is a regular file. | `missing` |
| 9 | The file is at most **262,144 bytes (256 KiB)**. A reader checks the size before reading the bytes. | `too_large` |
| 10 | The bytes are the extension's type: PNG starts `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; WebP `RIFF`, any four bytes, then `WEBP`; SVG is UTF-8 text whose first element, after an optional XML declaration, comments and whitespace, is `<svg`. | `type_mismatch` |
| 11 | An SVG passes the SVG rule below. | `unsafe_svg` |

An I/O error at any step (a `README.md` or file the reader may not read, a root that went away) is
the code `unreadable`, never an exception that fails the reader or the repository.

Checks 1–5 are lexical and need no filesystem. A reader that cannot perform checks 6–11, such as a
renderer that only has the path, reports nothing it has not checked and MUST NOT show the image
until they pass.

A result is either the image, as `{ path, media_type }` with `path` the normalized
repository-relative target and `media_type` one of `image/png`, `image/jpeg`, `image/webp`,
`image/svg+xml`, or a problem, as one of the codes above or `unreadable`, with a sentence for a
person. **A problem is never fatal:** the repository, the README and every other field stay valid, the reader shows its
default, and it MAY show the problem's sentence to the person who can fix it. Nothing is fetched,
written, or followed outside the root.

### The SVG rule

An SVG identity image is accepted only when its text has none of the following. The test is
lexical, case-insensitive, and refuses what it does not recognize:

- a `<!DOCTYPE` or `<!ENTITY` declaration;
- a `script`, `foreignObject`, `iframe`, `embed`, `object`, `handler` or `listener` element, with
  or without a namespace prefix;
- an attribute whose name, after any namespace prefix, starts with `on`;
- an `href` or `src` attribute, with or without a prefix such as `xlink:`, whose value is not a
  same-document `#fragment`;
- a `url(…)` whose value is not a `#fragment`;
- `@import`, the text `javascript:`, or an animation whose `attributeName` is an `href`;
- any backslash, since a CSS escape could spell the rest.

The test runs on the decoded text, with ASCII case folding only. An implementation MAY refuse more
than this list, never less: every `svg-refused` vector in
[`repository-image.json`](../conformance/assets/repository-image.json) is refused by every reader, and
a reader that refuses an `svg-accepted` vector shows its default, which is safe.

**A reader MUST draw an accepted SVG only as an image** (an `<img>` element, a CSS background, or an
image decoder) and MUST NOT inline it into a page's DOM, open it as a document, or serve it as a
page. The rule is a filter in front of image-only rendering, not a sanitizer, and a reader MUST NOT
rely on it alone.

### Where readers use it

A reader that lists or looks at a repository root (a content look at `.`, a list of a Vault's repos or
agents, a Map's roots) MAY carry the result beside the root's name and summary. A content look at
the repository root carries it from the `summary` rung upward (see [`content-look.md`](content-look.md)).
A changed file or field is a changed image: a reader that keeps a copy keys it on the file's
revision, not the path alone. An identity image is presentation. It proves nothing about who
controls the repo, grants nothing, and is never a reason to publish an otherwise private file.

## Conformance

An assets-aware implementation executes every required coverage vector in
[`../conformance/assets/manifest.json`](../conformance/assets/manifest.json). Repository validators
also recognize `_assets/` as known supporting material: they skip it without an unknown-infrastructure
warning and never validate Markdown payload beneath it as knowledge. Unknown extensions remain
quietly opaque according to the base protocol: their name alone causes no error or warning.

An implementation that reads identity images additionally executes every required coverage vector
in [`../conformance/assets/repository-image.json`](../conformance/assets/repository-image.json).

Apart from the identity image's own checks above, binary I/O, upload UX, filename collision policy,
MIME/type and size limits, rendering, CSP/filesystem capabilities, serving, access control, object
storage, rename rewriting, and cross-Space references are outside this contract.
