import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type {
  ComposedContract,
  ContractFile,
  ContractLevel,
  ComposedSpace,
  SpaceContract,
} from "./space.js";
import { composeContractAlongPath } from "./space.js";
import { stripFrontmatter, extractDescription, parseFrontmatter } from "./frontmatter.js";
import { summarizeMarkdown } from "./markdown-inspection.js";
import { classifyRepositoryPath } from "./repository-path.js";
import {
  gitState,
  recentActivity,
  resolveRepoRoot,
  type ChangedFile,
  type GitState,
} from "./git.js";
import {
  renderPosition,
  walkPathContext,
  type PathContext,
} from "./path-context.js";
import {
  collectDocDependencies,
  staleDocSignals,
  type DriftSignal,
} from "./stale-docs.js";
import { readSeenRef } from "./surface-state.js";
import { DEFAULT_IGNORED_DIRECTORIES } from "./filesystem.js";
import { parseRootNodeId } from "./root-identity.js";
import {
  composeAgreementAlongPath,
  type AgreementIssue,
  type ComposedAgreement,
  type ContentRepresentation,
  type ContractSource,
  type PromptPlacement,
} from "./agreement.js";

export interface AssembleAwarenessOpts {
  /** Absolute path to the position whose tree and local skills are surfaced. */
  root: string;
  /** Parsed effective five-file contract. */
  contract: SpaceContract | ComposedContract;
  /** Optional commit SHA from a previous session — surfaces a "since last session" diff. */
  lastSha?: string;
  /** Cap on changes listed before truncation. Default: 15. */
  maxChanges?: number;
  /** Cap on the Now first-line excerpt. Default: 200 characters. */
  nowExcerptLength?: number;
  /** Cap on per-summary length when surfacing contract / skill summaries. Default: 200 characters. */
  summaryExcerptLength?: number;
}

export type ContentTreeDepth = number | "full";

export interface AssembleContentTreeOpts {
  /** Absolute or cwd-relative local directory to map. No `_agent/` contract is required. */
  position: string;
  /** Bounded probes clamp to [1, 4]; `full` walks every content directory explicitly. */
  depth?: ContentTreeDepth;
  /** Per-directory cap. Defaults to 50 for bounded probes and no cap for `full`. */
  maxEntries?: number;
  /** Cap on each summary-rung excerpt. Default: 200 characters. */
  summaryExcerptLength?: number;
}

export interface AssembleContentAwarenessOpts {
  /** Absolute or cwd-relative directory at which awareness is focused. */
  position: string;
  /** Explicit authority frame. Required by the protocol when both entrypoints resolve. */
  contractSource?: ContractSource;
  /**
   * Previous-session baseline. `undefined` reads `refs/ideaspaces/seen` when
   * inside git; `null` deliberately disables the activity section.
   */
  lastSha?: string | null;
  /** Cap on changes retained in the bounded manifest. Default: 15. */
  maxChanges?: number;
  /** Cap on the Now first-line excerpt. Default: 200 characters. */
  nowExcerptLength?: number;
  /** Cap on per-summary length for contract and skill entries. Default: 200 characters. */
  summaryExcerptLength?: number;
  /**
   * Probe depth for the tree section — how many levels to pull, soft-capped to
   * [1, 4]. Default 1: the ambient orientation depth every harness renders at
   * session start. Deeper is a deliberate map-probe a caller passes on demand
   * (a CLI flag, a navigate tool parameter); levels below 1 render as a thin
   * name-rung outline, never summaries. Probe depth pulls more map, not more
   * content — content loads via read, not here.
   */
  treeDepth?: number;
  /**
   * Soft display cap per directory. Default 50. Truncation is always honest:
   * the true totals and an omitted count are carried in the manifest and
   * rendered — never a silent cut.
   */
  treeMaxEntries?: number;
}

export interface AssembleContentFocusOpts {
  /** Absolute or cwd-relative target directory to read as reference context. */
  position: string;
  /** Explicit target frame. Required when both entrypoints resolve. */
  contractSource?: ContractSource;
  /** Cap on per-summary length for target contract and skill entries. Default: 200 characters. */
  summaryExcerptLength?: number;
  /** Soft display cap for the target's depth-one Content tree. Default: 50. */
  treeMaxEntries?: number;
}

export const CONTENT_AWARENESS_SECTIONS = [
  "position",
  "now",
  "tree",
  "contract",
  "skills",
  "activity",
  "git",
  "stale-docs",
  "direction-drift",
] as const;

export type ContentAwarenessSection =
  (typeof CONTENT_AWARENESS_SECTIONS)[number];

export interface RenderContentAwarenessOpts {
  /** Canonical sections to include. Output order is fixed regardless of input order. */
  sections?: readonly ContentAwarenessSection[];
  /** Cap on stale-doc signals rendered before truncation. Default: 10. */
  maxDrift?: number;
}

export interface ContentAwarenessPosition {
  placement: PromptPlacement;
  /** Absolute focused directory. */
  path: string;
  /** Root against which the displayed cwd is relative. */
  base: string;
  /** Canonical git root, or null for a non-git ideaspace. */
  repoRoot: string | null;
  /** Structured root-to-position path context. */
  context: PathContext;
}

export interface ContentAwarenessNow {
  text: string;
  /** Absolute source file path. */
  source: string;
  representation: "summary";
  placement: PromptPlacement;
  revision: string;
}

export interface ContentAwarenessTreeEntry {
  name: string;
  placement: PromptPlacement;
  kind: "directory" | "markdown";
  /** Recursive markdown count for directories; absent for markdown files. */
  markdownFiles?: number;
  /**
   * Summary-rung handle text — at level 1 for bounded probes, and at every
   * visited level for an explicit full-depth tree. A directory uses its README
   * summary; a file uses frontmatter summary / first content line. Absent from
   * bounded levels below 1 (name-rung outline) and from the legacy block.
   */
  summary?: string | null;
  /** Probe outline below this directory; name-rung only below level 1 unless full-depth. */
  children?: ContentAwarenessTreeEntry[];
  /** Children over the per-directory cap, when truncated. Always rendered. */
  omittedChildren?: number;
}

