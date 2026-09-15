import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assembleContentAwareness,
  assembleContentFocus,
  renderContentAwareness,
  renderContentFocus,
  type AssembleContentAwarenessOpts,
  type ContentAwarenessManifest,
  type ContentFocusManifest,
  type ContentFocusTreeEntry,
} from "./awareness.js";

interface VectorFiles {
  id: string;
  contract_source?: "foundation" | "agreement";
  files: Record<string, string>;
  directories?: string[];
  symlinks?: Record<string, string>;
  git_commits?: Array<{
    message: string;
    files: Record<string, string>;
  }>;
  last_sha_commit?: number;
  covers: string[];
}

interface Vector extends VectorFiles {
  expected: {
    status: string;
    contract_source?: "foundation" | "agreement" | null;
    representations?: string[];
    excluded?: string;
    issue_codes?: string[];
    render_fixture?: string;
    placement_render_fixtures?: {
      head: string;
      tail: string;
    };
  };
}

interface FocusVector extends VectorFiles {
  expected: {
    status: string;
    kind?: "content-focus";
    contract_source?: "foundation" | "agreement" | null;
    contract_role?: "reference";
    representations?: string[];
    excluded?: string;
    issue_codes?: string[];
    contract_count?: number;
    skill_count?: number;
    render_fixture?: string;
  };
}

const manifestPath = fileURLToPath(
  new URL("../conformance/awareness/manifest.json", import.meta.url),
);
const kit = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
  format: string;
  required_coverage: string[];
  focus_required_coverage: string[];
  vectors: Vector[];
  focus_vectors: FocusVector[];
};
const made: string[] = [];

afterEach(async () => {
  await Promise.all(made.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })));
});

async function writeVectorFiles(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await fs.mkdir(join(absolute, ".."), { recursive: true });
    await fs.writeFile(absolute, content, "utf-8");
  }
}

