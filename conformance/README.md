# conformance/

Makes "conforms to the protocol" testable rather than aspirational.

- **`reference-space/`** — a small, known-good conformant ideaspace: a root
  `_agent/` five-file contract, READMEs along a path, a Note with valid Layer-1+2
  frontmatter, a `projects/` branch with a partial `_agent/` (fractal
  composition), and an unknown `_scratch/` folder (graceful-ignore). Validating it
  yields zero `error`-level issues.

- **`validateSpace(root)`** — shipped from the reference library
  ([`../src/conformance.ts`](../src/conformance.ts), exported from the package
  root). It checks a directory against [`../SPEC.md`](../SPEC.md)'s Conformance
  section and [`../schema/agent-contract.md`](../schema/agent-contract.md):

  - **error** — no root `_agent/` (not a space at all).
  - **error** — knowledge `.md` frontmatter that is malformed or violates the
    [`../schema/frontmatter.schema.json`](../schema/frontmatter.schema.json) key
    constraints (`name`/`summary` strings, `tags` a string array, `attached_to` a
    single string matching the schema pattern). The schema is *read at runtime*,
    not bundled with a validator dependency.
  - **warn** — drift signals: a missing `foundation.md`, named-but-absent
    contract files (`purpose.md`/`now.md`), and skipped underscore-prefixed infra
    folders. Drift never fails conformance.

  It dogfoods the library (`readContract`, `inspectFrontmatterSyntax`) and adds no
  new runtime dependencies. Returns `{ ok, issues, notesChecked }`; `ok` is true
  when there are no `error`-level issues.

```ts
import { validateSpace } from "@ideaspaces/protocol";

const report = await validateSpace("./conformance/reference-space");
console.log(report.ok); // true
```

The same kit doubles as the test that an implementation (TS lib here, or
`sw_space` in Python) actually conforms.
