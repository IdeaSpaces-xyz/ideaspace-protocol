import { describe, it, expect } from "vitest";
import { listSkills, readSkill } from "./skills.js";

const EXPECTED = [
  "awareness",
  "capture",
  "form-perspective",
  "form-primitive",
  "guide",
  "purpose-elicitation",
  "repo-context",
  "writing",
].sort();

describe("listSkills", () => {
  it("returns the 8 universal skills, each with a description", async () => {
    const skills = await listSkills();
    expect(skills.map((s) => s.name)).toEqual(EXPECTED);
    for (const s of skills) {
      expect(s.description, `${s.name} should have a description`).toBeTruthy();
    }
  });
});

describe("readSkill", () => {
  it("returns full content + description for a known skill", async () => {
    const skill = await readSkill("awareness");
    expect(skill.name).toBe("awareness");
    expect(skill.description).toMatch(/alignment/i);
    expect(skill.content).toContain("# Awareness — Delta Protocol");
  });

  it("throws for an unknown skill", async () => {
    await expect(readSkill("does-not-exist")).rejects.toThrow(/Unknown skill/);
  });

  it("rejects path-traversal names", async () => {
    await expect(readSkill("../package")).rejects.toThrow(/Invalid skill name/);
  });
});

describe("neutralization guard", () => {
  it("no Keeper-specific tool tokens leak into the shipped catalog", async () => {
    const skills = await listSkills();
    // Tool-name tokens that must not survive the port. Plain English uses of
    // "search"/"navigate" (e.g. "filtered search", "reader navigation") are fine
    // — these patterns target the tool identifiers specifically.
    const forbidden = [
      /`navigate`/,
      /`search`/,
      /apply_perspective/,
      /scrape_url/,
      /resolve_agent/,
      /grep_sections/,
      /list_tags/,
      /\bkeeper\b/i,
    ];
    for (const { name } of skills) {
      const { content } = await readSkill(name);
      for (const pat of forbidden) {
        expect(pat.test(content), `${name} contains forbidden token ${pat}`).toBe(false);
      }
    }
  });

  it("every skill carries a provenance marker", async () => {
    for (const { name } of await listSkills()) {
      const { content } = await readSkill(name);
      expect(content, `${name} missing provenance`).toMatch(/Ported from sw_space\/resources\/skills\//);
    }
  });
});
