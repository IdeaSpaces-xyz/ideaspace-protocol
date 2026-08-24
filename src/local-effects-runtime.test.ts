import { spawn } from "node:child_process";
import {
  accessSync,
  constants,
  readFileSync,
} from "node:fs";
import {
  appendFile,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseFrontmatter, stripFrontmatter } from "./frontmatter.js";
import { pathRevision } from "./git.js";
import type {
  CommitPathsRequest,
  LocalEffectCapabilities,
  LocalEffectFileSystem,
  LocalGitResult,
  LocalGitRunner,
  PathRevision,
  WriteMarkdownRequest,
} from "./local-effects.js";
import {
  commitPaths,
  nodeLocalEffectFileSystem,
  writeMarkdown,
} from "./local-effects-runtime.js";

interface Manifest {
  format: string;
  contents: Record<string, string>;
  vectors: Vector[];
}
interface Vector {
  id: string;
  cases?: Array<Record<string, string>>;
  initial: FixtureState;
  before_request?: FixtureAction[];
  fault?: { phase: "stage" | "commit"; when: "before" | "after" };
  request: Record<string, unknown>;
  expected: {
    result: Record<string, any>;
    facts: { paths: Record<string, Record<string, any>>; unchanged: string[] };
  };
}
interface FixtureState {
  head: Record<string, FixtureEntry>;
  index: Record<string, FixtureEntry>;
  worktree: Record<string, FixtureEntry>;
  ignore: string[];
}
type FixtureEntry = { content: string } | { symlink: string };
type FixtureAction = Record<string, any> & { action: string };

