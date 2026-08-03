import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  readRootHandle,
  readWorkspaceRepositories,
} from "./workspace.js";

let tmp: string;

beforeEach(async () => {
  tmp = realpathSync(await mkdtemp(join(tmpdir(), "is-protocol-workspace-")));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function hasGit(): boolean {
  return spawnSync("git", ["--version"]).status === 0;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

async function initRepo(dir: string, readme = "# Repo\n"): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  await fs.writeFile(join(dir, "README.md"), readme, "utf-8");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "seed"]);
}

describe("readRootHandle", () => {
  it("prefers the Now summary and counts immediate non-noise directories", async () => {
    await fs.mkdir(join(tmp, "_agent"), { recursive: true });
    await fs.writeFile(
      join(tmp, "_agent", "now.md"),
      "---\nname: Now\nsummary: >\n  Current focus across\n  two lines.\n---\n# Now\nBody\n",
      "utf-8",
    );
    await fs.writeFile(join(tmp, "README.md"), "README fallback", "utf-8");
    for (const dir of [
      "notes",
      "node_modules",
      "dist",
      "build",
      ".github",
      ".vscode",
      ".idea",
      ".git",
      "surface-cache",
    ]) {
      await fs.mkdir(join(tmp, dir), { recursive: true });
    }
    await fs.writeFile(join(tmp, "file.md"), "not a directory", "utf-8");

    expect(
      await readRootHandle(tmp, { excludeDirectories: ["surface-cache"] }),
    ).toEqual({
      root: tmp,
      summary: "Current focus across two lines.",
      // `_agent/` is meaningful shape and remains visible; implementation-noise
      // directories are excluded.
      directoryCount: 2,
    });
  });

  it("falls back from an empty Now to the first meaningful README body line", async () => {
    await fs.mkdir(join(tmp, "_agent"), { recursive: true });
    await fs.writeFile(join(tmp, "_agent", "now.md"), "# Now\n", "utf-8");
    await fs.writeFile(
      join(tmp, "README.md"),
      "---\nname: Root\n---\n# Root\n\n> A portable root handle.\n",
      "utf-8",
    );

    expect((await readRootHandle(tmp)).summary).toBe("A portable root handle.");
  });

  it("falls through when Now has malformed frontmatter", async () => {
    await fs.mkdir(join(tmp, "_agent"), { recursive: true });
    await fs.writeFile(
      join(tmp, "_agent", "now.md"),
      "---\nsummary: never closed\n",
      "utf-8",
    );
    await fs.writeFile(join(tmp, "README.md"), "README summary.\n", "utf-8");

    expect((await readRootHandle(tmp)).summary).toBe("README summary.");
  });

  it("degrades unreadable roots to null facts", async () => {
    const file = join(tmp, "not-a-directory");
    await fs.writeFile(file, "x", "utf-8");

    expect(await readRootHandle(file)).toEqual({
      root: file,
      summary: null,
      directoryCount: null,
    });
  });

  it("reads through a symlink while retaining the caller-visible root", async () => {
    const target = join(tmp, "target");
    const link = join(tmp, "linked-root");
    await fs.mkdir(target);
    await fs.writeFile(join(target, "README.md"), "# Target\n\nLinked summary.\n", "utf-8");
    await fs.symlink(target, link, "dir");

    expect(await readRootHandle(link)).toEqual({
      root: link,
      summary: "Linked summary.",
      directoryCount: 0,
    });
  });
});

describe("readWorkspaceRepositories", () => {
  it("returns sorted immediate repository handles with raw git state", async () => {
    if (!hasGit()) return;
    const alpha = join(tmp, "alpha");
    const zeta = join(tmp, "zeta");
    await initRepo(zeta, "---\nsummary: Zeta repo.\n---\n# Zeta\n");
    await initRepo(alpha, "---\nsummary: Alpha repo.\n---\n# Alpha\n");
    await fs.writeFile(join(zeta, "README.md"), "changed", "utf-8");

    const repositories = await readWorkspaceRepositories(tmp);
    expect(repositories.map((repository) => basename(repository.root))).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(repositories[0]).toMatchObject({
      root: alpha,
      summary: "Alpha repo.",
      directoryCount: 0,
      git: { repoRoot: alpha, branch: "main", dirty: false },
    });
    expect(repositories[1].git.dirty).toBe(true);
  });

  it("excludes plain folders and children that only inherit a parent repo", async () => {
    if (!hasGit()) return;
    await initRepo(tmp);
    const inherited = join(tmp, "inherited");
    const nested = join(tmp, "nested-repo");
    await fs.mkdir(inherited);
    await initRepo(nested);

    const repositories = await readWorkspaceRepositories(tmp);
    expect(repositories.map((repository) => basename(repository.root))).toEqual([
      "nested-repo",
    ]);
  });

  it("recognizes linked worktrees whose .git marker is a file", async () => {
    if (!hasGit()) return;
    const source = join(tmp, "source");
    const worktree = join(tmp, "linked-worktree");
    await initRepo(source);
    git(source, ["worktree", "add", "-q", "-b", "secondary", worktree]);

    const repositories = await readWorkspaceRepositories(tmp);
    const linked = repositories.find(
      (repository) => repository.root === worktree,
    );
    expect(linked).toBeDefined();
    expect(linked?.git.repoRoot).toBe(realpathSync(worktree));
    expect(linked?.git.branch).toBe("secondary");
  });

  it("recognizes a symlink only when it points at a repository root", async () => {
    if (!hasGit()) return;
    const repo = join(tmp, "repo");
    const repoLink = join(tmp, "repo-link");
    const subdirLink = join(tmp, "subdir-link");
    await initRepo(repo);
    await fs.mkdir(join(repo, "subdir"));
    await fs.symlink(repo, repoLink, "dir");
    await fs.symlink(join(repo, "subdir"), subdirLink, "dir");

    const repositories = await readWorkspaceRepositories(tmp);
    const roots = repositories.map((repository) => basename(repository.root));
    expect(roots).toContain("repo");
    expect(roots).toContain("repo-link");
    expect(roots).not.toContain("subdir-link");
  });

  it("applies caller-supplied workspace exclusions", async () => {
    if (!hasGit()) return;
    const visible = join(tmp, "visible");
    const hiddenByCaller = join(tmp, "surface-cache");
    await initRepo(visible);
    await initRepo(hiddenByCaller);

    const repositories = await readWorkspaceRepositories(tmp, {
      excludeDirectories: ["surface-cache"],
    });
    expect(repositories.map((repository) => basename(repository.root))).toEqual([
      "visible",
    ]);
  });

  it("returns an empty list for a plain, missing, or non-directory workspace", async () => {
    expect(await readWorkspaceRepositories(tmp)).toEqual([]);
    expect(await readWorkspaceRepositories(join(tmp, "missing"))).toEqual([]);
    const file = join(tmp, "file");
    await fs.writeFile(file, "x", "utf-8");
    expect(await readWorkspaceRepositories(file)).toEqual([]);
  });
});
