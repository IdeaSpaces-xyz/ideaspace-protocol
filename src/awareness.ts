import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import type {
  ComposedContract,
  ContractFile,
  SpaceContract,
} from "./space.js";
import { composeContractAlongPath } from "./space.js";
import { stripFrontmatter, extractSummary } from "./frontmatter.js";
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

export interface AssembleContentAwarenessOpts {
  /** Absolute or cwd-relative directory at which awareness is focused. */
  position: string;
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
}

export interface ContentAwarenessTreeEntry {
  name: string;
  kind: "directory" | "markdown";
  /** Recursive markdown count for directories; absent for markdown files. */
  markdownFiles?: number;
}

export interface ContentAwarenessTree {
  totalMarkdownFiles: number;
  entries: ContentAwarenessTreeEntry[];
}

export interface ContentAwarenessContractEntry {
  name: ContractFile;
  /** Absolute source file path. */
  path: string;
  /** Absolute `_agent/` parent position when composed along a fractal path. */
  level?: string;
  summary: string | null;
}

export interface ContentAwarenessSkill {
  name: string;
  /** Absolute source file path. */
  path: string;
  summary: string | null;
}

export interface ContentAwarenessActivity {
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
  kind: "content";
  /** Space root selected by the nearest foundation boundary. */
  spaceRoot: string;
  position: ContentAwarenessPosition;
  now: ContentAwarenessNow | null;
  tree: ContentAwarenessTree | null;
  contract: ContentAwarenessContractEntry[];
  skills: ContentAwarenessSkill[];
  activity: ContentAwarenessActivity | null;
  git: GitState | null;
  staleDocs: DriftSignal[];
  missingDirection: Array<"purpose" | "now">;
}

interface AwarenessSections {
  now: ContentAwarenessNow | null;
  tree: ContentAwarenessTree | null;
  contract: ContentAwarenessContractEntry[];
  skills: ContentAwarenessSkill[];
  activity: ContentAwarenessActivity | null;
}

const SKIP_DIRS = new Set([
  "_agent",
  "node_modules",
  ".git",
  ".github",
  ".vscode",
  ".idea",
  "dist",
  "build",
]);

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
 * Assemble the structured local Content awareness at one position.
 *
 * Returns `null` when no foundation-marked ideaspace resolves. All reads are
 * local filesystem/git reads; the function never mutates the space or contacts
 * a remote.
 */
export async function assembleContentAwareness(
  opts: AssembleContentAwarenessOpts,
): Promise<ContentAwarenessManifest | null> {
  const requestedPosition = resolve(opts.position);
  // Git canonicalizes symlinked ancestors (macOS `/var` → `/private/var`) when
  // reporting its toplevel. Canonicalize the focus too so the relative cwd
  // cannot escape into a synthetic `../../…` path.
  const position = await fs.realpath(requestedPosition).catch(() => requestedPosition);
  const [repoRoot, composed] = await Promise.all([
    resolveRepoRoot(position),
    composeContractAlongPath(position),
  ]);
  if (!composed.spaceRoot) return null;

  const base = repoRoot ?? composed.spaceRoot;
  const lastShaPromise: Promise<string | undefined> =
    opts.lastSha === undefined
      ? repoRoot
        ? readSeenRef(repoRoot)
        : Promise.resolve(undefined)
      : Promise.resolve(opts.lastSha ?? undefined);

  const pathContextPromise = walkPathContext(base, position);
  const gitPromise: Promise<GitState | null> = repoRoot
    ? gitState(repoRoot)
    : Promise.resolve(null);
  const staleDocsPromise: Promise<DriftSignal[]> = repoRoot
    ? collectDocDependencies(repoRoot, repoRoot).then((docs) =>
        staleDocSignals(repoRoot, docs),
      )
    : Promise.resolve([]);
  const sectionsPromise = lastShaPromise.then((lastSha) =>
    readAwarenessSections({
      root: position,
      activityRoot: repoRoot ?? position,
      contract: composed.contract,
      lastSha,
      maxChanges: opts.maxChanges,
      nowExcerptLength: opts.nowExcerptLength,
      summaryExcerptLength: opts.summaryExcerptLength,
    }),
  );

  const [context, git, staleDocs, sections] = await Promise.all([
    pathContextPromise,
    gitPromise,
    staleDocsPromise,
    sectionsPromise,
  ]);

  const missingDirection: Array<"purpose" | "now"> = [];
  if (!composed.contract.purpose) missingDirection.push("purpose");
  if (!composed.contract.now) missingDirection.push("now");

  return {
    kind: "content",
    spaceRoot: composed.spaceRoot,
    position: { path: position, base, repoRoot, context },
    ...sections,
    git,
    staleDocs,
    missingDirection,
  };
}

/**
 * Render a structured Content manifest in canonical section order.
 *
 * Callers may select sections for harness-specific placement; selection never
 * changes wording or order. An omitted/empty section renders nothing.
 */
