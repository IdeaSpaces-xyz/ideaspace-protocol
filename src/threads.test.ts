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
  parseThreadAttachment,
  parseThreadOpeningPostAttachment,
  parseThreadAgreementAttachment,
  resolveThreadParent,
  childThreadsOfPost,
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
  attachment_vectors: string;
};

const attachments = JSON.parse(readFileSync(
  new URL("../conformance/threads/attachments.json", import.meta.url), "utf-8",
));
const agreementSchemaVectors = JSON.parse(readFileSync(
  new URL("../conformance/threads/agreement-schema.json", import.meta.url), "utf-8",
));
const threadAgreementSchema = JSON.parse(readFileSync(
  new URL("../schema/thread-agreement.schema.json", import.meta.url), "utf-8",
));
const noteSchema = JSON.parse(readFileSync(
  new URL("../schema/frontmatter.schema.json", import.meta.url), "utf-8",
));

// Exercise the published JSON Schema's optional field and disjoint oneOf patterns.
// The other Agreement fields are intentionally unconstrained by this schema.
function acceptsAttachment(schema: any, frontmatter: Record<string, unknown>): boolean {
  if (!("attached_to" in frontmatter)) return true;
  const value = frontmatter.attached_to;
  const alternatives = schema.properties.attached_to.oneOf ?? [schema.properties.attached_to];
  return alternatives.filter((alternative: any) =>
    alternative.type === "string" && typeof value === "string" &&
    new RegExp(alternative.pattern).test(value) &&
    (!alternative.not || !new RegExp(alternative.not.pattern).test(value))
  ).length === 1;
}

