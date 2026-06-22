import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSpace } from "./conformance.js";

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

    const report = await validateSpace(tmp);
    expect(report.ok).toBe(false);
    const rules = report.issues.filter((i) => i.level === "error").map((i) => i.rule);
    expect(rules).toContain("frontmatter-malformed");
    expect(rules).toContain("attached-to-pattern");
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
