# schema/

The machine-readable, language-neutral contract — so non-TypeScript surfaces (e.g. the Python `sw_space` backend) can conform without importing the reference library.

Planned (step 2):

- `frontmatter.schema.json` — the Layer 1 leaf. Fields: `name`, `summary`, `attached_to` (single, typed link), `tags`. Validates a Note's frontmatter.
- `agent-contract.md` — the `_agent/` five-file contract (`foundation`/`guide`/`purpose`/`now`/`next`), the two-roles split, and the underscore extension rule, stated as a checkable contract.

These mirror [`../SPEC.md`](../SPEC.md) in a form tooling can validate against.
