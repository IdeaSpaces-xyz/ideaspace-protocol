# conformance/

Makes "conforms to the protocol" testable rather than aspirational.

Planned (step 4):

- `reference-space/` — a small, known-good conformant ideaspace (root `_agent/` with the five-file contract, READMEs along a path, a Note with valid frontmatter, an unknown `_`-folder to test graceful-ignore).
- `validate.ts` — checks a space against [`../SPEC.md`](../SPEC.md)'s MUST/SHOULD: `_agent/` read order, two-roles split, frontmatter schema, graceful-ignore of unknown `_`-folders, no gitignored paths committed.

The same kit doubles as the test that an implementation (TS lib here, or `sw_space` in Python) actually conforms.