export interface ContentAwarenessTree {
  placement: PromptPlacement;
  totalMarkdownFiles: number;
  entries: ContentAwarenessTreeEntry[];
  /** Top-level entries over the per-directory cap, when truncated. */
  omittedEntries?: number;
}

export interface ContentAwarenessContractEntry {
  name: string;
  /** Absolute source file path. */
  path: string;
  /** Absolute `_agent/` parent position when composed along a fractal path. */
  sourcePosition?: string;
  /** @deprecated Composition-path alias retained for Foundation compatibility. */
  level?: string;
  summary: string | null;
  representation: ContentRepresentation;
  /** Exact file bytes when representation is full. */
  content?: string;
  revision: string;
  placement: PromptPlacement;
}

export interface ContentAwarenessSkill {
  name: string;
  /** Absolute source file path. */
  path: string;
  /**
   * Absolute `_agent/` parent position the skill resolved from, when composed
   * along a fractal path. A deeper same-named skill shadows its ancestor's.
   */
  level?: string;
  sourcePosition?: string;
  summary: string | null;
  representation: "summary";
  revision: string | null;
  placement: PromptPlacement;
}

export interface ContentAwarenessActivity {
  placement: "tail";
  totalChanges: number;
  changes: ChangedFile[];
  omittedChanges: number;
}

/**
 * Portable local Content adapter for awareness.
 *
 * This is deliberately not the graph-wide vantage/focus manifest: it contains
 * only facts derivable from a cloned markdown/git space. Harnesses decide where
 * rendered sections are placed and own session state, mounts, and remote tiers.
 */
export interface ContentAwarenessManifest {
  status: "ok";
  kind: "content";
  /** Selected authority frame; null is floor orientation without agent terms. */
  contractSource: ContractSource | null;
  /** Space root selected by the active frame, or the orientation base at floor. */
  spaceRoot: string;
  position: ContentAwarenessPosition;
  now: ContentAwarenessNow | null;
  tree: ContentAwarenessTree | null;
  contract: ContentAwarenessContractEntry[];
  skills: ContentAwarenessSkill[];
  activity: ContentAwarenessActivity | null;
  git: (GitState & { placement: "tail" }) | null;
  staleDocs: Array<DriftSignal & { placement: "tail" }>;
  missingDirection: Array<"purpose" | "now">;
}

export type ContentAwarenessDiagnosticStatus =
  | "contract_choice_required"
  | "contract_source_unavailable"
  | "contract_invalid";

export interface ContentAwarenessDiagnostic {
  status: ContentAwarenessDiagnosticStatus;
  kind: "content";
  availableSources: ContractSource[];
  requestedSource?: ContractSource;
  issues?: AgreementIssue[];
}

export type ContentAwarenessResult = ContentAwarenessManifest | ContentAwarenessDiagnostic;

export type ContentFocusPosition = Omit<ContentAwarenessPosition, "placement"> & {
  placement: "history";
};

export interface ContentFocusTreeEntry
  extends Omit<ContentAwarenessTreeEntry, "placement" | "children"> {
  placement: "history";
  children?: ContentFocusTreeEntry[];
}

export interface ContentFocusTree
  extends Omit<ContentAwarenessTree, "placement" | "entries"> {
  placement: "history";
  entries: ContentFocusTreeEntry[];
}

export type ContentFocusContractEntry = Omit<ContentAwarenessContractEntry, "placement"> & {
  placement: "history";
};

export type ContentFocusSkill = Omit<ContentAwarenessSkill, "placement"> & {
  placement: "history";
};

/**
 * One bounded read of another Content position.
 *
 * `contractRole` is fixed: target agent context is evidence about that target,
 * never an addition to the caller's composed authority frame.
 */
export interface ContentFocusManifest {
  status: "ok";
  kind: "content-focus";
  contractRole: "reference";
  contractSource: ContractSource | null;
  spaceRoot: string;
  position: ContentFocusPosition;
  tree: ContentFocusTree | null;
  contract: ContentFocusContractEntry[];
  skills: ContentFocusSkill[];
}

export interface ContentFocusDiagnostic
  extends Omit<ContentAwarenessDiagnostic, "kind"> {
  kind: "content-focus";
}

export type ContentFocusResult = ContentFocusManifest | ContentFocusDiagnostic;

interface AwarenessSections {
  now: ContentAwarenessNow | null;
  tree: ContentAwarenessTree | null;
  contract: ContentAwarenessContractEntry[];
  skills: ContentAwarenessSkill[];
  activity: ContentAwarenessActivity | null;
}

interface SelectedContentFrame {
  position: string;
  repoRoot: string | null;
  foundation: ComposedSpace;
  agreement: ComposedAgreement;
  contractSource: ContractSource | null;
  spaceRoot: string;
  base: string;
}

const SKIP_DIRS: ReadonlySet<string> = new Set(DEFAULT_IGNORED_DIRECTORIES);

function isContentDirectoryName(name: string): boolean {
  if (SKIP_DIRS.has(name)) return false;
  const classification = classifyRepositoryPath(name, "directory");
  return classification.status === "ok" && classification.role === "ordinary";
}

const CONTRACT_ORDER = ["foundation", "guide", "purpose", "now", "next"] as const;
const LEGACY_AWARENESS_SECTIONS: readonly ContentAwarenessSection[] = [
  "now",
  "tree",
  "contract",
  "skills",
  "activity",
];
const DEFAULT_MAX_DRIFT = 10;

