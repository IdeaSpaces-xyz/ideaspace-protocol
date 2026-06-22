import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSpaceRoot } from "./space.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "is-sdk-space-"));
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

describe("findSpaceRoot", () => {
  it("finds _agent/ at cwd", async () => {
    await makeAgent(tmp, { "purpose.md": "# Purpose\nWhy.", "now.md": "# Now\nWhat." });
    const result = await findSpaceRoot(tmp);
    expect(result.root).toBe(tmp);
    expect(result.source).toBe("local");
    expect(result.contract.purpose?.content).toContain("Why.");
    expect(result.contract.now?.content).toContain("What.");
    expect(result.contract.foundation).toBeUndefined();
  });

  it("walks up to find _agent/ in an ancestor", async () => {
    await makeAgent(tmp, { "foundation.md": "# Foundation" });
    const deep = join(tmp, "a", "b", "c");
    await fs.mkdir(deep, { recursive: true });
    const result = await findSpaceRoot(deep);
    expect(result.root).toBe(tmp);
    expect(result.contract.foundation?.content).toContain("Foundation");
  });

  it("returns source 'none' when no _agent/ exists", async () => {
    const result = await findSpaceRoot(tmp);
    expect(result.root).toBeNull();
    expect(result.source).toBe("none");
    expect(result.contract).toEqual({});
  });

  it("ignores files outside the five-file contract", async () => {
    await makeAgent(tmp, {
      "purpose.md": "# Purpose",
      "rules.md": "# legacy",
      "soul.md": "# legacy",
    });
    const result = await findSpaceRoot(tmp);
    expect(result.contract.purpose).toBeDefined();
    // legacy files not in the five-file contract are not loaded
    expect((result.contract as Record<string, unknown>).rules).toBeUndefined();
    expect((result.contract as Record<string, unknown>).soul).toBeUndefined();
  });

  it("treats a regular file named _agent as not-a-space", async () => {
    await fs.writeFile(join(tmp, "_agent"), "not a directory", "utf-8");
    const result = await findSpaceRoot(tmp);
    expect(result.source).toBe("none");
  });

  it("loads all five contract files when present", async () => {
    await makeAgent(tmp, {
      "foundation.md": "f",
      "guide.md": "g",
      "purpose.md": "p",
      "now.md": "n",
      "next.md": "x",
    });
    const result = await findSpaceRoot(tmp);
    expect(result.contract.foundation?.content).toBe("f");
    expect(result.contract.guide?.content).toBe("g");
    expect(result.contract.purpose?.content).toBe("p");
    expect(result.contract.now?.content).toBe("n");
    expect(result.contract.next?.content).toBe("x");
  });
});
