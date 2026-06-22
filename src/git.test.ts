import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitState, recentActivity, lastCommitTime } from "./git.js";

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
