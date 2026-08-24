import { spawn } from "node:child_process";
import { lstat as nodeLstat, realpath as nodeRealpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type {
  LocalEffectReadFileSystem,
  LocalGitResult,
  LocalGitRunner,
  PathRevision,
  PathRevisionReadError,
  PathRevisionReadResult,
} from "./local-effects.js";
import { validateLocalEffectPath } from "./local-effects.js";

/**
 * Local read-only git primitives for orientation and capture state.
 *
 * They shell out to the local `git` binary and never touch the network. The
 * session-start block uses `gitState` / `recentActivity`; capture surfaces use
 * repo resolution, single-path status, and staged-knowledge discovery without
 * routing those reads through a platform executable.
 */

/** Field separator for parseable git formats (ASCII unit separator). */
const FS = "\x1f";
/** Record marker prefixed to commit header lines in a `--name-status` log. */
const REC = "\x01";

/** Default number of commits surfaced on a first session (no `sinceSha`). */
const DEFAULT_COMMIT_LIMIT = 20;

export interface GitState {
  /** Absolute path to the git toplevel — the canonical repo root. */
  repoRoot: string;
  /** Current HEAD commit SHA, or `null` when the repo has no commits. */
  headSha: string | null;
  /** Current branch name, or `null` in detached HEAD. */
  branch: string | null;
  /** Commits ahead of upstream, or `null` when there is no upstream. */
  ahead: number | null;
  /** Commits behind upstream, or `null` when there is no upstream. */
  behind: number | null;
  /** True when tracked files have staged or unstaged modifications. */
  dirty: boolean;
  /**
   * Untracked files sitting inside already-tracked directories — new knowledge
   * dropped into an established area, not whole new untracked trees. Git
   * collapses a wholly-untracked directory into a single `dir/` entry, so these
   * are exactly the porcelain `??` entries that are individual files.
   */
  untrackedInTrackedDirs: string[];
}

export interface CommitInfo {
  sha: string;
  subject: string;
  /** Committer date, ISO 8601. */
  date: string;
  author: string;
}

export interface ChangedFile {
  /** Single-letter status (M, A, D, R, …). */
  status: string;
  path: string;
}

export interface RecentActivity {
  commits: CommitInfo[];
  changedFiles: ChangedFile[];
}

/** Run a git subcommand; resolves `{ ok, out }`. Never rejects. Shared read
 * primitive — `surface-state.ts` reuses it rather than hand-rolling a copy. */
export function runGit(
  repoRoot: string,
  args: string[],
): Promise<{ ok: boolean; out: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("git", ["-C", repoRoot, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d));
    proc.on("close", (code) => resolve({ ok: code === 0, out, code }));
    proc.on("error", () => resolve({ ok: false, out: "", code: null }));
  });
}

/**
 * Resolve the git toplevel for a directory, or `null` outside a work tree.
 *
 * Kept separate from {@link gitState}: an unborn repo and a non-repo can both
 * have no HEAD or branch, but surfaces must distinguish them when deciding
 * whether to render repo state or report "not inside a git repository".
 */
export async function resolveRepoRoot(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return result.ok ? result.out.trim() || null : null;
}

export interface PathStatus {
  /** The path supplied by the caller. */
  path: string;
  /** Whether the worktree file exists, represented by a content blob SHA. */
  exists: boolean;
  /** Content blob SHA — the optimistic-concurrency token used by `if_match`. */
  sha: string | null;
  /** Whether the index differs from HEAD for this path. */
  inIndex: boolean;
  /** Whether the worktree differs from the index for this path. */
  modified: boolean;
  /** Whether git tracks the path in its index (committed or newly staged). */
  inTracked: boolean;
}

/**
 * Read one path's content/index state without mutating the repository.
 * `path` may be absolute; a relative path resolves against `repoRoot` through
 * git's `-C` context.
 */
export async function pathStatus(path: string, repoRoot: string): Promise<PathStatus> {
  const [hash, staged, modified, tracked] = await Promise.all([
    runGit(repoRoot, ["hash-object", "--", path]),
    runGit(repoRoot, ["diff", "--cached", "--quiet", "--", path]),
    runGit(repoRoot, ["diff", "--quiet", "--", path]),
    runGit(repoRoot, ["ls-files", "--error-unmatch", "--", path]),
  ]);
  const sha = hash.ok ? hash.out.trim() || null : null;
  return {
    path,
    exists: sha !== null,
    sha,
    inIndex: staged.code === 1,
    modified: modified.code === 1,
    inTracked: tracked.ok,
  };
}

