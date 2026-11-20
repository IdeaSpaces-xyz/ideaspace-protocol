import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENTRY_KINDS,
  LEGACY_ENTRY_KINDS,
  currentMap,
  inspectEntries,
  isEntryPath,
  parseEntry,
  readsTime,
  reconstructTimeline,
  resolveEntryById,
  selectEntries,
  type Entry,
  type EntryInspection,
  type InspectEntriesOptions,
  type TimeKeeping,
} from "./time.js";
import {
  THREAD_KINDS,
  currentThreadMap,
  inspectThreadPosts,
  parseThreadAgreementAttachment,
  parseThreadPost,
  reconstructThreadTimeline,
  resolveThreadPostById,
} from "./threads.js";
import * as protocol from "./index.js";

const read = (relative: string) => JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf-8"));
const manifest = read("../conformance/time/manifest.json");
const state = read("../conformance/time/state.json");
const memory = read("../conformance/time/memory.json");
const threadFiles: Record<string, any> = Object.fromEntries(
  manifest.threads_vectors.files.map((file: string) => [file, read(`../conformance/threads/${file}`)]),
);

/** A folder that keeps time by declaration, where the Thread vectors' `_threads/<thread>/` paths go. */
const DECLARED = manifest.threads_vectors.declared_folder as string;
const THREAD_PATH = /^_threads\/[^/]+\//;

/**
 * Move a vector out of `_threads/`: every path value (input and expected) whose first two segments
 * are `_threads/<thread>/` becomes `<declared>/`. Field values such as `parent: post:_threads/…` are
 * references, not paths, and stay as authored.
 */
function declared<T>(value: T, key?: string): T {
  if (Array.isArray(value)) {
    return value.map((item) => declared(item, key === "unreadablePaths" || key === "undated" || key === "notes" ? "path" : undefined)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, declared(v, k)])) as T;
  }
  if (typeof value === "string") {
    if (key === "path" || key === "post") return value.replace(THREAD_PATH, `${DECLARED}/`) as T;
    if (key === "writeRefusal") return value.replace(/_threads\/[^/]+\//g, `${DECLARED}/`) as T;
  }
  return value;
}

type Mode = { keeping: TimeKeeping; folder?: string };
const PLACEMENT: Mode = { keeping: "placement" };
const AGREEMENT: Mode = { keeping: "agreement", folder: DECLARED };

const rawLink = (value: EntryInspection["parent"] | undefined) =>
  value === "unknown" || value === null || value === undefined ? value ?? null : value.raw;

function checkInspection(inspection: EntryInspection, expected: any): void {
  if ("parent" in expected) expect(rawLink(inspection.parent)).toBe(expected.parent);
  if (expected.origin !== undefined) expect(rawLink(inspection.origin)).toBe(expected.origin);
  if ("closed" in expected) expect(inspection.closed).toBe(expected.closed);
  if ("writable" in expected) expect(inspection.writable).toBe(expected.writable);
  if ("writeRefusal" in expected) expect(inspection.writeRefusal).toBe(expected.writeRefusal);
  if ("movedTo" in expected) expect(inspection.movedTo).toBe(expected.movedTo);
  if ("source" in expected) expect(inspection.source).toBe(expected.source);
  for (const handle of ["parentPost", "aboutPost", "closedPost", "movedToPost", "namePost", "summaryPost"] as const) {
    if (handle in expected) expect(inspection[handle] ?? null).toEqual(expected[handle]);
  }
  if ("about" in expected) expect(inspection.about.map((link) => link.raw)).toEqual(expected.about);
  if ("name" in expected) expect(inspection.name).toBe(expected.name);
  if ("summary" in expected) expect(inspection.summary).toBe(expected.summary);
  if (expected.readableIds) expect(inspection.posts.map((p) => p.id)).toEqual(expected.readableIds);
  if (expected.notes) expect(inspection.notes).toEqual(expected.notes);
  if (expected.superseded) expect(inspection.superseded).toEqual(expected.superseded);
  if (expected.current) {
    const superseded = new Set(inspection.superseded);
    expect(inspection.posts.filter((p) => !superseded.has(p.id)).map((p) => p.id)).toEqual(expected.current);
  }
  if (expected.unreadablePaths) {
    expect(inspection.unreadable.map((p) => p.path)).toEqual(expected.unreadablePaths);
    for (const path of expected.unreadablePaths) expect(inspection.warnings.some((w) => w.post === path)).toBe(true);
  }
  if (expected.warnings) expect(inspection.warnings).toEqual(expected.warnings);
  if (expected.asOf) expect(inspection.asOf).toEqual(expected.asOf);
}

