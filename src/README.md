# src/

The reference TypeScript implementation of the shape — what TS surfaces embed instead of re-implementing.

Planned (step 3): the pure-shape modules currently in `@ideaspaces/sdk` —

- frontmatter parse / compose / extract (Layer 1 + the `attached_to`/`tags` fields)
- `_agent/` contract reader (`CONTRACT_FILES`, `findSpaceRoot`, `readContract`)
- awareness assembly (`assembleAwareness`) and path walking
- git state / recent-activity / stale-doc drift

`@ideaspaces/sdk` is already almost entirely this logic; step 3 graduates it here. `sdk` then becomes the platform layer (sync/auth/api) depending on `@ideaspaces/protocol`.
