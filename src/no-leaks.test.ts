import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// This repo is the platform-neutral shape, not any one platform. These
// implementation identifiers must never appear anywhere in the tracked tree —
// they leak a specific platform (its graph handles, its retrieval mechanism)
// into a spec that names no platform. A conformant consumer named as an example
// (Claude, Pi, a third-party tool) is fine; an internal identifier is not.
const FORBIDDEN = [
  "sw[_-]space", // internal platform name
  "pi-sw-space", // internal source path
  "node_id", // platform graph handle (rides in the map, never the file)
  "node_type", // platform graph handle
  "node:n_", // platform node reference form
  "dir_centroids", // platform vector index
  "semantic fingerprint", // retrieval mechanism
  "vector centroid", // retrieval mechanism
  "embedding vector", // retrieval mechanism
];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "src/no-leaks.test.ts";

describe("no implementation leaks (repo-wide)", () => {
  it.each(FORBIDDEN)("no tracked file contains /%s/i", (pattern) => {
    let hits = "";
    try {
      hits = execFileSync(
        "git",
        [
          "grep",
          "-nIiE",
          pattern,
          "--",
          ".",
          ":(exclude)node_modules",
          ":(exclude)dist",
          ":(exclude)package-lock.json",
          `:(exclude)${SELF}`,
        ],
        { cwd: repoRoot, encoding: "utf-8" },
      );
    } catch (err) {
      // git grep exits 1 when there are no matches — the passing case.
      if ((err as { status?: number }).status === 1) return;
      throw err;
    }
    expect(hits, `implementation identifier leaked:\n${hits}`).toBe("");
  });
});
