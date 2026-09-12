import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeAgreementAlongPath } from "./agreement.js";

const made: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(made.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })));
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agreement-frame-"));
  made.push(root);
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await fs.mkdir(join(absolute, ".."), { recursive: true });
    await fs.writeFile(absolute, content, "utf-8");
  }
  return fs.realpath(root);
}

describe("composeAgreementAlongPath", () => {
  it("loads every Agreement root-first, summarizes siblings, and honors context.full", async () => {
    const root = await fixture({
      "_agent/agreement.md": [
        "---",
        "summary: Root agreement.",
        "context:",
        "  full:",
        "    - purpose.md",
        "---",
        "# Root Agreement",
      ].join("\n"),
      "_agent/foundation.md": "FOUNDATION SENTINEL",
      "_agent/purpose.md": "---\nsummary: Root purpose.\n---\n\nPURPOSE BODY",
      "_agent/now.md": "---\nsummary: Root now.\n---\n\nNOW BODY",
      "branch/_agent/agreement.md": "---\nsummary: Branch agreement.\n---\n\n# Branch Agreement",
      "branch/_agent/guide.md": "---\nsummary: Branch guide.\n---\n\nGUIDE BODY",
      "branch/leaf/note.md": "# Note",
    });

    const composed = await composeAgreementAlongPath(join(root, "branch", "leaf"), root);

    expect(composed.spaceRoot).toBe(root);
    expect(composed.stack.map((level) => level.dir)).toEqual([root, join(root, "branch")]);
    expect(composed.agreements.map((entry) => entry.sourcePosition)).toEqual([
      root,
      join(root, "branch"),
    ]);
    expect(composed.stack.flatMap((level) => level.files)).toMatchObject([
      { name: "agreement", representation: "full" },
      { name: "now", representation: "summary" },
      { name: "purpose", representation: "full" },
      { name: "agreement", representation: "full" },
      { name: "guide", representation: "summary" },
    ]);
    expect(JSON.stringify(composed)).not.toContain("FOUNDATION SENTINEL");
    expect(composed.issues).toEqual([]);
  });

  it("re-roots at the nearest Agreement carrying root_node_id", async () => {
    const root = await fixture({
      "_agent/agreement.md": "# Parent Agreement",
      "sub/_agent/agreement.md": [
        "---",
        "root_node_id: n_0123456789abcdef01234567",
        "---",
        "# Nested Agreement",
      ].join("\n"),
      "sub/leaf/_agent/agreement.md": "# Leaf Agreement",
    });

    const composed = await composeAgreementAlongPath(join(root, "sub", "leaf"), root);

    expect(composed.spaceRoot).toBe(join(root, "sub"));
    expect(composed.rootNodeId).toBe("n_0123456789abcdef01234567");
    expect(composed.agreements.map((entry) => entry.sourcePosition)).toEqual([
      join(root, "sub"),
      join(root, "sub", "leaf"),
    ]);
  });

  it("uses the outermost Agreement as the ceiling outside Git", async () => {
    const root = await fixture({
      "_agent/agreement.md": "# Root Agreement",
      "a/_agent/agreement.md": "# Branch Agreement",
      "a/b/note.md": "# Note",
    });

    const composed = await composeAgreementAlongPath(join(root, "a", "b"));

    expect(composed.spaceRoot).toBe(root);
    expect(composed.agreements).toHaveLength(2);
  });

  it("reports invalid and unavailable full-load declarations without partial success", async () => {
    const root = await fixture({
      "_agent/agreement.md": [
        "---",
        "context:",
        "  full:",
        "    - purpose.md",
        "    - purpose.md",
        "    - ../secret.md",
        "    - /absolute.md",
        "    - https://example.com/context.md",
        "    - skills/review.md",
        "    - '*.md'",
        "    - agreement.md",
        "    - foundation.md",
        "---",
        "# Agreement",
      ].join("\n"),
    });

    const composed = await composeAgreementAlongPath(root, root);

    expect(composed.issues.map((issue) => issue.code)).toEqual([
      "duplicate_full_load",
      "invalid_full_load_path",
      "invalid_full_load_path",
      "invalid_full_load_path",
      "invalid_full_load_path",
      "invalid_full_load_path",
      "invalid_full_load_path",
      "invalid_full_load_path",
      "missing_full_load",
    ]);
  });

  it.each([
    ["context is scalar", "---\ncontext: full\n---\n# Agreement", "invalid_context"],
    ["context.full is scalar", "---\ncontext:\n  full: purpose.md\n---\n# Agreement", "invalid_full_loads"],
    ["frontmatter is malformed", "---\ncontext: [broken\n---\n# Agreement", "agreement_frontmatter_malformed"],
    ["root identity is invalid", "---\nroot_node_id: wrong\n---\n# Agreement", "invalid_root_node_id"],
  ])("reports %s", async (_name, agreement, code) => {
    const root = await fixture({ "_agent/agreement.md": agreement });
    const composed = await composeAgreementAlongPath(root, root);
    expect(composed.issues.map((issue) => issue.code)).toContain(code);
  });

  it("fails the frame if _agent disappears after Agreement bytes are read", async () => {
    const root = await fixture({ "_agent/agreement.md": "# Agreement" });
    const original = fs.readdir.bind(fs);
    vi.spyOn(fs, "readdir").mockImplementation((async (...args: Parameters<typeof fs.readdir>) => {
      if (String(args[0]) === join(root, "_agent")) {
        throw new Error("simulated directory race");
      }
      return original(...args);
    }) as typeof fs.readdir);

    const composed = await composeAgreementAlongPath(root, root);
    expect(composed.agreements).toHaveLength(1);
    expect(composed.issues).toMatchObject([
      { code: "agent_context_unreadable", detail: "simulated directory race" },
    ]);
  });

  it("fails the frame if a declared full load disappears after listing", async () => {
    const root = await fixture({
      "_agent/agreement.md": "---\ncontext:\n  full:\n    - purpose.md\n---\n# Agreement",
      "_agent/purpose.md": "# Purpose",
    });
    const original = fs.lstat.bind(fs);
    vi.spyOn(fs, "lstat").mockImplementation((async (...args: Parameters<typeof fs.lstat>) => {
      if (String(args[0]) === join(root, "_agent", "purpose.md")) {
        throw new Error("simulated file race");
      }
      return original(...args);
    }) as typeof fs.lstat);

    const composed = await composeAgreementAlongPath(root, root);
    expect(composed.issues).toMatchObject([
      { code: "missing_full_load", detail: expect.stringContaining("became unavailable") },
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "does not follow an _agent directory symlink", async () => {
      const root = await fixture({ "note.md": "# Note" });
      const outside = await fixture({ "_agent/agreement.md": "# Outside Agreement" });
      await fs.symlink(join(outside, "_agent"), join(root, "_agent"), "dir");

      const composed = await composeAgreementAlongPath(root, root);
      expect(composed.spaceRoot).toBeNull();
      expect(composed.agreements).toEqual([]);
    },
  );

  it.skipIf(process.platform === "win32")(
    "refuses directory and symlink full-load targets as unavailable regular files",
    async () => {
      const root = await fixture({
        "_agent/agreement.md": [
          "---",
          "context:",
          "  full:",
          "    - directory.md",
          "    - linked.md",
          "---",
          "# Agreement",
        ].join("\n"),
        "target.md": "# Outside agent context",
      });
      await fs.mkdir(join(root, "_agent", "directory.md"));
      await fs.symlink(join(root, "target.md"), join(root, "_agent", "linked.md"));

      const composed = await composeAgreementAlongPath(root, root);
      expect(composed.issues.map((issue) => issue.code)).toEqual([
        "missing_full_load",
        "missing_full_load",
      ]);
    },
  );
});
