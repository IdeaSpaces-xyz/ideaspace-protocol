import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check, list, who, companyRepoViewerGrant, type AccessFacts, type AccessActor, type AccessTarget, type AccessRelation, type AccessTargetKind } from "./access.js";
import * as protocol from "./index.js";
const manifestUrl = new URL("../conformance/access/manifest.json", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
interface Input {
  facts: AccessFacts; actor: AccessActor; target: AccessTarget; relation: AccessRelation; now: number;
  kind: AccessTargetKind; requireComplete?: boolean; requester: AccessActor; candidates: AccessActor[];
  repo: string; organisation: string;
}
const { vectors, git_access } = JSON.parse(readFileSync(new URL(manifest.evaluation_vectors, manifestUrl), "utf8")) as {
  git_access: { target_kind: AccessTargetKind; checks: AccessRelation[]; combine: string; same_snapshot: boolean };
  vectors: { id: string; coverage: string[]; operation: string; input: Input; expected: unknown }[];
};
describe("version-one evaluator vectors (language-neutral)", () => {
  it("publishes every query at the package root and keeps all nine quirks named", () => {
    expect(git_access).toMatchObject({ target_kind: "repo", checks: ["edit", "pull"], combine: "all", same_snapshot: true });
    expect(protocol.check).toBe(check);
    expect(protocol.list).toBe(list);
    expect(protocol.who).toBe(who);
    expect(new Set(vectors.map((v) => v.id)).size).toBe(vectors.length);
    for (let n = 1; n <= 9; n++) expect(vectors.some((v) => v.coverage.includes(`quirk_${n}`))).toBe(true);
  });
  for (const v of vectors) it(v.id, () => {
    const input = structuredClone(v.input);
    const before = JSON.stringify(input);
    const i = input;
    let actual: unknown;
    switch (v.operation) {
      case "git_access": actual = i.target.kind === git_access.target_kind && git_access.checks.every((r) =>
        check(i.facts, i.actor, i.target, r, i.now).allowed); break;
      case "check": actual = check(i.facts, i.actor, i.target, i.relation, i.now); break;
      case "list": actual = list(i.facts, i.actor, i.kind, i.relation, i.now, i.requireComplete); break;
      case "who": actual = who(i.facts, i.requester, i.candidates, i.target, i.relation, i.now); break;
      case "company_repo_grant": actual = companyRepoViewerGrant(i.repo, i.organisation); break;
      default: throw new Error(`Unknown operation ${v.operation}`);
    }
    expect(actual).toEqual(v.expected);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("list agrees with check for every supplied snapshot/actor and every relation", () => {
    for (const { operation, input: i } of vectors) {
      if (operation !== "check") continue;
      for (const relation of ["discover", "view", "edit", "pull", "owner"] as const) {
        const result = list(i.facts, i.actor, "note", relation, i.now);
        expect(result.items).toEqual(i.facts.objects.filter((o) => o.kind === "note" &&
          check(i.facts, i.actor, o, relation, i.now).allowed).map(({ kind, id }) => ({ kind, id })));
      }
    }
  });
});