function checkCurrentMap(result: ReturnType<typeof currentMap>, expected: any): void {
  expect(result.status).toBe(expected.status);
  expect(result.post).toEqual(expected.post);
  expect(result.reason).toBe(expected.reason);
  expect(result.skipped).toEqual(expected.skipped);
  expect(result.warnings).toEqual(expected.warnings);
  expect(result.lookback).toEqual(expected.lookback);
  if (expected.members === undefined) expect(result.map).toBeUndefined();
  else expect(result.map?.members.map((member: any) => member.position)).toEqual(expected.members);
}

/** Run one Thread vector through the time operations, in the given mode. */
function executeThreadVector(vector: any, mode: Mode): void {
  const options: InspectEntriesOptions = { keeping: mode.keeping, ...(mode.folder ? { folder: mode.folder } : {}) };
  switch (vector.operation) {
    case "parse_post": {
      const parsed = parseEntry(vector.input.content, vector.input.path, { keeping: mode.keeping });
      expect(parsed.status).toBe(vector.expected.status);
      if (parsed.status !== "valid") return;
      expect(parsed.post.id).toBe(vector.expected.id ?? vector.expected.post?.id);
      if (vector.expected.warnings) expect(parsed.post.warnings).toEqual(vector.expected.warnings);
      if ("parent" in vector.expected) expect(rawLink(parsed.post.parent)).toBe(vector.expected.parent);
      if ("about" in vector.expected) expect(parsed.post.about?.map((link) => link.raw) ?? null).toEqual(vector.expected.about);
      if ("attachedTo" in vector.expected) expect(rawLink(parsed.post.attachedTo)).toBe(vector.expected.attachedTo);
      if (vector.expected.mapDropped) expect(parsed.post.mapResult).toBeUndefined();
      if (vector.expected.mapMemberPositions) {
        expect(parsed.post.mapResult?.status).toBe("valid");
        if (parsed.post.mapResult?.status === "valid") {
          expect(parsed.post.mapResult.map.members.filter((m) => "position" in m).map((m) => m.position))
            .toEqual(vector.expected.mapMemberPositions);
        }
      }
      return;
    }
    case "reconstruct_timeline": {
      const posts = vector.input.posts.map(({ content, path }: any) => {
        const parsed = parseEntry(content, path);
        if (parsed.status !== "valid") throw new Error(`Invalid fixture ${path}`);
        return parsed.post;
      });
      const timeline = reconstructTimeline(posts);
      expect(timeline.posts.map((p) => p.id)).toEqual(vector.expected.linearized_ids);
      if (vector.expected.childOf) expect(timeline.childrenByParentId.get(vector.expected.childOf)?.map((p) => p.id)).toEqual(vector.expected.childIds);
      if (vector.expected.kind) expect(timeline.postsById.get(vector.expected.kindPost)?.kind).toBe(vector.expected.kind);
      if (vector.expected.warningPost) expect(timeline.postsById.get(vector.expected.warningPost)?.warnings).toContainEqual(vector.expected.warning);
      if (vector.expected.markValues) {
        expect(timeline.postsById.get(vector.expected.markTarget)?.marks?.map((m) => m.mark)).toEqual(vector.expected.markValues);
        expect(timeline.postsById.get(vector.expected.markTarget)?.marks?.map((m) => m.id)).toEqual(vector.expected.markIds);
      }
      return;
    }
    case "inspect_posts": {
      // The Agreement's fallback parent is the Threads kind's; its parsed value is passed in either mode.
      const agreementAttachment = vector.input.agreement
        ? parseThreadAgreementAttachment(vector.input.agreement, "_threads/child/_agent/agreement.md") : undefined;
      const inspection = inspectEntries(vector.input.sources, { ...options, ...(agreementAttachment ? { agreementAttachment } : {}) });
      checkInspection(inspection, vector.expected);
      return;
    }
    case "current_thread_map":
    default: {
      if (!vector.posts) throw new Error(`Unknown operation ${vector.operation}`);
      checkCurrentMap(currentMap(vector.posts, { ...vector.options, ...options }), vector.expected);
    }
  }
}

/** The Thread vectors a time implementation must pass: the listed operations, from the listed files. */
function threadVectors(): any[] {
  const operations = new Set<string>(manifest.threads_vectors.operations);
  return Object.entries(threadFiles).flatMap(([file, data]) =>
    (data.vectors as any[]).filter((vector) => operations.has(vector.operation ?? data.operation))
      .map((vector) => ({ ...vector, operation: vector.operation ?? data.operation, file })));
}

