import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { extractSummary, stripFrontmatter } from "./frontmatter.js";
import {
  gitState,
  resolveRepoRoot,
  type GitState,
} from "./git.js";

/** Directories that are implementation noise rather than workspace handles. */
const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "backups",
  ".pi",
  ".claude",
]);

/** A neutral, shallow description of one local root. */
export interface RootHandle {
  /** Absolute path supplied to the reader, normalized without changing symlink identity. */
  root: string;
  /** `_agent/now.md` summary, falling back to README content. */
  summary: string | null;
  /** Immediate non-noise directory count, or null when the root is unreadable. */
  directoryCount: number | null;
}

/** One immediate-child git repository in a local workspace. */
export interface WorkspaceRepository extends RootHandle {
  /** Raw local git facts; callers decide how to label or render them. */
  git: GitState;
}

/**
 * Read a shallow root handle without assigning it a harness role.
 *
 * Summary preference is `_agent/now.md`, then `README.md`. Layer-1 frontmatter
 * summary wins; imperfect files fall back to their first meaningful body line.
 * Missing or unreadable content degrades to null fields rather than throwing.
 */
export async function readRootHandle(root: string): Promise<RootHandle> {
  const absoluteRoot = resolve(root);
  const [summary, directoryCount] = await Promise.all([
    readRootSummary(absoluteRoot),
    countImmediateDirectories(absoluteRoot),
  ]);
  return { root: absoluteRoot, summary, directoryCount };
}

/**
 * Read git repositories that are immediate children of a workspace directory.
 *
 * A directory qualifies only when its resolved git toplevel is the directory
 * itself. This includes ordinary repositories, linked worktrees, and symlinked
 * repository roots while excluding plain folders and directories that merely
 * inherit a parent repository. Results are sorted by visible child path.
 */
export async function readWorkspaceRepositories(
  workspace: string,
): Promise<WorkspaceRepository[]> {
  const absoluteWorkspace = resolve(workspace);
  let entries: Array<{ name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }>;
  try {
    entries = await fs.readdir(absoluteWorkspace, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates = entries
    .filter((entry) => !SKIP_DIRECTORIES.has(entry.name))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => join(absoluteWorkspace, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const repositories = await Promise.all(candidates.map(readWorkspaceRepository));
  return repositories.filter(
    (repository): repository is WorkspaceRepository => repository !== null,
  );
}

async function readWorkspaceRepository(
  candidate: string,
): Promise<WorkspaceRepository | null> {
  try {
    if (!(await fs.stat(candidate)).isDirectory()) return null;
  } catch {
    return null;
  }

  const repoRoot = await resolveRepoRoot(candidate);
  if (!repoRoot) return null;

  const [candidateIdentity, repoIdentity] = await Promise.all([
    canonicalPath(candidate),
    canonicalPath(repoRoot),
  ]);
  if (candidateIdentity !== repoIdentity) return null;

  const [handle, git] = await Promise.all([
    readRootHandle(candidate),
    gitState(repoRoot),
  ]);
  return { ...handle, git };
}

async function readRootSummary(root: string): Promise<string | null> {
  const candidates = [join(root, "_agent", "now.md"), join(root, "README.md")];
  for (const candidate of candidates) {
    let content: string;
    try {
      content = await fs.readFile(candidate, "utf-8");
    } catch {
      continue;
    }

    const summary = extractSummary(content) ?? firstMeaningfulLine(content);
    if (summary) {
      const normalized = normalizeSummary(summary);
      if (normalized) return normalized;
    }
  }
  return null;
}

function firstMeaningfulLine(content: string): string | null {
  for (const raw of stripFrontmatter(content).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const unquoted = line.replace(/^>+\s*/, "").trim();
    if (unquoted) return unquoted;
  }
  return null;
}

function normalizeSummary(summary: string): string {
  return summary.replace(/\s+/g, " ").trim();
}

async function countImmediateDirectories(root: string): Promise<number | null> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter(
      (entry) => entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name),
    ).length;
  } catch {
    return null;
  }
}

async function canonicalPath(path: string): Promise<string> {
  return fs.realpath(path).catch(() => resolve(path));
}
