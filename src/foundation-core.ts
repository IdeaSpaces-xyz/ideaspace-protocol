// The canonical universal core — the conduct seed a scaffolded space carries
// in its `_agent/foundation.md`.
//
// This is default *content*, not a conformance requirement: SPEC.md stays the
// normative shape, and a space owner may evolve or remove the core in their
// own foundation. Scaffolding tools compose it into the foundation they write
// (the space carries its conduct; harnesses carry capability and mechanics).
// The markdown asset is `templates/foundation-core.md`, shipped in the package
// so non-TypeScript runtimes can read the identical bytes; these exports are
// the bundling-safe compiled-in form, like the skill catalog.

export {
  FOUNDATION_CORE,
  FOUNDATION_CORE_VERSION,
} from "./foundation-core.generated.js";
