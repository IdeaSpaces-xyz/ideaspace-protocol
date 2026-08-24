import { describe, expect, it } from "vitest";
import {
  validateCommitPathsRequest,
  validateLocalEffectPath,
  validateWriteMarkdownRequest,
} from "./local-effects.js";

const absent = { worktree: null, index: null, head: null };
const present = { worktree: "worktree-oid", index: "index-oid", head: "head-oid" };

function writeRequest() {
  return {
    operation: "write_markdown",
    root: "/repo",
    path: "notes/hello.md",
    expected_revision: absent,
    frontmatter: {
      mode: "preserve",
      set: { name: "Hello", unknown: { nested: [1, true, null] } },
      remove: ["old"],
    },
    body: "# Hello\n",
    stage: true,
  };
}

function commitRequest() {
  return {
    operation: "commit_paths",
    root: "/repo",
    paths: [{ path: "notes/hello.md", expected_revision: present }],
    message: "Capture hello",
    trailers: {
      op: "capture",
      conversation: "session-1",
      turn: 2,
      co_authored_by: ["Keeper <agent:keeper@ideaspaces>"],
      change_id: "chg_hello-a3f9",
    },
    author: { name: "Person", email: "person@example.com" },
    committer: { name: "Person", email: "person@example.com" },
  };
}

describe("local-effect path grammar", () => {
  it.each([
    "notes/a.md",
    "notes/space name/日本語.md",
    "plain-file",
    ".hidden/file.md",
  ])("accepts %s", (path) => {
    expect(validateLocalEffectPath(path)).toBeNull();
  });

  it.each([
    ["", "invalid_path"],
    ["/absolute.md", "path_escape"],
    ["../outside.md", "path_escape"],
    ["notes/../outside.md", "path_escape"],
    ["notes//a.md", "invalid_path"],
    ["notes/./a.md", "invalid_path"],
    ["notes\\a.md", "invalid_path"],
    [".git/config", "reserved_git_path"],
    ["notes/.GIT/config", "reserved_git_path"],
  ])("rejects %s", (path, code) => {
    expect(validateLocalEffectPath(path)?.code).toBe(code);
  });

  it("applies the Markdown-only constraint only to writes", () => {
    expect(validateLocalEffectPath("src/index.ts")).toBeNull();
    expect(validateLocalEffectPath("src/index.ts", true)?.code).toBe("invalid_path");
  });
});

describe("write_markdown request validation", () => {
  it("accepts exact and explicit-any revision preconditions", () => {
    expect(validateWriteMarkdownRequest(writeRequest()).ok).toBe(true);
    expect(
      validateWriteMarkdownRequest({ ...writeRequest(), expected_revision: "any" }).ok,
    ).toBe(true);
  });

  it("rejects overlapping patch keys and non-finite values", () => {
    const request = writeRequest();
    request.frontmatter = {
      mode: "preserve",
      set: { old: Number.NaN },
      remove: ["old"],
    };
    const result = validateWriteMarkdownRequest(request);
    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual([
      "invalid_frontmatter_patch",
      "invalid_frontmatter_patch",
    ]);
  });

  it("rejects incomplete path revisions", () => {
    const result = validateWriteMarkdownRequest({
      ...writeRequest(),
      expected_revision: { worktree: null, index: null },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((item) => item.field === "expected_revision.head")).toBe(true);
  });
});

describe("commit_paths request validation", () => {
  it("accepts exact paths, explicit identities, and canonical trailers", () => {
    const result = validateCommitPathsRequest(commitRequest());
    expect(result).toMatchObject({ ok: true, issues: [] });
  });

  it("rejects duplicate paths and an any commit precondition", () => {
    const entry = { path: "notes/hello.md", expected_revision: present };
    const result = validateCommitPathsRequest({
      ...commitRequest(),
      paths: [entry, entry, { path: "other.md", expected_revision: "any" }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((item) => item.message === "paths must not repeat")).toBe(true);
    expect(result.issues.some((item) => item.field === "paths[2].expected_revision")).toBe(true);
  });

  it("rejects missing identity and malformed structured trailers", () => {
    const result = validateCommitPathsRequest({
      ...commitRequest(),
      trailers: {
        op: "ship",
        co_authored_by: ["not an agent identity"],
        change_id: "change-1",
      },
      author: { name: "", email: "not-an-email" },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.code)).toContain("invalid_identity");
    expect(result.issues.filter((item) => item.code === "invalid_trailers")).toHaveLength(3);
  });

  it("rejects a structured trailer that conflicts with the base message", () => {
    const result = validateCommitPathsRequest({
      ...commitRequest(),
      message: "Capture hello\n\nOp: update",
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_trailers", field: "trailers" }),
    );
  });

  it.each([
    "Capture hello\n\nTurn: nope",
    "Capture hello\n\nTurn: 1x",
    "Capture hello\n\nOp: capture\nOp: capture",
  ])("rejects invalid or repeated protocol trailers already in the message", (message) => {
    const result = validateCommitPathsRequest({ ...commitRequest(), message });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_trailers", field: "message" }),
    );
  });
});