/**
 * Assemble only the local content tree for one directory.
 *
 * This is the contract-free tree seam shared by ambient awareness and explicit
 * derived-Map consumers. Numeric depth retains the portable [1, 4] probe cap;
 * `full` is an explicit local diagnostic walk, not ambient orientation. Full
 * walks default to no per-directory cap and still return handles only — never
 * embedded member bodies.
 */
export async function assembleContentTree(
  opts: AssembleContentTreeOpts,
): Promise<ContentAwarenessTree | null> {
  const requestedPosition = resolve(opts.position);
  const position = await fs.realpath(requestedPosition).catch(() => requestedPosition);
  const depth = normalizeContentTreeDepth(opts.depth);
  return buildTree(position, {
    depth,
    maxEntries: opts.maxEntries ?? (depth === "full" ? Infinity : 50),
    summaries: true,
    summaryLength: opts.summaryExcerptLength ?? 200,
    strict: true,
  });
}

/**
 * Assemble structured local Content awareness at one position.
 *
 * Foundation and Agreement are selectable authority frames. The protocol never
 * chooses between them: one available source selects automatically, while two
 * without an explicit choice return `contract_choice_required`. Ordinary
 * folders with neither source still orient at the bounded floor. `null` is
 * reserved for paths that are not Content positions (`_agent/`, extensions,
 * and reserved Git state).
 */
export async function assembleContentAwareness(
  opts: AssembleContentAwarenessOpts,
): Promise<ContentAwarenessResult | null> {
  const selected = await selectContentFrame(opts.position, opts.contractSource);
  if (!selected || "status" in selected) return selected;
  const {
    position,
    repoRoot,
    foundation,
    agreement,
    contractSource,
    spaceRoot,
    base,
  } = selected;
  const lastShaPromise: Promise<string | undefined> =
    opts.lastSha === undefined
      ? repoRoot
        ? readSeenRef(repoRoot)
        : Promise.resolve(undefined)
      : Promise.resolve(opts.lastSha ?? undefined);

  const pathContextPromise = walkPathContext(base, position).then((context) =>
    filterPathContextForSource(context, contractSource),
  );
  const gitPromise: Promise<(GitState & { placement: "tail" }) | null> = repoRoot
    ? gitState(repoRoot).then((state) => ({ ...state, placement: "tail" }))
    : Promise.resolve(null);
  const staleDocsPromise: Promise<Array<DriftSignal & { placement: "tail" }>> = repoRoot
    ? collectDocDependencies(repoRoot, repoRoot)
        .then((docs) => staleDocSignals(repoRoot, docs))
        .then((signals) => signals.map((signal) => ({ ...signal, placement: "tail" })))
    : Promise.resolve([]);

  const tree: BuildTreeOpts = {
    depth: normalizeContentTreeDepth(opts.treeDepth) as number,
    maxEntries: opts.treeMaxEntries ?? 50,
    summaries: true,
    summaryLength: opts.summaryExcerptLength ?? 200,
    strict: false,
  };
  const sectionsPromise = lastShaPromise.then((lastSha) => {
    const common = {
      root: position,
      activityRoot: base,
      lastSha,
      maxChanges: opts.maxChanges,
      nowExcerptLength: opts.nowExcerptLength,
      summaryExcerptLength: opts.summaryExcerptLength,
      tree,
    };
    if (contractSource === "foundation") {
      return readAwarenessSections({
        ...common,
        contract: foundation.contract,
        stack: foundation.stack,
      });
    }
    if (contractSource === "agreement") {
      return readAgreementAwarenessSections({ ...common, agreement });
    }
    return readFloorAwarenessSections(common);
  });

  const [context, git, staleDocs, sections] = await Promise.all([
    pathContextPromise,
    gitPromise,
    staleDocsPromise,
    sectionsPromise,
  ]);

  const missingDirection: Array<"purpose" | "now"> = [];
  if (contractSource === "foundation") {
    if (!foundation.contract.purpose) missingDirection.push("purpose");
    if (!foundation.contract.now) missingDirection.push("now");
  }

  return {
    status: "ok",
    kind: "content",
    contractSource,
    spaceRoot,
    position: { placement: "head", path: position, base, repoRoot, context },
    ...sections,
    git,
    staleDocs,
    missingDirection,
  };
}

/**
 * Read one target as bounded reference context without accepting, returning,
 * or mutating a caller contract stack.
 *
 * Selection and validation match ambient Content awareness, but the result is
 * deliberately smaller: target position, depth-one tree, agent context, and
 * skills. Every returned awareness item belongs in prompt history. A selected
 * Agreement still loads in full; it is read as reference, never composed.
 */
export async function assembleContentFocus(
  opts: AssembleContentFocusOpts,
): Promise<ContentFocusResult | null> {
  const selected = await selectContentFrame(opts.position, opts.contractSource);
  if (!selected) return null;
  if ("status" in selected) return { ...selected, kind: "content-focus" };
  const {
    position,
    repoRoot,
    foundation,
    agreement,
    contractSource,
    spaceRoot,
    base,
  } = selected;
  const summaryExcerptLength = opts.summaryExcerptLength ?? 200;
  const common: ReadAwarenessCommonOpts = {
    root: position,
    activityRoot: base,
    summaryExcerptLength,
    tree: {
      depth: 1,
      maxEntries: opts.treeMaxEntries ?? 50,
      summaries: true,
      summaryLength: summaryExcerptLength,
      strict: false,
    },
  };
  const [context, sections] = await Promise.all([
    walkPathContext(base, position).then((value) =>
      filterPathContextForSource(value, contractSource),
    ),
    contractSource === "foundation"
      ? readAwarenessSections({
          ...common,
          contract: foundation.contract,
          stack: foundation.stack,
        })
      : contractSource === "agreement"
        ? readAgreementAwarenessSections({ ...common, agreement })
        : readFloorAwarenessSections(common),
  ]);

  return {
    status: "ok",
    kind: "content-focus",
    contractRole: "reference",
    contractSource,
    spaceRoot,
    position: {
      placement: "history",
      path: position,
      base,
      repoRoot,
      context,
    },
    tree: sections.tree ? toFocusTree(sections.tree) : null,
    contract: sections.contract.map((entry) => ({ ...entry, placement: "history" })),
    skills: sections.skills.map((skill) => ({ ...skill, placement: "history" })),
  };
}