export function renderContentAwareness(
  manifest: ContentAwarenessManifest,
  opts: RenderContentAwarenessOpts = {},
): string {
  return renderAwarenessSections(manifest, opts);
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

async function readAwarenessSections(
  opts: AssembleAwarenessOpts & { activityRoot: string },
): Promise<AwarenessSections> {
  const {
    root,
    activityRoot,
    contract,
    lastSha,
    maxChanges = 15,
    nowExcerptLength = 200,
    summaryExcerptLength = 200,
  } = opts;

  const now = extractNow(contract, nowExcerptLength);
  const contractEntries = buildContractEntries(contract, summaryExcerptLength);
  const [tree, skills, activity] = await Promise.all([
    buildTree(root),
    readSkills(root, summaryExcerptLength),
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

function renderAwarenessSections(
  data: AwarenessSections & {
    position?: ContentAwarenessPosition;
    git: GitState | null;
    staleDocs: DriftSignal[];
    missingDirection: Array<"purpose" | "now">;
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
        rendered = renderContract(data.contract);
        break;
      case "skills":
        rendered = renderSkills(data.skills);
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
      ...(hasLevel(entry) ? { level: entry.level } : {}),
      summary: describeFile(entry.content, max),
    });
  }
  return entries;
}

function hasLevel(
  entry: { path: string; content: string } | { path: string; content: string; level: string },
): entry is { path: string; content: string; level: string } {
  return "level" in entry;
}

async function readSkills(
  root: string,
  max: number,
): Promise<ContentAwarenessSkill[]> {
  const skillsDir = join(root, "_agent", "skills");
  let entries: string[];
  try {
    entries = (await fs.readdir(skillsDir))
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }

  return Promise.all(
    entries.map(async (file) => {
      const path = join(skillsDir, file);
      try {
        const content = await fs.readFile(path, "utf-8");
        return {
          name: file.replace(/\.md$/, ""),
          path,
          summary: describeFile(content, max),
        };
      } catch {
        return {
          name: file.replace(/\.md$/, ""),
          path,
          summary: null,
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
    totalChanges: changedFiles.length,
    changes,
    omittedChanges: changedFiles.length - changes.length,
  };
}

function describeFile(content: string, max: number): string | null {
  const summary = extractSummary(content);
  if (summary) return truncate(summary, max);
  const body = stripFrontmatter(content);
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    return truncate(line, max);
  }
  return null;
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
      if (stripped) return { text: truncate(stripped, max), source: entry.path };
      continue;
    }
    return { text: truncate(line, max), source: entry.path };
  }
  return null;
}

function truncate(value: string, max: number): string {
  return value.length <= max
    ? value
    : `${value.slice(0, max).trimEnd()}…`;
}

async function buildTree(root: string): Promise<ContentAwarenessTree | null> {
  let entries: Array<{ name: string; isDir: boolean }>;
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    entries = dirents
      .filter((entry) => !entry.name.startsWith(".") || entry.name === ".gitignore")
      .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }));
  } catch {
    return null;
  }

  const dirs = entries
    .filter((entry) => entry.isDir && !SKIP_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const files = entries
    .filter((entry) => !entry.isDir && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  if (!dirs.length && !files.length) return null;

  const [totalMarkdownFiles, dirCounts] = await Promise.all([
    countMarkdown(root),
    Promise.all(dirs.map((dir) => countMarkdown(join(root, dir)))),
  ]);

  return {
    totalMarkdownFiles,
    entries: [
      ...dirs.map((name, index) => ({
        name,
        kind: "directory" as const,
        markdownFiles: dirCounts[index],
      })),
      ...files.map((name) => ({ name, kind: "markdown" as const })),
    ],
  };
}

async function countMarkdown(dir: string): Promise<number> {
  let count = 0;
  let dirents: Array<{
    name: string;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of dirents) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      count += await countMarkdown(join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

function renderTree(tree: ContentAwarenessTree): string {
  const lines = [`Tree (${tree.totalMarkdownFiles} files):`];
  for (const entry of tree.entries) {
    if (entry.kind === "directory") {
      lines.push(
        entry.markdownFiles
          ? `  ${entry.name}/ (${entry.markdownFiles})`
          : `  ${entry.name}/`,
      );
    } else {
      lines.push(`  ${entry.name}`);
    }
  }
  return lines.join("\n");
}

function renderContract(entries: ContentAwarenessContractEntry[]): string | null {
  if (!entries.length) return null;
  const lines = ["Agent context:"];
  for (const entry of entries) {
    lines.push(
      entry.summary
        ? `  ${entry.name} — ${entry.summary}`
        : `  ${entry.name}`,
    );
  }
  return lines.join("\n");
}

function renderSkills(skills: ContentAwarenessSkill[]): string | null {
  if (!skills.length) return null;
  const lines = ["Operating skills:"];
  for (const skill of skills) {
    lines.push(
      skill.summary
        ? `  ${skill.name} — ${skill.summary}`
        : `  ${skill.name}`,
    );
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