describe("time: the manifest", () => {
  it("publishes the state, memory and Thread-vector rules with complete coverage", () => {
    expect(manifest.format).toBe("ideaspaces-time/v1");
    expect(manifest.state_vectors).toBe("state.json");
    expect(manifest.memory_vectors).toBe("memory.json");
    expect(state.format).toBe("ideaspaces-time-state/v1");
    expect(memory.format).toBe("ideaspaces-time-memory/v1");
    expect(manifest.threads_vectors.files).toEqual(["metalayer.json", "parent.json", "current-map.json"]);
    const covered = new Set([...state.vectors, ...memory.vectors].flatMap((vector: any) => vector.covers)
      .concat(manifest.threads_vectors.covers));
    for (const requirement of manifest.required_coverage) expect(covered.has(requirement), requirement).toBe(true);
    expect(threadVectors().length).toBeGreaterThan(60);
  });

  it("names the kinds a writer offers and the legacy ones a reader keeps", () => {
    expect(ENTRY_KINDS).toEqual(["post", "reframe", "correction", "mark"]);
    expect(LEGACY_ENTRY_KINDS).toEqual(["snapshot", "closure"]);
    expect([...ENTRY_KINDS, ...LEGACY_ENTRY_KINDS].sort()).toEqual([...THREAD_KINDS].sort());
  });

  it("keeps every Thread name as the time operation under the Thread rule", () => {
    const open = { path: "_threads/t/01.md", content: "---\nid: msg_open\nkind: closure\n---\nOpen" };
    expect(parseThreadPost(open.content, open.path)).toEqual(parseEntry(open.content, open.path));
    expect(inspectThreadPosts([open])).toEqual(inspectEntries([open]));
    expect(currentThreadMap([open])).toEqual(currentMap([open]));
    const parsed = parseEntry(open.content, open.path);
    if (parsed.status !== "valid") throw new Error("fixture");
    expect(reconstructThreadTimeline([parsed.post]).posts.map((p) => p.id)).toEqual(reconstructTimeline([parsed.post]).posts.map((p) => p.id));
    expect(resolveThreadPostById("msg_open", [{ path: open.path, id: "msg_open" }])).toEqual(resolveEntryById("msg_open", [{ path: open.path, id: "msg_open" }]));
    // The Thread name keeps the canonical-path filter; the generic one takes any supplied path.
    expect(resolveThreadPostById("msg_x", [{ path: "notes/x.md", id: "msg_x" }])).toEqual({ status: "unresolved" });
    expect(resolveEntryById("msg_x", [{ path: "notes/x.md", id: "msg_x" }])).toEqual({ status: "resolved", post: { path: "notes/x.md", id: "msg_x" } });
    for (const name of ["parseThreadPost", "inspectThreadPosts", "currentThreadMap", "reconstructThreadTimeline", "resolveThreadPostById",
      "parseEntry", "inspectEntries", "currentMap", "reconstructTimeline", "selectEntries", "resolveEntryById", "readsTime"]) {
      expect(typeof (protocol as any)[name], name).toBe("function");
    }
  });

  it("knows which paths are a folder's direct entries", () => {
    expect(isEntryPath("_threads/t/01.md")).toBe(true);
    expect(isEntryPath("_threads/t/README.md")).toBe(false);
    expect(isEntryPath("notes/01.md")).toBe(false);
    expect(isEntryPath("notes/01.md", "notes")).toBe(true);
    expect(isEntryPath("notes/README.md", "notes")).toBe(false);
    expect(isEntryPath("notes/_agent/agreement.md", "notes")).toBe(false);
    expect(isEntryPath("notes/.draft.md", "notes")).toBe(false);
    expect(isEntryPath("notes/deeper/01.md", "notes")).toBe(false);
    expect(isEntryPath("01.md", ".")).toBe(true);
    expect(isEntryPath("other/01.md", "notes")).toBe(false);
  });
});

describe("time: every Thread vector passes through the time operations", () => {
  it.each(threadVectors())("$file / $id, in _threads/", (vector: any) => executeThreadVector(vector, PLACEMENT));
  it.each(threadVectors())("$file / $id, in a declared folder", (vector: any) => executeThreadVector(declared(vector), AGREEMENT));
});

