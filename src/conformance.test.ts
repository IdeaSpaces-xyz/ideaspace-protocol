import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSpace } from "./conformance.js";
import { composeFrontmatter } from "./frontmatter.js";

const here = dirname(fileURLToPath(import.meta.url));
// src/ and conformance/ are siblings under the package root.
const referenceSpace = join(here, "..", "conformance", "reference-space");

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "is-conformance-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function makeAgent(at: string, files: Record<string, string>): Promise<void> {
  const agentDir = join(at, "_agent");
  await fs.mkdir(agentDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      fs.writeFile(join(agentDir, name), content, "utf-8"),
    ),
  );
}

describe("validateSpace — reference space", () => {
  it("passes the bundled reference space with zero errors", async () => {
    const report = await validateSpace(referenceSpace);
    const errors = report.issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.notesChecked).toBeGreaterThan(0);
    expect(
      await fs.readFile(join(referenceSpace, "_agent", "skills", "weekly-review.md"), "utf-8"),
    ).toContain("name: weekly-review");
  });

  it("records the unknown underscore folder as a graceful skip (warn, not error)", async () => {
    const report = await validateSpace(referenceSpace);
    const skipped = report.issues.find((i) => i.rule === "infra-skipped");
    expect(skipped).toBeDefined();
    expect(skipped?.level).toBe("warn");
    expect(skipped?.path).toBe("_scratch");
  });
});

describe("validateSpace — not a space", () => {
  it("errors when there is no root _agent/ directory", async () => {
    await fs.writeFile(join(tmp, "README.md"), "# Just folders", "utf-8");
    const report = await validateSpace(tmp);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.rule)).toContain("no-space");
  });
});