/** Render a successful manifest or one actionable selection diagnostic. */
export function renderContentAwareness(
  result: ContentAwarenessResult,
  opts: RenderContentAwarenessOpts = {},
): string {
  if (result.status !== "ok") return renderContentAwarenessDiagnostic(result);
  return renderAwarenessSections(
    { ...result, levelBase: result.spaceRoot, spaceRoot: result.spaceRoot },
    opts,
  );
}

/** Render the canonical bounded reference block shared by focus consumers. */
export function renderContentFocus(result: ContentFocusResult): string {
  if (result.status !== "ok") return renderContentAwarenessDiagnostic(result);
  const target = relative(result.position.base, result.position.path) || ".";
  const spaceRoot = relative(result.position.base, result.spaceRoot) || ".";
  const lines = ["Focus:"];
  if (result.position.repoRoot) lines.push(`  repo: ${result.position.repoRoot}`);
  lines.push(
    `  target: ${target}`,
    `  space root: ${spaceRoot}`,
    `  contract source: ${result.contractSource ?? "floor"}`,
    "  contract role: reference — read, never composed",
  );
  const body = renderAwarenessSections(
    {
      now: null,
      tree: result.tree,
      contract: result.contract,
      skills: result.skills,
      activity: null,
      position: undefined,
      git: null,
      staleDocs: [],
      missingDirection: [],
      levelBase: result.spaceRoot,
      spaceRoot: result.spaceRoot,
    },
    { sections: ["tree", "contract", "skills"] },
  );
  return body ? `${lines.join("\n")}\n\n${body}` : lines.join("\n");
}

function renderContentAwarenessDiagnostic(
  result: ContentAwarenessDiagnostic | ContentFocusDiagnostic,
): string {
  if (result.status === "contract_choice_required") {
    return "Contract choice required: select `foundation` or `agreement`.";
  }
  if (result.status === "contract_source_unavailable") {
    return `Contract source unavailable: ${result.requestedSource}.`;
  }
  const lines = ["Agreement contract is invalid:"];
  for (const issue of result.issues ?? []) {
    lines.push(`  ${issue.code}: ${issue.path} — ${issue.detail}`);
  }
  return lines.join("\n");
}

async function selectContentFrame(
  requested: string,
  requestedSource?: ContractSource,
): Promise<SelectedContentFrame | ContentAwarenessDiagnostic | null> {
  const requestedPosition = resolve(requested);
  const position = await fs.realpath(requestedPosition).catch(() => requestedPosition);
  const repoRoot = await resolveRepoRoot(position);
  if (repoRoot) {
    const repositoryPath = relative(repoRoot, position).split(sep).join("/");
    if (repositoryPath) {
      const classification = classifyRepositoryPath(repositoryPath, "directory");
      if (classification.status !== "ok" || classification.role !== "ordinary") return null;
    }
  } else if (hasOpaqueFilesystemAncestor(position)) {
    return null;
  }

  const [foundation, agreement] = await Promise.all([
    composeContractAlongPath(position),
    composeAgreementAlongPath(position, repoRoot),
  ]);
  const availableSources: ContractSource[] = [];
  if (foundation.spaceRoot) availableSources.push("foundation");
  if (agreement.agreements.length) availableSources.push("agreement");

  let contractSource: ContractSource | null = requestedSource ?? null;
  if (contractSource && !availableSources.includes(contractSource)) {
    return {
      status: "contract_source_unavailable",
      kind: "content",
      availableSources,
      requestedSource: contractSource,
    };
  }
  const identityConflict = contractIdentityConflict(foundation, agreement);
  if (identityConflict) {
    return {
      status: "contract_invalid",
      kind: "content",
      availableSources,
      ...(contractSource ? { requestedSource: contractSource } : {}),
      issues: [identityConflict],
    };
  }
  if (!contractSource && availableSources.length > 1) {
    return { status: "contract_choice_required", kind: "content", availableSources };
  }
  contractSource ??= availableSources[0] ?? null;

  if (contractSource === "agreement" && agreement.issues.length) {
    return {
      status: "contract_invalid",
      kind: "content",
      availableSources,
      ...(requestedSource ? { requestedSource } : {}),
      issues: agreement.issues,
    };
  }

  const spaceRoot = contractSource === "foundation"
    ? foundation.spaceRoot!
    : contractSource === "agreement"
      ? agreement.spaceRoot!
      : repoRoot ?? position;
  if (!repoRoot && contractSource) {
    const spacePath = relative(spaceRoot, position).split(sep).join("/");
    if (spacePath) {
      const classification = classifyRepositoryPath(spacePath, "directory");
      if (classification.status !== "ok" || classification.role !== "ordinary") return null;
    }
  }

  return {
    position,
    repoRoot,
    foundation,
    agreement,
    contractSource,
    spaceRoot,
    base: repoRoot ?? spaceRoot,
  };
}

function toFocusTree(tree: ContentAwarenessTree): ContentFocusTree {
  return {
    ...tree,
    placement: "history",
    entries: tree.entries.map(toFocusTreeEntry),
  };
}

function toFocusTreeEntry(entry: ContentAwarenessTreeEntry): ContentFocusTreeEntry {
  const { children, ...rest } = entry;
  return {
    ...rest,
    placement: "history",
    ...(children ? { children: children.map(toFocusTreeEntry) } : {}),
  };
}

