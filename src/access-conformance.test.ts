import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES, ACCESS_LEVELS, ACCESS_TARGET_KINDS, accessLevelProfile,
  expandCapabilities, intersectAccessCapabilities, canPassAccess, parseAccessGrant,
  mapLegacyCapability, isValidCapability, parseAccessOwnership, isActingSubjectKind,
  COMPANY_MEMBER_CAPABILITIES, copyOperationRequirements,
  type AccessTargetKind, type AccessLevel, type Capability,
} from "./access.js";
import * as maps from "./maps.js";
import * as protocol from "./index.js";

type Vector = { id: string; expected: unknown } & (
  | { operation: "level"; input: { target: AccessTargetKind; level: AccessLevel; context?: {companyVault?: boolean} } }
  | { operation: "expand"; input: Capability[] }
  | { operation: "pass"; input: { held: Capability[]; requested: Capability[] } }
  | { operation: "intersect"; input: { person: Capability[]; ceiling: Capability[] } }
  | { operation: "legacy"; input: { target: AccessTargetKind; name: string } }
  | { operation: "grant" | "ownership" | "acting_kind"; input: unknown }
  | { operation: "copy_requirements"; input: {target: AccessTargetKind; operation: "fork" | "pull"; hasClosedBranch?: boolean} }
);
const manifest = JSON.parse(readFileSync(new URL("../conformance/access/manifest.json", import.meta.url), "utf8")) as {
  company_member_capabilities: string[]; capabilities: string[]; levels: string[]; target_kinds: string[]; required_coverage: string[]; vectors: Vector[];
};

describe("portable access conformance", () => {
  it("has one vocabulary at the root and historical Maps entrypoint", () => {
    expect(manifest.capabilities).toEqual(CAPABILITIES);
    expect(manifest.company_member_capabilities).toEqual(COMPANY_MEMBER_CAPABILITIES);
    expect(manifest.levels).toEqual(ACCESS_LEVELS);
    expect(manifest.target_kinds).toEqual(ACCESS_TARGET_KINDS);
    expect(maps.CAPABILITIES).toBe(CAPABILITIES);
    expect(protocol.CAPABILITIES).toBe(CAPABILITIES);
    expect(maps.isValidCapability).toBe(isValidCapability);
    for (const old of ["read", "write", "push", "manage", "owner", "copy"]) {
      expect(isValidCapability(old)).toBe(false);
    }
    for (const cap of CAPABILITIES) expect(isValidCapability(cap)).toBe(true);
    expect(isValidCapability(null)).toBe(false);
  });

  it("covers every level on every target, including Open and inapplicable profiles", () => {
    for (const target of ACCESS_TARGET_KINDS) for (const level of ACCESS_LEVELS) {
      expect(manifest.vectors.some((v) => v.operation === "level" && v.input.target === target && v.input.level === level)).toBe(true);
    }
    expect(new Set(manifest.vectors.map((v) => v.id)).size).toBe(manifest.vectors.length);
  });

  for (const vector of manifest.vectors) it(vector.id, () => {
    const before = JSON.stringify(vector.input);
    let actual: unknown;
    switch (vector.operation) {
      case "level": actual = accessLevelProfile(vector.input.target, vector.input.level, vector.input.context); break;
      case "expand": actual = expandCapabilities(vector.input); break;
      case "pass": actual = canPassAccess(vector.input.held, vector.input.requested); break;
      case "intersect": actual = intersectAccessCapabilities(vector.input.person, vector.input.ceiling); break;
      case "legacy": actual = mapLegacyCapability(vector.input.target, vector.input.name); break;
      case "grant": actual = parseAccessGrant(vector.input); break;
      case "ownership": actual = parseAccessOwnership(vector.input); break;
      case "acting_kind": actual = isActingSubjectKind(vector.input); break;
      case "copy_requirements": actual = copyOperationRequirements(vector.input.target, vector.input.operation, vector.input.hasClosedBranch); break;
      default: throw new Error("Unknown conformance operation");
    }
    expect(actual).toEqual(vector.expected);
    expect(JSON.stringify(vector.input)).toBe(before);
  });

  it("version one needs no closed-branch walk", () => {
    expect(copyOperationRequirements("repo", "pull", null as unknown as boolean))
      .toEqual({ status: "applicable", history: "whole" });
  });

  it("obeys set laws for every possible canonical capability set", () => {
    const sets = Array.from({ length: 2 ** CAPABILITIES.length }, (_, mask) =>
      CAPABILITIES.filter((_, index) => mask & (1 << index)));
    for (const a of sets) {
      const closed = expandCapabilities(a);
      expect(expandCapabilities(closed)).toEqual(closed);
      expect(intersectAccessCapabilities(a, a)).toEqual(closed);
      for (const b of sets) {
        const overlap = intersectAccessCapabilities(a, b);
        expect(overlap).toEqual(intersectAccessCapabilities(b, a));
        expect(expandCapabilities(overlap)).toEqual(overlap);
        if (canPassAccess(a, b)) {
          expect(closed).toContain("reshare");
          expect(expandCapabilities(b).every((right) => closed.includes(right))).toBe(true);
        }
      }
    }
  });
});
