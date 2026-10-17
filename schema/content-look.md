# Content look

Content look is the portable, read-only local operation for deepening exactly one Markdown Note or directory, including standard `_threads/` and `_agent/` targets, at a requested Map rung. It combines the target's applicable reference frame with one target projection without accepting or changing caller authority.

This is a reader capability, not a repository-conformance requirement. It performs no network access, fetch, checkout movement, identity minting, write, or Git mutation.

## Request

A request carries:

- `position` — an absolute or caller-relative local Markdown file or Content directory;
- `depth` — one of `name`, `summary`, `surface`, `children`, or `full`; default `summary`;
- optional explicit `contractSource: foundation | agreement` for the target frame;
- optional summary and direct-child display caps.

The five depth values are the same vocabulary as Map member depth. Here depth requests a representation; on a stored Map member it remains only a disclosure ceiling.

## Target semantics

| Depth | Markdown Note / Thread post / Thread README / `_agent` file | Directory / repository / Thread folder / `_agent` directory |
|---|---|---|
| `name` | Layer-1 `name`, else filename/id | README Layer-1 `name`, else Agreement name, else directory name |
| `summary` | Layer-1 summary, else first meaningful body line | README summary, else Agreement summary, else `null` |
| `surface` | Markdown body | README body, or `null` when absent |
| `children` | ATX heading records | direct child handles (or direct post handles for Thread folders) with names and available summaries |
| `full` | equivalent to `surface` | surface plus direct children |

Higher target representations retain name and, except at `name`, summary. `children` and `surface` are sibling facets: a children request does not load the surface. A Note's `full` is its surface and does not add heading records.

Directory children preserve the Content tree's deterministic producer order and exclusion rules. `README.md` is the directory surface and is not also returned as a child. The default direct-child cap is 50, or a caller may supply a non-negative cap; omissions are reported through `omittedChildren`. For a Thread folder, children enumerate direct post Markdown files in deterministic filename order with parsed names and available summaries, not post bodies or a recursive timeline. `full` includes one selected README body and those direct child handles; it does not include child surfaces. The cap bounds disclosure of child handles, not the byte length of an individual Markdown body.

## Result

A successful result has `kind: content-look`, fixed `contractRole: reference`, and two parts:

- `reference` — the applicable Content-focus frame with its ambient tree removed. Agreement/Foundation selection, full-load declarations, skills, exact revisions, diagnostics, and `placement: history` retain Content-focus semantics. Target terms are read, never composed as caller authority.
- `target` — canonical local path, portable repository-relative or reference-root-relative `position`, target kind, requested depth, exact representation revision, name, requested representation fields, and `placement: history`.

`target.member` is the rootless local projection `{ position, depth, disclosure }`. It uses Map member vocabulary but does not fabricate root ordinal `0`. A consumer may wrap it as a portable Map member only after independently proving a clean, pinned, identified root. Invalid, dirty, unborn, ignored, or local-only roots remain useful local projections and MUST NOT emit malformed portable Maps.

The target revision is SHA-256 over exactly the semantic target representation returned at that rung, excluding machine-local path, prompt placement, and the requested depth field. A child cap changes the returned child list and `omittedChildren`, so it deliberately changes the representation revision. A Note's equivalent `surface` and `full` reads have the same revision.

## Selection and failures

Foundation/Agreement selection remains neutral. Two available entrypoints without an explicit choice return `contract_choice_required`; unavailable and invalid target frames preserve the Content-focus diagnostics. The unselected entrypoint contributes neither body nor summary.

Standard `_threads/` targets (Thread folder, Thread README, Thread post) and exact `_agent/` files and directories are valid targets at requested rungs. Reserved `.git` state, opaque extension payload from unknown extensions, non-Markdown files, and other non-Content targets return no Content look (`null`). Local filesystem errors propagate to the host so it can provide its own bounded error channel.

## Rendering

The canonical renderer emits the reference frame first and one `Look:` block second. It preserves exact target ordering, renders only requested target fields, and contains no caller contract or authority mutation. CLI, agent tools, and plugins use this renderer rather than reformatting the manifest independently.