describe("Thread Agreement JSON Schema vectors", () => {
  it("publishes a separate optional schema and portable cases", () => {
    expect(manifest.agreement_schema_vectors).toBe("agreement-schema.json");
    expect(agreementSchemaVectors.format).toBe("ideaspaces-thread-agreement-schema/v1");
    expect(agreementSchemaVectors.schema).toBe("../../schema/thread-agreement.schema.json");
    expect(threadAgreementSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(threadAgreementSchema.type).toBe("object");
    expect(threadAgreementSchema.additionalProperties).toBe(true);
    expect(threadAgreementSchema.required).toBeUndefined();
    expect(noteSchema.properties.attached_to.pattern).toBe("^[a-z][a-z0-9_]*:.+$");
  });

  it.each(agreementSchemaVectors.cases)("checks $id", (vector: any) => {
    expect(acceptsAttachment(threadAgreementSchema, vector.frontmatter)).toBe(vector.valid);
    if ("attached_to" in vector.frontmatter) {
      expect(parseThreadAttachment(vector.frontmatter.attached_to) !== null).toBe(vector.valid);
    }
  });

  it.each(agreementSchemaVectors.note_schema_boundary)("keeps Note subjects separate: $frontmatter.attached_to", (vector: any) => {
    const value = vector.frontmatter.attached_to;
    expect(new RegExp(noteSchema.properties.attached_to.pattern).test(value)).toBe(vector.valid);
  });
});

describe("portable Thread attachments", () => {
  it("publishes language-neutral attachment vectors", () => {
    expect(manifest.attachment_vectors).toBe("attachments.json");
    expect(attachments.format).toBe("ideaspaces-thread-attachments/v1");
    expect(attachments.vectors.length).toBeGreaterThan(0);
    const covered = new Set([...manifest.vectors, ...attachments.vectors].flatMap((vector: any) => vector.covers));
    for (const requirement of manifest.required_coverage) expect(covered.has(requirement), requirement).toBe(true);
  });

  it.each(attachments.negative_cases)("rejects $id", (vector: any) => {
    expect(parseThreadAgreementAttachment(vector.agreement, vector.agreementPath)).toEqual(vector.expected);
  });

  it.each(attachments.vectors)("executes $id", (vector: any) => {
    const parsed = parseThreadAgreementAttachment(vector.agreement, vector.agreementPath);
    expect(parsed.status).toBe(vector.expected.status === "invalid" ? "invalid" : "valid");
    if (parsed.status === "invalid") {
      expect(parsed.issue).toBe(vector.expected.issue);
      if (vector.expected.subject) {
        expect(parseFrontmatter(vector.agreement)?.attached_to).toBe(vector.expected.subject);
      }
      return;
    }
    if (parsed.status !== "valid") throw new Error("Expected a parent attachment");
    expect(parsed.attachment.kind).toBe(vector.expected.kind);
    const resolved = resolveThreadParent(parsed.attachment, vector.roots, vector.authoredPin);
    expect(resolved.status).toBe(vector.expected.status);
    if (resolved.status === "resolved") {
      expect(resolved.parent).toEqual(vector.expected.parent);
      const children = (vector.children ?? []).map((child: any) => ({
        threadPath: child.threadPath,
        attachment: parseThreadAttachment(child.attachment),
      }));
      expect(childThreadsOfPost(resolved.parent, children, vector.roots)).toEqual(vector.expected.children);
    } else {
      expect("parent" in resolved).toBe(false);
      if (vector.children) {
        const children = vector.children.map((child: any) => ({
          threadPath: child.threadPath,
          attachment: parseThreadAttachment(child.attachment),
        }));
        for (const child of children) {
          expect(resolveThreadParent(child.attachment, vector.roots, vector.authoredPin).status).not.toBe("resolved");
        }
        const candidate = vector.roots[0]?.posts[0];
        if (candidate) {
          expect(childThreadsOfPost({ root: vector.roots[0].root, pin: vector.roots[0].pin, ...candidate }, children, vector.roots))
            .toEqual(vector.expected.children);
        }
      }
    }
  });

  it("parses typed attachments on opening posts and resolves post parents", () => {
    expect(parseThreadOpeningPostAttachment("---\nid: msg_open\nattached_to: post:msg_parent\n---\nOpening"))
      .toEqual({ status: "valid", attachment: { kind: "post", value: "msg_parent", raw: "post:msg_parent" } });
    expect(parseThreadOpeningPostAttachment("---\nid: msg_open\nattached_to: post:_threads/p/one.md\n---\nOpening"))
      .toEqual({ status: "valid", attachment: { kind: "post", value: "_threads/p/one.md", raw: "post:_threads/p/one.md" } });
    expect(parseThreadOpeningPostAttachment("---\nid: msg_open\nattached_to: note:@notes//ideas/plan.md\n---\nOpening"))
      .toEqual({ status: "valid", attachment: { kind: "note", value: "@notes//ideas/plan.md", raw: "note:@notes//ideas/plan.md" } });
    expect(parseThreadOpeningPostAttachment("---\nid: msg_open\nattached_to: repo:n_0123456789abcdef01234567\n---\nOpening"))
      .toEqual({ status: "valid", attachment: { kind: "repo", value: "n_0123456789abcdef01234567", raw: "repo:n_0123456789abcdef01234567" } });
    expect(parseThreadOpeningPostAttachment("---\nid: msg_open\nattached_to: change:chg_feature-decision\n---\nOpening"))
      .toEqual({ status: "valid", attachment: { kind: "change", value: "chg_feature-decision", raw: "change:chg_feature-decision" } });
    expect(parseThreadOpeningPostAttachment("---\nid: msg_open\n---\nNo parent"))
      .toEqual({ status: "absent" });

    // resolveThreadParent resolves typed post: attachments
    const root = { root: "space", pin: "p1", posts: [{ path: "_threads/p/one.md", id: "msg_parent" }] };
    expect(resolveThreadParent({ kind: "post", value: "msg_parent", raw: "post:msg_parent" }, [root]))
      .toEqual({ status: "resolved", parent: { root: "space", pin: "p1", path: "_threads/p/one.md", id: "msg_parent" } });
    expect(resolveThreadParent({ kind: "post", value: "_threads/p/one.md", raw: "post:_threads/p/one.md" }, [root]))
      .toEqual({ status: "resolved", parent: { root: "space", pin: "p1", path: "_threads/p/one.md", id: "msg_parent" } });

    // Non-post attachments (note, repo, change) do not create parent edges in the thread tree
    expect(resolveThreadParent({ kind: "note", value: "@notes//plan.md", raw: "note:@notes//plan.md" }, [root]))
      .toEqual({ status: "unresolved" });
    expect(resolveThreadParent({ kind: "repo", value: "n_123", raw: "repo:n_123" }, [root]))
      .toEqual({ status: "unresolved" });
  });

  it("does not interpret a Note's typed subject as a Thread parent", () => {
    expect(parseThreadAgreementAttachment("---\nattached_to: node:thing\n---\n", "_threads/child/_agent/agreement.md"))
      .toEqual({ status: "invalid", issue: "invalid_attached_to" });
    expect(parseFrontmatter("---\nattached_to: node:thing\n---\n")?.attached_to).toBe("node:thing");
    for (const value of ["_threads/../parent/post.md", "_threads/x/README.md", "_threads/.hidden/post.md", "msg_", "_threads/x/./post.md"]) {
      expect(parseThreadAttachment(value)).toBeNull();
    }
    expect(parseThreadAgreementAttachment("---\nname: Child\n---\n", "_threads/child/_agent/agreement.md"))
      .toEqual({ status: "absent" });
    expect(parseThreadAgreementAttachment("# Plain Markdown", "_threads/child/_agent/agreement.md"))
      .toEqual({ status: "absent" });
    for (const value of ["[one, two]", "''", "msg_"]) {
      expect(parseThreadAgreementAttachment(`---\nattached_to: ${value}\n---\n`, "_threads/child/_agent/agreement.md"))
        .toEqual({ status: "invalid", issue: "invalid_attached_to" });
    }
  });

  it("does not choose duplicate paths or ids, or reverse-link an unresolved child", () => {
    const first = { root: "first", pin: "a", posts: [{ path: "_threads/a/one.md", id: "msg_same" }] };
    const second = { root: "second", pin: "b", posts: [{ path: "_threads/a/one.md", id: "msg_same" }] };
    expect(resolveThreadParent({ kind: "path", value: "_threads/a/one.md" }, [first, second]))
      .toEqual({ status: "ambiguous" });
    expect(resolveThreadParent({ kind: "id", value: "msg_same" }, [{ ...first, posts: [...first.posts, { path: "_threads/a/two.md", id: "msg_same" }] }]))
      .toEqual({ status: "ambiguous" });
    const parent = resolveThreadParent({ kind: "id", value: "msg_same" }, [first]);
    if (parent.status !== "resolved") throw new Error("Expected resolved parent");
    expect(childThreadsOfPost(parent.parent, [
      { threadPath: "_threads/valid", attachment: { kind: "id", value: "msg_same" }, authoredPin: "a" },
      { threadPath: "_threads/wrong-pin", attachment: { kind: "id", value: "msg_same" }, authoredPin: "b" },
      { threadPath: "_threads/missing", attachment: { kind: "id", value: "msg_missing" } },
    ], [first])).toEqual(["_threads/valid"]);
  });
});

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
    const covered = new Set([...manifest.vectors, ...attachments.vectors].flatMap((vector: any) => vector.covers));
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
          if ("date" in vector.expected.post) expect(result.post.date ?? null).toBe(vector.expected.post.date);
          if ("fileDate" in vector.expected.post) expect(result.post.fileDate ?? null).toBe(vector.expected.post.fileDate);
          if ("dateWarning" in vector.expected.post) expect(result.post.dateWarning ?? null).toBe(vector.expected.post.dateWarning);
          if (vector.expected.post.body) {
            expect(result.post.body).toBe(vector.expected.post.body);
          }
          // parseFrontmatter must accept the raw content without returning null
          expect(parseFrontmatter(vector.input.content)).not.toBeNull();
        } else if (vector.expected.issues) {
          expect(result.issues).toEqual(vector.expected.issues);
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
