// @ideaspaces/protocol — reference implementation of the ideaspace shape

// Stable type contract; useful for both local and future remote primitives.
export * from "./types.js";

// Local primitives — filesystem-backed building blocks for the agent's
// session-start orientation, Note authoring, and `_agent/` contract handling.
export {
  findNearestAgent,
  findSpaceRoot,
  readContract,
  composeContractAlongPath,
  CONTRACT_FILES,
} from "./space.js";
export type {
  SpaceRoot,
  SpaceContract,
  ContractEntry,
  ContractFile,
  ComposedSpace,
  ComposedContract,
  ComposedContractEntry,
} from "./space.js";

export { assembleAwareness } from "./awareness.js";
export type { AssembleAwarenessOpts } from "./awareness.js";

// Awareness data primitives — local git/fs state for session-start orientation
// and capture safety. The plugin (and other surfaces) format these into the
// session block; these return data, not rendered text.
export { gitState, recentActivity, lastCommitTime } from "./git.js";
export type {
  GitState,
  RecentActivity,
  CommitInfo,
  ChangedFile,
} from "./git.js";

export {
  walkPathContext,
  spaceRootLevel,
  currentBranchLevel,
} from "./path-context.js";
export type {
  PathContext,
  PathLevel,
  WalkPathContextOpts,
} from "./path-context.js";

export { collectDocDependencies, staleDocSignals } from "./stale-docs.js";
export type {
  DocDependency,
  DriftSignal,
  StaleSignal,
  BrokenRefSignal,
} from "./stale-docs.js";

// Skill catalog — the distribution-canonical reference content (8 universal
// skills), consumed by the plugin build and the MCP server's resource serving.
export { listSkills, readSkill } from "./skills.js";
export type { SkillInfo, Skill } from "./skills.js";

export {
  stripFrontmatter,
  composeFrontmatter,
  extractSummary,
  extractDescription,
  inspectFrontmatterSyntax,
} from "./frontmatter.js";
export type { Frontmatter, FrontmatterSyntax } from "./frontmatter.js";

// Conformance — check whether a directory is a conformant ideaspace. Read-only;
// validates the shape against SPEC.md + the runtime-loaded frontmatter schema.
export { validateSpace } from "./conformance.js";
export type { ConformanceReport, ConformanceIssue } from "./conformance.js";

// Change-layer commit trailers — the checkable form of schema/trailers.md.
// Pure string in/out; never invokes git. Surfaces stamp; this builds/parses/mints.
export {
  isValidChangeId,
  slugify,
  formatChangeId,
  mintChangeId,
  changeIdGrep,
  parseTrailers,
  buildTrailers,
  appendTrailers,
  CHANGE_ID_PATTERN,
} from "./trailers.js";
export type { Op, Trailers } from "./trailers.js";

