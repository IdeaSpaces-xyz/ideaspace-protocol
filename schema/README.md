# schema/

The machine-readable, language-neutral contract — so non-TypeScript runtimes can conform without importing the reference library.

Present (v0.1, provisional):

- [`frontmatter.schema.json`](frontmatter.schema.json) — the Layer 1 leaf. Fields: `name`, `summary`, `attached_to` (single, typed link; the `<type>:<id>` shape is protocol, the type namespace is platform-defined), `tags`. Nothing strictly required (absent = drift, not error); `additionalProperties` allowed (extensible).
- [`agent-contract.md`](agent-contract.md) — the `_agent/` five-file contract, two-roles split, fractal composition, underscore extension rule, and a conformance checklist.

Both mirror [`../SPEC.md`](../SPEC.md) in a form tooling can validate against. **Provisional and internal-use** — the attach-type namespace especially is expected to grow; public timing is undecided.
