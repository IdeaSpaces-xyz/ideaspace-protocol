# src/

The reference TypeScript implementation of the shape — what TS surfaces embed instead of re-implementing. Graduated wholesale from `@ideaspaces/sdk` (which was 100% shape logic).

Present:

- `frontmatter.ts` — parse / compose / extract (Layer 1: `name`, `summary`, `attached_to`, `tags`)
- `markdown-inspection.ts` — portable progressive-disclosure reads (`summary`, ATX `outline`, exact `section`) over a string or local file
- `space.ts` — `_agent/` contract reader (`CONTRACT_FILES`, `findSpaceRoot`, `readContract`)
- `awareness.ts` — structured Content awareness assembly/rendering (`assembleContentAwareness`, `renderContentAwareness`) plus the compatibility `assembleAwareness` block; `path-context.ts` — path walking
- `git.ts` — git state / recent activity plus the injected, read-only `pathRevision` fact; `local-effects.ts` — pure request/result types and preflight validators for the language-neutral local-effect contract; `stale-docs.ts` — drift signals
- `workspace.ts` — neutral root handles and immediate-child workspace repository reads
- `skills.ts` + `skill-catalog.generated.ts` — the canonical skill catalog (generated from `../skills/` by `scripts/embed-skills.mjs`)

`npm run build` (embed-skills + `tsc`), `npm test` (vitest). Repository-shape consumers import this package directly; `@ideaspaces/sdk` is a separate Keeper transport package and does not re-export the protocol.
