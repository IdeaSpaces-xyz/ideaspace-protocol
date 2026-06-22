import { spawn } from "node:child_process";

/**
 * Local git primitives — `gitState` and `recentActivity`.
 *
 * Both shell out to the local `git` binary and never touch the network.
 * They back the session-start orientation block: where the working tree
 * stands (`gitState`) and what moved since last session (`recentActivity`).
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

/** Run a git subcommand; resolves `{ ok, out }`. Never rejects. */
function runGit(
  repoRoot: string,
  args: string[],
): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn("git", ["-C", repoRoot, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d));
    proc.on("close", (code) => resolve({ ok: code === 0, out }));
    proc.on("error", () => resolve({ ok: false, out: "" }));
  });
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