function hasGit(): boolean {
  return spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function materialize(
  vector: VectorFiles,
): Promise<{ root: string; lastSha?: string }> {
  const created = await mkdtemp(join(tmpdir(), "awareness-vector-"));
  made.push(created);
  await writeVectorFiles(created, vector.files);
  for (const path of vector.directories ?? []) {
    await fs.mkdir(join(created, path), { recursive: true });
  }
  for (const [path, target] of Object.entries(vector.symlinks ?? {})) {
    const absolute = join(created, path);
    await fs.mkdir(join(absolute, ".."), { recursive: true });
    await fs.symlink(target, absolute);
  }

  const revisions: string[] = [];
  if (vector.git_commits?.length) {
    git(created, ["init", "-q", "-b", "main"]);
    git(created, ["config", "user.email", "conformance@example.com"]);
    git(created, ["config", "user.name", "Conformance"]);
    for (const commit of vector.git_commits) {
      await writeVectorFiles(created, commit.files);
      git(created, ["add", "."]);
      git(created, ["commit", "-q", "-m", commit.message]);
      revisions.push(git(created, ["rev-parse", "HEAD"]));
    }
  }

  const root = await fs.realpath(created);
  const baseline = vector.last_sha_commit;
  return {
    root,
    ...(baseline === undefined ? {} : { lastSha: revisions[baseline] }),
  };
}

async function readRenderFixture(name: string, root: string): Promise<string> {
  return (
    await fs.readFile(join(manifestPath, "..", name), "utf-8")
  ).trimEnd().replaceAll("$ROOT", root);
}

describe("Content awareness conformance manifest", () => {
  it("covers every required behavior", () => {
    const covered = new Set(kit.vectors.flatMap((vector) => vector.covers));
    const focusCovered = new Set(kit.focus_vectors.flatMap((vector) => vector.covers));
    expect(kit.format).toBe("ideaspaces-content-awareness/v1");
    for (const required of kit.required_coverage) expect(covered.has(required)).toBe(true);
    for (const required of kit.focus_required_coverage) {
      expect(focusCovered.has(required)).toBe(true);
    }
  });

  for (const vector of kit.vectors) {
    it(vector.id, async () => {
      if (vector.git_commits?.length && !hasGit()) return;
      const { root, lastSha } = await materialize(vector);
      const opts: AssembleContentAwarenessOpts = {
        position: root,
        lastSha: lastSha ?? null,
        ...(vector.contract_source ? { contractSource: vector.contract_source } : {}),
      };
      const result = await assembleContentAwareness(opts);
      expect(result?.status).toBe(vector.expected.status);
      if (!result || result.status !== "ok") {
        if (result?.status === "contract_invalid" && vector.expected.issue_codes) {
          expect(result.issues?.map((issue) => issue.code)).toEqual(
            vector.expected.issue_codes,
          );
        }
        return;
      }

      expect(result.contractSource).toBe(vector.expected.contract_source);
      if (vector.expected.representations) {
        expect(result.contract.map((entry) => entry.representation)).toEqual(
          vector.expected.representations,
        );
      }
      if (vector.expected.excluded) {
        expect(JSON.stringify(result)).not.toContain(vector.expected.excluded);
      }
      if (vector.expected.render_fixture) {
        expect(renderContentAwareness(result)).toBe(
          await readRenderFixture(vector.expected.render_fixture, root),
        );
      }
      if (vector.expected.placement_render_fixtures) {
        const head = renderContentAwareness(result, { placement: "head" });
        const tail = renderContentAwareness(result, { placement: "tail" });
        expect(head).toBe(
          await readRenderFixture(vector.expected.placement_render_fixtures.head, root),
        );
        expect(tail).toBe(
          await readRenderFixture(vector.expected.placement_render_fixtures.tail, root),
        );
        expect(renderContentAwareness(result)).toBe(`${head}\n\n${tail}`);
      }
      expectExactRevisionsAndPlacements(result);
    });
  }

  for (const vector of kit.focus_vectors) {
    it(`focus: ${vector.id}`, async () => {
      const { root } = await materialize(vector);
      const result = await assembleContentFocus({
        position: root,
        ...(vector.contract_source ? { contractSource: vector.contract_source } : {}),
      });
      expect(result?.status).toBe(vector.expected.status);
      expect(result?.kind).toBe(vector.expected.kind);
      if (!result || result.status !== "ok") {
        if (result?.status === "contract_invalid" && vector.expected.issue_codes) {
          expect(result.issues?.map((issue) => issue.code)).toEqual(
            vector.expected.issue_codes,
          );
        }
        return;
      }

      expect(result.contractSource).toBe(vector.expected.contract_source);
      expect(result.contractRole).toBe(vector.expected.contract_role);
      if (vector.expected.representations) {
        expect(result.contract.map((entry) => entry.representation)).toEqual(
          vector.expected.representations,
        );
      }
      if (vector.expected.excluded) {
        expect(JSON.stringify(result)).not.toContain(vector.expected.excluded);
      }
      if (vector.expected.contract_count !== undefined) {
        expect(result.contract).toHaveLength(vector.expected.contract_count);
      }
      if (vector.expected.skill_count !== undefined) {
        expect(result.skills).toHaveLength(vector.expected.skill_count);
      }
      expectFocusPlacements(result);
      if (vector.expected.render_fixture) {
        const expected = await readRenderFixture(
          vector.expected.render_fixture,
          root,
        );
        expect(renderContentFocus(result)).toBe(expected);
        const repeated = await assembleContentFocus({ position: root });
        expect(repeated?.status).toBe("ok");
        expect(renderContentFocus(repeated!)).toBe(expected);
      }
    });
  }

  it("loads the public Agreement fixture and its three skills", async () => {
    const root = fileURLToPath(
      new URL("../conformance/reference-agreement", import.meta.url),
    );
    const result = await assembleContentAwareness({
      position: root,
      contractSource: "agreement",
      lastSha: null,
    });
    expect(result?.status).toBe("ok");
    if (!result || result.status !== "ok") return;

    expect(result.contract).toMatchObject([
      { name: "agreement", representation: "full" },
      { name: "purpose", representation: "full" },
    ]);
    expect(result.contract[0]?.content).toContain("AGREEMENT_FULL_SENTINEL");
    expect(result.contract[1]?.content).toContain("DECLARED_FULL_SENTINEL");
    expect(result.skills.map((skill) => skill.name)).toEqual([
      "ask",
      "close-context",
      "reach-agreement",
    ]);
  });
});

function expectFocusPlacements(result: ContentFocusManifest): void {
  expect(result.position.placement).toBe("history");
  if (result.tree) {
    expect(result.tree.placement).toBe("history");
    expectTreeHistory(result.tree.entries);
  }
  for (const entry of result.contract) expect(entry.placement).toBe("history");
  for (const skill of result.skills) expect(skill.placement).toBe("history");
}

function expectTreeHistory(entries: ContentFocusTreeEntry[]): void {
  for (const entry of entries) {
    expect(entry.placement).toBe("history");
    expectTreeHistory(entry.children ?? []);
  }
}

function expectExactRevisionsAndPlacements(result: ContentAwarenessManifest): void {
  for (const entry of result.contract) {
    expect(entry.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(entry.placement).toBe("head");
  }
  for (const skill of result.skills) expect(skill.placement).toBe("head");
  expect(result.position.placement).toBe("head");
  if (result.tree) expect(result.tree.placement).toBe("head");
  if (result.activity) expect(result.activity.placement).toBe("tail");
  if (result.git) expect(result.git.placement).toBe("tail");
  for (const signal of result.staleDocs) expect(signal.placement).toBe("tail");
}
