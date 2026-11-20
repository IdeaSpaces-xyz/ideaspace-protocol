import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkVerbAnswer,
  FACT_FIELDS,
  MAP_REQUESTS,
  POST_REQUESTS,
  renderVerbAnswer,
  SAID_FORBIDDEN_WORDS,
  spellVerb,
  validateVerbRequest,
  VERB_NAMESPACE,
  VERB_REASON_CODES,
  VERB_ROUTES,
  VERBS,
  type VerbAnswer,
  type VerbContext,
  type VerbRoute,
  type Verb,
} from "./verbs.js";

interface Vector {
  id: string;
  operation: "spell_verb" | "validate_request" | "check_answer" | "render_answer";
  covers: string[];
  context?: VerbContext;
  request?: Record<string, unknown>;
  answer?: Record<string, unknown>;
  expected?: unknown;
  cases?: Array<Record<string, unknown>>;
}

const manifest = JSON.parse(
  readFileSync(new URL("../conformance/verbs/manifest.json", import.meta.url), "utf-8"),
) as {
  format: string;
  verbs: string[];
  namespace: string;
  routes: Record<string, string>;
  post_requests: string[];
  map_requests: string[];
  fact_fields: string[];
  reason_codes: string[];
  said_forbidden_words: string[];
  required_coverage: string[];
  vectors: Vector[];
};

const OPERATIONS = new Set(["spell_verb", "validate_request", "check_answer", "render_answer"]);

/** Replace every `$CASE.<field>` string with that case's field, as the local-effects runner does. */
function materialize<T>(value: T, kase: Record<string, unknown>): T {
  if (typeof value === "string") {
    const match = /^\$CASE\.([a-z_]+)$/.exec(value);
    if (match) return kase[match[1]] as T;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => materialize(item, kase)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, materialize(v, kase)])) as T;
  }
  return value;
}

function expand(vector: Vector): Array<{ id: string; vector: Vector }> {
  if (!vector.cases) return [{ id: vector.id, vector }];
  return vector.cases.map((kase, index) => ({
    id: `${vector.id}#${index}`,
    vector: { ...materialize({ ...vector, cases: undefined }, kase), expected: kase.expected ?? vector.expected, ...(vector.operation === "spell_verb" ? kase : {}) },
  }));
}

describe("the four verbs: language-neutral manifest", () => {
  it("has the supported format, the fixed lists, and unique vector ids", () => {
    expect(manifest.format).toBe("ideaspaces-verbs/v1");
    expect(manifest.verbs).toEqual([...VERBS]);
    expect(manifest.namespace).toBe(VERB_NAMESPACE);
    expect(manifest.routes).toEqual(VERB_ROUTES);
    expect(manifest.post_requests).toEqual([...POST_REQUESTS]);
    expect(manifest.map_requests).toEqual([...MAP_REQUESTS]);
    expect(manifest.fact_fields).toEqual([...FACT_FIELDS]);
    expect(manifest.reason_codes).toEqual([...VERB_REASON_CODES]);
    const ids = manifest.vectors.map((vector) => vector.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const vector of manifest.vectors) expect(OPERATIONS.has(vector.operation), vector.id).toBe(true);
  });

  it("carries AX's forbidden list, and every vector that checks words uses all of it", () => {
    expect(manifest.said_forbidden_words).toEqual([...SAID_FORBIDDEN_WORDS]);
    for (const vector of manifest.vectors) {
      const words = vector.context?.forbidden_words;
      if (vector.operation !== "check_answer" || !words || words.length === 0) continue;
      expect(words, vector.id).toEqual([...SAID_FORBIDDEN_WORDS]);
    }
  });

  it("covers every required behavior and names no uncovered tag", () => {
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    expect([...covered].sort()).toEqual([...manifest.required_coverage].sort());
  });

  it.each(manifest.vectors.flatMap(expand))("executes $id", ({ vector }) => {
    switch (vector.operation) {
      case "spell_verb": {
        const kase = vector as unknown as { route: VerbRoute; verb: Verb; expected: string };
        expect(spellVerb(kase.route, kase.verb)).toBe(kase.expected);
        return;
      }
      case "validate_request":
        expect(validateVerbRequest(vector.request, vector.context ?? {})).toEqual(vector.expected);
        return;
      case "check_answer":
        expect(checkVerbAnswer(vector.answer, vector.context ?? {})).toEqual(vector.expected);
        return;
      case "render_answer":
        expect(renderVerbAnswer(vector.answer as unknown as VerbAnswer)).toBe(vector.expected);
        return;
    }
  });
});

