# conformance/

Makes "conforms to the protocol" testable rather than aspirational.

- **`extensions/manifest.json`** — language-neutral vectors for the base repository-path classifier: explicit file/directory target kind, exact core naming, first-owner precedence, reserved Git state, invalid portable input, and quiet opacity for unknown extensions. No vector requires the semantics of `_assets` or another named extension.

- **`assets/manifest.json`** — language-neutral vectors for exact `_assets/` recognition, pure relative resolution from the containing Markdown file, explicit authored selection when root and nested folders coexist, normalization and root escape, and repository-validator skipping. No vector depends on Markdown parsing, filesystem discovery, rendering, or platform storage.

- **`local-effects/manifest.json`** — language-neutral request/result vectors for safe Markdown writes, per-path revision CAS, exact-path commits, frontmatter preservation, ignore/symlink boundaries, bystander preservation, explicit identity, and honest partial failures. Rust, TypeScript, or another runtime materializes and judges the same data; the manifest contains no language-specific API shape. The TypeScript reference suite executes every vector and case against isolated real Git repositories through the public effect subpath, with injected stage/commit failures.

- **`root-identity/manifest.json`** — language-neutral vectors for optional Space identity: current and legacy reads, deterministic 96-bit generation, absent/local-only/legacy-unstamped/aligned states, and refusal to select an ID from drift, ambiguity, or malformed evidence.

- **`reference-space/`** — a small, known-good conformant ideaspace: a root
  `_agent/` five-file contract, a portable flat-form `_agent/skills/` entry,
  READMEs along a path, a Note with valid Layer-1+2 frontmatter, a recognized
  `_assets/` tree containing deliberately malformed Markdown payload, a `projects/`
  branch with a partial `_agent/` (fractal composition), and an unknown
  `_scratch/` extension (quiet opaque payload). Validating it yields zero
  `error`-level issues.

- **`validateSpace(root)`** — shipped from the reference library
  ([`../src/conformance.ts`](../src/conformance.ts), exported from the package
  root). It checks a directory against [`../SPEC.md`](../SPEC.md)'s Conformance
  section and [`../schema/agent-contract.md`](../schema/agent-contract.md):

  - **error** — no root `_agent/` (not a space at all).
  - **error** — an `_agent/skills/` entry id or frontmatter `name` is not a portable Agent Skills id, or the two do not match.
  - **error** — malformed root foundation frontmatter or a declared `root_node_id` outside the current/legacy forms; missing identity remains valid.
  - **error** — knowledge `.md` frontmatter that is malformed or violates the
    [`../schema/frontmatter.schema.json`](../schema/frontmatter.schema.json) key
    constraints (`name`/`summary` strings, `tags` a string array, `attached_to` a
    single string matching the schema pattern). The schema is *read at runtime*,
    not bundled with a validator dependency.
  - **warn** — drift signals: a missing `foundation.md` and named-but-absent
    contract files (`guide.md`/`purpose.md`/`now.md`). Unknown underscore-prefixed
    extensions are skipped quietly; their name alone is not drift. Drift never fails conformance.

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
lib here, or another language/runtime) actually conforms. Base extension-boundary, assets,
root-identity, and local-effect conformance are distinct claims: every repository reader executes the
extension-boundary vectors without knowing named extension semantics; an assets implementation also
executes the assets vectors; identity absence remains valid for an ordinary reader; an identity
implementation executes the root-identity vectors; and an effect implementation executes every
local-effect manifest coverage tag.
