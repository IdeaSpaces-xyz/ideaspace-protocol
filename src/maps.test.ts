import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAP_DEPTHS,
  buildMap,
  parseCanonicalRepoUrl,
  type MapBuildInput,
  parseMap,
  type MapParseResult,
  type CanonicalRepoUrlParseResult,
} from "./maps.js";

interface ParseVector {
  id: string;
  operation: "parse" | "build";
  covers: string[];
  input?: unknown;
  expected: MapParseResult;
}

interface ParseRepoUrlCasesVector {
  id: string;
  operation: "parse_repo_url_cases";
  covers: string[];
  cases: unknown[];
  expected: CanonicalRepoUrlParseResult;
}

type MapVector = ParseVector | ParseRepoUrlCasesVector;

const manifest = JSON.parse(
  readFileSync(new URL("../conformance/maps/manifest.json", import.meta.url), "utf-8"),
) as {
  format: string;
  depths: string[];
  required_coverage: string[];
  vectors: MapVector[];
};

describe("Map primitives", () => {
  it("accepts HTTPS repo URLs and only loopback HTTP", () => {
    expect(parseCanonicalRepoUrl("https://ideaspaces.example/repos/n_0123456789abcdef01234567")).toEqual({
      status: "valid",
      repo: "https://ideaspaces.example/repos/n_0123456789abcdef01234567",
      rootNodeId: "n_0123456789abcdef01234567",
    });
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const repo = `http://${host}:3000/repos/n_0123456789abcdef01234567`;
      expect(parseCanonicalRepoUrl(repo)).toEqual({
        status: "valid",
        repo,
        rootNodeId: "n_0123456789abcdef01234567",
      });
    }
    expect(parseCanonicalRepoUrl("http://ideaspaces.example/repos/n_0123456789abcdef01234567")).toEqual({
      status: "invalid",
      code: "invalid_repo",
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
  const root = {
    repo: "https://ideaspaces.example/repos/n_0123456789abcdef01234567",
    sha: "a".repeat(40),
  };

  it("constructs an empty selection without claiming optional absence", () => {
    expect(buildMap({})).toEqual({ status: "valid", map: { roots: [], members: [] } });
    expect(buildMap(undefined as unknown as MapBuildInput)).toEqual({
      status: "invalid", issues: [{ path: "map", code: "invalid_map_type" }],
    });
    expect(parseMap(undefined)).toEqual({ status: "absent" });
  });

  it("does not mutate frozen inputs or change annotations into observations", () => {
    const member = Object.freeze({
      root: 0, position: "note.md", depth: "full" as const,
      summary: "Curator context", disclosure: Object.freeze({ name: "Observed name" }),
    });
    const input = Object.freeze({
      roots: Object.freeze([Object.freeze(root)]), members: Object.freeze([member]),
    });
    const result = buildMap(input);
    expect(root.repo).toBe("https://ideaspaces.example/repos/n_0123456789abcdef01234567");
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.map.members[0]).toEqual(member);
    expect(result.map.members[0]?.disclosure).not.toHaveProperty("summary");
    expect(parseMap(result.map)).toEqual(result);
  });

  it.each([null, [], "summary", 1])("rejects invalid position disclosure %j", (disclosure) => {
    const result = parseMap({ roots: [root], members: [
      { root: 0, position: "note.md", depth: "full", disclosure },
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
      { root: 0, position: "note.md", depth: "name", disclosure: { summary: "" } },
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
    expect(manifest.format).toBe("ideaspaces-maps/v2");
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
      case "parse_repo_url_cases":
        for (const input of vector.cases) {
          expect(parseCanonicalRepoUrl(input), String(input)).toEqual(vector.expected);
        }
        break;
    }
  });
});
