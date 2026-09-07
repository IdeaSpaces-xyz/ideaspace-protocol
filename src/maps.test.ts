import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAP_DEPTHS,
  buildMap,
  canonicalizeMapSpace,
  type MapBuildInput,
  parseMap,
  type MapParseResult,
  type MapSpaceNormalization,
} from "./maps.js";

interface ParseVector {
  id: string;
  operation: "parse" | "build";
  covers: string[];
  input?: unknown;
  expected: MapParseResult;
}

interface CanonicalizeCasesVector {
  id: string;
  operation: "canonicalize_space_cases";
  covers: string[];
  cases: unknown[];
  expected: MapSpaceNormalization;
}

type MapVector = ParseVector | CanonicalizeCasesVector;

const manifest = JSON.parse(
  readFileSync(new URL("../conformance/maps/manifest.json", import.meta.url), "utf-8"),
) as {
  format: string;
  depths: string[];
  required_coverage: string[];
  vectors: MapVector[];
};

describe("Map primitives", () => {
  it("normalizes common remote syntax without carrying credentials or transport", () => {
    expect(canonicalizeMapSpace("https://person@git.example.com/Acme/research.git")).toEqual({
      status: "valid",
      space: "git.example.com/Acme/research",
    });
    expect(canonicalizeMapSpace("git.example.com:2222/Acme/research.git")).toEqual({
      status: "valid",
      space: "git.example.com:2222/Acme/research",
    });
    expect(canonicalizeMapSpace("file:///tmp/research")).toEqual({
      status: "invalid",
      code: "invalid_space",
    });
  });

  it("preserves unknown fields on a valid provisional block", () => {
    expect(parseMap({ legend_version: 2 })).toEqual({
      status: "valid",
      map: { legend_version: 2, roots: [], members: [] },
    });
  });

  it("does not turn one invalid Map projection into a partial Map", () => {
    const result = parseMap({
      members: [{ address: "https://example.com", depth: "full" }],
    });
    expect(result.status).toBe("invalid");
    expect(result).not.toHaveProperty("map");
  });
});

describe("Map construction and disclosure", () => {
  const root = { space: "https://git.example.com/team/repo.git", sha: "a".repeat(40) };

  it("constructs an empty selection without claiming optional absence", () => {
    expect(buildMap({})).toEqual({ status: "valid", map: { roots: [], members: [] } });
    expect(buildMap(undefined as unknown as MapBuildInput)).toEqual({
      status: "invalid", issues: [{ path: "map", code: "invalid_map_type" }],
    });
    expect(parseMap(undefined)).toEqual({ status: "absent" });
  });

  it("does not mutate frozen inputs or change annotations into observations", () => {
    const member = Object.freeze({
      space: 0, position: "note.md", depth: "full" as const,
      summary: "Curator context", disclosure: Object.freeze({ name: "Observed name" }),
    });
    const input = Object.freeze({
      roots: Object.freeze([Object.freeze(root)]), members: Object.freeze([member]),
    });
    const result = buildMap(input);
    expect(root.space).toBe("https://git.example.com/team/repo.git");
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.map.members[0]).toEqual(member);
    expect(result.map.members[0]?.disclosure).not.toHaveProperty("summary");
    expect(parseMap(result.map)).toEqual(result);
  });

  it.each([null, [], "summary", 1])("rejects invalid position disclosure %j", (disclosure) => {
    const result = parseMap({ roots: [root], members: [
      { space: 0, position: "note.md", depth: "full", disclosure },
    ] });
    expect(result).toEqual({ status: "invalid", issues: [
      { path: "map.members[0].disclosure", code: "invalid_disclosure" },
    ] });
  });

  it("rejects malformed observed fields without returning a partial Map", () => {
    expect(parseMap({ members: [{ address: "custom:item", disclosure: { name: null, summary: [] } }] })).toEqual({
      status: "invalid", issues: [
        { path: "map.members[0].disclosure.name", code: "invalid_name" },
        { path: "map.members[0].disclosure.summary", code: "invalid_summary" },
      ],
    });
  });

  it("enforces a position's name ceiling, not just an external address ceiling", () => {
    expect(parseMap({ roots: [root], members: [
      { space: 0, position: "note.md", depth: "name", disclosure: { summary: "" } },
    ] })).toEqual({ status: "invalid", issues: [
      { path: "map.members[0].disclosure.summary", code: "disclosure_exceeds_depth" },
    ] });
  });

  it("preserves independent curator disclosure and supports partial observations", () => {
    const input = { members: [
      { address: "custom:item", depth: "name" as const, summary: "Curator-authored", disclosure: {} },
      { address: "custom:other", disclosure: { summary: "Observed summary" } },
    ] };
    expect(buildMap(input)).toEqual({ status: "valid", map: { ...input, roots: [] } });
  });

  it("does not pretend parse/build acceptance removes private runtime fields", () => {
    const input = { roots: [{ ...root, local_path: "/private/checkout", custom_root: true }] };
    const result = buildMap(input);
    expect(result.status).toBe("valid");
    if (result.status === "valid") expect(result.map.roots[0]).toMatchObject({
      local_path: "/private/checkout", custom_root: true,
    });
  });
});

describe("Map conformance manifest", () => {
  it("has the expected language-neutral format and complete declared coverage", () => {
    expect(manifest.format).toBe("ideaspaces-maps/v1");
    expect(manifest.depths).toEqual(MAP_DEPTHS);
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const requirement of manifest.required_coverage) {
      expect(covered.has(requirement), requirement).toBe(true);
    }
  });

  it.each(manifest.vectors)("executes $id", (vector) => {
    switch (vector.operation) {
      case "parse":
        expect(parseMap(vector.input)).toEqual(vector.expected);
        break;
      case "build": {
        const result = buildMap(vector.input as MapBuildInput);
        expect(result).toEqual(vector.expected);
        // Parse-only implementations execute these inputs through their parser.
        expect(parseMap(vector.input)).toEqual(vector.expected);
        if (result.status === "valid") expect(parseMap(result.map)).toEqual(result);
        break;
      }
      case "canonicalize_space_cases":
        for (const input of vector.cases) {
          expect(canonicalizeMapSpace(input), String(input)).toEqual(vector.expected);
        }
        break;
    }
  });
});
