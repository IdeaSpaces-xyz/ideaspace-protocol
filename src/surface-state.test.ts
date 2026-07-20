import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  armingDecision,
  changeCachePath,
  parsePersistedChange,
  projectCacheKey,
  readPersistedChange,
  readSeenRef,
  sessionIdCachePath,
  SEEN_REF,
  type PersistedChange,
} from "./surface-state.js";

const NOW = 1_768_600_000_000;

describe("cache paths", () => {
  it("both kinds live under <home>/.ideaspaces/<kind>, never inside the project tree", () => {
    expect(sessionIdCachePath("/home/u", "/work/s").startsWith("/home/u/.ideaspaces/sessions/")).toBe(true);
    expect(changeCachePath("/home/u", "/work/s").startsWith("/home/u/.ideaspaces/changes/")).toBe(true);
    expect(sessionIdCachePath("/home/u", "/work/s").includes("/work/s")).toBe(false);
  });

  it("share one derivation, differing only in the kind subdir", () => {
    expect(sessionIdCachePath("/home/u", "/work/a").split("/").pop()).toBe(
      changeCachePath("/home/u", "/work/a").split("/").pop(),
    );
  });

  it("resolve the project dir so equivalent paths key identically", () => {
    expect(projectCacheKey("/work/a")).toBe(projectCacheKey("/work/./a"));
    expect(projectCacheKey("/work/a")).toBe(projectCacheKey("/work/b/../a"));
    expect(projectCacheKey("/work/a")).not.toBe(projectCacheKey("/work/b"));
  });

  it("produce a 16-char hex key", () => {
    expect(projectCacheKey("/work/a")).toMatch(/^[0-9a-f]{16}$/);
  });

  // The cross-implementation lock: every surface (and any third-party runtime)
  // MUST reproduce these exact paths, or it can't read what another wrote. The
  // four consumer copies assert the same value; this is now its source.
  it("match the cross-implementation golden value", () => {
    expect(sessionIdCachePath("/home/u", "/work/a")).toBe("/home/u/.ideaspaces/sessions/d7f9747246691548");
    expect(changeCachePath("/home/u", "/work/a")).toBe("/home/u/.ideaspaces/changes/d7f9747246691548");
  });
});

describe("parsePersistedChange", () => {
  it("parses a full record", () => {
    const raw = JSON.stringify({ change_id: "chg_x-1a2b", handle: "h", opened_at: NOW, session_id: "s1" });
    expect(parsePersistedChange(raw)).toEqual({ change_id: "chg_x-1a2b", handle: "h", opened_at: NOW, session_id: "s1" });
  });

  it("defaults a missing opened_at to 0 and drops non-string optionals", () => {
    expect(parsePersistedChange(JSON.stringify({ change_id: "chg_x-1a2b", handle: 7, session_id: 9 }))).toEqual({
      change_id: "chg_x-1a2b",
      handle: undefined,
      opened_at: 0,
      session_id: undefined,
    });
  });

  it("fails open (undefined) on malformed JSON, a non-object, or a bad change_id", () => {
    expect(parsePersistedChange("not json {")).toBeUndefined();
    expect(parsePersistedChange('"chg_x-1a2b"')).toBeUndefined();
    expect(parsePersistedChange("null")).toBeUndefined();
    expect(parsePersistedChange(JSON.stringify({ opened_at: 1 }))).toBeUndefined();
    expect(parsePersistedChange(JSON.stringify({ change_id: "CHG_NOPE", opened_at: 1 }))).toBeUndefined();
  });
});

describe("readPersistedChange", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "is-surface-state-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads and validates a record from disk", async () => {
    const file = join(dir, "rec");
    const rec: PersistedChange = { change_id: "chg_x-1a2b", handle: "h", opened_at: NOW, session_id: "s1" };
    writeFileSync(file, JSON.stringify(rec) + "\n");
    expect(await readPersistedChange(file)).toEqual(rec);
  });

  it("returns undefined for an absent file", async () => {
    expect(await readPersistedChange(join(dir, "nope"))).toBeUndefined();
  });
});

describe("armingDecision", () => {
  const rec = (session_id?: string): PersistedChange => ({ change_id: "chg_x-1a2b", opened_at: 1, session_id });

  it("none when nothing is persisted", () => {
    expect(armingDecision(undefined, "s1")).toBe("none");
  });

  it("arms silently only for the same session", () => {
    expect(armingDecision(rec("s1"), "s1")).toBe("arm");
  });

  it("surfaces for a different session — and cross-surface, since ids never collide", () => {
    expect(armingDecision(rec("s1"), "s2")).toBe("surface");
    // A Claude Code session id shape can never equal a Pi one → always surfaces.
    expect(armingDecision(rec("6132b385-f9b4-4730-af69-ef8f0ddbe59c"), "019f6fa6-bce0-7313-af58-d3cb1aa94f55")).toBe("surface");
  });

  it("surfaces (never arms) when either side lacks a session id", () => {
    expect(armingDecision(rec(undefined), "s1")).toBe("surface");
    expect(armingDecision(rec("s1"), undefined)).toBe("surface");
    expect(armingDecision(rec(undefined), undefined)).toBe("surface");
  });
});

describe("readSeenRef", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "is-seen-ref-"));
    const g = (args: string[]) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf-8" });
    g(["init", "-q"]);
    g(["config", "user.email", "t@t"]);
    g(["config", "user.name", "T"]);
    g(["commit", "-q", "--allow-empty", "-m", "init"]);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("returns undefined when the ref is unset (a first session)", async () => {
    expect(await readSeenRef(repo)).toBeUndefined();
  });

  it("returns the sha the ref points at once written", async () => {
    const head = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();
    spawnSync("git", ["-C", repo, "update-ref", SEEN_REF, head]);
    expect(await readSeenRef(repo)).toBe(head);
  });

  it("returns undefined outside a git repo", async () => {
    const notRepo = mkdtempSync(join(tmpdir(), "is-not-repo-"));
    mkdirSync(join(notRepo, "sub"), { recursive: true });
    expect(await readSeenRef(notRepo)).toBeUndefined();
    rmSync(notRepo, { recursive: true, force: true });
  });
});
