import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES, ACCESS_LEVELS, ACCESS_TARGET_KINDS, accessLevelProfile,
  expandCapabilities, intersectAccessCapabilities, canPassAccess, parseAccessGrant,
  mapLegacyCapability, isValidCapability,
  type AccessTargetKind, type AccessLevel, type Capability,
} from "./access.js";
import * as maps from "./maps.js";
import * as protocol from "./index.js";

type Vector = { id: string; expected: unknown } & (
  | { operation: "level"; input: { target: AccessTargetKind; level: AccessLevel } }
  | { operation: "expand"; input: Capability[] }
  | { operation: "pass"; input: { held: Capability[]; requested: Capability[] } }
  | { operation: "intersect"; input: { person: Capability[]; ceiling: Capability[] } }
  | { operation: "legacy"; input: { target: AccessTargetKind; name: string } }
  | { operation: "grant"; input: unknown }
);
const manifest = JSON.parse(readFileSync(new URL("../conformance/access/manifest.json", import.meta.url), "utf8")) as {
  capabilities: string[]; levels: string[]; target_kinds: string[]; required_coverage: string[]; vectors: Vector[];
};

describe("portable access conformance", () => {
  it("has one vocabulary at the root and historical Maps entrypoint", () => {
    expect(manifest.capabilities).toEqual(CAPABILITIES);
    expect(manifest.levels).toEqual(ACCESS_LEVELS);
    expect(manifest.target_kinds).toEqual(ACCESS_TARGET_KINDS);
    expect(maps.CAPABILITIES).toBe(CAPABILITIES);
    expect(protocol.CAPABILITIES).toBe(CAPABILITIES);
    expect(maps.isValidCapability).toBe(isValidCapability);
    for (const old of ["read", "history", "write", "push", "manage", "owner"]) {
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
      case "level": actual = accessLevelProfile(vector.input.target, vector.input.level); break;
      case "expand": actual = expandCapabilities(vector.input); break;
      case "pass": actual = canPassAccess(vector.input.held, vector.input.requested); break;
      case "intersect": actual = intersectAccessCapabilities(vector.input.person, vector.input.ceiling); break;
      case "legacy": actual = mapLegacyCapability(vector.input.target, vector.input.name); break;
      case "grant": actual = parseAccessGrant(vector.input); break;
      default: throw new Error("Unknown conformance operation");
    }
    expect(actual).toEqual(vector.expected);
    expect(JSON.stringify(vector.input)).toBe(before);
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
