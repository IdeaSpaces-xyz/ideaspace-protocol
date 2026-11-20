import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ABOUT_POSITION_TYPES,
  aboutMaps,
  parseAbout,
  sameEntity,
  type AboutContext,
  type AboutMapCarrier,
} from "./map-about.js";
import { parseFrontmatter } from "./frontmatter.js";
import { checkVerbAnswer, SAID_FORBIDDEN_WORDS, type VerbAnswer } from "./verbs.js";

interface ParseAboutVector {
  id: string; operation: "parse_about"; covers: string[]; input: unknown; expected: ReturnType<typeof parseAbout>;
}
interface SameEntityVector {
  id: string; operation: "same_entity"; covers: string[]; a: string; b: string; context?: AboutContext; expected: boolean;
}
interface AboutMapsVector {
  id: string; operation: "about_maps"; covers: string[]; entity: string; carriers: string; context?: AboutContext;
  expected: ReturnType<typeof aboutMaps>;
}
type AboutVector = ParseAboutVector | SameEntityVector | AboutMapsVector;

const mapsManifest = JSON.parse(
  readFileSync(new URL("../conformance/maps/manifest.json", import.meta.url), "utf-8"),
) as { about_vectors: string };

const manifest = JSON.parse(
  readFileSync(new URL(`../conformance/maps/${mapsManifest.about_vectors}`, import.meta.url), "utf-8"),
) as {
  format: string;
  schema: string;
  position_types: string[];
  required_coverage: string[];
  carrier_sets: Record<string, AboutMapCarrier[]>;
  vectors: AboutVector[];
};

describe("Map about vectors", () => {
  it("are pointed at from the Maps manifest and declare every required behavior", () => {
    expect(mapsManifest.about_vectors).toBe("about.json");
    expect(manifest.format).toBe("ideaspaces-map-about/v1");
    expect(manifest.schema).toBe("../../schema/map-about.md");
    expect(manifest.position_types).toEqual([...ABOUT_POSITION_TYPES]);
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const tag of manifest.required_coverage) expect(covered.has(tag), tag).toBe(true);
    for (const vector of manifest.vectors) for (const tag of vector.covers) expect(manifest.required_coverage).toContain(tag);
  });

  for (const vector of manifest.vectors) {
    it(vector.id, () => {
      if (vector.operation === "parse_about") {
        expect(parseAbout(vector.input)).toEqual(vector.expected);
      } else if (vector.operation === "same_entity") {
        expect(sameEntity(vector.a, vector.b, vector.context)).toBe(vector.expected);
        expect(sameEntity(vector.b, vector.a, vector.context)).toBe(vector.expected);
      } else {
        const carriers = manifest.carrier_sets[vector.carriers];
        expect(carriers, `carrier set ${vector.carriers}`).toBeDefined();
        const frozen = carriers!.map((carrier) => Object.freeze({ ...carrier }));
        expect(aboutMaps(vector.entity, frozen, vector.context)).toEqual(vector.expected);
      }
    });
  }
});

describe("parseAbout over a real Note", () => {
  it("reads about from frontmatter text and keeps the raw link", () => {
    const fm = parseFrontmatter("---\nname: Legend\nabout:\n  - note:@n_0123456789abcdef01234567//ideas/x.md\n---\n# Legend\n");
    expect(parseAbout(fm)).toEqual({
      status: "valid", source: "about", warnings: [],
      links: [{ kind: "note", value: "@n_0123456789abcdef01234567//ideas/x.md", raw: "note:@n_0123456789abcdef01234567//ideas/x.md" }],
    });
  });

  it("treats a non-object as about nothing, without a warning", () => {
    expect(parseAbout(null)).toEqual({ status: "absent", warnings: [] });
    expect(parseAbout(["about"])).toEqual({ status: "absent", warnings: [] });
  });
});

describe("aboutMaps", () => {
  const root = "n_0123456789abcdef01234567";
  it("does not mutate its carriers and never fabricates a hit from a member", () => {
    const carriers = Object.freeze([
      Object.freeze({ position: "a.md", frontmatter: Object.freeze({ map: Object.freeze({ roots: [{ root_node_id: root }], members: [{ root: 0, position: "b.md" }] }) }) }),
    ]);
    const result = aboutMaps(`note:@${root}//b.md`, carriers, { rootNodeId: root });
    expect(result).toEqual({ status: "ok", entity: `note:@${root}//b.md`, hits: [], skipped: [] });
  });

  it("treats a Thread as beside-only: its own Map comes from its posts", () => {
    const carriers = [{ position: "_threads/t/README.md", frontmatter: { map: { roots: [], members: [] } } }];
    const result = aboutMaps(`thread:@${root}//_threads/t`, carriers, { rootNodeId: root });
    expect(result).toEqual({ status: "ok", entity: `thread:@${root}//_threads/t`, hits: [], skipped: [] });
  });

  it("matches the repository root only when the reader knows its identity", () => {
    const carriers = [{ position: "README.md", frontmatter: { map: { roots: [], members: [] } } }];
    expect(aboutMaps(`repo:${root}`, carriers)).toEqual({ status: "ok", entity: `repo:${root}`, hits: [], skipped: [] });
    expect(aboutMaps(`repo:${root}`, carriers, { rootNodeId: root }).status).toBe("ok");
    expect((aboutMaps(`repo:${root}`, carriers, { rootNodeId: root }) as { hits: unknown[] }).hits).toHaveLength(1);
  });
});

describe("a Map about anything: AX's words pass the said check", () => {
  const page = readFileSync(new URL("../schema/map-about.md", import.meta.url), "utf-8");
  const section = page.slice(page.indexOf("### The words"), page.indexOf("## What it does not do yet"));
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("| `") || line.startsWith("| any"))
    .map((line) => line.split(" | ").map((cell) => cell.replace(/^\| ?| ?\|$/g, "").trim()));

  it("fills every cell, and each sentence has no forbidden word, hash or command", () => {
    expect(rows.length).toBe(12);
    for (const row of rows) {
      expect(row).toHaveLength(5);
      const outcome = row[2].replace(/`/g, "") as VerbAnswer["facts"]["outcome"];
      const facts = outcome === "ok" ? { outcome } : { outcome, reason_code: row[3].replace(/`/g, ""), next: null };
      const sentences = row[4].split(/\*[^*]+:\*/).map((part) => part.replace(/\{[a-z_]+\}/g, "Plan").trim()).filter(Boolean);
      expect(sentences.length, row[1]).toBeGreaterThan(0);
      for (const said of sentences) {
        expect(checkVerbAnswer({ said, facts }, { forbidden_words: [...SAID_FORBIDDEN_WORDS] }), `${row[1]}: ${said}`).toEqual({ status: "valid" });
      }
    }
  });

  it("names no member: no handle, address or email in any sentence", () => {
    for (const row of rows) expect(row[4], row[1]).not.toMatch(/@|person:|repo:|agent:|https?:/);
  });
});