const manifestPath = fileURLToPath(
  new URL("../conformance/local-effects/manifest.json", import.meta.url),
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const gitExecutable = findExecutable("git");
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("TypeScript local-effect reference", () => {
  for (const vector of manifest.vectors) {
    const cases = vector.cases ?? [null];
    for (const [caseIndex, fixtureCase] of cases.entries()) {
      const suffix = fixtureCase === null ? "" : ` case ${caseIndex + 1}`;
      it(`${vector.id}${suffix}`, async () => {
        const concrete = resolveFixture(vector, fixtureCase) as Vector;
        const fixture = await materializeFixture(concrete.initial);
        const reviewed = await collectReviewedRevisions(concrete.request, fixture);
        const unchangedBefore = await snapshotPaths(fixture.root, concrete.expected.facts.unchanged, fixture.runner);
        await applyActions(fixture, concrete.before_request ?? []);

        const request = resolveRequest(concrete.request, fixture.root, reviewed);
        const capabilities: LocalEffectCapabilities = {
          git: faultRunner(fixture.runner, concrete.fault),
          filesystem: nodeLocalEffectFileSystem,
        };
        const result = request.operation === "write_markdown"
          ? await writeMarkdown(request as unknown as WriteMarkdownRequest, capabilities)
          : await commitPaths(request as unknown as CommitPathsRequest, capabilities);

        expectResult(result as unknown as Record<string, any>, concrete.expected.result);
        await expectFacts(fixture, concrete.expected, unchangedBefore);
      });
    }
  }

  it("rechecks write CAS immediately before atomic replacement", async () => {
    const fixture = await materializeFixture({
      head: { "note.md": { content: "v1" } },
      index: { "note.md": { content: "v1" } },
      worktree: { "note.md": { content: "v1" } },
      ignore: [],
    });
    const revision = await requiredRevision(fixture, "note.md");
    let moved = false;
    const filesystem: LocalEffectFileSystem = {
      ...nodeLocalEffectFileSystem,
      async readUtf8(path) {
        const content = await nodeLocalEffectFileSystem.readUtf8(path);
        if (!moved) {
          moved = true;
          await writeFile(path, manifest.contents.v2!, "utf8");
        }
        return content;
      },
    };
    const result = await writeMarkdown(
      {
        operation: "write_markdown",
        root: fixture.root,
        path: "note.md",
        expected_revision: revision,
        frontmatter: { mode: "replace", set: {}, remove: [] },
        body: "# Requested\n",
        stage: false,
      },
      { git: fixture.runner, filesystem },
    );
    expect(result).toMatchObject({
      status: "error",
      code: "revision_mismatch",
      phase: "revision_check",
      affected_paths: [],
    });
    expect(await readFile(join(fixture.root, "note.md"), "utf8")).toBe(manifest.contents.v2);
  });

  it("rechecks commit CAS immediately before exact-path staging", async () => {
    const fixture = await materializeFixture({
      head: { "note.md": { content: "v1" } },
      index: { "note.md": { content: "v1" } },
      worktree: { "note.md": { content: "v2" } },
      ignore: [],
    });
    const revision = await requiredRevision(fixture, "note.md");
    let rootReads = 0;
    const runner: LocalGitRunner = async (root, args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
        rootReads += 1;
        if (rootReads === 2) {
          await writeFile(join(root, "note.md"), manifest.contents.v3!, "utf8");
        }
      }
      return fixture.runner(root, args);
    };
    const result = await commitPaths(
      {
        operation: "commit_paths",
        root: fixture.root,
        paths: [{ path: "note.md", expected_revision: revision }],
        message: "Commit note",
        trailers: {},
        author: { name: "Person", email: "person@example.com" },
        committer: { name: "Person", email: "person@example.com" },
      },
      { git: runner, filesystem: nodeLocalEffectFileSystem },
    );
    expect(result).toMatchObject({
      status: "error",
      code: "revision_mismatch",
      phase: "revision_check",
      affected_paths: [],
    });
    const current = await requiredRevision(fixture, "note.md");
    expect(current.worktree).not.toBe(revision.worktree);
    expect(current.index).toBe(revision.index);
    expect(current.head).toBe(revision.head);
  });

  it("reports an injected atomic-write failure without touching the path", async () => {
    const fixture = await materializeFixture({ head: {}, index: {}, worktree: {}, ignore: [] });
    const revision = await requiredRevision(fixture, "note.md");
    const filesystem: LocalEffectFileSystem = {
      ...nodeLocalEffectFileSystem,
      async atomicWriteUtf8() {
        throw new Error("injected replacement failure");
      },
    };
    const result = await writeMarkdown(
      {
        operation: "write_markdown",
        root: fixture.root,
        path: "note.md",
        expected_revision: revision,
        frontmatter: { mode: "replace", set: { name: "Note" }, remove: [] },
        body: "# Note\n",
        stage: false,
      },
      { git: fixture.runner, filesystem },
    );
    expect(result).toMatchObject({
      status: "error",
      code: "atomic_write_failed",
      phase: "write",
      affected_paths: [],
    });
    await expect(lstat(join(fixture.root, "note.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never asks the injected Git capability to run a network verb", async () => {
    const fixture = await materializeFixture({ head: {}, index: {}, worktree: {}, ignore: [] });
    const revision = await requiredRevision(fixture, "note.md");
    const seen: string[] = [];
    const runner: LocalGitRunner = async (root, args) => {
      seen.push(...args);
      return fixture.runner(root, args);
    };
    const result = await writeMarkdown(
      {
        operation: "write_markdown",
        root: fixture.root,
        path: "note.md",
        expected_revision: revision,
        frontmatter: { mode: "replace", set: {}, remove: [] },
        body: "# Note\n",
        stage: true,
      },
      { git: runner, filesystem: nodeLocalEffectFileSystem },
    );
    expect(result.status).toBe("ok");
    expect(seen.some((arg) => /^(clone|fetch|pull|push|ls-remote)$/.test(arg))).toBe(false);
  });
});

async function materializeFixture(initial: FixtureState): Promise<{
  root: string;
  runner: LocalGitRunner;
}> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "protocol-local-effects-"));
  const root = await realpath(temporaryRoot);
  cleanup.push(root);
  const home = join(root, ".isolated-home");
  await mkdir(home, { recursive: true });
  const runner = createGitRunner(home);
  await mustGit(runner, root, ["init", "--initial-branch=main"]);

  await clearWorktree(root);
  await writeState(root, initial.head);
  if (Object.keys(initial.head).length > 0) {
    await mustGit(runner, root, ["add", "-A"]);
    await fixtureCommit(runner, root, "Fixture HEAD", []);
  }

  await clearWorktree(root);
  await writeState(root, initial.index);
  await mustGit(runner, root, ["add", "-A"]);

  await clearWorktree(root);
  await writeState(root, initial.worktree);
  if (initial.ignore.length > 0) {
    await appendFile(join(root, ".git", "info", "exclude"), `\n${initial.ignore.join("\n")}\n`);
  }
  return { root, runner };
}

async function clearWorktree(root: string): Promise<void> {
  for (const entry of await readdir(root)) {
    if (entry === ".git" || entry === ".isolated-home") continue;
    await rm(join(root, entry), { recursive: true, force: true });
  }
}

async function writeState(root: string, state: Record<string, FixtureEntry>): Promise<void> {
  for (const [path, entry] of Object.entries(state)) {
    const target = join(root, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    if ("content" in entry) {
      await writeFile(target, manifest.contents[entry.content]!, "utf8");
    } else {
      await symlink(entry.symlink, target);
    }
  }
}

async function collectReviewedRevisions(
  request: Record<string, any>,
  fixture: { root: string; runner: LocalGitRunner },
): Promise<Map<string, PathRevision>> {
  const paths = new Set<string>();
  collectRevisionPaths(request, paths);
  const revisions = new Map<string, PathRevision>();
  for (const path of paths) revisions.set(path, await requiredRevision(fixture, path));
  return revisions;
}

function collectRevisionPaths(value: unknown, paths: Set<string>): void {
  if (Array.isArray(value)) return value.forEach((entry) => collectRevisionPaths(entry, paths));
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.$revision === "reviewed" && typeof record.path === "string") {
    paths.add(record.path);
    return;
  }
  Object.values(record).forEach((entry) => collectRevisionPaths(entry, paths));
}

async function requiredRevision(
  fixture: { root: string; runner: LocalGitRunner },
  path: string,
): Promise<PathRevision> {
  const result = await pathRevision(fixture.root, path, fixture.runner);
  if (result.status === "error") throw new Error(`${result.code}: ${result.message}`);
  return result.revision;
}

function resolveRequest(
  value: unknown,
  root: string,
  revisions: Map<string, PathRevision>,
): any {
  if (Array.isArray(value)) return value.map((entry) => resolveRequest(entry, root, revisions));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.$revision === "reviewed" && typeof record.path === "string") {
      return revisions.get(record.path);
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, resolveRequest(entry, root, revisions)]),
    );
  }
  return value === "$ROOT" ? root : value;
}

