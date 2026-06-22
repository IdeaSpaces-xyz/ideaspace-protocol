import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectDocDependencies, staleDocSignals } from "./stale-docs.js";

let tmp: string;

beforeEach(async () => {
  tmp = realpathSync(await mkdtemp(join(tmpdir(), "is-sdk-stale-")));
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

async function write(rel: string, content: string): Promise<void> {
  const abs = join(tmp, rel);
  await fs.mkdir(join(abs, ".."), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

async function initRepo(): Promise<void> {
  git(tmp, ["init", "-q", "-b", "main"]);
  git(tmp, ["config", "user.email", "test@example.com"]);
  git(tmp, ["config", "user.name", "Test"]);
}

const docWithDeps = (deps: string[]) =>
  `---\nsummary: a doc\ncode_paths:\n${deps.map((d) => `  - ${d}`).join("\n")}\n---\n\nbody`;

describe("collectDocDependencies", () => {
  it("collects only docs declaring code_paths, recursively", async () => {
    await write("docs/with.md", docWithDeps(["src/a.ts"]));
    await write("docs/nested/also.md", docWithDeps(["src/b.ts"]));
    await write("docs/without.md", "---\nsummary: no deps\n---\n\nbody");

    const deps = await collectDocDependencies(tmp, "docs");
    const byPath = Object.fromEntries(deps.map((d) => [d.path, d.codePaths]));
    expect(Object.keys(byPath).sort()).toEqual([
      "docs/nested/also.md",
      "docs/with.md",
    ]);
    expect(byPath["docs/with.md"]).toEqual(["src/a.ts"]);
  });
});

describe("staleDocSignals", () => {
  it("flags a doc whose code dependency was committed more recently", async () => {
    if (!hasGit()) return;
    await initRepo();
    await write("doc.md", docWithDeps(["src/a.ts"]));
    await write("src/a.ts", "v1");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "doc + code"], "2026-01-01T00:00:00");

    // Code moves forward; doc does not.
    await write("src/a.ts", "v2");
    git(tmp, ["add", "src/a.ts"]);
    git(tmp, ["commit", "-q", "-m", "code update"], "2026-02-01T00:00:00");

    const deps = await collectDocDependencies(tmp, ".");
    const signals = await staleDocSignals(tmp, deps);
    expect(signals).toHaveLength(1);
    const sig = signals[0];
    expect(sig.kind).toBe("stale");
    if (sig.kind !== "stale") throw new Error("expected stale signal");
    expect(sig.doc).toBe("doc.md");
    expect(sig.newestCode).toBe("src/a.ts");
    expect(sig.staleBySeconds).toBeGreaterThan(0);
  });

  it("does not flag when the doc is newer than its code", async () => {
    if (!hasGit()) return;
    await initRepo();
    await write("doc.md", docWithDeps(["src/a.ts"]));
    await write("src/a.ts", "v1");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "code"], "2026-01-01T00:00:00");

    await write("doc.md", docWithDeps(["src/a.ts"]) + "\nmore");
    git(tmp, ["add", "doc.md"]);
    git(tmp, ["commit", "-q", "-m", "doc update"], "2026-03-01T00:00:00");

    const deps = await collectDocDependencies(tmp, ".");
    expect(await staleDocSignals(tmp, deps)).toEqual([]);
  });

  it("emits a broken signal when a declared code path no longer exists", async () => {
    if (!hasGit()) return;
    await initRepo();
    await write("doc.md", docWithDeps(["src/ghost.ts"]));
    git(tmp, ["add", "doc.md"]);
    git(tmp, ["commit", "-q", "-m", "doc only"], "2026-01-01T00:00:00");

    const deps = await collectDocDependencies(tmp, ".");
    const signals = await staleDocSignals(tmp, deps);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({
      kind: "broken",
      doc: "doc.md",
      missing: ["src/ghost.ts"],
    });
  });

  it("emits both broken and stale for a doc with mixed code paths", async () => {
    if (!hasGit()) return;
    await initRepo();
    await write("doc.md", docWithDeps(["src/keep.ts", "src/gone.ts"]));
    await write("src/keep.ts", "v1");
    await write("src/gone.ts", "v1");
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "doc + both"], "2026-01-01T00:00:00");

    // keep.ts moves ahead of the doc; gone.ts is deleted.
    await write("src/keep.ts", "v2");
    git(tmp, ["rm", "-q", "src/gone.ts"]);
    git(tmp, ["add", "src/keep.ts"]);
    git(tmp, ["commit", "-q", "-m", "update + delete"], "2026-02-01T00:00:00");

    const deps = await collectDocDependencies(tmp, ".");
    const signals = await staleDocSignals(tmp, deps);
    expect(signals).toHaveLength(2);

    const broken = signals.find((s) => s.kind === "broken");
    const stale = signals.find((s) => s.kind === "stale");
    expect(broken).toMatchObject({ doc: "doc.md", missing: ["src/gone.ts"] });
    expect(stale).toMatchObject({ doc: "doc.md", newestCode: "src/keep.ts" });
  });

  it("skips an existing-but-untracked code path without flagging stale or broken", async () => {
    if (!hasGit()) return;
    await initRepo();
    await write("doc.md", docWithDeps(["src/a.ts"]));
    git(tmp, ["add", "doc.md"]);
    git(tmp, ["commit", "-q", "-m", "doc only"], "2026-01-01T00:00:00");
    // Code exists on disk but was never committed — nothing to compare.
    await write("src/a.ts", "v1");

    const deps = await collectDocDependencies(tmp, ".");
    expect(await staleDocSignals(tmp, deps)).toEqual([]);
  });
});