describe("the four verbs: reference behaviour beyond the vectors", () => {
  it("is pure: the same request and context give the same answer, and the input is not changed", () => {
    const request = { verb: "post", target: "_threads/t", body: "x" };
    const before = JSON.stringify(request);
    const first = validateVerbRequest(request);
    const second = validateVerbRequest(request);
    expect(first).toEqual(second);
    expect(JSON.stringify(request)).toBe(before);
  });

  it("the three guards fail closed: no caller reads as agent, nothing the person said reads as not from the person", () => {
    const revoke = validateVerbRequest({ verb: "post", target: "repo:n_0", request: "revoke", from: "@b" }, { person_named: ["repo:n_0", "@b"] });
    expect(revoke).toMatchObject({ status: "refused", reason_code: "person_only" });
    const publish = validateVerbRequest({ verb: "post", target: "/a/space", request: "publish" }, { caller: "agent" });
    expect(publish).toMatchObject({ status: "refused", reason_code: "not_from_person", field: "request" });
    const named = validateVerbRequest({ verb: "post", target: "/a/space", request: "publish" }, { caller: "agent", person_asked: ["publish"] });
    expect(named).toMatchObject({ status: "refused", reason_code: "not_from_person", field: "target" });
    const look = validateVerbRequest({ verb: "look", target: "thread:x_0123456789abcdef01234567" }, {});
    expect(look).toMatchObject({ status: "refused", reason_code: "out_of_reach" });
  });

  it("a secret is found anywhere in the answer, the problem names the field and never the value, and an empty secret matches nothing", () => {
    const secrets = ["ist_live_canary_t0k3n", ""];
    const clean = checkVerbAnswer({ said: "Saved.", facts: { outcome: "ok", look: { name: "Plan", summary: "A plan." } } }, { secrets });
    expect(clean).toEqual({ status: "valid" });
    const leaked = checkVerbAnswer({ said: "Saved.", facts: { outcome: "ok", look: { name: "Plan", summary: "token ist_live_canary_t0k3n" } } }, { secrets });
    expect(leaked).toEqual({ status: "invalid", problems: [{ code: "credential_in_answer", field: "look" }] });
    expect(JSON.stringify(leaked)).not.toContain("canary");
    // A secret used as a field name: in facts, at the top level, and inside look. No report carries it.
    const asFactName = checkVerbAnswer({ said: "Saved.", facts: { outcome: "ok", ist_live_canary_t0k3n: "x" } }, { secrets });
    expect(asFactName).toEqual({ status: "invalid", problems: [{ code: "credential_in_answer", field: "facts" }] });
    const asTopName = checkVerbAnswer({ said: "Saved.", facts: { outcome: "ok" }, ist_live_canary_t0k3n: "x" }, { secrets });
    expect(asTopName).toEqual({ status: "invalid", problems: [{ code: "credential_in_answer", field: "answer" }] });
    const asLookName = checkVerbAnswer({ said: "Saved.", facts: { outcome: "ok", look: { name: "Plan", ist_live_canary_t0k3n: "x" } } }, { secrets });
    expect(asLookName).toEqual({ status: "invalid", problems: [{ code: "credential_in_answer", field: "look" }] });
    for (const result of [asFactName, asTopName, asLookName]) expect(JSON.stringify(result)).not.toContain("canary");
  });

  it("a list is read only with the person, needs no reach, and what it listed reaches nothing", () => {
    expect(validateVerbRequest({ verb: "map", start: "ideaspaces" }, { lists: true }).status).toBe("valid");
    expect(validateVerbRequest({ verb: "map", start: "ideaspaces" }, {})).toMatchObject({ reason_code: "no_lists" });
    expect(validateVerbRequest({ verb: "map", start: "person:@janis" }, { lists: true, reach: [] }).status).toBe("valid");
    const listed = { lists: true, listed: ["thread:x_0123456789abcdef01234567"] };
    expect(validateVerbRequest({ verb: "look", target: "thread:x_0123456789abcdef01234567" }, listed)).toMatchObject({ reason_code: "out_of_reach" });
    expect(validateVerbRequest({ verb: "look", target: "thread:x_0123456789abcdef01234567" }, { ...listed, reach: ["thread:x_0123456789abcdef01234567"] }).status).toBe("valid");
  });

  it("a handle is a handle by shape alone", () => {
    const facts = (who: string) => ({ outcome: "ok" as const, access: { public: false, people: [{ who, level: "Viewer" }], teams: [], pending: 0 } });
    expect(checkVerbAnswer({ said: "A sentence.", facts: facts("@janis_b-2") }, { lists: true }).status).toBe("valid");
    for (const bad of ["janis@example.com", "@", "@jānis", "@janis b", ""]) {
      expect(checkVerbAnswer({ said: "A sentence.", facts: facts(bad) }, { lists: true }), bad).toEqual({ status: "invalid", problems: [{ code: "who_not_a_handle", field: "access.people[0].who" }] });
    }
    // Readers are a list: without the person, an access object fails and not_checked passes.
    expect(checkVerbAnswer({ said: "A sentence.", facts: facts("@janis") })).toEqual({ status: "invalid", problems: [{ code: "access_without_lists", field: "access" }] });
    expect(checkVerbAnswer({ said: "A sentence.", facts: { outcome: "ok", access: "not_checked" } }).status).toBe("valid");
  });

  it("a list start is a handle or a host name by shape, and a listed name carries no invisible character", () => {
    expect(validateVerbRequest({ verb: "map", start: "person:jan@x.com" }, { lists: true })).toMatchObject({ reason_code: "invalid_field", field: "start" });
    expect(validateVerbRequest({ verb: "map", start: "hostname:../../x" }, { lists: true })).toMatchObject({ reason_code: "invalid_field", field: "start" });
    expect(validateVerbRequest({ verb: "map", start: "hostname:acme.example" }, { lists: true }).status).toBe("valid");
    const item = (name: string) => ({ outcome: "ok" as const, list: [{ address: "repo:n_9ffe8bb354f1b10b6fbb059e", kind: "repo", name, by_others: true }] });
    expect(checkVerbAnswer({ said: "A sentence.", facts: item("Garden plan") }).status).toBe("valid");
    // A direction override, a zero-width space, a C1 control, a tab, and the line and paragraph separators.
    const invisible = [0x202e, 0x200b, 0x009b, 0x0009, 0x2028, 0x2029].map((code) => String.fromCharCode(code));
    for (const character of invisible) {
      expect(checkVerbAnswer({ said: "A sentence.", facts: item(`Garden ${character}plan`) }), character.charCodeAt(0).toString(16)).toEqual({ status: "invalid", problems: [{ code: "list_name_multiline", field: "list[0].name" }] });
    }
  });

  it("a Thread opened with nobody in it needs nothing asked; one with someone does", () => {
    expect(validateVerbRequest({ verb: "post", request: "start_thread", name: "Plan" }, { caller: "agent" }).status).toBe("valid");
    expect(validateVerbRequest({ verb: "post", request: "start_thread", name: "Plan", with: "@b" }, { caller: "agent" })).toMatchObject({ reason_code: "not_from_person", field: "request" });
    expect(validateVerbRequest({ verb: "post", target: "thread:x_0123456789abcdef01234567", request: "start_thread", name: "Plan" }, { caller: "agent" })).toMatchObject({ reason_code: "out_of_reach" });
  });

  it("the person's words match whole and case-insensitively, never by substring", () => {
    const context: VerbContext = { caller: "agent", person_asked: ["share"], person_named: ["@Bea", "notes/plan.md", "explore"] };
    expect(validateVerbRequest({ verb: "post", target: "notes/plan.md", request: "share", with: "@bea", grade: "explore" }, context).status).toBe("valid");
    expect(validateVerbRequest({ verb: "post", target: "notes/plan.md", request: "share", with: "@beatrice", grade: "explore" }, context)).toMatchObject({ reason_code: "not_from_person" });
  });

  it("a forbidden word matches whole words only, so 'pushed' needs its own entry and 'pulley' is never caught", () => {
    const facts = { outcome: "ok" as const };
    expect(checkVerbAnswer({ said: "Saved; not pushed yet.", facts }, { forbidden_words: ["push"] }).status).toBe("valid");
    expect(checkVerbAnswer({ said: "Saved; the pulley note.", facts }, { forbidden_words: ["pull"] }).status).toBe("valid");
    expect(checkVerbAnswer({ said: "Saved; push it later.", facts }, { forbidden_words: ["push"] })).toEqual({
      status: "invalid",
      problems: [{ code: "said_forbidden_word", field: "push" }],
    });
  });

  it("a hash needs a digit and a letter: a plain number and a word in hex letters pass, a short id does not", () => {
    const facts = { outcome: "ok" as const };
    expect(checkVerbAnswer({ said: "Saved 1000000 words.", facts }).status).toBe("valid");
    expect(checkVerbAnswer({ said: "The defaced Note is saved.", facts }).status).toBe("valid");
    expect(checkVerbAnswer({ said: "Saved as b52662f.", facts })).toEqual({ status: "invalid", problems: [{ code: "said_contains_hash", field: "said" }] });
  });

  it("a non-object answer is one problem, not a crash", () => {
    expect(checkVerbAnswer("Saved.")).toEqual({ status: "invalid", problems: [{ code: "answer_not_object" }] });
    expect(checkVerbAnswer({ said: "Saved." })).toEqual({ status: "invalid", problems: [{ code: "facts_missing", field: "facts" }] });
  });

  it("renders a null next as 'none' and an object fact as JSON", () => {
    const rendered = renderVerbAnswer({ said: "A sentence.", facts: { outcome: "refused", reason_code: "person_only", next: null, warnings: [{ field: "date", warning: "invalid_date" }] } });
    expect(rendered).toBe('A sentence.\n\noutcome: refused\nwarnings: [{"field":"date","warning":"invalid_date"}]\nreason_code: person_only\nnext: none');
  });
});

