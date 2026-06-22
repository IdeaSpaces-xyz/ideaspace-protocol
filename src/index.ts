// @ideaspaces/sdk

// Stable type contract; useful for both local and future remote primitives.
export * from "./types.js";

// Local primitives — filesystem-backed building blocks for the agent's
// session-start orientation, Note authoring, and `_agent/` contract handling.
export { findNearestAgent, findSpaceRoot, readContract, CONTRACT_FILES } from "./space.js";
export type {
  SpaceRoot,
  SpaceContract,
  ContractEntry,
  ContractFile,
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

