# src/

The reference TypeScript implementation of the shape — what TS surfaces embed instead of re-implementing. Graduated wholesale from `@ideaspaces/sdk` (which was 100% shape logic).

Present:

- `assets.ts` — exact `_assets/` recognition and pure lexical relative-reference resolution with no filesystem lookup, search, fallback, or mutation
- `frontmatter.ts` — parse / compose / extract (Layer 1: `name`, `summary`, `attached_to`, `tags`)
- `root-identity.ts` — optional Space root ID parsing, deterministic current-form generation, and pure lazy-alignment evaluation over caller-supplied evidence
- `markdown-inspection.ts` — portable progressive-disclosure reads (`summary`, ATX `outline`, exact `section`) over a string or local file
- `space.ts` — `_agent/` contract reader (`CONTRACT_FILES`, `findSpaceRoot`, `readContract`)
- `awareness.ts` — structured Content awareness assembly/rendering (`assembleContentAwareness`, `renderContentAwareness`) plus the compatibility `assembleAwareness` block; `path-context.ts` — path walking
- `git.ts` — git state / recent activity plus the injected, read-only `pathRevision` fact; `local-effects.ts` — pure request/result types, capability contracts, and preflight validators; `local-effects-runtime.ts` — the opt-in `@ideaspaces/protocol/local-effects` reference implementation for atomic Markdown writes and exact-path commits; `stale-docs.ts` — drift signals
- `workspace.ts` — neutral root handles and immediate-child workspace repository reads
- `skills.ts` + `skill-catalog.generated.ts` — the canonical skill catalog (generated from `../skills/` by `scripts/embed-skills.mjs`)

`npm run build` (embed-skills + `tsc`), `npm test` (vitest). Repository-shape consumers import this package directly; `@ideaspaces/sdk` is a separate Keeper transport package and does not re-export the protocol.
