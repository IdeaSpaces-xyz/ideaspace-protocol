import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleContentAwareness, renderContentAwareness } from "./awareness.js";
import {
  assembleContentState,
  renderContentState,
  renderContentTail,
  type ContentState,
} from "./content-state.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "is-content-state-"));
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function git(args: string[]): string {
  const result = spawnSync("git", ["-C", tmp, ...args], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

async function write(path: string, content: string): Promise<void> {
  await fs.mkdir(join(tmp, path, ".."), { recursive: true });
  await fs.writeFile(join(tmp, path), content, "utf-8");
}

function state(overrides: Partial<ContentState["git"]> = {}, captures: string[] = []): ContentState {
  return {
    placement: "tail",
    git: {
      repoRoot: tmp,
      headSha: "abc",
      branch: "main",
      ahead: null,
      behind: null,
      dirty: false,
      untrackedInTrackedDirs: [],
      ...overrides,
    },
    captures,
  };
}

describe("assembleContentState", () => {
  it("reads git facts and only knowledge paths as captures", async () => {
    await write("README.md", "# Root\n");
    await write("notes/a.md", "# A\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "seed"]);
    await write("notes/b.md", "# B\n");
    await write("_agent/now.md", "now\n");
    await write("build.log", "noise\n");
    git(["add", "notes/b.md", "_agent/now.md", "build.log"]);
    await write("notes/loose.md", "# untracked\n");

    const result = await assembleContentState(tmp);
    expect(result.placement).toBe("tail");
    expect(result.git.branch).toBe("main");
    expect(result.git.dirty).toBe(true);
    expect(result.captures).toEqual(["_agent/now.md", "notes/b.md"]);
    expect(result.git.untrackedInTrackedDirs).toEqual(["notes/loose.md"]);
  });
});

describe("renderContentState", () => {
  it("renders the canonical block without an upstream", () => {
    expect(renderContentState(state())).toBe(
      ["State:", "  branch: main", "  remote: no upstream", "  working tree: clean", "  captures awaiting commit: 0"].join("\n"),
    );
  });

  it("renders upstream counts, dirtiness, captures, and untracked knowledge", () => {
    expect(
      renderContentState(
        state({ branch: null, ahead: 2, behind: 0, dirty: true, untrackedInTrackedDirs: ["n/x.md"] }, ["a.md", "b.md"]),
      ),
    ).toBe(
      [
        "State:",
        "  branch: (detached)",
        "  remote: ahead 2, behind 0",
        "  working tree: dirty",
        "  captures awaiting commit: 2",
        "  untracked knowledge files: 1",
      ].join("\n"),
    );
  });
});

describe("renderContentTail", () => {
  async function manifest() {
    await write("_agent/foundation.md", "---\nsummary: F.\n---\nBody\n");
    await write("_agent/purpose.md", "---\nsummary: P.\n---\nBody\n");
    await write("README.md", "v1\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "seed"]);
    const seed = git(["rev-parse", "HEAD"]).trim();
    await write("changed.md", "new\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "change"]);
    const result = await assembleContentAwareness({ position: tmp, lastSha: seed });
    if (!result || result.status !== "ok") throw new Error("expected an ok manifest");
    return result;
  }

  it("orders State, handles, manifest tail, then the Change line", async () => {
    const m = await manifest();
    const s = await assembleContentState(tmp);
    const text = renderContentTail(m, {
      state: s,
      handles: ["Repos in scope (local):\n  home", null, "", "hint"],
      change: "Change open: chg_x",
    });
    const protocolTail = renderContentAwareness(m, { placement: "tail" });
    expect(protocolTail).toContain("Git: branch main");
    expect(text).toBe(
      [
        renderContentState(s),
        "Repos in scope (local):\n  home",
        "hint",
        renderContentAwareness(m, {
          placement: "tail",
          sections: ["activity", "stale-docs", "direction-drift"],
        }),
        "Change open: chg_x",
      ].join("\n\n"),
    );
    // State supersedes the compact Git line; the facts never render twice.
    expect(text).not.toContain("Git: branch");
    expect(text).toContain("Since last session");
    expect(text).not.toContain("Now:");
  });

  it("keeps the compact Git line when no State is supplied", async () => {
    const m = await manifest();
    expect(renderContentTail(m)).toBe(renderContentAwareness(m, { placement: "tail" }));
    expect(renderContentTail(m)).toContain("Git: branch main");
  });

  it("honors an explicit section filter as an intersection", async () => {
    const m = await manifest();
    const text = renderContentTail(m, { sections: ["activity", "stale-docs", "direction-drift"] });
    expect(text).toContain("Since last session");
    expect(text).not.toContain("Git: branch");
  });

  it("composes local inputs alone when no Content position resolves", () => {
    const s = state();
    expect(renderContentTail(null, { state: s, handles: ["catalog"], change: "chg" })).toBe(
      `${renderContentState(s)}\n\ncatalog\n\nchg`,
    );
    expect(renderContentTail(null)).toBe("");
  });

  it("is deterministic for equal inputs", async () => {
    const m = await manifest();
    const s = await assembleContentState(tmp);
    const opts = { state: s, handles: ["h"], change: "c" };
    expect(renderContentTail(m, opts)).toBe(renderContentTail(m, opts));
  });
});
