import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  THREADS_DIRECTORY,
  THREAD_KINDS,
  parseThreadPost,
  inspectThreadPosts,
  reconstructThreadTimeline,
  resolveThreadGitPath,
  isThreadPosition,
  parseThreadAttachment,
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
const metalayer = JSON.parse(readFileSync(
  new URL("../conformance/threads/metalayer.json", import.meta.url), "utf-8",
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
  const fieldSchema = schema.properties.attached_to;
  if (!fieldSchema.type && !fieldSchema.oneOf) return true;
  const alternatives = fieldSchema.oneOf ?? [fieldSchema];
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
      const parsedAgreement = parseThreadAgreementAttachment(
        `---\nattached_to: ${JSON.stringify(vector.frontmatter.attached_to)}\n---\n`,
        "_threads/t/_agent/agreement.md",
      );
      expect(parsedAgreement.status).toBe(vector.parent ? "valid" : "absent");
      if (!vector.parent) expect(parsedAgreement).toEqual({ status: "absent", warning: "invalid_attached_to" });
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
    const covered = new Set([...manifest.vectors, ...attachments.vectors, ...metalayer.vectors].flatMap((vector: any) => vector.covers));
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

  it("does not interpret a Note's typed subject as a Thread parent", () => {
    expect(parseThreadAgreementAttachment("---\nattached_to: node:thing\n---\n", "_threads/child/_agent/agreement.md"))
      .toEqual({ status: "absent", warning: "invalid_attached_to" });
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
        .toEqual({ status: "absent", warning: "invalid_attached_to" });
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

describe("metalayer conformance vectors", () => {
  it("publishes independent field, mark, parent, and unreadable cases", () => {
    expect(metalayer.format).toBe("ideaspaces-thread-metalayer/v1");
    expect(metalayer.vectors.length).toBeGreaterThanOrEqual(7);
  });

  it.each(metalayer.vectors)("executes $id", (vector: any) => {
    if (vector.operation === "parse_post") {
      const parsed = parseThreadPost(vector.input.content, vector.input.path);
      expect(parsed.status).toBe(vector.expected.status);
      if (parsed.status !== "valid") throw new Error("Expected readable post");
      expect(parsed.post.id).toBe(vector.expected.id);
      expect(parsed.post.warnings).toEqual(vector.expected.warnings);
      if (vector.expected.references) expect(parsed.post.references).toEqual(vector.expected.references);
      if (vector.expected.mapMemberPositions) {
        expect(parsed.post.mapResult?.status).toBe("valid");
        if (parsed.post.mapResult?.status === "valid") {
          expect(parsed.post.mapResult.map.members.filter((m) => "position" in m).map((m) => m.position))
            .toEqual(vector.expected.mapMemberPositions);
        }
      }
    } else if (vector.operation === "reconstruct_timeline") {
      const posts = vector.input.posts.map(({ content, path }: any) => {
        const parsed = parseThreadPost(content, path);
        if (parsed.status !== "valid") throw new Error(`Invalid fixture ${path}`);
        return parsed.post;
      });
      const timeline = reconstructThreadTimeline(posts);
      expect(timeline.posts.map((p) => p.id)).toEqual(vector.expected.linearized_ids);
      expect(timeline.childrenByParentId.get("msg_root")?.map((p) => p.id)).toEqual(vector.expected.childIds);
      if (vector.expected.kind) expect(timeline.postsById.get("msg_reply")?.kind).toBe(vector.expected.kind);
      if (vector.expected.markValues) {
        expect(timeline.postsById.get("msg_root")?.marks?.map((m) => m.mark)).toEqual(vector.expected.markValues);
        expect(timeline.postsById.get("msg_root")?.marks?.map((m) => m.id)).toEqual(vector.expected.markIds);
      }
    } else if (vector.operation === "resolve_parent") {
      const attachment = parseThreadAttachment(vector.input.attached_to);
      expect(attachment).not.toBeNull();
      if (!attachment) throw new Error("Expected typed attachment");
      const resolved = resolveThreadParent(attachment, vector.input.roots);
      expect(resolved).toEqual({ status: vector.expected.status, attachment });
    } else if (vector.operation === "inspect_posts") {
      const legacy = vector.input.agreement
        ? parseThreadAgreementAttachment(vector.input.agreement, "_threads/child/_agent/agreement.md") : undefined;
      const inspection = inspectThreadPosts(vector.input.sources, legacy);
      expect(inspection.parent === "unknown" || inspection.parent === null ? inspection.parent : inspection.parent.raw)
        .toBe(vector.expected.parent);
      expect(inspection.closed).toBe(vector.expected.closed);
      expect(inspection.writable).toBe(vector.expected.writable);
      expect(inspection.writeRefusal).toBe(vector.expected.writeRefusal);
      if (vector.expected.readableIds) expect(inspection.posts.map((p) => p.id)).toEqual(vector.expected.readableIds);
      if (vector.expected.unreadablePaths) {
        expect(inspection.unreadable.map((p) => p.path)).toEqual(vector.expected.unreadablePaths);
        for (const path of vector.expected.unreadablePaths) {
          expect(inspection.warnings.some((w) => w.post === path)).toBe(true);
        }
      }
    } else throw new Error(`Unknown operation ${vector.operation}`);
  });
});

describe("threads primitives", () => {
  it("exports expected constants and kind definitions", () => {
    expect(THREADS_DIRECTORY).toBe("_threads");
    expect(THREAD_KINDS).toEqual(["post", "snapshot", "reframe", "correction", "closure", "mark"]);
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

  it("accepts post with unknown kind and keeps raw kind", () => {
    expect(parseThreadPost("---\nid: p1\nkind: unknown_kind\n---\nbody")).toEqual({
      status: "valid",
      post: {
        id: "p1",
        path: "",
        kind: "unknown_kind",
        frontmatter: {
          id: "p1",
          kind: "unknown_kind",
        },
        body: "body",
        inReplyTo: [],
        references: [],
      },
    });
  });

  it("tolerates bad map block, drops map and records field warning", () => {
    const content = `---
id: p1
map:
  members:
    - root: 0
      position: _agent/foundation.md
---
body`;
    const result = parseThreadPost(content);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.post.mapResult).toMatchObject({ status: "valid", map: { members: [] } });
      expect(result.post.warnings).toEqual([
        { field: "map.members[0].root", warning: "invalid_root_index" },
      ]);
    }
  });

  it("tolerates invalid references, in_reply_to, and supersedes with field warnings", () => {
    const content = `---
id: p1
in_reply_to: 1234
references: "not-an-array"
supersedes: ""
---
body`;
    const result = parseThreadPost(content);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.post.inReplyTo).toEqual([]);
      expect(result.post.references).toEqual([]);
      expect(result.post.supersedes).toBeUndefined();
      expect(result.post.warnings).toEqual([
        { field: "in_reply_to", warning: "invalid_in_reply_to" },
        { field: "references", warning: "invalid_references" },
        { field: "supersedes", warning: "invalid_supersedes" },
      ]);
    }
  });

  it("parses kind: mark and folds marks onto target post in timeline reconstruction", () => {
    const targetPostContent = `---
id: msg_target
author: Alice
date: 2026-10-21T07:00:00.000Z
---
Target task post.`;
    const mark1Content = `---
id: msg_m1
kind: mark
mark: claimed
author: Integrator
in_reply_to: msg_target
date: 2026-10-21T07:10:00.000Z
---
Claimed.`;
    const mark2Content = `---
id: msg_m2
kind: mark
mark: claimed
author: Integrator
in_reply_to: msg_target
date: 2026-10-21T07:15:00.000Z
---
Claimed again.`;
    const mark3Content = `---
id: msg_m3
kind: mark
mark: done
author: Integrator
in_reply_to: msg_target
date: 2026-10-21T07:20:00.000Z
---
Done.`;
    const correctionContent = `---
id: msg_m4
kind: correction
supersedes: msg_m1
in_reply_to: msg_target
date: 2026-10-21T07:25:00.000Z
---
Superseded old claim.`;

    const parsedTarget = parseThreadPost(targetPostContent, "_threads/t/01.md");
    const parsedM1 = parseThreadPost(mark1Content, "_threads/t/02.md");
    const parsedM2 = parseThreadPost(mark2Content, "_threads/t/03.md");
    const parsedM3 = parseThreadPost(mark3Content, "_threads/t/04.md");
    const parsedM4 = parseThreadPost(correctionContent, "_threads/t/05.md");

    expect(parsedTarget.status).toBe("valid");
    expect(parsedM1.status).toBe("valid");
    expect(parsedM2.status).toBe("valid");
    expect(parsedM3.status).toBe("valid");
    expect(parsedM4.status).toBe("valid");

    if (
      parsedTarget.status === "valid" &&
      parsedM1.status === "valid" &&
      parsedM2.status === "valid" &&
      parsedM3.status === "valid" &&
      parsedM4.status === "valid"
    ) {
      expect(parsedM1.post.kind).toBe("mark");
      expect(parsedM1.post.mark).toBe("claimed");

      const timeline = reconstructThreadTimeline([
        parsedTarget.post,
        parsedM1.post,
        parsedM2.post,
        parsedM3.post,
        parsedM4.post,
      ]);

      // Timeline only contains non-mark posts
      expect(timeline.posts.map((p) => p.id)).toEqual(["msg_target", "msg_m4"]);

      // Target post has marks folded: msg_m1 was superseded by msg_m4, msg_m2 is deduplicated, msg_m3 is done
      const targetInTimeline = timeline.postsById.get("msg_target");
      expect(targetInTimeline?.marks).toEqual([
        {
          author: "Integrator",
          mark: "claimed",
          id: "msg_m2",
          date: "2026-10-21T07:15:00.000Z",
        },
        {
          author: "Integrator",
          mark: "done",
          id: "msg_m3",
          date: "2026-10-21T07:20:00.000Z",
        },
      ]);
    }
  });

  it("parses typed attached_to on opening post and resolves only post: as tree edges", () => {
    const postNote = parseThreadPost(`---
id: msg_open1
attached_to: note:@notes//docs/api.md
---
Opening post`);
    const postRepo = parseThreadPost(`---
id: msg_open2
attached_to: repo:n_0123456789abcdef01234567
---
Opening post`);
    const postParent = parseThreadPost(`---
id: msg_open3
attached_to: post:msg_parent
---
Opening post`);

    expect(postNote.status).toBe("valid");
    expect(postRepo.status).toBe("valid");
    expect(postParent.status).toBe("valid");

    if (postNote.status === "valid" && postRepo.status === "valid" && postParent.status === "valid") {
      expect(postNote.post.attachedTo).toEqual({
        kind: "note",
        value: "@notes//docs/api.md",
        raw: "note:@notes//docs/api.md",
      });
      expect(postRepo.post.attachedTo).toEqual({
        kind: "repo",
        value: "n_0123456789abcdef01234567",
        raw: "repo:n_0123456789abcdef01234567",
      });
      expect(postParent.post.attachedTo).toEqual({
        kind: "post",
        value: "msg_parent",
        raw: "post:msg_parent",
      });

      const root = {
        root: "space",
        pin: "p1",
        posts: [{ path: "_threads/t1/01.md", id: "msg_parent" }],
      };

      // Only post: resolves as a parent edge
      expect(resolveThreadParent(postParent.post.attachedTo!, [root])).toEqual({
        status: "resolved",
        parent: { root: "space", pin: "p1", path: "_threads/t1/01.md", id: "msg_parent" },
      });
      expect(resolveThreadParent(postNote.post.attachedTo!, [root])).toEqual({
        status: "none", attachment: postNote.post.attachedTo,
      });
      expect(resolveThreadParent(postRepo.post.attachedTo!, [root])).toEqual({
        status: "none", attachment: postRepo.post.attachedTo,
      });
    }
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
    const covered = new Set([...manifest.vectors, ...attachments.vectors, ...metalayer.vectors].flatMap((vector: any) => vector.covers));
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
