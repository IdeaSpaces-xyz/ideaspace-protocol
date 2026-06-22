# src/

The reference TypeScript implementation of the shape — what TS surfaces embed instead of re-implementing. Graduated wholesale from `@ideaspaces/sdk` (which was 100% shape logic).

Present:

- `frontmatter.ts` — parse / compose / extract (Layer 1: `name`, `summary`, `attached_to`, `tags`)
- `space.ts` — `_agent/` contract reader (`CONTRACT_FILES`, `findSpaceRoot`, `readContract`)
- `awareness.ts` — awareness assembly (`assembleAwareness`); `path-context.ts` — path walking
- `git.ts` — git state / recent activity; `stale-docs.ts` — drift signals
- `skills.ts` + `skill-catalog.generated.ts` — the canonical skill catalog (generated from `../skills/` by `scripts/embed-skills.mjs`)
- `types.ts` — the shape type contract

`npm run build` (embed-skills + `tsc`), `npm test` (vitest — 97 tests). Next: `@ideaspaces/sdk` becomes a thin re-export of this package (step 3b), then the platform layer grows on top.