function resolveFixture(value: unknown, fixtureCase: Record<string, string> | null): any {
  if (Array.isArray(value)) return value.map((entry) => resolveFixture(entry, fixtureCase));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveFixture(entry, fixtureCase)]),
    );
  }
  if (typeof value === "string" && value.startsWith("$CASE.") && fixtureCase) {
    return fixtureCase[value.slice("$CASE.".length)];
  }
  return value;
}

async function applyActions(
  fixture: { root: string; runner: LocalGitRunner },
  actions: FixtureAction[],
): Promise<void> {
  for (const action of actions) {
    if (action.action === "write_worktree") {
      const path = join(fixture.root, ...action.path.split("/"));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, manifest.contents[action.content]!, "utf8");
    } else if (action.action === "remove_worktree") {
      await rm(join(fixture.root, ...action.path.split("/")), { recursive: true, force: true });
    } else if (action.action === "stage") {
      await mustGit(fixture.runner, fixture.root, [
        "add",
        "-A",
        "--",
        ...action.paths.map(literalPathspec),
      ]);
    } else if (action.action === "commit") {
      await mustGit(fixture.runner, fixture.root, [
        "add",
        "-A",
        "--",
        ...action.paths.map(literalPathspec),
      ]);
      await fixtureCommit(fixture.runner, fixture.root, action.message, action.paths);
    } else if (action.action === "add_ignore") {
      await appendFile(join(fixture.root, ".git", "info", "exclude"), `${action.pattern}\n`);
    } else {
      throw new Error(`Unknown fixture action: ${action.action}`);
    }
  }
}