describe("the four verbs: AX's words in schema/verbs.md pass their own check", () => {
  const page = readFileSync(new URL("../schema/verbs.md", import.meta.url), "utf-8");

  /** The rows of the table under one `###` heading, as cells. */
  function rows(heading: string): string[][] {
    const start = page.indexOf(`### ${heading}`);
    expect(start, heading).toBeGreaterThan(-1);
    const rest = page.slice(start).split("\n").slice(1);
    const end = rest.findIndex((line) => line.startsWith("### "));
    return (end === -1 ? rest : rest.slice(0, end))
      .filter((line) => line.startsWith("| ") && !line.startsWith("|---"))
      .slice(1)
      .map((line) => line.split(" | ").map((cell) => cell.replace(/^\| ?| ?\|$/g, "").trim()));
  }

  /** One cell's sentences: the variants after `*Label:*` split out, placeholders filled. */
  function sentences(cell: string): string[] {
    return cell
      .split(/\*[^*]+:\*/)
      .map((part) => part.replace(/\{[a-z_]+\}/g, "Plan").trim())
      .filter((part) => part.length > 0);
  }

  const context: VerbContext = { forbidden_words: [...SAID_FORBIDDEN_WORDS] };

  it("fills every said cell, and each sentence has no forbidden word, hash or command", () => {
    const table = rows("The sentences");
    expect(table.length).toBe(32);
    for (const row of table) {
      const cell = row[4];
      expect(cell, row[1]).not.toBe("*AX*");
      for (const said of sentences(cell)) {
        const outcome = row[2].replace(/`/g, "") as VerbAnswer["facts"]["outcome"];
        const facts =
          outcome === "ok" ? { outcome } : outcome === "partial" ? { outcome, reason_code: "stage_failed" } : { outcome, reason_code: "keeps_time", next: null };
        expect(checkVerbAnswer({ said, facts }, context), `${row[1]}: ${said}`).toEqual({ status: "valid" });
      }
    }
  });

  it("opens each verb's description with a sentence free of the same words", () => {
    const table = rows("The four descriptions' first sentences");
    expect(table.map((row) => row[0].replace(/`/g, ""))).toEqual([...VERBS]);
    for (const row of table) {
      expect(checkVerbAnswer({ said: row[1], facts: { outcome: "ok" } }, context), row[0]).toEqual({ status: "valid" });
    }
  });
});
