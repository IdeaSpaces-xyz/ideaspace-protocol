# schema/

The machine-readable, language-neutral contract — so non-TypeScript runtimes can conform without importing the reference library.

Present (v0.6.0, provisional):

- [`frontmatter.schema.json`](frontmatter.schema.json) — the Layer 1 leaf. Fields: `name`, `summary`, `attached_to` (single, typed link; the `<type>:<id>` shape is protocol, the type namespace is platform-defined), `tags`. Nothing strictly required (absent = drift, not error); `additionalProperties` allowed (extensible).
- [`agent-contract.md`](agent-contract.md) — the `_agent/` five-file contract, two-roles split, fractal composition, underscore extension rule, and a conformance checklist.
- [`content-awareness.md`](content-awareness.md) — the portable read-only Content awareness manifest, canonical render sections, and the protocol/harness placement boundary.
- [`markdown-inspection.md`](markdown-inspection.md) — portable progressive-disclosure reads for one Markdown document: summary, ATX outline, or an explicitly selected section.
- [`workspace-handles.md`](workspace-handles.md) — neutral root summaries and immediate-child repository handles for local workspace awareness.
- [`trailers.md`](trailers.md) — the Change layer: commit trailers (`Op`, `Conversation`, `Change-Id`, …), the `Change-Id` format, and the not-a-superproject stance.
- [`surface-state.md`](surface-state.md) — shared surface state: the interop conventions surfaces derive identically to coexist (`~/.ideaspaces/` caches, `refs/ideaspaces/` markers) — the underscore-namespace move applied outside the content tree.

These make the normative shape and its portable interoperability conventions language-neutral. `content-awareness.md`, `markdown-inspection.md`, `workspace-handles.md`, and `surface-state.md` do not add repository-conformance requirements beyond [`../SPEC.md`](../SPEC.md). **Provisional and public** — the attach-type namespace especially is expected to grow, and breaking changes remain possible before 1.0.