function expectResult(actual: Record<string, any>, expected: Record<string, any>): void {
  expect(actual.status).toBe(expected.status);
  expect(actual.affected_paths).toEqual(expected.affected_paths);
  if (expected.code !== undefined) expect(actual.code).toBe(expected.code);
  if (expected.phase !== undefined) expect(actual.phase).toBe(expected.phase);
  if (expected.completed_phases !== undefined) {
    expect(actual.completed_phases).toEqual(expected.completed_phases);
  }
}

async function expectFacts(
  fixture: { root: string; runner: LocalGitRunner },
  expected: Vector["expected"],
  unchangedBefore: Map<string, string>,
): Promise<void> {
  for (const [path, facts] of Object.entries(expected.facts.paths)) {
    const actual = await pathContents(fixture.root, path, fixture.runner);
    for (const place of ["worktree", "index", "head"] as const) {
      if (Object.hasOwn(facts, place)) {
        const expectedContent = facts[place] === null ? null : manifest.contents[facts[place]];
        expect(actual[place], `${path} ${place}`).toBe(expectedContent);
      }
    }
    if (facts.index_matches_worktree) expect(actual.index).toBe(actual.worktree);
    if (facts.frontmatter !== undefined || facts.body_exact !== undefined) {
      expect(actual.worktree, `${path} worktree content`).not.toBeNull();
      const content = actual.worktree!;
      const frontmatter = parseFrontmatter(content);
      if (facts.frontmatter !== undefined) {
        expect(frontmatter).toMatchObject(facts.frontmatter);
      }
      for (const absent of facts.frontmatter_absent ?? []) {
        expect(frontmatter).not.toHaveProperty(absent);
      }
      if (facts.body_exact !== undefined) expect(stripFrontmatter(content)).toBe(facts.body_exact);
    }
  }
  const unchangedAfter = await snapshotPaths(
    fixture.root,
    expected.facts.unchanged,
    fixture.runner,
  );
  expect(unchangedAfter).toEqual(unchangedBefore);

  if (expected.result.status === "ok" && expected.result.commit_paths) {
    const membership = await mustGit(fixture.runner, fixture.root, [
      "diff-tree",
      "--root",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      "HEAD",
    ]);
    expect(new Set(membership.stdout.split("\0").filter(Boolean))).toEqual(
      new Set(expected.result.commit_paths),
    );
  }
  if (expected.result.status === "ok" && expected.result.author) {
    const log = await mustGit(fixture.runner, fixture.root, [
      "log",
      "-1",
      "--format=%an%x00%ae%x00%cn%x00%ce%x00%B",
    ]);
    const [authorName, authorEmail, committerName, committerEmail, ...messageParts] =
      log.stdout.split("\0");
    expect({ name: authorName, email: authorEmail }).toEqual(expected.result.author);
    expect({ name: committerName, email: committerEmail }).toEqual(expected.result.committer);
    const trailers = await mustGit(fixture.runner, fixture.root, [
      "interpret-trailers",
      "--parse",
    ], messageParts.join("\0"));
    const parsed: Record<string, string[]> = {};
    for (const line of trailers.stdout.trim().split("\n").filter(Boolean)) {
      const separator = line.indexOf(":");
      const key = line.slice(0, separator);
      (parsed[key] ??= []).push(line.slice(separator + 1).trim());
    }
    expect(parsed).toEqual(expected.result.trailers);
  }
}

