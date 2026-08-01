import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gitState,
  recentActivity,
  lastCommitTime,
  resolveRepoRoot,
  pathStatus,
  isIdeaspacePath,
  stagedIdeaspacePaths,
} from "./git.js";

let tmp: string;

beforeEach(async () => {
  tmp = realpathSync(await mkdtemp(join(tmpdir(), "is-sdk-git-")));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function hasGit(): boolean {
  return spawnSync("git", ["--version"]).status === 0;
}

function git(cwd: string, args: string[], date?: string): string {
  const env = date
    ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : process.env;
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf-8", env });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

async function initRepo(dir: string): Promise<void> {
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
}

describe("gitState", () => {
  it("reports repoRoot, branch, clean tree, and null ahead/behind without upstream", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "README.md"), "v1", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);

    const head = git(tmp, ["rev-parse", "HEAD"]).trim();
    const state = await gitState(tmp);
    expect(state.repoRoot).toBe(tmp);
    expect(state.headSha).toBe(head);
    expect(state.branch).toBe("main");
    expect(state.ahead).toBeNull();
    expect(state.behind).toBeNull();
    expect(state.dirty).toBe(false);
    expect(state.untrackedInTrackedDirs).toEqual([]);
  });

  it("resolves repoRoot from a subdirectory", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "README.md"), "v1", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    const sub = join(tmp, "a", "b");
    await fs.mkdir(sub, { recursive: true });

    const state = await gitState(sub);
    expect(state.repoRoot).toBe(tmp);
  });

  it("reports a null branch in detached HEAD", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "README.md"), "v1", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    git(tmp, ["checkout", "-q", "--detach"]);

    const state = await gitState(tmp);
    expect(state.branch).toBeNull();
  });

  it("flags dirty on a tracked modification", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "README.md"), "v1", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    await fs.writeFile(join(tmp, "README.md"), "v2", "utf-8");

    const state = await gitState(tmp);
    expect(state.dirty).toBe(true);
  });

  it("lists an untracked file in a tracked dir but not a wholly-untracked dir", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "README.md"), "v1", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    // New file in the tracked root dir → surfaced.
    await fs.writeFile(join(tmp, "note.md"), "new", "utf-8");
    // Whole new untracked directory → git collapses it; not surfaced.
    await fs.mkdir(join(tmp, "fresh"), { recursive: true });
    await fs.writeFile(join(tmp, "fresh", "x.md"), "x", "utf-8");

    const state = await gitState(tmp);
    expect(state.untrackedInTrackedDirs).toContain("note.md");
    expect(state.untrackedInTrackedDirs.some((p) => p.startsWith("fresh"))).toBe(false);
    expect(state.dirty).toBe(false); // untracked-only is not "dirty"
  });

  it("reports null headSha for an unborn repo", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);

    const state = await gitState(tmp);
    expect(state.headSha).toBeNull();
    expect(state.branch).toBeNull();
  });
});

