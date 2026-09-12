import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assembleContentAwareness,
  type AssembleContentAwarenessOpts,
  type ContentAwarenessManifest,
} from "./awareness.js";

interface Vector {
  id: string;
  contract_source?: "foundation" | "agreement";
  files: Record<string, string>;
  covers: string[];
  expected: {
    status: string;
    contract_source?: "foundation" | "agreement" | null;
    representations?: string[];
    excluded?: string;
  };
}

const manifestPath = fileURLToPath(
  new URL("../conformance/awareness/manifest.json", import.meta.url),
);
const kit = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
  format: string;
  required_coverage: string[];
  vectors: Vector[];
};
const made: string[] = [];

afterEach(async () => {
  await Promise.all(made.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })));
});

async function materialize(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "awareness-vector-"));
  made.push(root);
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await fs.mkdir(join(absolute, ".."), { recursive: true });
    await fs.writeFile(absolute, content, "utf-8");
  }
  return fs.realpath(root);
}

describe("Content awareness conformance manifest", () => {
  it("covers every required behavior", () => {
    const covered = new Set(kit.vectors.flatMap((vector) => vector.covers));
    expect(kit.format).toBe("ideaspaces-content-awareness/v1");
    for (const required of kit.required_coverage) expect(covered.has(required)).toBe(true);
  });

  for (const vector of kit.vectors) {
    it(vector.id, async () => {
      const root = await materialize(vector.files);
      const opts: AssembleContentAwarenessOpts = {
        position: root,
        lastSha: null,
        ...(vector.contract_source ? { contractSource: vector.contract_source } : {}),
      };
      const result = await assembleContentAwareness(opts);
      expect(result?.status).toBe(vector.expected.status);
      if (!result || result.status !== "ok") return;

      expect(result.contractSource).toBe(vector.expected.contract_source);
      if (vector.expected.representations) {
        expect(result.contract.map((entry) => entry.representation)).toEqual(
          vector.expected.representations,
        );
      }
      if (vector.expected.excluded) {
        expect(JSON.stringify(result)).not.toContain(vector.expected.excluded);
      }
      expectExactRevisionsAndPlacements(result);
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