async function pathContents(
  root: string,
  path: string,
  runner: LocalGitRunner,
): Promise<{ worktree: string | null; index: string | null; head: string | null }> {
  let worktree: string | null = null;
  try {
    const stat = await lstat(join(root, ...path.split("/")));
    if (stat.isFile()) worktree = await readFile(join(root, ...path.split("/")), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    worktree,
    index: await gitPlaceContent(runner, root, "index", path),
    head: await gitPlaceContent(runner, root, "head", path),
  };
}

async function gitPlaceContent(
  runner: LocalGitRunner,
  root: string,
  place: "index" | "head",
  path: string,
): Promise<string | null> {
  const result = place === "index"
    ? await runner(root, ["ls-files", "--stage", "-z", "--", literalPathspec(path)])
    : await runner(root, ["ls-tree", "-z", "HEAD", "--", literalPathspec(path)]);
  if (!result.ok) return null;
  const match = place === "index"
    ? /^\d+ ([^ ]+) \d+\t/.exec(result.stdout)
    : /^\d+ blob ([^\t]+)\t/.exec(result.stdout);
  if (!match) return null;
  const blob = await mustGit(runner, root, ["cat-file", "blob", match[1]!]);
  return blob.stdout;
}

async function snapshotPaths(
  root: string,
  paths: string[],
  runner: LocalGitRunner,
): Promise<Map<string, string>> {
  const snapshots = new Map<string, string>();
  for (const path of paths) {
    const target = join(root, ...path.split("/"));
    let worktree: unknown = null;
    try {
      const stat = await lstat(target);
      worktree = stat.isSymbolicLink()
        ? { kind: "symlink", target: await readlink(target) }
        : stat.isFile()
          ? { kind: "file", content: await readFile(target, "base64") }
          : { kind: stat.isDirectory() ? "directory" : "other" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const index = await runner(root, ["ls-files", "--stage", "-z", "--", literalPathspec(path)]);
    const head = await runner(root, ["ls-tree", "-z", "HEAD", "--", literalPathspec(path)]);
    snapshots.set(path, JSON.stringify({ worktree, index: index.stdout, head: head.stdout }));
  }
  return snapshots;
}

function faultRunner(
  runner: LocalGitRunner,
  fault: Vector["fault"],
): LocalGitRunner {
  if (!fault) return runner;
  let fired = false;
  return async (root, args) => {
    const command = gitCommand(args);
    if (!fired && fault.when === "before" && command === fault.phase) {
      fired = true;
      return { ok: false, stdout: "", stderr: `injected ${fault.phase} failure`, code: 1 };
    }
    return runner(root, args);
  };
}

function gitCommand(args: readonly string[]): "stage" | "commit" | null {
  if (args[0] === "add") return "stage";
  return args.includes("commit") ? "commit" : null;
}

function createGitRunner(home: string): LocalGitRunner {
  return (root, args) => spawnGit(root, args, home);
}

function spawnGit(
  root: string,
  args: readonly string[],
  home: string,
  stdin?: string,
): Promise<LocalGitResult> {
  return new Promise((resolve) => {
    const child = spawn(gitExecutable, args, {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
    child.on("error", (error) => resolve({ ok: false, stdout: "", stderr: error.message, code: null }));
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr, code }));
    if (stdin !== undefined) child.stdin.end(stdin);
  });
}

async function mustGit(
  runner: LocalGitRunner,
  root: string,
  args: readonly string[],
  stdin?: string,
): Promise<LocalGitResult> {
  const result = stdin === undefined
    ? await runner(root, args)
    : await spawnGit(root, args, join(root, ".isolated-home"), stdin);
  if (!result.ok) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

async function fixtureCommit(
  runner: LocalGitRunner,
  root: string,
  message: string,
  paths: string[],
): Promise<void> {
  const args = [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "-m",
    message,
    ...(paths.length === 0 ? [] : ["--only", "--", ...paths.map(literalPathspec)]),
  ];
  await mustGit(runner, root, args);
}

function literalPathspec(path: string): string {
  return `:(literal)${path}`;
}

function findExecutable(name: string): string {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through the caller's PATH until an explicit executable is found.
    }
  }
  throw new Error(`${name} executable not found for tests`);
}
