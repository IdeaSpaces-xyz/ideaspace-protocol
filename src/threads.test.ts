import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  THREADS_DIRECTORY,
  THREAD_KINDS,
  parseThreadPost,
  reconstructThreadTimeline,
  resolveThreadGitPath,
  isThreadPosition,
  type ThreadPost,
  type ThreadKind,
} from "./threads.js";
import { parseMap, buildMap, type MapBuildInput } from "./maps.js";
import { validateSpace } from "./conformance.js";
import { parseFrontmatter } from "./frontmatter.js";

const manifest = JSON.parse(
  readFileSync(
    new URL("../conformance/threads/manifest.json", import.meta.url),
    "utf-8",
  ),
) as {
  format: string;
  thread_directory: string;
  required_coverage: string[];
  vectors: any[];
};

describe("threads primitives", () => {
  it("exports expected constants and kind definitions", () => {
    expect(THREADS_DIRECTORY).toBe("_threads");
    expect(THREAD_KINDS).toEqual(["post", "snapshot", "reframe", "correction", "closure"]);
  });

  it("identifies thread positions", () => {
    expect(isThreadPosition("_threads")).toBe(true);
    expect(isThreadPosition("_threads/2026-09-26-auth/README.md")).toBe(true);
    expect(isThreadPosition("subspace/_threads/2026-09-26-auth/post.md")).toBe(true);
    expect(isThreadPosition("notes/decision.md")).toBe(false);
    expect(isThreadPosition("_agent/agreement.md")).toBe(false);
  });

  it("parses frontmatter of vector posts with parseFrontmatter directly", () => {
    const postContent = `---
id: test-01
kind: post
name: "Title: with colon"
summary: "Summary: with colon"
---
Body content`;
    const fm = parseFrontmatter(postContent);
    expect(fm).toEqual({
      id: "test-01",
      kind: "post",
      name: "Title: with colon",
      summary: "Summary: with colon",
    });
  });

  it("rejects post with missing or empty id", () => {
    expect(parseThreadPost("---\nkind: post\n---\nbody")).toEqual({
      status: "invalid",
      issues: ["invalid_id"],
    });
    expect(parseThreadPost("---\nid: '  '\n---\nbody")).toEqual({
      status: "invalid",
      issues: ["invalid_id"],
    });
  });

  it("rejects post with invalid kind", () => {
    expect(parseThreadPost("---\nid: p1\nkind: unknown_kind\n---\nbody")).toEqual({
      status: "invalid",
      issues: ["invalid_kind"],
    });
  });

  it("rejects post with invalid map block", () => {
    const content = `---
id: p1
map:
  members:
    - root: 0
      position: _agent/foundation.md
---
body`;
    expect(parseThreadPost(content)).toEqual({
      status: "invalid",
      issues: ["invalid_map"],
    });
  });
});

describe("threads conformance manifest", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    tempDirs.length = 0;
  });

  it("has the expected language-neutral format and complete declared coverage", () => {
    expect(manifest.format).toBe("ideaspaces-threads/v1");
    expect(manifest.thread_directory).toBe("_threads");
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const requirement of manifest.required_coverage) {
      expect(covered.has(requirement), requirement).toBe(true);
    }
  });

  it.each(manifest.vectors)("executes $id", async (vector) => {
    switch (vector.operation) {
      case "parse_post": {
        const result = parseThreadPost(vector.input.content, vector.input.path);
        expect(result.status).toBe(vector.expected.status);
        if (result.status === "valid") {
          expect(result.post.id).toBe(vector.expected.post.id);
          expect(result.post.kind).toBe(vector.expected.post.kind);
          expect(result.post.inReplyTo).toEqual(vector.expected.post.inReplyTo);
          expect(result.post.references).toEqual(vector.expected.post.references);
          if (vector.expected.post.date) expect(result.post.date).toBe(vector.expected.post.date);
          if (vector.expected.post.body) {
            expect(result.post.body).toBe(vector.expected.post.body);
          }
          // parseFrontmatter must accept the raw content without returning null
          expect(parseFrontmatter(vector.input.content)).not.toBeNull();
        }
        break;
      }
      case "reconstruct_timeline": {
        const parsedPosts: ThreadPost[] = vector.input.posts.map((raw: any) => {
          const parsed = parseThreadPost(raw.content, raw.path);
          if (parsed.status !== "valid") {
            throw new Error(`Failed to parse post ${raw.id}: ${parsed.issues.join(", ")}`);
          }
          return parsed.post;
        });
        const timeline = reconstructThreadTimeline(parsedPosts);
        const actualIds = timeline.posts.map((p) => p.id);
        expect(actualIds).toEqual(vector.expected.linearized_ids);
        break;
      }
      case "map_member_resolution": {
        const mapResult = buildMap(vector.input.map as MapBuildInput);
        expect(mapResult.status).toBe(vector.expected.valid_map ? "valid" : "invalid");
        if (mapResult.status === "valid") {
          for (const item of vector.expected.resolved_positions) {
            const member = mapResult.map.members[item.member_index];
            if ("position" in member) {
              const treeFiles: string[] = vector.input.trees[String(item.root)] ?? [];
              const treeSet = new Set(treeFiles);
              const resolved = resolveThreadGitPath(member.position, (p) => treeSet.has(p));
              expect(resolved).toBe(item.resolved_tree_path);
            } else {
              throw new Error(`Expected position member at index ${item.member_index}`);
            }
          }
        }
        break;
      }
      case "map_member_refusals": {
        for (const testCase of vector.cases) {
          const result = parseMap({
            roots: [
              {
                repo: "https://ideaspaces.example/repos/n_0123456789abcdef01234567",
                sha: "1111111111111111111111111111111111111111",
              },
            ],
            members: [
              {
                root: 0,
                position: testCase.position,
                depth: "summary",
              },
            ],
          });
          expect(result.status).toBe("invalid");
          if (result.status === "invalid") {
            expect(result.issues[0]?.code).toBe(testCase.expected_code);
          }
        }
        break;
      }
      case "validate_space": {
        const root = await mkdtemp(join(tmpdir(), "ideaspaces-threads-space-"));
        tempDirs.push(root);
        for (const [relPath, content] of Object.entries(vector.tree)) {
          const absPath = join(root, relPath);
          await mkdir(dirname(absPath), { recursive: true });
          await writeFile(absPath, content as string, "utf-8");
        }
        const report = await validateSpace(root);
        expect(report.ok).toBe(vector.expected.ok);
        expect(report.notesChecked).toBe(vector.expected.notes_checked);
        const unknownWarnings = report.issues
          .filter((i) => i.rule === "unknown-infrastructure")
          .map((i) => i.path);
        expect(unknownWarnings).toEqual(vector.expected.unknown_infrastructure_warnings);
        break;
      }
      default:
        throw new Error(`Unknown vector operation: ${(vector as any).operation}`);
    }
  });
});
