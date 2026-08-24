# conformance/

Makes "conforms to the protocol" testable rather than aspirational.

- **`local-effects/manifest.json`** — language-neutral PF0 request/result vectors for safe Markdown writes, per-path revision CAS, exact-path commits, frontmatter preservation, ignore/symlink boundaries, bystander preservation, explicit identity, and honest partial failures. Rust, TypeScript, or another runtime materializes and judges the same data; the manifest contains no language-specific API shape.

- **`reference-space/`** — a small, known-good conformant ideaspace: a root
  `_agent/` five-file contract, a portable flat-form `_agent/skills/` entry,
  READMEs along a path, a Note with valid Layer-1+2 frontmatter, a `projects/`
  branch with a partial `_agent/` (fractal composition), and an unknown
  `_scratch/` folder (graceful-ignore). Validating it
  yields zero `error`-level issues.

- **`validateSpace(root)`** — shipped from the reference library
  ([`../src/conformance.ts`](../src/conformance.ts), exported from the package
  root). It checks a directory against [`../SPEC.md`](../SPEC.md)'s Conformance
  section and [`../schema/agent-contract.md`](../schema/agent-contract.md):

  - **error** — no root `_agent/` (not a space at all).
  - **error** — an `_agent/skills/` entry id or frontmatter `name` is not a portable Agent Skills id, or the two do not match.
  - **error** — knowledge `.md` frontmatter that is malformed or violates the
    [`../schema/frontmatter.schema.json`](../schema/frontmatter.schema.json) key
    constraints (`name`/`summary` strings, `tags` a string array, `attached_to` a
    single string matching the schema pattern). The schema is *read at runtime*,
    not bundled with a validator dependency.
  - **warn** — drift signals: a missing `foundation.md`, named-but-absent
    contract files (`guide.md`/`purpose.md`/`now.md`), and skipped underscore-prefixed infra
    folders. Drift never fails conformance.

  Validation stops at a descendant `_agent/foundation.md`: that boundary starts
  another space, whose knowledge and skills are validated from its own root.

  It dogfoods the library (`readContract`, `inspectFrontmatterSyntax`) and adds no
  new runtime dependencies. Returns `{ ok, issues, notesChecked }`; `ok` is true
  when there are no `error`-level issues.

```ts
import { validateSpace } from "@ideaspaces/protocol";

const report = await validateSpace("./conformance/reference-space");
console.log(report.ok); // true
```

The same kit doubles as the test that an implementation (the TS reference
lib here, or another language/runtime) actually conforms. Repository-shape conformance and local-effect conformance are separate claims: a reader need not mutate a space, while an effect implementation must execute every required manifest coverage tag.