function contractIdentityConflict(
  foundation: ComposedSpace,
  agreement: ComposedAgreement,
): AgreementIssue | null {
  if (
    !foundation.spaceRoot ||
    !agreement.spaceRoot ||
    foundation.spaceRoot !== agreement.spaceRoot ||
    !agreement.rootNodeId
  ) {
    return null;
  }
  const foundationContent = foundation.contract.foundation?.content;
  if (!foundationContent) return null;
  const value = parseFrontmatter(foundationContent)?.root_node_id;
  const parsed = parseRootNodeId(value);
  if (parsed.status !== "valid" || parsed.rootNodeId === agreement.rootNodeId) return null;
  return {
    path: join(foundation.spaceRoot, "_agent"),
    code: "root_node_id_conflict",
    detail: "foundation.md and agreement.md declare different root_node_id values",
  };
}

function filterPathContextForSource(
  context: PathContext,
  source: ContractSource | null,
): PathContext {
  if (source === "foundation") return context;
  return {
    ...context,
    levels: context.levels.map((level) => ({
      ...level,
      foundation: false,
      agentFiles: [],
      contractSummaries: {},
      contract: null,
    })),
  };
}

function hasOpaqueFilesystemAncestor(path: string): boolean {
  let current = resolve(path);
  while (true) {
    const name = basename(current);
    if (name.startsWith("_")) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * Compatibility wrapper for the original awareness block.
 *
 * Shape and defaults are unchanged: Now, tree, contract summaries, skills, and
 * optional since-last-session activity. New consumers should assemble a
 * structured {@link ContentAwarenessManifest} instead.
 */
export async function assembleAwareness(
  opts: AssembleAwarenessOpts,
): Promise<string> {
  const sections = await readAwarenessSections({
    tree: LEGACY_TREE_OPTS,
    ...opts,
    activityRoot: opts.root,
  });
  return renderAwarenessSections(
    {
      ...sections,
      position: undefined,
      git: null,
      staleDocs: [],
      missingDirection: [],
    },
    { sections: LEGACY_AWARENESS_SECTIONS },
  );
}

interface ReadAwarenessCommonOpts {
  root: string;
  activityRoot: string;
  lastSha?: string;
  maxChanges?: number;
  nowExcerptLength?: number;
  summaryExcerptLength?: number;
  tree?: BuildTreeOpts;
}

async function readAwarenessSections(
  opts: AssembleAwarenessOpts & ReadAwarenessCommonOpts & {
    stack?: ContractLevel[];
  },
): Promise<AwarenessSections> {
  const {
    root,
    activityRoot,
    contract,
    stack,
    lastSha,
    maxChanges = 15,
    nowExcerptLength = 200,
    summaryExcerptLength = 200,
  } = opts;
  const treeOpts: BuildTreeOpts = opts.tree ?? {
    depth: 1,
    maxEntries: 50,
    summaries: true,
    summaryLength: summaryExcerptLength,
    strict: false,
  };

  const now = extractNow(contract, nowExcerptLength);
  const contractEntries = stack?.length
    ? buildStackedContractEntries(stack, summaryExcerptLength)
    : buildContractEntries(contract, summaryExcerptLength);
  const [tree, skills, activity] = await Promise.all([
    buildTree(root, treeOpts),
    readSkills(stack?.length ? stack.map((level) => level.dir) : [root], summaryExcerptLength),
    lastSha
      ? readActivity(activityRoot, lastSha, maxChanges)
      : Promise.resolve(null),
  ]);

  return {
    now,
    tree,
    contract: contractEntries,
    skills,
    activity,
  };
}

async function readAgreementAwarenessSections(
  opts: ReadAwarenessCommonOpts & { agreement: ComposedAgreement },
): Promise<AwarenessSections> {
  const {
    root,
    activityRoot,
    agreement,
    lastSha,
    maxChanges = 15,
    summaryExcerptLength = 200,
  } = opts;
  const treeOpts = opts.tree ?? {
    depth: 1,
    maxEntries: 50,
    summaries: true,
    summaryLength: summaryExcerptLength,
    strict: false,
  };
  const contract = agreement.stack.flatMap((level) =>
    level.files.map((file): ContentAwarenessContractEntry => ({
      name: file.name,
      path: file.path,
      sourcePosition: file.sourcePosition,
      level: file.sourcePosition,
      summary: describeFile(file.content, summaryExcerptLength),
      representation: file.representation,
      ...(file.representation === "full" ? { content: file.content } : {}),
      revision: contentRevision(file.content),
      placement: "head",
    })),
  );
  const [tree, skills, activity] = await Promise.all([
    buildTree(root, treeOpts),
    readSkills(agreement.stack.map((level) => level.dir), summaryExcerptLength),
    lastSha
      ? readActivity(activityRoot, lastSha, maxChanges)
      : Promise.resolve(null),
  ]);
  return { now: null, tree, contract, skills, activity };
}

async function readFloorAwarenessSections(
  opts: ReadAwarenessCommonOpts,
): Promise<AwarenessSections> {
  const {
    root,
    activityRoot,
    lastSha,
    maxChanges = 15,
    summaryExcerptLength = 200,
  } = opts;
  const treeOpts = opts.tree ?? {
    depth: 1,
    maxEntries: 50,
    summaries: true,
    summaryLength: summaryExcerptLength,
    strict: false,
  };
  const [tree, activity] = await Promise.all([
    buildTree(root, treeOpts),
    lastSha
      ? readActivity(activityRoot, lastSha, maxChanges)
      : Promise.resolve(null),
  ]);
  return { now: null, tree, contract: [], skills: [], activity };
}

function renderAwarenessSections(
  data: AwarenessSections & {
    position?: ContentAwarenessPosition;
    git: GitState | null;
    staleDocs: DriftSignal[];
    missingDirection: Array<"purpose" | "now">;
    /** Base for rendering branch-level annotations; absent for the legacy single-level block. */
    levelBase?: string;
    /** Selected space root; overrides foundation-derived position rendering. */
    spaceRoot?: string;
  },
  opts: RenderContentAwarenessOpts,
): string {
  const included = new Set(opts.sections ?? CONTENT_AWARENESS_SECTIONS);
  const sections: string[] = [];

  for (const section of CONTENT_AWARENESS_SECTIONS) {
    if (!included.has(section)) continue;
    let rendered: string | null = null;
    switch (section) {
      case "position":
        rendered = data.position
          ? renderPosition({
              pos: data.position.path,
              base: data.position.base,
              repoRoot: data.position.repoRoot,
              ctx: data.position.context,
              spaceRoot: data.spaceRoot,
            })
          : null;
        break;
      case "now":
        rendered = data.now ? `Now: ${data.now.text}` : null;
        break;
      case "tree":
        rendered = data.tree ? renderTree(data.tree) : null;
        break;
      case "contract":
        rendered = renderContract(data.contract, data.levelBase);
        break;
      case "skills":
        rendered = renderSkills(data.skills, data.levelBase);
        break;
      case "activity":
        rendered = data.activity ? renderActivity(data.activity) : null;
        break;
      case "git":
        rendered = data.git ? renderGitState(data.git) : null;
        break;
      case "stale-docs":
        rendered = renderStaleDocs(data.staleDocs, opts.maxDrift ?? DEFAULT_MAX_DRIFT);
        break;
      case "direction-drift":
        rendered = renderDirectionDrift(data.missingDirection);
        break;
    }
    if (rendered) sections.push(rendered);
  }

  return sections.join("\n\n");
}

function buildContractEntries(
  contract: SpaceContract | ComposedContract,
  max: number,
): ContentAwarenessContractEntry[] {
  const entries: ContentAwarenessContractEntry[] = [];
  for (const name of CONTRACT_ORDER) {
    const entry = contract[name];
    if (!entry) continue;
    entries.push({
      name,
      path: entry.path,
      ...(hasLevel(entry) ? { level: entry.level, sourcePosition: entry.level } : {}),
      summary: describeFile(entry.content, max),
      representation: "summary",
      revision: contentRevision(entry.content),
      placement: "head",
    });
  }
  return entries;
}

function hasLevel(
  entry: { path: string; content: string } | { path: string; content: string; level: string },
): entry is { path: string; content: string; level: string } {
  return "level" in entry;
}

/**
 * Contract entries along the full root → position stack: for each contract
 * file, every level carrying it appears, root-first, deepest (effective) last.
 * Deeper levels narrow ancestor context; nothing is dropped from view.
 */
function buildStackedContractEntries(
  stack: ContractLevel[],
  max: number,
): ContentAwarenessContractEntry[] {
  const entries: ContentAwarenessContractEntry[] = [];
  for (const name of CONTRACT_ORDER) {
    for (const level of stack) {
      const entry = level.contract[name];
      if (!entry) continue;
      entries.push({
        name,
        path: entry.path,
        level: level.dir,
        sourcePosition: level.dir,
        summary: describeFile(entry.content, max),
        representation: "summary",
        revision: contentRevision(entry.content),
        placement: "head",
      });
    }
  }
  return entries;
}

/** One discovered `_agent/skills/` entry — either form — content unread. */
export interface SkillEntry {
  /** Skill name: flat-file basename or directory name. */
  name: string;
  /** Absolute path to the skill's entry point (`<name>.md` or `<name>/SKILL.md`). */
  path: string;
  /** Absolute directory carrying the `_agent/` this skill resolved from. */
  level: string;
}

/**
 * Discover `_agent/skills/` entries across contract levels (root-first): flat
 * `<name>.md` files and Agent Skills-style `<name>/SKILL.md` directories. At
 * one level the directory form wins over a same-named flat file; across
 * levels a deeper same-named skill shadows its ancestor's. `README.md` is the
 * folder's surface, never an entry; a directory without `SKILL.md` is a plain
 * asset folder. Content is not read — callers decide what to load.
 */
export async function discoverSkillEntries(levels: string[]): Promise<SkillEntry[]> {
  const byName = new Map<string, SkillEntry>();
  for (const dir of levels) {
    const skillsDir = join(dir, "_agent", "skills");
    let dirents: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
    try {
      dirents = await fs.readdir(skillsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    const flat = dirents
      .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md")
      .map((e) => e.name)
      .sort();
    for (const file of flat) {
      const name = file.replace(/\.md$/, "");
      byName.set(name, { name, path: join(skillsDir, file), level: dir });
    }
    const skillDirs = dirents
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of skillDirs) {
      const path = join(skillsDir, name, "SKILL.md");
      try {
        if ((await fs.stat(path)).isFile()) {
          byName.set(name, { name, path, level: dir });
        }
      } catch {
        // no regular SKILL.md — plain asset folder, not a skill
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Skills composed along the root → position stack, with summaries: the
 * discovered entries ({@link discoverSkillEntries}) read and described —
 * `description` (the trigger) first, `summary`, then first body line. An
 * entry whose file cannot be read surfaces name-only rather than vanishing.
 */
async function readSkills(
  levels: string[],
  max: number,
): Promise<ContentAwarenessSkill[]> {
  const entries = await discoverSkillEntries(levels);
  return Promise.all(
    entries.map(async ({ name, path, level }) => {
      try {
        const content = await fs.readFile(path, "utf-8");
        return {
          name,
          path,
          level,
          sourcePosition: level,
          summary: describeSkill(content, max),
          representation: "summary" as const,
          revision: contentRevision(content),
          placement: "head" as const,
        };
      } catch {
        return {
          name,
          path,
          level,
          sourcePosition: level,
          summary: null,
          representation: "summary" as const,
          revision: null,
          placement: "head" as const,
        };
      }
    }),
  );
}

async function readActivity(
  repoRoot: string,
  lastSha: string,
  maxChanges: number,
): Promise<ContentAwarenessActivity | null> {
  const { changedFiles } = await recentActivity(repoRoot, lastSha);
  if (!changedFiles.length) return null;
  const changes = changedFiles.slice(0, maxChanges);
  return {
    placement: "tail",
    totalChanges: changedFiles.length,
    changes,
    omittedChanges: changedFiles.length - changes.length,
  };
}

function describeFile(content: string, max: number): string | null {
  const summary = summarizeMarkdown(content);
  return summary ? truncate(summary, max) : null;
}

/**
 * A skill's `description` is its trigger condition — the convention `_agent/`
 * skills carry — so it wins over `summary`; body first-line stays the last
 * resort via {@link describeFile}.
 */
function describeSkill(content: string, max: number): string | null {
  const description = extractDescription(content);
  if (description) return truncate(description, max);
  return describeFile(content, max);
}

function extractNow(
  contract: SpaceContract | ComposedContract,
  max: number,
): ContentAwarenessNow | null {
  const entry = contract.now;
  if (!entry) return null;
  const body = stripFrontmatter(entry.content);
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith(">")) {
      const stripped = line.replace(/^>+\s*/, "").trim();
      if (stripped) {
        return {
          text: truncate(stripped, max),
          source: entry.path,
          representation: "summary",
          placement: "head",
          revision: contentRevision(entry.content),
        };
      }
      continue;
    }
    return {
      text: truncate(line, max),
      source: entry.path,
      representation: "summary",
      placement: "head",
      revision: contentRevision(entry.content),
    };
  }
  return null;
}

function truncate(value: string, max: number): string {
  return value.length <= max
    ? value
    : `${value.slice(0, max).trimEnd()}…`;
}

function contentRevision(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf-8").digest("hex")}`;
}

interface BuildTreeOpts {
  /** Levels to pull; 1 is the position's own children. `full` walks to leaves. */
  depth: ContentTreeDepth;
  /** Per-directory display cap; `Infinity` disables (legacy block). */
  maxEntries: number;
  /** Summary-rung handles at level 1. Off for the legacy block and below level 1. */
  summaries: boolean;
  /** Cap on summary excerpt length. */
  summaryLength: number;
  /** Fail on an unreadable directory instead of treating it as absent. */
  strict: boolean;
}

function normalizeContentTreeDepth(depth: ContentTreeDepth | undefined): ContentTreeDepth {
  if (depth === "full") return "full";
  return Math.min(4, Math.max(1, Math.trunc(depth ?? 1)));
}

const LEGACY_TREE_OPTS: BuildTreeOpts = {
  depth: 1,
  maxEntries: Infinity,
  summaries: false,
  summaryLength: 200,
  strict: false,
};

/** Summary-rung text for one child: a directory's README summary, a file's own. */
async function childSummary(
  path: string,
  isDir: boolean,
  max: number,
): Promise<string | null> {
  try {
    const source = isDir ? join(path, "README.md") : path;
    return describeFile(await fs.readFile(source, "utf-8"), max);
  } catch {
    return null;
  }
}

async function buildTree(
  root: string,
  opts: BuildTreeOpts,
): Promise<ContentAwarenessTree | null> {
  const listed = await listTreeLevel(root, opts, opts.depth, true);
  if (!listed) return null;
  const totalMarkdownFiles = await countMarkdown(root, opts.strict);
  return {
    placement: "head",
    totalMarkdownFiles,
    entries: listed.entries,
    ...(listed.omitted ? { omittedEntries: listed.omitted } : {}),
  };
}

/**
 * One directory level of the map, at handle depth. Level `opts.depth` (the
 * position's own children) may carry summary-rung handles; every level below
 * a bounded probe is a name-rung outline. Explicit `full` carries summary-rung
 * handles at every level while walking to leaves — more map, never embedded content.
 */
async function listTreeLevel(
  dir: string,
  opts: BuildTreeOpts,
  levelsLeft: ContentTreeDepth,
  topLevel: boolean,
): Promise<{ entries: ContentAwarenessTreeEntry[]; omitted: number } | null> {
  let raw: Array<{ name: string; isDir: boolean }>;
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    raw = dirents
      .filter((entry) => !entry.name.startsWith(".") || entry.name === ".gitignore")
      .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }));
  } catch (error) {
    if (opts.strict) {
      throw new Error(
        `Cannot read Content tree directory ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }

  const dirs = raw
    .filter((entry) => entry.isDir && isContentDirectoryName(entry.name))
    .map((entry) => entry.name)
    .sort();
  const files = raw
    .filter((entry) => !entry.isDir && entry.name.endsWith(".md"))
    // Below level 1 the parent's line already carries its README summary —
    // listing README again in the probe outline is noise (Keeper parity).
    .filter((entry) => topLevel || entry.name !== "README.md")
    .map((entry) => entry.name)
    .sort();
  if (!dirs.length && !files.length) return null;

  const all = [
    ...dirs.map((name) => ({ name, isDir: true })),
    ...files.map((name) => ({ name, isDir: false })),
  ];
  const shown = Number.isFinite(opts.maxEntries) ? all.slice(0, opts.maxEntries) : all;
  const omitted = all.length - shown.length;
  const withSummaries = opts.summaries && (topLevel || opts.depth === "full");

  const entries = await Promise.all(
    shown.map(async ({ name, isDir }): Promise<ContentAwarenessTreeEntry> => {
      const path = join(dir, name);
      const entry: ContentAwarenessTreeEntry = isDir
        ? { name, placement: "head", kind: "directory", markdownFiles: await countMarkdown(path, opts.strict) }
        : { name, placement: "head", kind: "markdown" };
      if (withSummaries) {
        const summary = await childSummary(path, isDir, opts.summaryLength);
        if (summary) entry.summary = summary;
      }
      const shouldDescend = levelsLeft === "full" || levelsLeft > 1;
      if (isDir && shouldDescend) {
        const nextDepth = levelsLeft === "full" ? "full" : levelsLeft - 1;
        const deeper = await listTreeLevel(path, opts, nextDepth, false);
        if (deeper) {
          entry.children = deeper.entries;
          if (deeper.omitted) entry.omittedChildren = deeper.omitted;
        }
      }
      return entry;
    }),
  );

  return { entries, omitted };
}

async function countMarkdown(dir: string, strict = false): Promise<number> {
  let count = 0;
  let dirents: Array<{
    name: string;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (strict) {
      throw new Error(
        `Cannot count Content tree directory ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return 0;
  }
  for (const entry of dirents) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (!isContentDirectoryName(entry.name)) continue;
      count += await countMarkdown(join(dir, entry.name), strict);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

function renderTree(tree: ContentAwarenessTree): string {
  const lines = [`Tree (${tree.totalMarkdownFiles} files):`];
  renderTreeEntries(tree.entries, 1, lines);
  if (tree.omittedEntries) lines.push(`  … and ${tree.omittedEntries} more`);
  return lines.join("\n");
}

function renderTreeEntries(
  entries: ContentAwarenessTreeEntry[],
  level: number,
  lines: string[],
): void {
  const indent = "  ".repeat(level);
  for (const entry of entries) {
    const base =
      entry.kind === "directory"
        ? entry.markdownFiles
          ? `${indent}${entry.name}/ (${entry.markdownFiles})`
          : `${indent}${entry.name}/`
        : `${indent}${entry.name}`;
    lines.push(entry.summary ? `${base} — ${entry.summary}` : base);
    if (entry.children) {
      renderTreeEntries(entry.children, level + 1, lines);
      if (entry.omittedChildren) {
        lines.push(`${"  ".repeat(level + 1)}… and ${entry.omittedChildren} more`);
      }
    }
  }
}

/** `guide (branch/)` for entries below the space root; bare name at the root or without a base. */
function levelAnnotation(level: string | undefined, base: string | undefined): string {
  if (!level || !base || level === base) return "";
  const rel = relative(base, level);
  return rel && !rel.startsWith("..") ? ` (${rel}/)` : "";
}

function renderContract(
  entries: ContentAwarenessContractEntry[],
  levelBase?: string,
): string | null {
  if (!entries.length) return null;
  const lines = ["Agent context:"];
  for (const entry of entries) {
    const name = `${entry.name}${levelAnnotation(entry.level, levelBase)}`;
    if (entry.representation === "full" && entry.content !== undefined) {
      lines.push(`  ${name} [full]:`);
      for (const line of entry.content.trimEnd().split("\n")) lines.push(`    ${line}`);
    } else {
      lines.push(entry.summary ? `  ${name} — ${entry.summary}` : `  ${name}`);
    }
  }
  return lines.join("\n");
}

function renderSkills(
  skills: ContentAwarenessSkill[],
  levelBase?: string,
): string | null {
  if (!skills.length) return null;
  const lines = ["Operating skills:"];
  for (const skill of skills) {
    const name = `${skill.name}${levelAnnotation(skill.level, levelBase)}`;
    lines.push(skill.summary ? `  ${name} — ${skill.summary}` : `  ${name}`);
  }
  return lines.join("\n");
}

function renderActivity(activity: ContentAwarenessActivity): string {
  const lines = [`Since last session (${activity.totalChanges} changes):`];
  for (const change of activity.changes) {
    lines.push(`  ${change.status}\t${change.path}`);
  }
  if (activity.omittedChanges) {
    lines.push(`  ... and ${activity.omittedChanges} more`);
  }
  return lines.join("\n");
}

function renderGitState(state: GitState): string | null {
  const bits: string[] = [];
  if (state.branch) bits.push(`branch ${state.branch}`);
  if (
    state.ahead != null &&
    state.behind != null &&
    (state.ahead || state.behind)
  ) {
    bits.push(`↑${state.ahead} ↓${state.behind}`);
  }
  if (state.dirty) bits.push("dirty");
  if (state.untrackedInTrackedDirs.length) {
    bits.push(`${state.untrackedInTrackedDirs.length} untracked`);
  }
  return bits.length ? `Git: ${bits.join(", ")}` : null;
}

function renderStaleDocs(signals: DriftSignal[], max: number): string | null {
  if (!signals.length) return null;
  const lines = ["⚠ Possible stale docs — verify before quoting their status:"];
  for (const signal of signals.slice(0, max)) {
    lines.push(
      signal.kind === "stale"
        ? `  ${signal.doc} — \`${signal.newestCode}\` was committed after the doc`
        : `  ${signal.doc} — references missing path(s): ${signal.missing.join(", ")}`,
    );
  }
  if (signals.length > max) {
    lines.push(`  … and ${signals.length - max} more`);
  }
  return lines.join("\n");
}

function renderDirectionDrift(
  missing: Array<"purpose" | "now">,
): string | null {
  const lines: string[] = [];
  if (missing.includes("purpose")) {
    lines.push(
      "⚠ `_agent/purpose.md` not yet captured. The contract names it; suggest capturing at a natural moment.",
    );
  }
  if (missing.includes("now")) {
    lines.push(
      "⚠ `_agent/now.md` not yet captured. Suggest capturing what's currently active.",
    );
  }
  return lines.length ? lines.join("\n") : null;
}
