import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  validateCommitPathsRequest,
  validateWriteMarkdownRequest,
} from "./local-effects.js";

const manifestPath = fileURLToPath(
  new URL("../conformance/local-effects/manifest.json", import.meta.url),
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
  format: string;
  contents: Record<string, string>;
  required_coverage: string[];
  vectors: Array<Record<string, any>>;
};
const revision = { worktree: null, index: null, head: null };
const allowedActions = new Set([
  "write_worktree",
  "remove_worktree",
  "stage",
  "commit",
  "add_ignore",
]);

describe("language-neutral local-effect manifest", () => {
  it("has one supported format and unique vector ids", () => {
    expect(manifest.format).toBe("ideaspaces-local-effects/v1");
    const ids = manifest.vectors.map((vector) => vector.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === "string" && /^[a-z0-9-]+$/.test(id))).toBe(true);
  });

  it("covers every declared required behavior", () => {
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers ?? []));
    expect([...new Set(manifest.required_coverage)].sort()).toEqual(
      [...manifest.required_coverage].sort(),
    );
    expect([...covered].sort()).toEqual([...manifest.required_coverage].sort());
  });

  it("uses only declared state content, actions, faults, and result states", () => {
    for (const vector of manifest.vectors) {
      expect(vector.initial).toBeTypeOf("object");
      for (const place of ["head", "index", "worktree"]) {
        expect(vector.initial[place]).toBeTypeOf("object");
        for (const state of Object.values(vector.initial[place]) as Array<Record<string, string>>) {
          if (state.content && !state.content.startsWith("$CASE.")) {
            expect(manifest.contents, `${vector.id} ${place} content`).toHaveProperty(state.content);
          }
          if (state.symlink) expect(place).toBe("worktree");
        }
      }
      expect(Array.isArray(vector.initial.ignore)).toBe(true);
      for (const action of vector.before_request ?? []) {
        expect(allowedActions.has(action.action), `${vector.id} action ${action.action}`).toBe(true);
        if (action.content) expect(manifest.contents).toHaveProperty(action.content);
      }
      if (vector.fault) {
        expect(["stage", "commit"]).toContain(vector.fault.phase);
        expect(["before", "after"]).toContain(vector.fault.when);
      }
      expect(["ok", "partial", "error"]).toContain(vector.expected.result.status);
      expect(vector.expected.facts.paths).toBeTypeOf("object");
      expect(Array.isArray(vector.expected.facts.unchanged)).toBe(true);
    }
  });

  it("keeps every non-preflight-failure request aligned with the TS contract", () => {
    for (const vector of manifest.vectors) {
      if (vector.expected.result.status === "error" && vector.expected.result.phase === "preflight") {
        continue;
      }
      const cases = vector.cases ?? [null];
      for (const fixtureCase of cases) {
        const request = resolveFixtureValues(vector.request, fixtureCase);
        const result = request.operation === "write_markdown"
          ? validateWriteMarkdownRequest(request)
          : validateCommitPathsRequest(request);
        expect(result.issues, vector.id).toEqual([]);
      }
    }
  });
});

function resolveFixtureValues(value: any, fixtureCase: Record<string, string> | null): any {
  if (Array.isArray(value)) return value.map((entry) => resolveFixtureValues(entry, fixtureCase));
  if (value && typeof value === "object") {
    if (value.$revision === "reviewed") return revision;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveFixtureValues(entry, fixtureCase)]),
    );
  }
  if (value === "$ROOT") return "/fixture";
  if (typeof value === "string" && value.startsWith("$CASE.") && fixtureCase) {
    return fixtureCase[value.slice("$CASE.".length)];
  }
  return value;
}
