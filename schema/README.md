# schema/

The machine-readable, language-neutral contract — so non-TypeScript runtimes can conform without importing the reference library.

Present (v0.10.0, provisional):

- [`frontmatter.schema.json`](frontmatter.schema.json) — the Layer 1 leaf. Fields: `name`, `summary`, `attached_to` (single, typed link; the `<type>:<id>` shape is protocol, the type namespace is platform-defined), `tags`. Nothing strictly required (absent = drift, not error); `additionalProperties` allowed (extensible).
- [`agent-contract.md`](agent-contract.md) — the `_agent/` five-file contract, knowledge/support/context roles, fractal composition, optional root identity, underscore extension rule, and a conformance checklist.
- [`assets.md`](assets.md) — exact `_assets/` supporting payload, ordinary relative resolution from the containing Markdown file, one pure lexical operation, and the no-search/no-fallback boundary.
- [`root-identity.md`](root-identity.md) — optional `root_node_id` foundation declaration, current and legacy forms, one-minter lifecycle, pure evidence states, and lazy legacy convergence.
- [`content-awareness.md`](content-awareness.md) — the portable read-only Content awareness manifest, canonical render sections, and the protocol/harness placement boundary.
- [`markdown-inspection.md`](markdown-inspection.md) — portable progressive-disclosure reads for one Markdown document: summary, ATX outline, or an explicitly selected section.
- [`local-effects.md`](local-effects.md) — the language-neutral `write_markdown`, `commit_paths`, and `path_revision` contract: per-path revision CAS, root/symlink/ignore safety, frontmatter preservation, exact commits, and typed partial failure.
- [`workspace-handles.md`](workspace-handles.md) — neutral root summaries and immediate-child repository handles for local workspace awareness.
- [`trailers.md`](trailers.md) — the Change layer: commit trailers (`Op`, `Conversation`, `Change-Id`, …), the `Change-Id` format, and the not-a-superproject stance.
- [`surface-state.md`](surface-state.md) — shared surface state: the interop conventions surfaces derive identically to coexist (`~/.ideaspaces/` caches, `refs/ideaspaces/` markers) — the underscore-namespace move applied outside the content tree.

These make the normative shape and its portable interoperability conventions language-neutral. `assets.md` names one supporting-material role and pure resolver without adding storage or rendering policy. `root-identity.md` adds only validation when a root foundation declares the optional field; absence remains valid. `content-awareness.md`, `markdown-inspection.md`, `workspace-handles.md`, and `surface-state.md` do not add repository-conformance requirements beyond [`../SPEC.md`](../SPEC.md). `local-effects.md` applies only to tools that claim local-effect conformance; it does not require every ideaspace reader to mutate repositories. **Provisional and public** — the attach-type namespace especially is expected to grow, and breaking changes remain possible before 1.0.
