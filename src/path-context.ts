import { promises as fs } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  CONTRACT_FILES,
  readContract,
  type ContractFile,
  type SpaceContract,
} from "./space.js";
import { stripFrontmatter, extractSummary } from "./frontmatter.js";

/**
 * `walkPathContext` — the single root → cwd walk.
 *
 * One walk yields an ordered `levels[]`. The two "roots" callers used to juggle
 * separately are just projections of it:
 *   - space root    = the level carrying `foundation` (`spaceRootLevel`)
 *   - current branch = the last level with an `_agent/` (`currentBranchLevel`)
 *
 * Progressive disclosure is structural: summaries (README + contract files) are
 * loaded eagerly so the agent can decide whether to dig; full README/contract
 * content is attached only when `includeContent` is set. That keeps the
 * session-start block cheap while leaving a content path for explicit
 * re-orientation.
 *
 * Local filesystem only — no git, no network.
 */

export interface PathLevel {
  /** Path relative to `repoRoot`, always forward-slash separated; `""` at root. */
  path: string;
  /** Absolute path to this level's directory. */
  absPath: string;
  /** Whether this level has an `_agent/` directory. */
  hasAgent: boolean;
  /** Whether this level carries `_agent/foundation.md` — the space-root marker. */
  foundation: boolean;
  /** Which contract files exist at this level's `_agent/` (subset of the five). */
  agentFiles: ContractFile[];
  /** Frontmatter summary per present contract file — always loaded. */
  contractSummaries: Partial<Record<ContractFile, string>>;
  /** README.md summary (frontmatter, else first content line) — always loaded. */
  readmeSummary: string | null;
  /** Full README.md content — only when `includeContent` is true. */
  readmeContent: string | null;
  /** Full five-file contract content — only when `includeContent` is true. */
  contract: SpaceContract | null;
}

export interface PathContext {
  /** The `currentPath`, relative to `repoRoot` (`""` at root). */
  position: string;
  /** Ordered root → currentPath. */
  levels: PathLevel[];
}

export interface WalkPathContextOpts {
  /** Attach full README + contract content to each level. Default: false. */
  includeContent?: boolean;
}

/** The space root — the level carrying `foundation`. Null if none on the path. */
export function spaceRootLevel(ctx: PathContext): PathLevel | null {
  return ctx.levels.find((l) => l.foundation) ?? null;
}

/** The current branch — the nearest `_agent/` level. Null if none on the path. */
export function currentBranchLevel(ctx: PathContext): PathLevel | null {
  for (let i = ctx.levels.length - 1; i >= 0; i--) {
    if (ctx.levels[i].hasAgent) return ctx.levels[i];
  }
  return null;
}

export async function walkPathContext(
  repoRoot: string,
  currentPath: string,
  opts: WalkPathContextOpts = {},
): Promise<PathContext> {
  const { includeContent = false } = opts;
  const root = resolve(repoRoot);

  // Relative path root → currentPath. Anything outside the repo collapses to
  // the root level only — the walk never escapes `repoRoot`.
  const rel = relative(root, resolve(root, currentPath));
  const segments =
    rel === "" || rel.startsWith("..") || isAbsolute(rel)
      ? []
      : rel.split(sep).filter(Boolean);

  // Accumulate the ordered directory list: root, root/seg1, root/seg1/seg2, …
  // relPath stays forward-slash separated (segments came from splitting on the
  // platform `sep`); `join(root, relPath)` re-platforms it for filesystem reads.
  const relPaths: string[] = [""];
  let acc = "";
  for (const segment of segments) {
    acc = acc ? `${acc}/${segment}` : segment;
    relPaths.push(acc);
  }

  const levels = await Promise.all(
    relPaths.map((relPath) => readLevel(root, relPath, includeContent)),
  );

  const position = segments.join("/");
  return { position, levels };
}

async function readLevel(
  root: string,
  relPath: string,
  includeContent: boolean,
): Promise<PathLevel> {
  const absPath = relPath ? join(root, relPath) : root;
  const agentDir = join(absPath, "_agent");

  const [hasAgent, readme] = await Promise.all([
    isDirectory(agentDir),
    readFileOrNull(join(absPath, "README.md")),
  ]);

  let contract: SpaceContract = {};
  if (hasAgent) contract = await readContract(agentDir);

  const agentFiles = CONTRACT_FILES.filter((f) => contract[f]);
  const contractSummaries: Partial<Record<ContractFile, string>> = {};
  for (const f of agentFiles) {
    const summary = describe(contract[f]!.content);
    if (summary) contractSummaries[f] = summary;
  }

  return {
    path: relPath,
    absPath,
    hasAgent,
    foundation: Boolean(contract.foundation),
    agentFiles,
    contractSummaries,
    readmeSummary: readme ? describe(readme) : null,
    readmeContent: includeContent ? readme : null,
    contract: includeContent && hasAgent ? contract : null,
  };
}

/** Frontmatter summary, falling back to the first non-heading body line. */
function describe(content: string): string | null {
  const summary = extractSummary(content);
  if (summary) return summary;
  for (const raw of stripFrontmatter(content).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    return line.replace(/^>+\s*/, "").trim() || null;
  }
  return null;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, "utf-8");
  } catch {
    return null;
  }
}
