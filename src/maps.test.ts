import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAP_DEPTHS,
  canonicalizeMapSpace,
  parseMap,
  type MapParseResult,
  type MapSpaceNormalization,
} from "./maps.js";

interface ParseVector {
  id: string;
  operation: "parse";
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
      case "canonicalize_space_cases":
        for (const input of vector.cases) {
          expect(canonicalizeMapSpace(input), String(input)).toEqual(vector.expected);
        }
        break;
    }
  });
});