function parseAll(sources: any[], mode: Mode): Entry[] {
  return sources.flatMap((source) => {
    const parsed = parseEntry(source.content, source.path, { keeping: mode.keeping });
    return parsed.status === "valid" ? [parsed.post] : [];
  });
}

function executeStateVector(vector: any, mode: Mode): void {
  const options: InspectEntriesOptions = { keeping: mode.keeping, ...(mode.folder ? { folder: mode.folder } : {}) };
  const expected = mode.keeping === "agreement" ? { ...vector.expected, ...(vector.expected_declared ?? {}) } : vector.expected;
  if (vector.operation === "inspect") {
    checkInspection(inspectEntries(vector.sources, { ...options, ...(vector.asOf ? { asOf: vector.asOf } : {}) }), expected);
  } else if (vector.operation === "current_map") {
    checkCurrentMap(currentMap(vector.posts, { ...vector.options, ...options }), expected);
  } else if (vector.operation === "select") {
    const selection = selectEntries(parseAll(vector.sources, mode), vector.window);
    expect(selection.status).toBe(expected.status);
    if (selection.status !== "ok") return;
    expect(selection.entries.map((entry) => entry.id)).toEqual(expected.ids);
    if (expected.undated) expect(selection.undated).toEqual(expected.undated);
    if (expected.cursors) expect(selection.cursors).toEqual(expected.cursors);
  } else throw new Error(`Unknown operation ${vector.operation}`);
}

describe("time: entries set state, and are selected in time", () => {
  it.each(state.vectors)("$id, in _threads/", (vector: any) => executeStateVector(vector, PLACEMENT));
  it.each(state.vectors)("$id, in a declared folder", (vector: any) => executeStateVector(declared(vector), AGREEMENT));

  it("does not depend on the order entries are supplied in", () => {
    const vector = state.vectors.find((entry: any) => entry.id === "a-correction-supersedes-an-entry");
    expect(inspectEntries([...vector.sources].reverse())).toEqual(inspectEntries(vector.sources));
    const entries = parseAll(vector.sources, PLACEMENT);
    expect(selectEntries([...entries].reverse(), { newest: 2 })).toEqual(selectEntries(entries, { newest: 2 }));
  });
});

describe("time: memory is the fixture", () => {
  const folder = memory.folder as string;
  const sourcesOf = (vector: any) => vector.files.map((name: string) => memory.files[name]);
  const options: InspectEntriesOptions = { keeping: "agreement", folder };

  it("declares time in the folder's own Agreement", () => {
    expect(readsTime(JSON.parse(JSON.stringify(protocol.parseFrontmatter(memory.agreement))))).toEqual({ keeps: true });
  });

  it.each(memory.vectors)("$id", (vector: any) => {
    if (vector.operation === "reads_time") {
      for (const testCase of vector.cases) expect(readsTime(testCase.frontmatter), JSON.stringify(testCase.frontmatter)).toEqual(testCase.expected);
    } else if (vector.operation === "inspect") {
      checkInspection(inspectEntries(sourcesOf(vector), { ...options, ...(vector.asOf ? { asOf: vector.asOf } : {}) }), vector.expected);
    } else if (vector.operation === "select") {
      const selection = selectEntries(parseAll(sourcesOf(vector), AGREEMENT), vector.window);
      expect(selection.status).toBe(vector.expected.status);
      if (selection.status === "ok") {
        expect(selection.entries.map((entry) => entry.id)).toEqual(vector.expected.ids);
        expect(selection.undated).toEqual(vector.expected.undated);
      }
    } else if (vector.operation === "current_map") {
      checkCurrentMap(currentMap(sourcesOf(vector), options), vector.expected);
    } else throw new Error(`Unknown operation ${vector.operation}`);
  });

  it("turns time on for a folder of Notes without flagging one of them", () => {
    const notes = Object.values(memory.files as Record<string, any>).filter((file) => !/\nid:/.test(file.content));
    expect(notes.length).toBeGreaterThan(1);
    const inspection = inspectEntries(notes, options);
    expect(inspection.notes).toEqual(notes.map((file) => file.path).sort());
    expect(inspection.posts).toEqual([]);
    expect(inspection.unreadable).toEqual([]);
    expect(inspection.warnings).toEqual([]);
    expect(inspection.writable).toBe(true);
    // Under the Thread rule the same files would be unreadable: placement is the stricter rule.
    expect(inspectEntries(notes, { keeping: "placement", folder }).unreadable.map((entry) => entry.issues)).toEqual(notes.map(() => ["invalid_id"]));
  });
});
