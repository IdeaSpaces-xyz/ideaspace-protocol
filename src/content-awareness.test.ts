import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleContentAwareness,
  renderContentAwareness,
} from "./awareness.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "is-content-awareness-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function writeAgent(files: Record<string, string>): Promise<void> {
  const agentDir = join(tmp, "_agent");
  await fs.mkdir(agentDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      fs.writeFile(join(agentDir, name), content, "utf-8"),
    ),
  );
}

function initGit(): void {
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
}

function commit(message: string, date?: string): string {
  git(["add", "."]);
  const env = date
    ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : undefined;
  git(["commit", "-q", "-m", message], env);
  return git(["rev-parse", "HEAD"]).trim();
}

function git(args: string[], env?: Record<string, string>): string {
  const result = spawnSync("git", ["-C", tmp, ...args], {
    encoding: "utf-8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

describe("Content awareness manifest", () => {
  it("returns null when no foundation-marked space resolves", async () => {
    await writeAgent({ "now.md": "Working without a foundation." });

    await expect(
      assembleContentAwareness({ position: tmp, lastSha: null }),
    ).resolves.toBeNull();
  });

  it("assembles structured facts and preserves the canonical full render", async () => {
    await writeAgent({
      "foundation.md": "---\nname: Foundation\nsummary: Root agreement.\n---\n# Foundation",
      "guide.md": "---\nname: Guide\nsummary: Work together directly.\n---\n# Guide",
      "purpose.md": "---\nname: Purpose\nsummary: Keep shared understanding coherent.\n---\n# Purpose",
      "now.md": "---\nname: Now\nsummary: Current delivery state.\n---\n# Now\n\nShip structured awareness.",
    });
    await fs.mkdir(join(tmp, "_agent", "skills"), { recursive: true });
    await fs.writeFile(
      join(tmp, "_agent", "skills", "review.md"),
      "---\nname: Review\nsummary: Verify behavior before claiming done.\n---\n# Review",
      "utf-8",
    );
    await fs.mkdir(join(tmp, "docs"));
    await fs.writeFile(join(tmp, "docs", "design.md"), "# Design", "utf-8");
    await fs.writeFile(join(tmp, "README.md"), "# Space", "utf-8");
    initGit();
    commit("seed");

    const manifest = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
    });
    const canonicalTmp = await fs.realpath(tmp);

    expect(manifest).not.toBeNull();
    expect(manifest).toMatchObject({
      kind: "content",
      spaceRoot: canonicalTmp,
      now: {
        text: "Ship structured awareness.",
        source: join(canonicalTmp, "_agent", "now.md"),
      },
      tree: {
        totalMarkdownFiles: 2,
        entries: [
          { name: "docs", kind: "directory", markdownFiles: 1 },
          { name: "README.md", kind: "markdown" },
        ],
      },
      contract: [
        { name: "foundation", summary: "Root agreement." },
        { name: "guide", summary: "Work together directly." },
        { name: "purpose", summary: "Keep shared understanding coherent." },
        { name: "now", summary: "Current delivery state." },
      ],
      skills: [
        { name: "review", summary: "Verify behavior before claiming done." },
      ],
      activity: null,
      git: { branch: "main", dirty: false },
      staleDocs: [],
      missingDirection: [],
    });

    expect(renderContentAwareness(manifest!)).toBe(
      [
        "Position:",
        `  repo: ${canonicalTmp}`,
        "  cwd: .",
        "  space root: .",
        "  active _agent: .",
        "",
        "Now: Ship structured awareness.",
        "",
        "Tree (2 files):",
        "  docs/ (1)",
        "  README.md",
        "",
        "Agent context:",
        "  foundation — Root agreement.",
        "  guide — Work together directly.",
        "  purpose — Keep shared understanding coherent.",
        "  now — Current delivery state.",
        "",
        "Operating skills:",
        "  review — Verify behavior before claiming done.",
        "",
        "Git: branch main",
      ].join("\n"),
    );
  });

  it("renders selected sections in canonical order, not caller order", async () => {
    await writeAgent({
      "foundation.md": "Foundation",
      "purpose.md": "Purpose",
      "now.md": "Current focus.",
    });
    initGit();
    commit("seed");
    const manifest = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
    });

    const rendered = renderContentAwareness(manifest!, {
      sections: ["git", "now", "position"],
    });

    expect(rendered.indexOf("Position:")).toBeLessThan(rendered.indexOf("Now:"));
    expect(rendered.indexOf("Now:")).toBeLessThan(rendered.indexOf("Git:"));
    expect(rendered).not.toContain("Tree (");
    expect(rendered).not.toContain("Agent context:");
  });

  it("keeps missing direction as structured drift and renders it selectively", async () => {
    await writeAgent({ "foundation.md": "Foundation" });
    const manifest = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
    });

    const canonicalTmp = await fs.realpath(tmp);
    expect(manifest).toMatchObject({
      spaceRoot: canonicalTmp,
      position: {
        base: canonicalTmp,
        repoRoot: null,
      },
      git: null,
      staleDocs: [],
      missingDirection: ["purpose", "now"],
    });
    expect(
      renderContentAwareness(manifest!, { sections: ["position"] }),
    ).toBe(
      "Position:\n" +
        "  cwd: .\n" +
        "  space root: .\n" +
        "  active _agent: .",
    );
    expect(
      renderContentAwareness(manifest!, { sections: ["direction-drift"] }),
    ).toBe(
      [
        "⚠ `_agent/purpose.md` not yet captured. The contract names it; suggest capturing at a natural moment.",
        "⚠ `_agent/now.md` not yet captured. Suggest capturing what's currently active.",
      ].join("\n"),
    );
  });

  it("reads the seen ref by default and bounds activity in the manifest", async () => {
    await writeAgent({
      "foundation.md": "Foundation",
      "purpose.md": "Purpose",
      "now.md": "Now",
    });
    await fs.writeFile(join(tmp, "README.md"), "v1", "utf-8");
    initGit();
    const first = commit("first");
    git(["update-ref", "refs/ideaspaces/seen", first]);

    await fs.writeFile(join(tmp, "README.md"), "v2", "utf-8");
    await fs.writeFile(join(tmp, "one.md"), "one", "utf-8");
    await fs.writeFile(join(tmp, "two.md"), "two", "utf-8");
    commit("second");

    const manifest = await assembleContentAwareness({
      position: tmp,
      maxChanges: 2,
    });

    expect(manifest?.activity).toMatchObject({
      totalChanges: 3,
      omittedChanges: 1,
    });
    expect(manifest?.activity?.changes).toHaveLength(2);
    expect(renderContentAwareness(manifest!, { sections: ["activity"] })).toContain(
      "  ... and 1 more",
    );
  });

  it("carries raw stale-doc signals while the renderer owns their wording", async () => {
    await writeAgent({
      "foundation.md": "Foundation",
      "purpose.md": "Purpose",
      "now.md": "Now",
    });
    await fs.mkdir(join(tmp, "src"));
    await fs.writeFile(join(tmp, "src", "feature.ts"), "export const value = 1;", "utf-8");
    await fs.writeFile(
      join(tmp, "status.md"),
      "---\nname: Status\nsummary: Feature status.\ncode_paths:\n  - src/feature.ts\n---\n# Status",
      "utf-8",
    );
    initGit();
    commit("seed", "2026-08-01T00:00:00Z");
    await fs.writeFile(join(tmp, "src", "feature.ts"), "export const value = 2;", "utf-8");
    commit("change code", "2026-08-01T00:00:01Z");

    const manifest = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
    });

    expect(manifest?.staleDocs).toMatchObject([
      { kind: "stale", doc: "status.md", newestCode: "src/feature.ts" },
    ]);
    expect(
      renderContentAwareness(manifest!, { sections: ["stale-docs"] }),
    ).toBe(
      "⚠ Possible stale docs — verify before quoting their status:\n" +
        "  status.md — `src/feature.ts` was committed after the doc",
    );
  });
});