const nodeReadFileSystem: LocalEffectReadFileSystem = {
  realpath: (path) => nodeRealpath(path),
  async lstat(path) {
    try {
      const stat = await nodeLstat(path);
      return {
        kind: stat.isSymbolicLink()
          ? "symlink"
          : stat.isFile()
            ? "file"
            : stat.isDirectory()
              ? "directory"
              : "other",
        mode: stat.mode,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
};

/**
 * Read one portable path revision through a caller-supplied stock-Git runner.
 *
 * The function is read-only: it checks the canonical worktree boundary and
 * existing path components without following symlinks, then hashes the
 * worktree bytes and reads the stage-0 index and HEAD blob ids. It never
 * discovers a Git executable, mutates the object database, or contacts a
 * remote. Object-id length and algorithm are deliberately opaque.
 */
export async function pathRevision(
  root: string,
  path: string,
  runner: LocalGitRunner,
  filesystem: LocalEffectReadFileSystem = nodeReadFileSystem,
): Promise<PathRevisionReadResult> {
  const pathIssue = validateLocalEffectPath(path);
  if (pathIssue) {
    return revisionError(pathIssue.code, "preflight", pathIssue.message, path);
  }
  if (typeof root !== "string" || root.length === 0 || !isAbsolute(root)) {
    return revisionError("invalid_root", "preflight", "root must be an absolute path", path);
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = await filesystem.realpath(root);
  } catch (error) {
    return revisionError("invalid_root", "preflight", "root does not resolve", path, detail(error));
  }
  if (resolve(root) !== canonicalRoot) {
    return revisionError(
      "invalid_root",
      "preflight",
      "root must be the canonical worktree path",
      path,
    );
  }

  const top = await runLocalGit(runner, root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) {
    return revisionError(
      top.code === null ? "git_unavailable" : "not_git_repository",
      "preflight",
      "root is not a Git worktree",
      path,
      top.stderr?.trim() || undefined,
    );
  }

  let gitRoot: string;
  try {
    gitRoot = await filesystem.realpath(top.stdout.trim());
  } catch (error) {
    return revisionError(
      "not_git_repository",
      "preflight",
      "Git did not return a valid worktree root",
      path,
      detail(error),
    );
  }
  if (gitRoot !== canonicalRoot) {
    return revisionError(
      "invalid_root",
      "preflight",
      "root is not the supplied repository's canonical worktree root",
      path,
    );
  }

  const componentError = await inspectPathComponents(canonicalRoot, path, filesystem);
  if (componentError) return componentError;

  const worktree = await worktreeObjectId(runner, root, path, filesystem);
  if (isRevisionError(worktree)) return worktree;
  const index = await indexObjectId(runner, root, path);
  if (isRevisionError(index)) return index;
  const head = await headObjectId(runner, root, path);
  if (isRevisionError(head)) return head;

  const revision: PathRevision = { worktree, index, head };
  return { status: "ok", operation: "path_revision", path, revision };
}

async function inspectPathComponents(
  root: string,
  path: string,
  filesystem: LocalEffectReadFileSystem,
): Promise<PathRevisionReadError | null> {
  const segments = path.split("/");
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    try {
      const stat = await filesystem.lstat(current);
      if (stat === null) return null;
      if (stat.kind === "symlink") {
        return revisionError(
          "symlink_refused",
          "preflight",
          "selected path has a symlink target or ancestor",
          path,
        );
      }
      if (index < segments.length - 1 && stat.kind !== "directory") {
        return revisionError(
          "invalid_path",
          "preflight",
          "a path ancestor is not a directory",
          path,
        );
      }
      if (index === segments.length - 1 && stat.kind === "directory") {
        return revisionError(
          "uncommittable_path",
          "preflight",
          "selected path is a directory",
          path,
        );
      }
    } catch (error) {
      return revisionError(
        "invalid_path",
        "preflight",
        "selected path could not be inspected",
        path,
        detail(error),
      );
    }
  }
  return null;
}

async function worktreeObjectId(
  runner: LocalGitRunner,
  root: string,
  path: string,
  filesystem: LocalEffectReadFileSystem,
): Promise<string | null | PathRevisionReadError> {
  try {
    const stat = await filesystem.lstat(join(root, ...path.split("/")));
    if (stat === null) return null;
    if (stat.kind !== "file") {
      return revisionError(
        "uncommittable_path",
        "revision_check",
        "worktree path is not a regular file",
        path,
      );
    }
  } catch (error) {
    return revisionError(
      "invalid_path",
      "revision_check",
      "worktree path could not be read",
      path,
      detail(error),
    );
  }
  const result = await runLocalGit(runner, root, ["hash-object", "--", path]);
  if (!result.ok) return gitReadError(result, "revision_check", path, "could not hash worktree path");
  const oid = result.stdout.trim();
  return oid || revisionError("git_executor_failed", "revision_check", "Git returned no worktree object id", path);
}

async function indexObjectId(
  runner: LocalGitRunner,
  root: string,
  path: string,
): Promise<string | null | PathRevisionReadError> {
  const result = await runLocalGit(runner, root, [
    "ls-files",
    "--stage",
    "-z",
    "--",
    literalPathspec(path),
  ]);
  if (!result.ok) return gitReadError(result, "revision_check", path, "could not read index path");
  const entries = result.stdout.split("\0").filter(Boolean);
  if (entries.length === 0) return null;
  if (entries.length !== 1) {
    return revisionError(
      "uncommittable_path",
      "revision_check",
      "index path has unresolved merge stages",
      path,
    );
  }
  const match = /^(\d+) ([^ ]+) (\d+)\t/.exec(entries[0]);
  if (!match || match[3] !== "0") {
    return revisionError(
      "uncommittable_path",
      "revision_check",
      "index path has no single stage-0 blob",
      path,
    );
  }
  return match[2];
}

async function headObjectId(
  runner: LocalGitRunner,
  root: string,
  path: string,
): Promise<string | null | PathRevisionReadError> {
  const verify = await runLocalGit(runner, root, ["rev-parse", "--verify", "-q", "HEAD"]);
  if (!verify.ok) {
    if (verify.code === 1) return null;
    return gitReadError(verify, "revision_check", path, "could not resolve HEAD");
  }
  const result = await runLocalGit(runner, root, [
    "ls-tree",
    "-z",
    "HEAD",
    "--",
    literalPathspec(path),
  ]);
  if (!result.ok) return gitReadError(result, "revision_check", path, "could not read HEAD path");
  const entries = result.stdout.split("\0").filter(Boolean);
  if (entries.length === 0) return null;
  if (entries.length !== 1) {
    return revisionError("uncommittable_path", "revision_check", "HEAD path is not one file", path);
  }
  const match = /^(\d+) blob ([^\t]+)\t/.exec(entries[0]);
  if (!match) {
    return revisionError("uncommittable_path", "revision_check", "HEAD path is not a blob", path);
  }
  return match[2];
}

async function runLocalGit(
  runner: LocalGitRunner,
  root: string,
  args: readonly string[],
): Promise<LocalGitResult> {
  try {
    return await runner(root, args);
  } catch (error) {
    return { ok: false, stdout: "", stderr: detail(error), code: null };
  }
}

function gitReadError(
  result: LocalGitResult,
  phase: "preflight" | "revision_check",
  path: string,
  message: string,
): PathRevisionReadError {
  return revisionError(
    result.code === null ? "git_unavailable" : "git_executor_failed",
    phase,
    message,
    path,
    result.stderr?.trim() || undefined,
  );
}

function revisionError(
  code: PathRevisionReadError["code"],
  phase: PathRevisionReadError["phase"],
  message: string,
  path?: string,
  errorDetail?: string,
): PathRevisionReadError {
  return {
    status: "error",
    operation: "path_revision",
    code,
    phase,
    ...(path === undefined ? {} : { path }),
    message,
    ...(errorDetail === undefined ? {} : { detail: errorDetail }),
  };
}

function isRevisionError(value: unknown): value is PathRevisionReadError {
  return typeof value === "object" && value !== null && "status" in value;
}

/** Force Git pathspec consumers to interpret every request path literally. */
function literalPathspec(path: string): string {
  return `:(literal)${path}`;
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Knowledge path: a Markdown file, or anything under an `_agent/` directory. */
export function isIdeaspacePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return normalized.endsWith(".md") || normalized.split("/").includes("_agent");
}

/** Staged knowledge paths, repo-relative, in git's deterministic output order. */
export async function stagedIdeaspacePaths(repoRoot: string): Promise<string[]> {
  const result = await runGit(repoRoot, ["diff", "--cached", "--name-only"]);
  if (!result.ok) return [];
  return result.out.split("\n").map((path) => path.trim()).filter(Boolean).filter(isIdeaspacePath);
}

/**
 * Unix committer time (seconds) of the most recent commit touching `path`, or
 * `null` if the path has no commit history (untracked/new). Uses commit time,
 * not filesystem mtime — mtimes drift across clone/rebase and would produce
 * false drift signals.
 */
export async function lastCommitTime(
  repoRoot: string,
  path: string,
): Promise<number | null> {
  const res = await runGit(repoRoot, ["log", "-1", "--format=%ct", "--", path]);
  if (!res.ok) return null;
  const t = parseInt(res.out.trim(), 10);
  return Number.isFinite(t) ? t : null;
}

/**
 * Snapshot of the working tree's git position. Pure read — no mutation.
 *
 * `repoRoot` is the git toplevel resolved from the passed path, so callers can
 * hand in any directory inside the repo and get a canonical root back (which
 * `walkPathContext` then walks down from).
 */
export async function gitState(repoRoot: string): Promise<GitState> {
  const top = await runGit(repoRoot, ["rev-parse", "--show-toplevel"]);
  const root = top.ok ? top.out.trim() : repoRoot;

  const headRes = await runGit(root, ["rev-parse", "--verify", "HEAD"]);
  const headSha = headRes.ok ? headRes.out.trim() || null : null;

  const branchRes = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branchRaw = branchRes.ok ? branchRes.out.trim() : "";
  const branch = !branchRaw || branchRaw === "HEAD" ? null : branchRaw;

  // Ahead/behind only meaningful with an upstream; null otherwise.
  let ahead: number | null = null;
  let behind: number | null = null;
  const upstream = await runGit(root, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  if (upstream.ok && upstream.out.trim()) {
    const counts = await runGit(root, [
      "rev-list",
      "--left-right",
      "--count",
      "@{upstream}...HEAD",
    ]);
    if (counts.ok) {
      const [b, a] = counts.out.trim().split(/\s+/).map((n) => parseInt(n, 10));
      if (Number.isFinite(b)) behind = b;
      if (Number.isFinite(a)) ahead = a;
    }
  }

  const status = await runGit(root, ["status", "--porcelain"]);
  let dirty = false;
  const untrackedInTrackedDirs: string[] = [];
  if (status.ok) {
    for (const line of status.out.split("\n")) {
      if (!line) continue;
      if (line.startsWith("??")) {
        const path = line.slice(3).trim();
        // A trailing slash means git collapsed a wholly-untracked directory;
        // individual files are new content in an existing tracked dir.
        if (path && !path.endsWith("/")) untrackedInTrackedDirs.push(path);
      } else {
        // Any tracked-file modification (staged or unstaged) makes us dirty.
        dirty = true;
      }
    }
  }

  return { repoRoot: root, headSha, branch, ahead, behind, dirty, untrackedInTrackedDirs };
}

/**
 * What moved recently. With a `sinceSha` the range is precise
 * (`sinceSha..HEAD`); without one — a first session — it falls back to the
 * last {@link DEFAULT_COMMIT_LIMIT} commits. The fallback is a commit count,
 * not a time window: bounded and predictable, so the session block can't blow
 * its token budget on a busy repo (or come back empty on a dormant one).
 *
 * Both commits and changed files come from a single `git log --name-status`
 * pass, which sidesteps parent-of-root-commit edge cases in a diff range.
 */
export async function recentActivity(
  repoRoot: string,
  sinceSha?: string,
  limit = DEFAULT_COMMIT_LIMIT,
): Promise<RecentActivity> {
  const selector = sinceSha ? [`${sinceSha}..HEAD`] : [`-n`, String(limit)];
  const res = await runGit(repoRoot, [
    "log",
    ...selector,
    "--name-status",
    `--format=${REC}%H${FS}%s${FS}%cI${FS}%an`,
  ]);
  if (!res.ok) return { commits: [], changedFiles: [] };

  const commits: CommitInfo[] = [];
  // First (newest) status for a path wins, so the changed-file list reflects
  // each path's most recent movement across the range.
  const seen = new Set<string>();
  const changedFiles: ChangedFile[] = [];

  for (const raw of res.out.split("\n")) {
    if (!raw) continue;
    if (raw.startsWith(REC)) {
      const [sha, subject, date, author] = raw.slice(1).split(FS);
      commits.push({ sha, subject, date, author });
      continue;
    }
    // `STATUS\tpath` or, for renames/copies, `STATUS\told\tnew`.
    const parts = raw.split("\t");
    if (parts.length < 2) continue;
    const status = parts[0][0];
    const path = parts[parts.length - 1];
    if (seen.has(path)) continue;
    seen.add(path);
    changedFiles.push({ status, path });
  }

  return { commits, changedFiles };
}
