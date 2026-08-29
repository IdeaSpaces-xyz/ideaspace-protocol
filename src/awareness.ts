import { promises as fs } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type {
  ComposedContract,
  ContractFile,
  ContractLevel,
  SpaceContract,
} from "./space.js";
import { composeContractAlongPath } from "./space.js";
import { stripFrontmatter, extractDescription } from "./frontmatter.js";
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
  /**
   * Summary-rung handle text at level 1 — a directory's README summary or a
   * file's frontmatter summary / first content line. Absent below level 1
   * (deeper levels are name-rung outline) and in the legacy block.
   */
  summary?: string | null;
  /** Probe outline below this directory when `treeDepth > 1`. Name-rung only. */
  children?: ContentAwarenessTreeEntry[];
  /** Children over the per-directory cap, when truncated. Always rendered. */
  omittedChildren?: number;
}

export interface ContentAwarenessTree {
  totalMarkdownFiles: number;
  entries: ContentAwarenessTreeEntry[];
  /** Top-level entries over the per-directory cap, when truncated. */
  omittedEntries?: number;
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
  /**
   * Absolute `_agent/` parent position the skill resolved from, when composed
   * along a fractal path. A deeper same-named skill shadows its ancestor's.
   */
  level?: string;
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
  // Resolve the repository boundary before composing contracts. Starting both
  // reads in parallel would let composition inspect `_agent/` payload inside an
  // extension before the focus is rejected, violating extension opacity.
  const repoRoot = await resolveRepoRoot(position);
  if (repoRoot) {
    const repositoryPath = relative(repoRoot, position).split(sep).join("/");
    if (repositoryPath) {
      const classification = classifyRepositoryPath(repositoryPath, "directory");
      if (classification.status !== "ok" || classification.role !== "ordinary") return null;
    }
  }

  const composed = await composeContractAlongPath(position);
  if (!composed.spaceRoot) return null;
  if (!repoRoot) {
    const spacePath = relative(composed.spaceRoot, position).split(sep).join("/");
    if (spacePath) {
      const classification = classifyRepositoryPath(spacePath, "directory");
      if (classification.status !== "ok" || classification.role !== "ordinary") return null;
    }
  }

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
  // Probe depth is soft-capped, never rejected: a wild value clamps to the
  // ladder's bounds the way Keeper's navigate does.
  const treeDepth = Math.min(4, Math.max(1, Math.trunc(opts.treeDepth ?? 1)));
  const treeMaxEntries = opts.treeMaxEntries ?? 50;
  const sectionsPromise = lastShaPromise.then((lastSha) =>
    readAwarenessSections({
      root: position,
      activityRoot: base,
      contract: composed.contract,
      stack: composed.stack,
      lastSha,
      maxChanges: opts.maxChanges,
      nowExcerptLength: opts.nowExcerptLength,
      summaryExcerptLength: opts.summaryExcerptLength,
      tree: {
        depth: treeDepth,
        maxEntries: treeMaxEntries,
        summaries: true,
        summaryLength: opts.summaryExcerptLength ?? 200,
      },
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
  return renderAwarenessSections({ ...manifest, levelBase: manifest.spaceRoot }, opts);
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

async function readAwarenessSections(
  opts: AssembleAwarenessOpts & {
    activityRoot: string;
    stack?: ContractLevel[];
    tree?: BuildTreeOpts;
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

function renderAwarenessSections(
  data: AwarenessSections & {
    position?: ContentAwarenessPosition;
    git: GitState | null;
    staleDocs: DriftSignal[];
    missingDirection: Array<"purpose" | "now">;
    /** Base for rendering branch-level annotations; absent for the legacy single-level block. */
    levelBase?: string;
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
        summary: describeFile(entry.content, max),
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
        return { name, path, level, summary: describeSkill(content, max) };
      } catch {
        return { name, path, level, summary: null };
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

interface BuildTreeOpts {
  /** Levels to pull; 1 is the position's own children. Caller pre-clamps. */
  depth: number;
  /** Per-directory display cap; `Infinity` disables (legacy block). */
  maxEntries: number;
  /** Summary-rung handles at level 1. Off for the legacy block and below level 1. */
  summaries: boolean;
  /** Cap on summary excerpt length. */
  summaryLength: number;
}

const LEGACY_TREE_OPTS: BuildTreeOpts = {
  depth: 1,
  maxEntries: Infinity,
  summaries: false,
  summaryLength: 200,
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
  const listed = await listTreeLevel(root, opts, opts.depth);
  if (!listed) return null;
  const totalMarkdownFiles = await countMarkdown(root);
  return {
    totalMarkdownFiles,
    entries: listed.entries,
    ...(listed.omitted ? { omittedEntries: listed.omitted } : {}),
  };
}

/**
 * One directory level of the map, at handle depth. Level `opts.depth` (the
 * position's own children) may carry summary-rung handles; every level below
 * is a name-rung probe outline — more map, never content.
 */
async function listTreeLevel(
  dir: string,
  opts: BuildTreeOpts,
  levelsLeft: number,
): Promise<{ entries: ContentAwarenessTreeEntry[]; omitted: number } | null> {
  let raw: Array<{ name: string; isDir: boolean }>;
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    raw = dirents
      .filter((entry) => !entry.name.startsWith(".") || entry.name === ".gitignore")
      .map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }));
  } catch {
    return null;
  }

  const dirs = raw
    .filter((entry) => entry.isDir && isContentDirectoryName(entry.name))
    .map((entry) => entry.name)
    .sort();
  const atTop = levelsLeft === opts.depth;
  const files = raw
    .filter((entry) => !entry.isDir && entry.name.endsWith(".md"))
    // Below level 1 the parent's line already carries its README summary —
    // listing README again in the probe outline is noise (Keeper parity).
    .filter((entry) => atTop || entry.name !== "README.md")
    .map((entry) => entry.name)
    .sort();
  if (!dirs.length && !files.length) return null;

  const all = [
    ...dirs.map((name) => ({ name, isDir: true })),
    ...files.map((name) => ({ name, isDir: false })),
  ];
  const shown = Number.isFinite(opts.maxEntries) ? all.slice(0, opts.maxEntries) : all;
  const omitted = all.length - shown.length;
  const withSummaries = opts.summaries && atTop;

  const entries = await Promise.all(
    shown.map(async ({ name, isDir }): Promise<ContentAwarenessTreeEntry> => {
      const path = join(dir, name);
      const entry: ContentAwarenessTreeEntry = isDir
        ? { name, kind: "directory", markdownFiles: await countMarkdown(path) }
        : { name, kind: "markdown" };
      if (withSummaries) {
        const summary = await childSummary(path, isDir, opts.summaryLength);
        if (summary) entry.summary = summary;
      }
      if (isDir && levelsLeft > 1) {
        const deeper = await listTreeLevel(path, opts, levelsLeft - 1);
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
      if (!isContentDirectoryName(entry.name)) continue;
      count += await countMarkdown(join(dir, entry.name));
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
    lines.push(entry.summary ? `  ${name} — ${entry.summary}` : `  ${name}`);
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
