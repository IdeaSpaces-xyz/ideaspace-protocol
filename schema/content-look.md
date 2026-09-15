# Content look

Content look is the portable, read-only local operation for deepening exactly one Markdown Note or Content directory at a requested Map rung. It combines the target's applicable reference frame with one target projection without accepting or changing caller authority.

This is a reader capability, not a repository-conformance requirement. It performs no network access, fetch, checkout movement, identity minting, write, or Git mutation.

## Request

A request carries:

- `position` — an absolute or caller-relative local Markdown file or Content directory;
- `depth` — one of `name`, `summary`, `surface`, `children`, or `full`; default `summary`;
- optional explicit `contractSource: foundation | agreement` for the target frame;
- optional summary and direct-child display caps.

The five depth values are the same vocabulary as Map member depth. Here depth requests a representation; on a stored Map member it remains only a disclosure ceiling.

## Target semantics

| Depth | Markdown Note | Directory / repository |
|---|---|---|
| `name` | Layer-1 `name`, else filename | README Layer-1 `name`, else directory name |
| `summary` | Layer-1 summary, else first meaningful body line | README summary, else first meaningful README body line |
| `surface` | Markdown body | README body, or `null` when absent |
| `children` | ATX heading records | direct Content child handles with names and available summaries |
| `full` | equivalent to `surface` | surface plus direct children |

Higher target representations retain name and, except at `name`, summary. `children` and `surface` are sibling facets: a children request does not load the surface. A Note's `full` is its surface and does not add heading records.

Directory children preserve the Content tree's deterministic producer order and exclusion rules. `README.md` is the directory surface and is not also returned as a child. A child cap is honest through `omittedChildren`.

## Result

A successful result has `kind: content-look`, fixed `contractRole: reference`, and two parts:

- `reference` — the applicable Content-focus frame with its ambient tree removed. Agreement/Foundation selection, full-load declarations, skills, exact revisions, diagnostics, and `placement: history` retain Content-focus semantics. Target terms are read, never composed as caller authority.
- `target` — canonical local path, portable repository-relative or reference-root-relative `position`, target kind, requested depth, exact representation revision, name, requested representation fields, and `placement: history`.

`target.member` is the rootless local projection `{ position, depth, disclosure }`. It uses Map member vocabulary but does not fabricate root ordinal `0`. A consumer may wrap it as a portable Map member only after independently proving a clean, pinned, identified root. Invalid, dirty, unborn, ignored, or local-only roots remain useful local projections and MUST NOT emit malformed portable Maps.

The target revision is SHA-256 over exactly the semantic target representation returned at that rung, excluding machine-local path, prompt placement, and the requested depth field. A child cap changes the returned child list and `omittedChildren`, so it deliberately changes the representation revision. A Note's equivalent `surface` and `full` reads have the same revision.

## Selection and failures

Foundation/Agreement selection remains neutral. Two available entrypoints without an explicit choice return `contract_choice_required`; unavailable and invalid target frames preserve the Content-focus diagnostics. The unselected entrypoint contributes neither body nor summary.

Reserved `_agent`, opaque extension payload, non-Markdown files, and other non-Content targets return no Content look. Local filesystem errors propagate to the host so it can provide its own bounded error channel.

## Rendering

The canonical renderer emits the reference frame first and one `Look:` block second. It preserves exact target ordering, renders only requested target fields, and contains no caller contract or authority mutation. CLI, agent tools, and plugins use this renderer rather than reformatting the manifest independently.
