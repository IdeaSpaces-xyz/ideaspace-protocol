import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleContentLook,
  renderContentLook,
  type ContentLookManifest,
} from "./content-look.js";
import type { ContractSource } from "./agreement.js";
import type { MapDepth } from "./maps.js";

interface LookVector {
  id: string;
  target: string;
  depth: MapDepth;
  contract_source?: ContractSource;
  max_children?: number;
  covers: string[];
  expected: {
    status: "ok" | "absent" | "contract_choice_required";
    kind?: "markdown" | "directory";
    position?: string;
    name?: string;
    summary?: string;
    surface?: string;
    revision?: string;
    child_names?: string[];
    omitted_children?: number;
    absent?: string[];
    render_fixture?: string;
  };
}

interface LookManifest {
  format: string;
  fixture: string;
  required_coverage: string[];
  vectors: LookVector[];
}

const here = dirname(fileURLToPath(import.meta.url));
const conformanceRoot = join(here, "..", "conformance", "content-look");
const manifest = JSON.parse(
  await fs.readFile(join(conformanceRoot, "manifest.json"), "utf-8"),
) as LookManifest;

let tmp: string;
let fixtureRoot: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "is-look-conformance-"));
  const source = join(conformanceRoot, manifest.fixture);
  fixtureRoot = join(tmp, "fixture");
  await fs.cp(source, fixtureRoot, { recursive: true });
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("Content look conformance vectors", () => {
  it("declare every required behavior", () => {
    expect(manifest.format).toBe("ideaspaces-content-look/v1");
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const required of manifest.required_coverage) expect(covered.has(required)).toBe(true);
  });

  for (const vector of manifest.vectors) {
    it(vector.id, async () => {
      const result = await assembleContentLook({
        position: join(fixtureRoot, vector.target),
        depth: vector.depth,
        ...(vector.contract_source ? { contractSource: vector.contract_source } : {}),
        ...(vector.max_children !== undefined ? { maxChildren: vector.max_children } : {}),
      });

      if (vector.expected.status === "absent") {
        expect(result).toBeNull();
        return;
      }
      expect(result?.status).toBe(vector.expected.status);
      if (!result || result.status !== "ok") return;

      expect(result.kind).toBe("content-look");
      expect(result.contractRole).toBe("reference");
      expect(result.reference.tree).toBeNull();
      expect(result.reference.contract.every((entry) => entry.placement === "history")).toBe(true);
      expect(result.target).toMatchObject({
        placement: "history",
        kind: vector.expected.kind,
        position: vector.expected.position,
        depth: vector.depth,
        name: vector.expected.name,
        member: {
          position: vector.expected.position,
          depth: vector.depth,
        },
      });
      expect("root" in result.target.member).toBe(false);
      if (vector.depth === "name") {
        expect(result.target.member.disclosure).toEqual({ name: vector.expected.name });
      }
      if (vector.expected.summary !== undefined) {
        expect(result.target.summary).toBe(vector.expected.summary);
      }
      if (vector.expected.surface !== undefined) {
        expect(result.target.surface).toBe(vector.expected.surface);
      }
      if (vector.expected.revision !== undefined) {
        expect(result.target.revision).toBe(vector.expected.revision);
      }
      if (vector.expected.child_names) {
        expect(result.target.children?.map((child) => child.name)).toEqual(vector.expected.child_names);
      }
      if (vector.expected.omitted_children !== undefined) {
        expect(result.target.omittedChildren).toBe(vector.expected.omitted_children);
      }
      for (const absent of vector.expected.absent ?? []) {
        expect(result.target).not.toHaveProperty(absent);
      }
      if (vector.expected.render_fixture) {
        const expected = await fs.readFile(
          join(conformanceRoot, vector.expected.render_fixture),
          "utf-8",
        );
        const rendered = renderContentLook(result);
        expect(rendered).toBe(expected.trimEnd());
        expect(renderContentLook(result)).toBe(rendered);
        expect(rendered).toContain("LOOK_AGREEMENT_SENTINEL");
        expect(rendered).not.toContain("LOOK_FOUNDATION_SENTINEL");
      }
    });
  }

  it("declares Note full as the same representation revision as surface", async () => {
    const surface = await readOk("notes/decision.md", "surface");
    const full = await readOk("notes/decision.md", "full");
    expect(full.target.surface).toBe(surface.target.surface);
    expect(full.target.revision).toBe(surface.target.revision);
  });
});

async function readOk(target: string, depth: MapDepth): Promise<ContentLookManifest> {
  const result = await assembleContentLook({
    position: join(fixtureRoot, target),
    depth,
    contractSource: "agreement",
  });
  if (!result || result.status !== "ok") throw new Error("expected successful Content look");
  return result;
}
