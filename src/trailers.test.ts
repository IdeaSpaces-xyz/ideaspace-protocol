import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  isValidChangeId,
  slugify,
  formatChangeId,
  mintChangeId,
  changeIdGrep,
  parseTrailers,
  buildTrailers,
  appendTrailers,
} from "./trailers.js";
import type { Trailers } from "./trailers.js";

describe("isValidChangeId", () => {
  it("accepts slug+suffix, suffix-only, and single tokens", () => {
    expect(isValidChangeId("chg_token-bucket-a3f9")).toBe(true);
    expect(isValidChangeId("chg_a3f9")).toBe(true);
    expect(isValidChangeId("chg_x")).toBe(true);
  });

  it("rejects empty, dangling hyphens, doubles, underscores, and uppercase", () => {
    for (const bad of ["", "chg_", "chg_-a", "chg_a-", "chg_a--b", "chg_a_b", "Chg_x", "chg_UP", "token-bucket"]) {
      expect(isValidChangeId(bad)).toBe(false);
    }
  });
});

describe("slugify", () => {
  it("lowercases, collapses non-alphanumerics, trims edges", () => {
    expect(slugify("Token Bucket Rate Limiting")).toBe("token-bucket-rate-limiting");
    expect(slugify("  Weird__Chars!! ")).toBe("weird-chars");
    expect(slugify("trailing---dashes--")).toBe("trailing-dashes");
    expect(slugify("")).toBe("");
  });
});

describe("formatChangeId", () => {
  it("assembles a valid id and normalizes slug + suffix", () => {
    expect(formatChangeId("token bucket", "a3f9")).toBe("chg_token-bucket-a3f9");
    expect(formatChangeId("Token Bucket", "A3F9")).toBe("chg_token-bucket-a3f9");
  });

  it("drops an empty slug to a suffix-only id", () => {
    expect(formatChangeId("", "a3f9")).toBe("chg_a3f9");
  });

  it("throws on a non-alphanumeric suffix", () => {
    expect(() => formatChangeId("x", "a-b")).toThrow();
  });
});

describe("mintChangeId", () => {
  it("uses an injected rng deterministically", () => {
    expect(mintChangeId("Token Bucket", () => "a3f9")).toBe("chg_token-bucket-a3f9");
  });

  it("produces a valid id with the default CSPRNG suffix", () => {
    const id = mintChangeId("some decision");
    expect(isValidChangeId(id)).toBe(true);
    expect(id.startsWith("chg_some-decision-")).toBe(true);
  });
});

describe("changeIdGrep", () => {
  it("returns the git-log grep pattern", () => {
    expect(changeIdGrep("chg_x")).toBe("Change-Id: chg_x");
  });
});

describe("buildTrailers", () => {
  it("throws on an invalid Change-Id", () => {
    expect(() => buildTrailers({ changeId: "nope" })).toThrow(/invalid Change-Id/);
  });

  it("emits nothing for an empty set", () => {
    expect(buildTrailers({})).toBe("");
  });
});

describe("appendTrailers", () => {
  it("is a no-op when there is nothing new to add", () => {
    const msg = "S\n\nOp: update";
    expect(appendTrailers(msg, {})).toBe(msg);
  });

  it("throws on a single-valued conflict", () => {
    expect(() => appendTrailers("S\n\nOp: update", { op: "delete" })).toThrow(/conflict/);
  });

  it("preserves unknown existing trailers verbatim", () => {
    const out = appendTrailers("S\n\nSigned-off-by: X <x@y>", { changeId: "chg_z" });
    expect(out).toBe("S\n\nSigned-off-by: X <x@y>\nChange-Id: chg_z");
  });
});

// ── Shared conformance vectors ───────────────────────────────────────────────
// The same file a non-TS implementation (e.g. a Python one) loads and must
// satisfy. Read at runtime — not imported — so it stays language-neutral.

const vectors = JSON.parse(
  readFileSync(new URL("../conformance/trailers-vectors.json", import.meta.url), "utf-8"),
) as {
  changeId: { valid: string[]; invalid: string[] };
  slugify: { in: string; out: string }[];
  formatChangeId: { slug: string; suffix: string; out: string }[];
  parse: { name: string; message: string; expected: Record<string, unknown> }[];
  build: { name: string; trailers: Record<string, unknown>; expected: string }[];
  roundTrip: Record<string, unknown>[];
  append: { name: string; message: string; add: Record<string, unknown>; expected: string }[];
  appendConflicts: { name: string; message: string; add: Record<string, unknown> }[];
};

describe("conformance vectors", () => {
  it("Change-Id valid/invalid", () => {
    for (const id of vectors.changeId.valid) expect(isValidChangeId(id), id).toBe(true);
    for (const id of vectors.changeId.invalid) expect(isValidChangeId(id), id).toBe(false);
  });

  it.each(vectors.slugify)("slugify $in", ({ in: input, out }) => {
    expect(slugify(input)).toBe(out);
  });

  it.each(vectors.formatChangeId)("formatChangeId $slug/$suffix", ({ slug, suffix, out }) => {
    expect(formatChangeId(slug, suffix)).toBe(out);
  });

  it.each(vectors.parse)("parse: $name", ({ message, expected }) => {
    expect(parseTrailers(message)).toEqual(expected);
  });

  it.each(vectors.build)("build: $name", ({ trailers, expected }) => {
    expect(buildTrailers(trailers as Trailers)).toBe(expected);
  });

  it.each(vectors.roundTrip.map((t, i) => ({ i, t })))("roundTrip #$i", ({ t }) => {
    expect(parseTrailers(buildTrailers(t as Trailers))).toEqual(t);
  });

  it.each(vectors.append)("append: $name", ({ message, add, expected }) => {
    expect(appendTrailers(message, add as Trailers)).toBe(expected);
  });

  it.each(vectors.appendConflicts)("append conflict: $name", ({ message, add }) => {
    expect(() => appendTrailers(message, add as Trailers)).toThrow();
  });
});