describe("validateSpace — frontmatter violations", () => {
  it("flags malformed frontmatter and an invalid attached_to", async () => {
    await makeAgent(tmp, {
      "foundation.md": "# Foundation",
      "purpose.md": "# Purpose",
      "now.md": "# Now",
    });
    // Unterminated frontmatter block — will not parse.
    await fs.writeFile(
      join(tmp, "broken.md"),
      "---\nname: Broken\n# never closed\n",
      "utf-8",
    );
    // Valid YAML, but attached_to violates the schema pattern.
    await fs.writeFile(
      join(tmp, "bad-attach.md"),
      "---\nname: Bad\nattached_to: garbage\n---\nbody\n",
      "utf-8",
    );
    // The legacy array-of-one shape is invalid: attached_to is singular.
    await fs.writeFile(
      join(tmp, "array-attach.md"),
      "---\nname: Legacy\nattached_to:\n  - person:alice\n---\nbody\n",
      "utf-8",
    );

    const report = await validateSpace(tmp);
    expect(report.ok).toBe(false);
    const rules = report.issues.filter((i) => i.level === "error").map((i) => i.rule);
    expect(rules).toContain("frontmatter-malformed");
    expect(rules).toContain("attached-to-pattern");
    expect(rules).toContain("attached-to-type");
  });

  it("accepts attached_to emitted by the reference composer", async () => {
    await makeAgent(tmp, { "foundation.md": "# Foundation" });
    await fs.writeFile(
      join(tmp, "composed.md"),
      composeFrontmatter({ name: "Composed", attached_to: "person:alice" }) + "body\n",
      "utf-8",
    );

    const report = await validateSpace(tmp);
    const errors = report.issues.filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("flags wrong types for name and tags", async () => {
    await makeAgent(tmp, { "foundation.md": "# Foundation" });
    await fs.writeFile(
      join(tmp, "wrong-types.md"),
      "---\nname: 42\ntags: notalist\n---\nbody\n",
      "utf-8",
    );
    const report = await validateSpace(tmp);
    const rules = report.issues.filter((i) => i.level === "error").map((i) => i.rule);
    expect(rules).toContain("name-type");
    expect(rules).toContain("tags-type");
  });
});

describe("validateSpace — skill identities", () => {
  it("accepts matching portable names in both skill entry forms", async () => {
    await makeAgent(tmp, { "foundation.md": "# Foundation" });
    const skills = join(tmp, "_agent", "skills");
    await fs.mkdir(join(skills, "pdf-report"), { recursive: true });
    await fs.writeFile(
      join(skills, "weekly-review.md"),
      "---\nname: weekly-review\ndescription: Review the week.\n---\n# Weekly Review\n",
      "utf-8",
    );
    await fs.writeFile(
      join(skills, "pdf-report", "SKILL.md"),
      "---\nname: pdf-report\ndescription: Render a PDF.\n---\n# PDF Report\n",
      "utf-8",
    );

    const report = await validateSpace(tmp);
    expect(report.issues.filter((i) => i.rule.startsWith("skill-"))).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("rejects invalid or mismatched skill names and stops at nested spaces", async () => {
    await makeAgent(tmp, { "foundation.md": "# Foundation" });
    const skills = join(tmp, "_agent", "skills");
    await fs.mkdir(skills, { recursive: true });
    await fs.writeFile(
      join(skills, "weekly-review.md"),
      "---\nname: Weekly Review\ndescription: Review the week.\n---\n# Weekly Review\n",
      "utf-8",
    );
    await fs.writeFile(
      join(skills, "Bad_Name.md"),
      "---\nname: other-name\ndescription: Invalid id and mismatch.\n---\n# Bad\n",
      "utf-8",
    );
    await fs.writeFile(
      join(skills, "missing.md"),
      "---\ndescription: Missing name.\n---\n# Missing\n",
      "utf-8",
    );
    await fs.mkdir(join(skills, "Bad-Directory"), { recursive: true });
    await fs.writeFile(
      join(skills, "Bad-Directory", "SKILL.md"),
      "---\nname: other-directory\ndescription: Invalid directory id and mismatch.\n---\n# Bad\n",
      "utf-8",
    );

    const nested = join(tmp, "nested");
    await makeAgent(nested, { "foundation.md": "# Separate space" });
    await fs.mkdir(join(nested, "_agent", "skills"), { recursive: true });
    await fs.writeFile(
      join(nested, "_agent", "skills", "nested.md"),
      "---\nname: Nested Invalid\ndescription: Belongs to another space.\n---\n",
      "utf-8",
    );
    await fs.writeFile(
      join(nested, "broken.md"),
      "---\nname: Broken nested knowledge\n# no closing delimiter\n",
      "utf-8",
    );

    const report = await validateSpace(tmp);
    expect(report.ok).toBe(false);
    const rules = report.issues.filter((i) => i.level === "error").map((i) => i.rule);
    expect(rules).toContain("skill-id-invalid");
    expect(rules).toContain("skill-name-invalid");
    expect(rules).toContain("skill-name-mismatch");
    expect(rules).toContain("skill-name-missing");
    expect(report.issues.some((i) => i.path.includes("nested"))).toBe(false);
  });
});

describe("validateSpace — drift signals", () => {
  it("warns (not errors) on a missing foundation and contract files", async () => {
    await makeAgent(tmp, { "guide.md": "# Guide" });
    const report = await validateSpace(tmp);
    expect(report.ok).toBe(true); // drift never fails conformance
    const warnRules = report.issues.filter((i) => i.level === "warn").map((i) => i.rule);
    expect(warnRules).toContain("no-foundation");
    expect(warnRules).toContain("contract-drift");
  });
});

describe("validateSpace — graceful ignore", () => {
  it("does not error on junk inside an unknown underscore folder", async () => {
    await makeAgent(tmp, { "foundation.md": "# Foundation" });
    const infra = join(tmp, "_junk");
    await fs.mkdir(infra, { recursive: true });
    await fs.writeFile(join(infra, "garbage.md"), "---\nthis: [is, broken\n", "utf-8");
    await fs.writeFile(join(infra, "random.txt"), "not markdown", "utf-8");

    const report = await validateSpace(tmp);
    expect(report.ok).toBe(true);
    expect(report.issues.some((i) => i.level === "error")).toBe(false);
    const skipped = report.issues.find((i) => i.rule === "infra-skipped");
    expect(skipped?.path).toBe("_junk");
  });
});
