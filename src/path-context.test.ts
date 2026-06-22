import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  walkPathContext,
  spaceRootLevel,
  currentBranchLevel,
} from "./path-context.js";

let tmp: string;

beforeEach(async () => {
  // realpathSync resolves macOS /tmp → /private/tmp, matching the other
  // fixtures and keeping any future absPath assertions honest.
  tmp = realpathSync(await mkdtemp(join(tmpdir(), "is-sdk-pathctx-")));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function writeFile(rel: string, content: string): Promise<void> {
  const abs = join(tmp, rel);
  await fs.mkdir(join(abs, ".."), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

function fm(summary: string, body = ""): string {
  return `---\nsummary: ${summary}\n---\n\n${body}`;
}

describe("walkPathContext", () => {
  it("walks root → cwd, one ordered level per directory", async () => {
    await writeFile("_agent/foundation.md", fm("the place"));
    await writeFile("README.md", fm("root readme"));
    await writeFile("a/README.md", fm("a readme"));
    await writeFile("a/b/README.md", fm("b readme"));

    const ctx = await walkPathContext(tmp, "a/b");
    expect(ctx.position).toBe("a/b");
    expect(ctx.levels.map((l) => l.path)).toEqual(["", "a", "a/b"]);
    expect(ctx.levels.map((l) => l.readmeSummary)).toEqual([
      "root readme",
      "a readme",
      "b readme",
    ]);
  });

  it("projects space root from foundation and current branch from nearest _agent", async () => {
    await writeFile("_agent/foundation.md", fm("root"));
    await writeFile("_agent/guide.md", fm("how we work"));
    await writeFile("a/b/_agent/guide.md", fm("branch guide"));
    await writeFile("a/b/_agent/now.md", fm("branch now"));

    const ctx = await walkPathContext(tmp, "a/b");

    const root = spaceRootLevel(ctx);
    expect(root?.path).toBe("");
    expect(root?.foundation).toBe(true);

    const branch = currentBranchLevel(ctx);
    expect(branch?.path).toBe("a/b");
    expect(branch?.foundation).toBe(false);
    expect(branch?.agentFiles.sort()).toEqual(["guide", "now"]);
    expect(branch?.contractSummaries.now).toBe("branch now");
  });

  it("gates README and contract content behind includeContent", async () => {
    await writeFile("_agent/foundation.md", fm("root", "Foundation body."));
    await writeFile("README.md", fm("root readme", "Readme body."));

    const lean = await walkPathContext(tmp, "");
    expect(lean.levels[0].readmeSummary).toBe("root readme");
    expect(lean.levels[0].readmeContent).toBeNull();
    expect(lean.levels[0].contract).toBeNull();

    const full = await walkPathContext(tmp, "", { includeContent: true });
    expect(full.levels[0].readmeContent).toContain("Readme body.");
    expect(full.levels[0].contract?.foundation?.content).toContain("Foundation body.");
  });

  it("collapses a path outside the repo to the root level only", async () => {
    await writeFile("README.md", fm("root"));
    const ctx = await walkPathContext(tmp, "../escape");
    expect(ctx.levels.map((l) => l.path)).toEqual([""]);
    expect(ctx.position).toBe("");
  });

  it("marks levels without an _agent as non-branches", async () => {
    await writeFile("_agent/foundation.md", fm("root"));
    await writeFile("a/README.md", fm("a"));
    const ctx = await walkPathContext(tmp, "a");
    expect(ctx.levels[1].hasAgent).toBe(false);
    expect(ctx.levels[1].agentFiles).toEqual([]);
    expect(currentBranchLevel(ctx)?.path).toBe(""); // falls back to root branch
  });
});