describe("read-only repo and capture status", () => {
  it("distinguishes an empty repo from a non-repo and resolves nested paths", async () => {
    if (!hasGit()) return;
    const repo = join(tmp, "repo");
    const plain = join(tmp, "plain");
    await fs.mkdir(join(repo, "a", "b"), { recursive: true });
    await fs.mkdir(plain, { recursive: true });
    await initRepo(repo);

    expect(await resolveRepoRoot(join(repo, "a", "b"))).toBe(realpathSync(repo));
    expect(await resolveRepoRoot(plain)).toBeNull();
  });

  it("resolves a linked git worktree to that worktree's root", async () => {
    if (!hasGit()) return;
    const repo = join(tmp, "repo");
    const worktree = join(tmp, "worktree");
    await fs.mkdir(repo, { recursive: true });
    await initRepo(repo);
    await fs.writeFile(join(repo, "README.md"), "v1", "utf-8");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "first"]);
    git(repo, ["worktree", "add", "-q", "-b", "secondary", worktree]);

    expect(await resolveRepoRoot(worktree)).toBe(realpathSync(worktree));
  });

  it("reports sha and index state for a staged new file", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    const file = join(tmp, "a.md");
    await fs.writeFile(file, "# A", "utf-8");
    git(tmp, ["add", "a.md"]);

    expect(await pathStatus(file, tmp)).toEqual({
      path: file,
      exists: true,
      sha: git(tmp, ["hash-object", "a.md"]).trim(),
      inIndex: true,
      modified: false,
      inTracked: true,
    });
  });

  it("reports a clean committed file as tracked but unchanged", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    const file = join(tmp, "a.md");
    await fs.writeFile(file, "v1", "utf-8");
    git(tmp, ["add", "a.md"]);
    git(tmp, ["commit", "-q", "-m", "first"]);

    expect(await pathStatus(file, tmp)).toEqual({
      path: file,
      exists: true,
      sha: git(tmp, ["hash-object", "a.md"]).trim(),
      inIndex: false,
      modified: false,
      inTracked: true,
    });
  });

  it("reports an absent path without inventing git state", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    const file = join(tmp, "ghost.md");

    expect(await pathStatus(file, tmp)).toEqual({
      path: file,
      exists: false,
      sha: null,
      inIndex: false,
      modified: false,
      inTracked: false,
    });
  });

  it("resolves a bare filename from a nested caller before reading status", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    const sub = join(tmp, "sub");
    const file = join(sub, "n.md");
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(file, "# N", "utf-8");
    git(tmp, ["add", "sub/n.md"]);

    const root = await resolveRepoRoot(sub);
    expect(root).toBe(tmp);
    expect((await pathStatus(join(sub, "n.md"), root!)).sha).toBe(
      git(tmp, ["hash-object", "sub/n.md"]).trim(),
    );
  });

  it("flags an unstaged modification on a committed path", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    const file = join(tmp, "a.md");
    await fs.writeFile(file, "v1", "utf-8");
    git(tmp, ["add", "a.md"]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    await fs.writeFile(file, "v2", "utf-8");

    const status = await pathStatus(file, tmp);
    expect(status.modified).toBe(true);
    expect(status.inIndex).toBe(false);
    expect(status.inTracked).toBe(true);
  });

  it("reports a staged deletion as absent, staged, and no longer tracked", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    const file = join(tmp, "a.md");
    await fs.writeFile(file, "v1", "utf-8");
    git(tmp, ["add", "a.md"]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    git(tmp, ["rm", "-q", "a.md"]);

    expect(await pathStatus(file, tmp)).toEqual({
      path: file,
      exists: false,
      sha: null,
      inIndex: true,
      modified: false,
      inTracked: false,
    });
  });

  it("returns only staged Markdown and _agent paths", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.mkdir(join(tmp, "_agent"), { recursive: true });
    await fs.writeFile(join(tmp, "note.md"), "note", "utf-8");
    await fs.writeFile(join(tmp, "_agent", "guide.txt"), "guide", "utf-8");
    await fs.writeFile(join(tmp, "code.ts"), "code", "utf-8");
    git(tmp, ["add", "."]);

    expect(await stagedIdeaspacePaths(tmp)).toEqual(["_agent/guide.txt", "note.md"]);
  });

  it("recognizes cross-platform _agent path separators", () => {
    expect(isIdeaspacePath("notes/a.md")).toBe(true);
    expect(isIdeaspacePath("scope/_agent/guide.txt")).toBe(true);
    expect(isIdeaspacePath("scope\\_agent\\guide.txt")).toBe(true);
    expect(isIdeaspacePath("src/index.ts")).toBe(false);
  });
});

describe("recentActivity", () => {
  it("returns the last N commits and changed files with no sinceSha", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "a.md"), "a", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    await fs.writeFile(join(tmp, "b.md"), "b", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "second"]);

    const { commits, changedFiles } = await recentActivity(tmp);
    expect(commits.map((c) => c.subject)).toEqual(["second", "first"]);
    expect(changedFiles.map((f) => f.path).sort()).toEqual(["a.md", "b.md"]);
  });

  it("scopes to commits after sinceSha", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "a.md"), "a", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);
    const base = git(tmp, ["rev-parse", "HEAD"]).trim();
    await fs.writeFile(join(tmp, "b.md"), "b", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "second"]);

    const { commits, changedFiles } = await recentActivity(tmp, base);
    expect(commits.map((c) => c.subject)).toEqual(["second"]);
    expect(changedFiles.map((f) => f.path)).toEqual(["b.md"]);
  });

  it("returns empty on a bad sha rather than throwing", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "a.md"), "a", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"]);

    const res = await recentActivity(tmp, "deadbeef");
    expect(res).toEqual({ commits: [], changedFiles: [] });
  });
});

describe("lastCommitTime", () => {
  it("returns the committer time for a tracked path and null for an unknown one", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    await fs.writeFile(join(tmp, "a.md"), "a", "utf-8");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "first"], "2026-01-01T00:00:00");

    const t = await lastCommitTime(tmp, "a.md");
    expect(t).toBe(Math.floor(Date.parse("2026-01-01T00:00:00") / 1000));
    expect(await lastCommitTime(tmp, "missing.md")).toBeNull();
  });
});
