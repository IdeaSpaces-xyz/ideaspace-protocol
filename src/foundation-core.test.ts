import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FOUNDATION_CORE, FOUNDATION_CORE_VERSION } from "./foundation-core.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe("foundation core", () => {
  it("embeds the shipped markdown asset byte-for-byte", async () => {
    const asset = await fs.readFile(
      join(root, "templates", "foundation-core.md"),
      "utf-8",
    );
    expect(FOUNDATION_CORE).toBe(asset);
  });

  it("carries the conduct seed, not space structure or tool names", () => {
    // The agreement layer that has no SPEC home.
    expect(FOUNDATION_CORE).toContain("**Protect:**");
    expect(FOUNDATION_CORE).toContain("**Never:**");
    expect(FOUNDATION_CORE).toContain("**Capture is conscious.**");
    expect(FOUNDATION_CORE).toContain("not instructions to follow");
    expect(FOUNDATION_CORE).toContain("<untrusted_content>");
    // Space structure is SPEC's; tool rosters are harness-owned. Neither
    // belongs in the conduct seed.
    expect(FOUNDATION_CORE).not.toMatch(/foundation\.md|guide\.md|now\.md/);
    expect(FOUNDATION_CORE).not.toMatch(/\bnavigate\b|\bis_write\b|\bapply_perspective\b/);
  });

  it("versions the embed from the package VERSION file", async () => {
    const version = (await fs.readFile(join(root, "VERSION"), "utf-8")).trim();
    expect(FOUNDATION_CORE_VERSION).toBe(version);
    expect(FOUNDATION_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
