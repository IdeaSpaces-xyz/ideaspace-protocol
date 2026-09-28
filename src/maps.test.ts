import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAP_DEPTHS,
  SUBJECT_KINDS,
  CAPABILITY_LADDER,
  MAP_DISCLOSURE_CAPABILITY,
  REVISION_PATTERN,
  normalizeSubjectKind,
  isValidSubjectKind,
  isValidCapability,
  capabilityRank,
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

  it("accepts _threads extension positions while refusing _agent, _assets, and unknown extensions", () => {
    const validThreads = buildMap({
      roots: [root],
      members: [
        { root: 0, position: "_threads/2026-09-26-authorization/README.md", depth: "summary" },
        { root: 0, position: "_threads/2026-09-26-authorization/2026-09-26-01.md", depth: "full" },
      ],
    });
    expect(validThreads.status).toBe("valid");

    for (const invalidPos of [
      "_agent/agreement.md",
      "_assets/diagram.png",
      "_scratch/draft.md",
      "notes/_agent/guide.md",
      "notes/_assets/img.png",
      "_threads/_agent/agreement.md",
    ]) {
      const rejected = parseMap({
        roots: [root],
        members: [{ root: 0, position: invalidPos, depth: "summary" }],
      });
      expect(rejected.status).toBe("invalid");
      if (rejected.status === "invalid") {
        expect(rejected.issues[0]?.code).toBe("invalid_position");
      }
    }
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

  it("supports thread address with opaque latest-post revision", () => {
    const input = {
      members: [
        {
          address: "thread:x_0123456789abcdef01234567",
          depth: "summary" as const,
          name: "Thread title",
          revision: "n_0123456789abcdef01234567",
          disclosure: { name: "Observed thread", summary: "Latest activity" },
        },
      ],
    };
    const result = buildMap(input);
    expect(result).toEqual({
      status: "valid",
      map: {
        roots: [],
        members: [
          {
            address: "thread:x_0123456789abcdef01234567",
            depth: "summary",
            name: "Thread title",
            revision: "n_0123456789abcdef01234567",
            disclosure: { name: "Observed thread", summary: "Latest activity" },
          },
        ],
      },
    });
    if (result.status === "valid") {
      expect(parseMap(result.map)).toEqual(result);
    }
  });

  it.each([
    "invalid_hash",
    "x_0123456789abcdef01234567",
    "n_xyz",
    12345,
    null,
    {},
  ])("rejects invalid revision %j", (revision) => {
    const result = parseMap({
      members: [
        {
          address: "thread:x_0123456789abcdef01234567",
          revision,
        },
      ],
    });
    expect(result).toEqual({
      status: "invalid",
      issues: [
        {
          path: "map.members[0].revision",
          code: "invalid_revision",
        },
      ],
    });
  });

  it("matches valid revision patterns with REVISION_PATTERN", () => {
    expect(REVISION_PATTERN.test("n_0123456789abcdef01234567")).toBe(true);
    expect(REVISION_PATTERN.test("n_0123456789ab")).toBe(true);
    expect(REVISION_PATTERN.test("n_0123456789abcdef012345678")).toBe(false);
    expect(REVISION_PATTERN.test("x_0123456789abcdef01234567")).toBe(false);
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
    expect((manifest as any).subject_kinds).toEqual(SUBJECT_KINDS);
    expect((manifest as any).capability_ladder).toEqual(CAPABILITY_LADDER);
    expect((manifest as any).map_disclosure_capability).toBe(MAP_DISCLOSURE_CAPABILITY);
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

describe("Access vocabulary and capability ladder", () => {
  it("defines canonical subject kinds", () => {
    expect(SUBJECT_KINDS).toEqual(["person", "team", "organisation", "agent", "public"]);
  });

  it("defines the capability ladder in privilege order", () => {
    expect(CAPABILITY_LADDER).toEqual([
      "view",
      "read",
      "history",
      "copy",
      "write",
      "push",
      "manage",
    ]);
  });

  it("anchors Map disclosure to the view capability rung", () => {
    expect(MAP_DISCLOSURE_CAPABILITY).toBe("view");
    expect(capabilityRank(MAP_DISCLOSURE_CAPABILITY)).toBe(0);
  });

  it("normalizes subject kinds including organization alias", () => {
    expect(normalizeSubjectKind("person")).toBe("person");
    expect(normalizeSubjectKind("TEAM")).toBe("team");
    expect(normalizeSubjectKind("organisation")).toBe("organisation");
    expect(normalizeSubjectKind("organization")).toBe("organisation");
    expect(normalizeSubjectKind("  agent  ")).toBe("agent");
    expect(normalizeSubjectKind("public")).toBe("public");
    expect(normalizeSubjectKind("unknown")).toBeNull();
    expect(normalizeSubjectKind("")).toBeNull();
  });

  it("validates subject kinds and capabilities with type guards", () => {
    expect(isValidSubjectKind("person")).toBe(true);
    expect(isValidSubjectKind("team")).toBe(true);
    expect(isValidSubjectKind("organisation")).toBe(true);
    expect(isValidSubjectKind("agent")).toBe(true);
    expect(isValidSubjectKind("public")).toBe(true);
    expect(isValidSubjectKind("organization")).toBe(false); // alias normalized, not direct canonical
    expect(isValidSubjectKind("unknown")).toBe(false);
    expect(isValidSubjectKind(42)).toBe(false);

    for (const cap of CAPABILITY_LADDER) {
      expect(isValidCapability(cap)).toBe(true);
      expect(capabilityRank(cap)).toBeGreaterThanOrEqual(0);
    }
    expect(isValidCapability("admin")).toBe(false);
    expect(isValidCapability("delete")).toBe(false);
    expect(capabilityRank("unknown")).toBe(-1);
  });
});
