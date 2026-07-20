# schema/

The machine-readable, language-neutral contract — so non-TypeScript runtimes can conform without importing the reference library.

Present (v0.4.2, provisional):

- [`frontmatter.schema.json`](frontmatter.schema.json) — the Layer 1 leaf. Fields: `name`, `summary`, `attached_to` (single, typed link; the `<type>:<id>` shape is protocol, the type namespace is platform-defined), `tags`. Nothing strictly required (absent = drift, not error); `additionalProperties` allowed (extensible).
- [`agent-contract.md`](agent-contract.md) — the `_agent/` five-file contract, two-roles split, fractal composition, underscore extension rule, and a conformance checklist.
- [`trailers.md`](trailers.md) — the Change layer: commit trailers (`Op`, `Conversation`, `Change-Id`, …), the `Change-Id` format, and the not-a-superproject stance.
- [`surface-state.md`](surface-state.md) — shared surface state: the interop conventions surfaces derive identically to coexist (`~/.ideaspaces/` caches, `refs/ideaspaces/` markers) — the underscore-namespace move applied outside the content tree.

All mirror [`../SPEC.md`](../SPEC.md) in a form tooling can validate against. **Provisional and internal-use** — the attach-type namespace especially is expected to grow; public timing is undecided.
