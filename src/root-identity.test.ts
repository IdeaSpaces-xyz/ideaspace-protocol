import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateRootIdentity,
  isValidRootNodeId,
  mintRootNodeId,
  parseRootNodeId,
  rootNodeIdFromBytes,
} from "./root-identity.js";
import type { RootIdentityEvidence, RootIdentityEvaluation } from "./root-identity.js";

describe("root identity primitives", () => {
  it("accepts current and legacy reader forms without normalizing them", () => {
    expect(isValidRootNodeId("n_0123456789abcdef01234567")).toBe(true);
    expect(isValidRootNodeId("n_0123456789ab")).toBe(true);
    expect(parseRootNodeId("n_0123456789ab")).toEqual({
      status: "valid",
      rootNodeId: "n_0123456789ab",
      format: "legacy",
    });
  });

  it("treats only an omitted value as absent", () => {
    expect(parseRootNodeId(undefined)).toEqual({ status: "absent" });
    expect(parseRootNodeId(null)).toEqual({ status: "invalid", code: "invalid_type" });
    expect(parseRootNodeId("")).toEqual({ status: "invalid", code: "invalid_format" });
  });

  it("formats exactly 96 bits and rejects every other entropy length", () => {
    expect(rootNodeIdFromBytes(new Uint8Array(12).fill(0xab))).toBe(
      "n_abababababababababababab",
    );
    for (const length of [0, 6, 11, 13, 24]) {
      expect(() => rootNodeIdFromBytes(new Uint8Array(length))).toThrow(/exactly 12 bytes/);
    }
  });

  it("mints through an injected entropy boundary", () => {
    let requested = 0;
    const id = mintRootNodeId((length) => {
      requested = length;
      return Uint8Array.from({ length }, (_, index) => index);
    });
    expect(requested).toBe(12);
    expect(id).toBe("n_000102030405060708090a0b");
  });

  it("mints a valid current ID with the platform CSPRNG", () => {
    const parsed = parseRootNodeId(mintRootNodeId());
    expect(parsed.status).toBe("valid");
    if (parsed.status === "valid") expect(parsed.format).toBe("current");
  });

  it("never selects an identity from drift, ambiguity, or invalid evidence", () => {
    for (const result of [
      evaluateRootIdentity({
        declaration: "n_111111111111111111111111",
        canonicalOrigin: "n_222222222222222222222222",
      }),
      evaluateRootIdentity({
        canonicalOrigin: "n_111111111111111111111111",
        localRegistry: "n_222222222222222222222222",
      }),
      evaluateRootIdentity({ declaration: "invalid" }),
    ]) {
      expect(["drift", "ambiguous", "invalid"]).toContain(result.state);
      expect(result).not.toHaveProperty("rootNodeId");
    }
  });
});

interface ParseVector {
  id: string;
  operation: "parse";
  covers: string[];
  input?: unknown;
  expected: unknown;
}

interface ParseCasesVector {
  id: string;
  operation: "parse_cases";
  covers: string[];
  cases: unknown[];
  expected: unknown;
}

interface FromBytesVector {
  id: string;
  operation: "from_bytes";
  covers: string[];
  bytes_hex: string;
  expected: string;
}

interface FromBytesErrorVector {
  id: string;
  operation: "from_bytes_error";
  covers: string[];
  cases_hex: string[];
  error: "invalid_entropy_length";
}

interface EvaluateVector {
  id: string;
  operation: "evaluate";
  covers: string[];
  input: RootIdentityEvidence;
  expected: RootIdentityEvaluation;
}

type Vector = ParseVector | ParseCasesVector | FromBytesVector | FromBytesErrorVector | EvaluateVector;

const manifest = JSON.parse(
  readFileSync(new URL("../conformance/root-identity/manifest.json", import.meta.url), "utf-8"),
) as {
  format: string;
  required_coverage: string[];
  vectors: Vector[];
};

describe("root identity conformance manifest", () => {
  it("has the expected language-neutral format and complete declared coverage", () => {
    expect(manifest.format).toBe("ideaspaces-root-identity/v1");
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const requirement of manifest.required_coverage) {
      expect(covered.has(requirement), requirement).toBe(true);
    }
  });

  it.each(manifest.vectors)("executes $id", (vector) => {
    switch (vector.operation) {
      case "parse":
        expect(parseRootNodeId(vector.input)).toEqual(vector.expected);
        break;
      case "parse_cases":
        for (const input of vector.cases) {
          expect(parseRootNodeId(input), JSON.stringify(input)).toEqual(vector.expected);
        }
        break;
      case "from_bytes":
        expect(rootNodeIdFromBytes(Uint8Array.from(Buffer.from(vector.bytes_hex, "hex"))))
          .toBe(vector.expected);
        break;
      case "from_bytes_error":
        for (const value of vector.cases_hex) {
          expect(
            () => rootNodeIdFromBytes(Uint8Array.from(Buffer.from(value, "hex"))),
            value,
          ).toThrow(/exactly 12 bytes/);
        }
        break;
      case "evaluate":
        expect(evaluateRootIdentity(vector.input)).toEqual(vector.expected);
        break;
    }
  });
});
