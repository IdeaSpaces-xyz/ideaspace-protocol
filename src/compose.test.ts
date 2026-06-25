import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeContractAlongPath } from "./space.js";

const made: string[] = [];

afterEach(async () => {
  await Promise.all(made.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

/** Build a tmp tree. `files` maps relative paths → contents; dirs are created as needed. */
async function makeSpace(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "compose-"));
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await fs.mkdir(join(abs, ".."), { recursive: true });
    await fs.writeFile(abs, content, "utf-8");
  }
  return root;
}

describe("composeContractAlongPath", () => {
  it("composes the fractal stack: root foundation + deepest-present refinements", async () => {
    const root = await makeSpace({
      "_agent/foundation.md": "# Foundation",
      "_agent/guide.md": "# Guide",
      "_agent/purpose.md": "# Purpose",
      "_agent/now.md": "# Now (root)",
      "branch/_agent/now.md": "# Now (branch)",
      "branch/leaf/README.md": "# leaf", // no _agent here — inherits ancestors'
    });
    const leaf = join(root, "branch", "leaf");

    const composed = await composeContractAlongPath(leaf);

    expect(composed.spaceRoot).toBe(root);
    // foundation always from the space root
    expect(composed.contract.foundation?.level).toBe(root);
    // now is overridden by the nearest branch
    expect(composed.contract.now?.level).toBe(join(root, "branch"));
    expect(composed.contract.now?.content).toContain("Now (branch)");
    // guide/purpose fall back to the root (branch doesn't carry them)
    expect(composed.contract.guide?.level).toBe(root);
    expect(composed.contract.purpose?.level).toBe(root);
    // levels are the _agent/ dirs found, deepest first (leaf has none)
    expect(composed.levels).toEqual([join(root, "branch"), root]);
  });

  it("at the space root, resolves the root contract only", async () => {
    const root = await makeSpace({
      "_agent/foundation.md": "# Foundation",
      "_agent/now.md": "# Now",
    });
    const composed = await composeContractAlongPath(root);
    expect(composed.spaceRoot).toBe(root);
    expect(composed.contract.foundation?.level).toBe(root);
    expect(composed.contract.now?.level).toBe(root);
    expect(composed.levels).toEqual([root]);
  });

  it("stops at a nested space's foundation — never crosses into the parent", async () => {
    const root = await makeSpace({
      "_agent/foundation.md": "# Parent foundation",
      "_agent/now.md": "# Parent now",
      "sub/_agent/foundation.md": "# Sub foundation",
      "sub/_agent/now.md": "# Sub now",
    });
    const sub = join(root, "sub");

    const composed = await composeContractAlongPath(sub);

    expect(composed.spaceRoot).toBe(sub); // sub is its own space
    expect(composed.contract.foundation?.content).toContain("Sub foundation");
    expect(composed.contract.now?.content).toContain("Sub now");
    expect(composed.levels).toEqual([sub]); // did not walk up to the parent
  });

  it("returns null space root when no _agent/ is found", async () => {
    const root = await makeSpace({ "notes/thing.md": "# Thing" });
    const composed = await composeContractAlongPath(join(root, "notes"));
    expect(composed.spaceRoot).toBeNull();
    expect(composed.contract).toEqual({});
    expect(composed.levels).toEqual([]);
  });
});
