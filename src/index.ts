// @ideaspaces/protocol — reference implementation of the ideaspace shape

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
  ContractLevel,
} from "./space.js";

export {
  assembleAwareness,
  assembleContentAwareness,
  renderContentAwareness,
  discoverSkillEntries,
  CONTENT_AWARENESS_SECTIONS,
} from "./awareness.js";
export type {
  SkillEntry,
  AssembleAwarenessOpts,
  AssembleContentAwarenessOpts,
  RenderContentAwarenessOpts,
  ContentAwarenessSection,
  ContentAwarenessPosition,
  ContentAwarenessNow,
  ContentAwarenessTreeEntry,
  ContentAwarenessTree,
  ContentAwarenessContractEntry,
  ContentAwarenessSkill,
  ContentAwarenessActivity,
  ContentAwarenessManifest,
} from "./awareness.js";

// Awareness data primitives — local git/fs state for session-start orientation
// and capture safety. The plugin (and other surfaces) format these into the
// session block; these return data, not rendered text.
export {
  gitState,
  recentActivity,
  lastCommitTime,
  resolveRepoRoot,
  pathStatus,
  pathRevision,
  isIdeaspacePath,
  stagedIdeaspacePaths,
} from "./git.js";
export type {
  GitState,
  RecentActivity,
  CommitInfo,
  ChangedFile,
  PathStatus,
} from "./git.js";

// Local-effect contract — pure request/result types and preflight validators.
// The package root remains mutation-free: the only executable addition here is
// the read-only `pathRevision` fact above. Effect implementations opt into a
// dedicated subpath in the next layer.
export {
  validateLocalEffectPath,
  validateWriteMarkdownRequest,
  validateCommitPathsRequest,
} from "./local-effects.js";
export type {
  LocalEffectOperation,
  LocalEffectReadOperation,
  PathObjectId,
  PathRevision,
  WriteRevisionPrecondition,
  LocalEffectValue,
  FrontmatterUpdate,
  WriteMarkdownRequest,
  CommitPathInput,
  LocalEffectTrailers,
  LocalEffectIdentity,
  CommitPathsRequest,
  LocalEffectPhase,
  LocalEffectFailureCode,
  SelectedPathRevision,
  WriteMarkdownOk,
  CommitPathsOk,
  LocalEffectPartial,
  LocalEffectError,
  WriteMarkdownResult,
  CommitPathsResult,
  LocalEffectResult,
  PathRevisionReadOk,
  PathRevisionReadError,
  PathRevisionReadResult,
  LocalGitResult,
  LocalGitRunner,
  LocalEffectValidationIssue,
  LocalEffectValidationResult,
} from "./local-effects.js";

export {
  readRootHandle,
  readWorkspaceRepositories,
} from "./workspace.js";
export type {
  RootHandle,
  WorkspaceRepository,
  WorkspaceReadOptions,
} from "./workspace.js";

export {
  walkPathContext,
  spaceRootLevel,
  currentBranchLevel,
  renderPosition,
} from "./path-context.js";
export type {
  PathContext,
  PathLevel,
  WalkPathContextOpts,
  RenderPositionOpts,
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

// Foundation core — the canonical conduct seed scaffolds compose into a new
// space's `_agent/foundation.md`. Default content, not a conformance
// requirement; the markdown asset ships at templates/foundation-core.md for
// non-TS runtimes.
export { FOUNDATION_CORE, FOUNDATION_CORE_VERSION } from "./foundation-core.js";

export {
  stripFrontmatter,
  composeFrontmatter,
  extractSummary,
  extractDescription,
  parseFrontmatter,
  inspectFrontmatterSyntax,
} from "./frontmatter.js";
export type { Frontmatter, FrontmatterSyntax } from "./frontmatter.js";

// Progressive-disclosure Markdown inspection — summary, ATX outline, or one
// exact section. Pure string inspection plus a local read-only file wrapper.
export {
  inspectMarkdown,
  inspectMarkdownFile,
  summarizeMarkdown,
} from "./markdown-inspection.js";
export type {
  MarkdownInspectionMode,
  MarkdownHeading,
  MarkdownInspectionRequest,
  MarkdownSummaryInspection,
  MarkdownOutlineInspection,
  MarkdownSectionQuery,
  MarkdownSectionInspection,
  MarkdownInspection,
} from "./markdown-inspection.js";

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

export {
  projectCacheKey,
  sessionIdCachePath,
  changeCachePath,
  parsePersistedChange,
  readPersistedChange,
  armingDecision,
  readSeenRef,
  SEEN_REF,
} from "./surface-state.js";
export type { PersistedChange, ArmingDecision } from "./surface-state.js";

