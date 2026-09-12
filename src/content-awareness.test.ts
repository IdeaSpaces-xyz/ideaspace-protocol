import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleContentAwareness,
  assembleContentTree,
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
  it("orients at the floor when neither contract entrypoint resolves", async () => {
    await writeAgent({ "now.md": "Working without an entrypoint." });
    await fs.writeFile(join(tmp, "README.md"), "---\nsummary: Floor content.\n---\n# Floor", "utf-8");

    const result = await assembleContentAwareness({ position: tmp, lastSha: null });

    expect(result).toMatchObject({
      status: "ok",
      contractSource: null,
      contract: [],
      skills: [],
      missingDirection: [],
      tree: { entries: [{ name: "README.md", summary: "Floor content." }] },
    });
  });

  it("selects Agreement explicitly, loads it in full, and keeps Foundation outside context", async () => {
    await writeAgent({
      "foundation.md": "FOUNDATION BODY SENTINEL",
      "agreement.md": [
        "---",
        "summary: Agreement summary sentinel.",
        "context:",
        "  full:",
        "    - purpose.md",
        "---",
        "# Agreement",
        "",
        "AGREEMENT BODY SENTINEL",
      ].join("\n"),
      "purpose.md": "---\nsummary: Purpose summary.\n---\n\nPURPOSE BODY SENTINEL",
      "now.md": "---\nsummary: Now summary.\n---\n\nNOW BODY SENTINEL",
    });

    const unresolved = await assembleContentAwareness({ position: tmp, lastSha: null });
    expect(unresolved).toEqual({
      status: "contract_choice_required",
      kind: "content",
      availableSources: ["foundation", "agreement"],
    });

    const agreement = await assembleContentAwareness({
      position: tmp,
      contractSource: "agreement",
      lastSha: null,
    });
    expect(agreement).toMatchObject({
      status: "ok",
      contractSource: "agreement",
      now: null,
      contract: [
        {
          name: "agreement",
          representation: "full",
          content: expect.stringContaining("AGREEMENT BODY SENTINEL"),
          placement: "head",
        },
        {
          name: "now",
          representation: "summary",
          summary: "Now summary.",
          placement: "head",
        },
        {
          name: "purpose",
          representation: "full",
          content: expect.stringContaining("PURPOSE BODY SENTINEL"),
          placement: "head",
        },
      ],
    });
    expect(JSON.stringify(agreement)).not.toContain("FOUNDATION BODY SENTINEL");
    expect(renderContentAwareness(agreement!)).toContain("AGREEMENT BODY SENTINEL");
    expect(renderContentAwareness(agreement!)).toContain("PURPOSE BODY SENTINEL");
    expect(renderContentAwareness(agreement!)).not.toContain("NOW BODY SENTINEL");

    const foundation = await assembleContentAwareness({
      position: tmp,
      contractSource: "foundation",
      lastSha: null,
    });
    expect(JSON.stringify(foundation)).not.toContain("AGREEMENT BODY SENTINEL");
    expect(JSON.stringify(foundation)).not.toContain("Agreement summary sentinel.");
  });

  it("rejects conflicting root identity through the awareness API", async () => {
    await writeAgent({
      "foundation.md": "---\nroot_node_id: n_111111111111111111111111\n---\nFOUNDATION",
      "agreement.md": "---\nroot_node_id: n_222222222222222222222222\n---\nAGREEMENT",
    });
    const result = await assembleContentAwareness({
      position: tmp,
      contractSource: "agreement",
      lastSha: null,
    });
    expect(result).toMatchObject({
      status: "contract_invalid",
      issues: [{ code: "root_node_id_conflict" }],
    });
  });

  it("revisions identify the exact Agreement bytes", async () => {
    await writeAgent({ "agreement.md": "# Agreement\n\nFirst bytes." });
    const first = await assembleContentAwareness({ position: tmp, lastSha: null });
    expect(first?.status).toBe("ok");
    if (!first || first.status !== "ok") return;
    const revision = first.contract[0]?.revision;
    expect(revision).toMatch(/^sha256:[0-9a-f]{64}$/);

    await fs.writeFile(join(tmp, "_agent", "agreement.md"), "# Agreement\n\nSecond bytes.", "utf-8");
    const second = await assembleContentAwareness({ position: tmp, lastSha: null });
    expect(second?.status).toBe("ok");
    if (!second || second.status !== "ok") return;
    expect(second.contract[0]?.revision).not.toBe(revision);
  });

  it("returns typed unavailable and invalid Agreement diagnostics", async () => {
    await writeAgent({ "foundation.md": "# Foundation" });
    await expect(
      assembleContentAwareness({
        position: tmp,
        contractSource: "agreement",
        lastSha: null,
      }),
    ).resolves.toEqual({
      status: "contract_source_unavailable",
      kind: "content",
      availableSources: ["foundation"],
      requestedSource: "agreement",
    });

    await fs.writeFile(
      join(tmp, "_agent", "agreement.md"),
      "---\ncontext:\n  full:\n    - ../outside.md\n---\n# Agreement",
      "utf-8",
    );
    const invalid = await assembleContentAwareness({
      position: tmp,
      contractSource: "agreement",
      lastSha: null,
    });
    expect(invalid).toMatchObject({
      status: "contract_invalid",
      requestedSource: "agreement",
      issues: [{ code: "invalid_full_load_path" }],
    });
  });

  it("does not promote agent context or extension payload into Content positions", async () => {
    await writeAgent({ "foundation.md": "# Foundation" });
    await fs.mkdir(join(tmp, "_example", "nested"), { recursive: true });

    await expect(
      assembleContentAwareness({ position: join(tmp, "_agent"), lastSha: null }),
    ).resolves.toBeNull();
    await expect(
      assembleContentAwareness({ position: join(tmp, "_example", "nested"), lastSha: null }),
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
    await fs.mkdir(join(tmp, "_assets"));
    await fs.writeFile(join(tmp, "_assets", "payload.md"), "# Not knowledge", "utf-8");
    await fs.mkdir(join(tmp, "_example"));
    await fs.writeFile(join(tmp, "_example", "payload.md"), "# Also not knowledge", "utf-8");
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

    const frozenFoundation = (
      await fs.readFile(
        new URL("../conformance/awareness/foundation-render.txt", import.meta.url),
        "utf-8",
      )
    ).trimEnd().replaceAll("$ROOT", canonicalTmp);
    expect(renderContentAwareness(manifest!)).toBe(frozenFoundation);
    const second = await assembleContentAwareness({ position: tmp, lastSha: null });
    expect(second?.status).toBe("ok");
    expect(renderContentAwareness(second!)).toBe(frozenFoundation);
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

  it("composes contract and skills along the path — ancestors retained, deeper shadows", async () => {
    await writeAgent({
      "foundation.md": "---\nname: Foundation\nsummary: Root agreement.\n---\n# Foundation",
      "guide.md": "---\nname: Guide\nsummary: Root guide.\n---\n# Guide",
    });
    await fs.mkdir(join(tmp, "_agent", "skills"), { recursive: true });
    await fs.writeFile(
      join(tmp, "_agent", "skills", "capture.md"),
      "---\nname: Capture\nsummary: Root capture procedure.\n---\n# Capture",
      "utf-8",
    );
    await fs.writeFile(
      join(tmp, "_agent", "skills", "review.md"),
      "---\nname: Review\nsummary: Root review procedure.\n---\n# Review",
      "utf-8",
    );
    const branchAgent = join(tmp, "branch", "_agent");
    await fs.mkdir(join(branchAgent, "skills"), { recursive: true });
    await fs.writeFile(
      join(branchAgent, "guide.md"),
      "---\nname: Guide\nsummary: Branch guide.\n---\n# Guide",
      "utf-8",
    );
    await fs.writeFile(
      join(branchAgent, "skills", "review.md"),
      "---\nname: Review\nsummary: Branch review shadows root.\n---\n# Review",
      "utf-8",
    );
    const leaf = join(tmp, "branch", "leaf");
    await fs.mkdir(leaf, { recursive: true });
    await fs.writeFile(join(leaf, "note.md"), "# Note", "utf-8");

    const manifest = await assembleContentAwareness({
      position: leaf,
      lastSha: null,
    });
    const canonicalTmp = await fs.realpath(tmp);
    const branchDir = join(canonicalTmp, "branch");

    // contract: every level retained, root-first per file, deepest last
    expect(manifest?.contract).toMatchObject([
      { name: "foundation", level: canonicalTmp, summary: "Root agreement." },
      { name: "guide", level: canonicalTmp, summary: "Root guide." },
      { name: "guide", level: branchDir, summary: "Branch guide." },
    ]);
    // skills: union along the path; deeper same-named shadows the ancestor
    expect(manifest?.skills).toMatchObject([
      { name: "capture", level: canonicalTmp, summary: "Root capture procedure." },
      { name: "review", level: branchDir, summary: "Branch review shadows root." },
    ]);

    const rendered = renderContentAwareness(manifest!, {
      sections: ["contract", "skills"],
    });
    expect(rendered).toBe(
      [
        "Agent context:",
        "  foundation — Root agreement.",
        "  guide — Root guide.",
        "  guide (branch/) — Branch guide.",
        "",
        "Operating skills:",
        "  capture — Root capture procedure.",
        "  review (branch/) — Branch review shadows root.",
      ].join("\n"),
    );
  });

  it("carries summary-rung handles at level 1 and a name-rung probe below", async () => {
    await writeAgent({ "foundation.md": "Foundation" });
    await fs.mkdir(join(tmp, "research", "deep"), { recursive: true });
    await fs.writeFile(
      join(tmp, "research", "README.md"),
      "---\nname: Research\nsummary: EU landscape sweep.\n---\n# Research",
      "utf-8",
    );
    await fs.writeFile(join(tmp, "research", "notes.md"), "# Notes", "utf-8");
    await fs.writeFile(join(tmp, "research", "deep", "more.md"), "# More", "utf-8");
    await fs.writeFile(
      join(tmp, "overview.md"),
      "---\nname: Overview\nsummary: Top file.\n---\n# Overview",
      "utf-8",
    );

    // Ambient default: depth 1, handles decidable.
    const ambient = await assembleContentAwareness({ position: tmp, lastSha: null });
    expect(ambient?.tree?.entries).toMatchObject([
      { name: "research", kind: "directory", markdownFiles: 3, summary: "EU landscape sweep." },
      { name: "overview.md", kind: "markdown", summary: "Top file." },
    ]);
    expect(ambient?.tree?.entries[0].children).toBeUndefined();

    // Probe depth 2: name-rung outline below, no summaries on children.
    const probed = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
      treeDepth: 2,
    });
    const research = probed?.tree?.entries[0];
    expect(research?.children).toMatchObject([
      { name: "deep", kind: "directory", markdownFiles: 1 },
      { name: "notes.md", kind: "markdown" },
    ]);
    expect(research?.children?.every((c) => c.summary === undefined)).toBe(true);

    const rendered = renderContentAwareness(probed!, { sections: ["tree"] });
    expect(rendered).toBe(
      [
        "Tree (4 files):",
        "  research/ (3) — EU landscape sweep.",
        "    deep/ (1)",
        "    notes.md",
        "  overview.md — Top file.",
      ].join("\n"),
    );
  });

  it("walks a contract-free content tree explicitly to full depth without the ambient cap", async () => {
    const deep = join(tmp, "alpha", "bravo", "charlie", "delta", "echo");
    await fs.mkdir(deep, { recursive: true });
    await fs.writeFile(
      join(tmp, "alpha", "README.md"),
      "---\nname: Alpha\nsummary: Alpha branch.\n---\n# Alpha",
      "utf-8",
    );
    await fs.writeFile(
      join(deep, "finding.md"),
      "---\nname: Finding\nsummary: Deep finding.\n---\n# Finding",
      "utf-8",
    );
    await fs.mkdir(join(tmp, "_assets"), { recursive: true });
    await fs.writeFile(join(tmp, "_assets", "hidden.md"), "# Hidden", "utf-8");
    await Promise.all(
      Array.from({ length: 51 }, (_, index) =>
        fs.writeFile(join(tmp, `top-${String(index).padStart(2, "0")}.md`), "", "utf-8"),
      ),
    );

    const full = await assembleContentTree({ position: tmp, depth: "full" });
    expect(full?.totalMarkdownFiles).toBe(53);
    expect(full?.entries).toHaveLength(52);
    expect(full?.omittedEntries).toBeUndefined();
    const alpha = full?.entries[0];
    expect(alpha).toMatchObject({
      name: "alpha",
      kind: "directory",
      markdownFiles: 2,
      summary: "Alpha branch.",
    });
    const finding = alpha?.children?.[0].children?.[0].children?.[0].children?.[0]
      .children?.[0];
    expect(finding).toMatchObject({
      name: "finding.md",
      kind: "markdown",
      summary: "Deep finding.",
    });

    const bounded = await assembleContentTree({ position: tmp, depth: 99 });
    const delta = bounded?.entries[0].children?.[0].children?.[0].children?.[0];
    expect(delta?.name).toBe("delta");
    expect(delta?.children).toBeUndefined();
  });

  it.skipIf(process.platform === "win32")(
    "fails an explicit tree walk rather than silently treating unreadable territory as empty",
    async () => {
      const locked = join(tmp, "locked");
      await fs.mkdir(locked);
      await fs.writeFile(join(locked, "hidden.md"), "# Hidden", "utf-8");
      await fs.chmod(locked, 0o000);
      try {
        await expect(
          assembleContentTree({ position: tmp, depth: "full" }),
        ).rejects.toThrow("Cannot count Content tree directory");
      } finally {
        await fs.chmod(locked, 0o700);
      }
    },
  );

  it("caps entries per directory with honest omitted counts", async () => {
    await writeAgent({ "foundation.md": "Foundation" });
    for (const name of ["a.md", "b.md", "c.md", "d.md"]) {
      await fs.writeFile(join(tmp, name), `# ${name}`, "utf-8");
    }
    const manifest = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
      treeMaxEntries: 2,
    });
    expect(manifest?.tree?.entries).toHaveLength(2);
    expect(manifest?.tree?.omittedEntries).toBe(2);
    expect(renderContentAwareness(manifest!, { sections: ["tree"] })).toBe(
      ["Tree (4 files):", "  a.md", "  b.md", "  … and 2 more"].join("\n"),
    );
  });

  it("surfaces a skill's description as its trigger and keeps README out of the roster", async () => {
    await writeAgent({ "foundation.md": "Foundation" });
    const skillsDir = join(tmp, "_agent", "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      join(skillsDir, "meeting-notes.md"),
      "---\nname: meeting-notes\ndescription: Turn a transcript into a decision-first record.\n---\n# Meeting notes\n\n1. Lead with decisions.",
      "utf-8",
    );
    await fs.writeFile(
      join(skillsDir, "review.md"),
      "---\nname: Review\nsummary: Verify behavior before claiming done.\n---\n# Review",
      "utf-8",
    );
    await fs.writeFile(
      join(skillsDir, "README.md"),
      "---\nname: Skills\nsummary: Convention marker, not an ability.\n---\n# Skills",
      "utf-8",
    );

    const manifest = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
    });

    // description (the trigger) wins; summary remains the fallback; README is
    // the folder's surface, never a roster entry.
    expect(manifest?.skills).toMatchObject([
      { name: "meeting-notes", summary: "Turn a transcript into a decision-first record." },
      { name: "review", summary: "Verify behavior before claiming done." },
    ]);
    expect(renderContentAwareness(manifest!, { sections: ["skills"] })).toBe(
      [
        "Operating skills:",
        "  meeting-notes — Turn a transcript into a decision-first record.",
        "  review — Verify behavior before claiming done.",
      ].join("\n"),
    );
  });

  it("discovers Agent Skills-style skill directories beside flat files", async () => {
    await writeAgent({ "foundation.md": "Foundation" });
    const skillsDir = join(tmp, "_agent", "skills");
    // Flat skill that a same-named directory form should shadow.
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      join(skillsDir, "review.md"),
      "---\nname: Review\ndescription: Flat review form.\n---\n# Review",
      "utf-8",
    );
    // Standard directory skill with an asset — copied in as users have it.
    await fs.mkdir(join(skillsDir, "pdf-report", "scripts"), { recursive: true });
    await fs.writeFile(
      join(skillsDir, "pdf-report", "SKILL.md"),
      "---\nname: pdf-report\ndescription: Render a PDF report from collected notes.\n---\n# PDF report",
      "utf-8",
    );
    await fs.writeFile(join(skillsDir, "pdf-report", "scripts", "render.sh"), "#!/bin/sh\n", "utf-8");
    // Directory form beats the flat file of the same name.
    await fs.mkdir(join(skillsDir, "review"), { recursive: true });
    await fs.writeFile(
      join(skillsDir, "review", "SKILL.md"),
      "---\nname: review\ndescription: Directory review form wins.\n---\n# Review",
      "utf-8",
    );
    // A plain asset folder without SKILL.md is not a skill. Nor is a directory
    // merely named SKILL.md — the entry point must be a regular file.
    await fs.mkdir(join(skillsDir, "notes"), { recursive: true });
    await fs.writeFile(join(skillsDir, "notes", "scratch.md"), "# scratch", "utf-8");
    await fs.mkdir(join(skillsDir, "broken", "SKILL.md"), { recursive: true });

    const manifest = await assembleContentAwareness({
      position: tmp,
      lastSha: null,
    });
    const canonicalTmp = await fs.realpath(tmp);

    expect(manifest?.skills).toMatchObject([
      {
        name: "pdf-report",
        path: join(canonicalTmp, "_agent", "skills", "pdf-report", "SKILL.md"),
        summary: "Render a PDF report from collected notes.",
      },
      {
        name: "review",
        path: join(canonicalTmp, "_agent", "skills", "review", "SKILL.md"),
        summary: "Directory review form wins.",
      },
    ]);
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
