# Markdown inspection

Portable, read-only inspection lets a surface deepen into one Markdown document without making the full body the default:

```text
summary → outline → selected section → full document
```

This is a reader capability, not a new repository format or conformance requirement. It performs no network access and no writes. Local file-read errors propagate to the caller so each host can apply its own permission, missing-path, and presentation contract.

## Requests

An inspection request selects exactly one mode:

- `summary` — return the frontmatter `summary`; when absent, return the first meaningful non-heading body line; return `null` when neither exists.
- `outline` — return structured ATX headings only.
- `section` — select one heading by exact text plus an optional one-based occurrence.

Setext headings are intentionally out of scope. The Ideaspace writing standard uses ATX headings, and keeping the first primitive narrow makes behavior portable across runtimes.

## Heading record

Each outline or section heading carries:

- `level` — ATX depth `1..6`;
- `text` — trimmed heading text with an optional closing `#` sequence removed;
- `line` — one-based line in the complete source document, including frontmatter;
- `occurrence` — one-based count among headings with the same exact, case-sensitive text.

Leading frontmatter and headings inside backtick or tilde fenced code blocks are not part of the outline.

## Section selection

A section starts at its selected ATX heading and includes its body and nested subsections. It stops immediately before the next heading whose level is equal to or higher than the selected heading. The returned Markdown is the exact source slice, including its original line endings.

Duplicate headings are never selected silently. When exact heading text has multiple matches and no occurrence is supplied, inspection returns `ambiguous` with all matching heading records. A missing heading or out-of-range occurrence returns `not-found`; a positive one-based occurrence selects that exact match.

## Structured result

- Summary: `{ mode: "summary", summary: string | null }`
- Outline: `{ mode: "outline", headings: Heading[] }`
- Found section: `{ mode: "section", status: "found", query, heading, markdown }`
- Duplicate without occurrence: `{ mode: "section", status: "ambiguous", query, matches }`
- Missing selection: `{ mode: "section", status: "not-found", query, matches }`

Surfaces own presentation, output truncation, permissions, and whether a missing or ambiguous section maps to a non-zero process exit. Full-document reads remain a later, explicit rung supplied by the host.
