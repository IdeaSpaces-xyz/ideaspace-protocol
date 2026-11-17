// The four verbs — the pure, language-neutral shape of schema/verbs.md.
//
// `validateVerbRequest` checks one request against its verb's (and a `post`'s kind's) fields and
// the three guards on the acts that reach other people, with the host's knowledge supplied as
// context. `checkVerbAnswer` checks one answer: `said` first and free of Git words, the facts under
// the closed field set, a refusal carrying `reason_code` and a `next` that is a verb call.
// `renderVerbAnswer` is the one human-readable render. Nothing here touches the filesystem, Git, or
// a network. The words themselves (`said`) are the host's, from AX's table in schema/verbs.md;
// the words they never contain are SAID_FORBIDDEN_WORDS.

import type { PathRevision } from "./local-effects.js";

export const VERBS = ["map", "look", "post", "write"] as const;
export type Verb = (typeof VERBS)[number];

/** The one name every route spells the verbs under. */
export const VERB_NAMESPACE = "ideaspaces";

/** How each route spells a verb. `<verb>` is replaced by the verb. */
export const VERB_ROUTES = {
  cli: "ideaspaces <verb>",
  mcp: "mcp__ideaspaces__<verb>",
  flat: "ideaspaces_<verb>",
} as const;
export type VerbRoute = keyof typeof VERB_ROUTES;

export function spellVerb(route: VerbRoute, verb: Verb): string {
  return VERB_ROUTES[route].replace("<verb>", verb);
}

export const DEPTHS = ["name", "summary", "surface", "children", "full"] as const;

export const POST_REQUESTS = ["entry", "start_thread", "share", "revoke", "visibility", "publish"] as const;
export type PostRequest = (typeof POST_REQUESTS)[number];

export const MAP_REQUESTS = ["read", "create", "add", "remove"] as const;
export type MapRequest = (typeof MAP_REQUESTS)[number];

/** The acts that reach other people under the person's authority; the three guards apply to them. */
export const REACHING_REQUESTS: readonly PostRequest[] = ["share", "revoke", "visibility", "publish", "start_thread"];

/** The closed set of fact fields, in render order. An answer carries no field outside it. */
export const FACT_FIELDS = [
  "outcome",
  "path",
  "saved",
  "history",
  "shared",
  "change",
  "post",
  "item",
  "with",
  "from",
  "level",
  "public",
  "pin",
  "now",
  "until",
  "look",
  "map",
  "list",
  "access",
  "page",
  "warnings",
  "reason_code",
  "next",
] as const;
export type FactField = (typeof FACT_FIELDS)[number];

export const OUTCOMES = ["ok", "partial", "refused"] as const;
export type VerbOutcome = (typeof OUTCOMES)[number];

/** The refusal codes this page names. local-effects codes are also valid in `reason_code`. */
export const VERB_REASON_CODES = [
  "unknown_verb",
  "retired_name",
  "missing_field",
  "unexpected_field",
  "invalid_field",
  "unknown_request",
  "out_of_reach",
  "local_only",
  "keeps_time",
  "changed_since_read",
  "no_identity",
  "not_from_person",
  "person_only",
  "limit_reached",
  "redirected",
  "no_lists",
] as const;
export type VerbReasonCode = (typeof VERB_REASON_CODES)[number];

/**
 * The words a `said` sentence, and each verb description's first sentence, never contain: AX's list
 * in schema/verbs.md ("Words `said` never contains"). Whole words, case-insensitive, so each form a
 * sentence could use is listed. A host's word test passes this as `context.forbidden_words`.
 */
export const SAID_FORBIDDEN_WORDS = [
  "git", "commit", "commits", "committed", "committing", "uncommitted",
  "push", "pushes", "pushed", "pushing", "unpushed",
  "pull", "pulls", "pulled", "pulling", "fetch", "fetched",
  "merge", "merged", "merging", "rebase", "rebased",
  "branch", "branches", "checkout", "clone", "cloned", "stash", "diff",
  "staged", "staging", "unstaged", "untracked", "worktree", "HEAD",
  "repository", "repositories", "repo", "repos", "remote", "remotes", "upstream",
  "sha", "hash",
  "Vault", "Vaults",
] as const;

/** What a list item can be. A kind outside this set is `list_invalid`. */
export const LIST_KINDS = ["space", "org", "repo", "folder", "note", "thread", "person"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

/** The fields a list item may carry, and no others (schema/verbs.md, Lists). */
export const LIST_ITEM_FIELDS = ["address", "kind", "level", "who", "time", "name", "by_others"] as const;
/** The longest a listed name may be, after control characters and line breaks are removed. */
export const LIST_NAME_MAX = 120;

/** Field sets per verb. `post` and `map` refine them per `request`. */
const VERB_FIELDS: Record<Verb, { required: string[]; optional: string[] }> = {
  map: { required: ["start"], optional: ["request", "depth", "kind", "query", "name", "summary", "member", "member_index", "if_match"] },
  look: { required: ["target"], optional: ["depth", "agreement", "limit", "order", "since", "post"] },
  post: { required: [], optional: ["target", "request"] },
  write: { required: [], optional: ["target", "body", "edits", "frontmatter", "history", "message", "as_read"] },
};

const POST_FIELDS: Record<PostRequest, { required: string[]; optional: string[] }> = {
  entry: {
    required: ["target", "body"],
    optional: ["reply_to", "kind", "mark", "supersedes", "name", "summary", "map", "tags", "parent", "about", "closed", "author"],
  },
  start_thread: { required: ["name"], optional: ["target", "summary", "body", "with", "parent", "about", "map"] },
  share: { required: ["target", "with"], optional: ["grade"] },
  revoke: { required: ["target", "from"], optional: [] },
  visibility: { required: ["target", "public"], optional: [] },
  publish: { required: ["target"], optional: [] },
};

const MAP_FIELDS: Record<MapRequest, { required: string[]; optional: string[] }> = {
  read: { required: ["start"], optional: ["depth", "kind", "query"] },
  create: { required: ["start", "name"], optional: ["summary"] },
  add: { required: ["start", "member"], optional: ["if_match"] },
  remove: { required: ["start", "member_index"], optional: ["if_match"] },
};

const ENTRY_KINDS = new Set(["post", "reframe", "correction", "mark"]);

export interface VerbEntry {
  /** Portable path of a file that is an entry in a folder that keeps time. */
  path: string;
  id: string;
  /** Portable path of the folder, the `target` of the correcting `post`. */
  folder: string;
}

export interface VerbContext {
  /** Old names that still answer as their verb. */
  aliases?: Record<string, Verb>;
  /** Old names that answer `retired_name` and point at their verb. */
  retired?: Record<string, Verb>;
  /** Who is calling. Absent reads as `agent`: the check fails closed. */
  caller?: "person" | "agent";
  /** Names the person wrote in this conversation: handles, emails, addresses, levels. */
  person_named?: string[];
  /**
   * The acts the person asked for in this conversation: `start_thread`, `share`, `publish`,
   * `public`, `private`. A reaching request whose act is not listed is refused before who and what
   * are looked at (agreed 2026-11-17). Absent reads as none: fails closed.
   */
  person_asked?: string[];
  /** Service addresses this conversation may name. Absent reads as none: a missing reach never widens it. */
  reach?: string[];
  /** Files known to be entries. */
  entries?: VerbEntry[];
  /** Words `said` never contains; whole words, case-insensitive. */
  forbidden_words?: string[];
  /** Strings the host holds that must never reach the model: live credentials, a canary in tests. */
  secrets?: string[];
  /**
   * Whether this conversation may see lists (`map` from `ideaspaces`, an org or a person): true only
   * in a conversation with the person. Absent reads as false: a listener or a launched child.
   */
  lists?: boolean;
  /**
   * What lists returned in this conversation: addresses and handles. The host's record, consulted
   * by nothing here: seeing is not reaching, and a listed name is not one the person said.
   */
  listed?: string[];
}

export type VerbRequest = { verb: string } & Record<string, unknown>;

export interface VerbCall {
  verb: Verb;
  [field: string]: unknown;
}

export type VerbRequestCheck =
  | { status: "valid"; verb: Verb; request: VerbCall }
  | { status: "refused"; reason_code: VerbReasonCode; field?: string; next: VerbCall | null };

const SERVICE_ADDRESS = /^(ideaspaces|repo:n_[0-9a-f]+|thread:x_[0-9a-f]+|x_[0-9a-f]+|person:[^\s]+|hostname:[^\s]+|space:[^\s]+|https:\/\/[^\s]+)$/i;
const LIST_START = /^(ideaspaces|hostname:[^\s]+|person:[^\s]+)$/i;
/** A level as the service names it: one word, letters, `_` or `-`, never a sentence. */
const LEVEL = /^[a-z][a-z_-]{0,31}$/i;
/** An ISO instant, as time.md spells one. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
/** A handle as the service spells it: `@`, then 1 to 39 letters, digits, `_` or `-`. An email or a display name is not one. */
const HANDLE = /^@[A-Za-z0-9][A-Za-z0-9_-]{0,38}$/;
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const CONTROL_OR_BREAK = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** A service address, as schema/verbs.md tells it from a local path or a Map address. */
export function isServiceAddress(target: unknown): target is string {
  return typeof target === "string" && SERVICE_ADDRESS.test(target.trim());
}

/** A `map` start that is a list: the account, an org (`hostname:`) or a person (`person:`). */
export function isListStart(start: unknown): start is string {
  return typeof start === "string" && LIST_START.test(start.trim());
}

/** A handle the model may see, by shape alone. */
export function isHandle(value: unknown): value is string {
  return typeof value === "string" && HANDLE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function refuse(reason_code: VerbReasonCode, next: VerbCall | null, field?: string): VerbRequestCheck {
  return field === undefined ? { status: "refused", reason_code, next } : { status: "refused", reason_code, field, next };
}

/** Resolve a name to its verb through the host's catalog. */
export function resolveVerbName(
  name: unknown,
  context: VerbContext = {},
): { kind: "verb"; verb: Verb; alias?: string } | { kind: "retired"; verb: Verb } | { kind: "unknown" } {
  if (!isNonEmptyString(name)) return { kind: "unknown" };
  const trimmed = name.trim();
  if ((VERBS as readonly string[]).includes(trimmed)) return { kind: "verb", verb: trimmed as Verb };
  const alias = context.aliases?.[trimmed];
  if (alias && (VERBS as readonly string[]).includes(alias)) return { kind: "verb", verb: alias, alias: trimmed };
  const retired = context.retired?.[trimmed];
  if (retired && (VERBS as readonly string[]).includes(retired)) return { kind: "retired", verb: retired };
  return { kind: "unknown" };
}

function checkFields(
  verb: Verb,
  request: Record<string, unknown>,
  fields: { required: string[]; optional: string[] },
  exempt: string[],
): VerbRequestCheck | null {
  for (const field of fields.required) {
    if (request[field] === undefined) return refuse("missing_field", { verb }, field);
  }
  const allowed = new Set([...fields.required, ...fields.optional, ...exempt]);
  for (const field of Object.keys(request)) {
    if (!allowed.has(field)) return refuse("unexpected_field", { verb }, field);
  }
  return null;
}

function fromPerson(value: string, context: VerbContext): boolean {
  const named = context.person_named ?? [];
  return named.some((word) => word.trim().toLowerCase() === value.trim().toLowerCase());
}

/** A service address is in reach only when the host listed it; a missing list is an empty one. */
function inReach(address: string, context: VerbContext): boolean {
  return (context.reach ?? []).includes(address.trim());
}

/**
 * Validate one verb request against schema/verbs.md. Pure: the host supplies what it knows about
 * aliases, the caller, the person's words, reach and entries through `context`.
 */
export function validateVerbRequest(input: unknown, context: VerbContext = {}): VerbRequestCheck {
  if (!isRecord(input)) return refuse("invalid_field", null, "request");
  const resolved = resolveVerbName(input.verb, context);
  if (resolved.kind === "unknown") return refuse("unknown_verb", null, "verb");
  if (resolved.kind === "retired") return refuse("retired_name", { verb: resolved.verb }, "verb");
  const verb = resolved.verb;
  const { verb: _name, ...rest } = input;
  const request: VerbCall = { verb, ...rest };

  if (rest.depth !== undefined && !(DEPTHS as readonly string[]).includes(rest.depth as string)) {
    return refuse("invalid_field", { verb }, "depth");
  }

  switch (verb) {
    case "map": {
      const kind = rest.request === undefined ? "read" : rest.request;
      if (!isNonEmptyString(kind) || !(MAP_REQUESTS as readonly string[]).includes(kind)) return refuse("unknown_request", null, "request");
      const bad = checkFields(verb, rest, MAP_FIELDS[kind as MapRequest], ["request"]);
      if (bad) return bad;
      if (!isNonEmptyString(rest.start)) return refuse("invalid_field", { verb }, "start");
      if (kind === "remove" && (typeof rest.member_index !== "number" || !Number.isInteger(rest.member_index) || rest.member_index < 0)) {
        return refuse("invalid_field", { verb }, "member_index");
      }
      if (isListStart(rest.start)) {
        // A list (the account, an org, a person) is read under the person's own sign-in, only in a
        // conversation with the person. It is not reach, and it does not need reach.
        // By shape: a person is a handle and an org a host name, so a list start never asks the
        // service whether an email has an account or follows a path.
        const start = rest.start.trim();
        if (/^person:/i.test(start) && !isHandle(start.slice("person:".length))) return refuse("invalid_field", { verb }, "start");
        if (/^hostname:/i.test(start) && !HOSTNAME.test(start.slice("hostname:".length))) return refuse("invalid_field", { verb }, "start");
        if (kind !== "read") return refuse("invalid_field", { verb, start }, "request");
        if (context.lists !== true) return refuse("no_lists", null, "start");
      } else if (isServiceAddress(rest.start) && !inReach(rest.start, context)) {
        return refuse("out_of_reach", null, "start");
      }
      return { status: "valid", verb, request: { ...request, request: kind } };
    }
    case "look": {
      const bad = checkFields(verb, rest, VERB_FIELDS.look, []);
      if (bad) return bad;
      if (!isNonEmptyString(rest.target)) return refuse("invalid_field", { verb }, "target");
      if (rest.order !== undefined && rest.order !== "older" && rest.order !== "newer") return refuse("invalid_field", { verb }, "order");
      if (rest.agreement !== undefined && rest.agreement !== "summary" && rest.agreement !== "full") return refuse("invalid_field", { verb }, "agreement");
      if (isServiceAddress(rest.target) && !inReach(rest.target, context)) return refuse("out_of_reach", null, "target");
      return { status: "valid", verb, request };
    }
    case "post": {
      const kind = rest.request === undefined ? "entry" : rest.request;
      if (!isNonEmptyString(kind) || !(POST_REQUESTS as readonly string[]).includes(kind)) return refuse("unknown_request", null, "request");
      // Guard 3, first: a take back from anyone but the person is refused before any field is looked at.
      if (kind === "revoke" && context.caller !== "person") return refuse("person_only", null);
      const bad = checkFields(verb, rest, POST_FIELDS[kind as PostRequest], ["request"]);
      if (bad) return bad;
      if (rest.target !== undefined && !isNonEmptyString(rest.target)) return refuse("invalid_field", { verb }, "target");
      if (kind === "entry") {
        if (!isNonEmptyString(rest.body)) return refuse("invalid_field", { verb, request: "entry" }, "body");
        if (rest.kind !== undefined && !ENTRY_KINDS.has(rest.kind as string)) return refuse("invalid_field", { verb, request: "entry" }, "kind");
        if (rest.kind === "correction" && !isNonEmptyString(rest.supersedes)) return refuse("missing_field", { verb, request: "entry", kind: "correction" }, "supersedes");
        if (rest.kind === "mark" && !isNonEmptyString(rest.mark)) return refuse("missing_field", { verb, request: "entry", kind: "mark" }, "mark");
        if (rest.closed !== undefined && typeof rest.closed !== "boolean") return refuse("invalid_field", { verb, request: "entry" }, "closed");
        if (rest.reply_to !== undefined && !isNonEmptyString(rest.reply_to) && !isStringList(rest.reply_to)) return refuse("invalid_field", { verb, request: "entry" }, "reply_to");
        if (isServiceAddress(rest.target) && !inReach(rest.target as string, context)) return refuse("out_of_reach", null, "target");
        return { status: "valid", verb, request: { ...request, request: kind } };
      }
      if (kind === "visibility" && typeof rest.public !== "boolean") return refuse("invalid_field", { verb, request: kind }, "public");
      if (kind === "share" && rest.grade !== undefined && !isNonEmptyString(rest.grade)) return refuse("invalid_field", { verb, request: kind }, "grade");
      for (const who of ["with", "from"]) {
        if (rest[who] !== undefined && !isNonEmptyString(rest[who])) return refuse("invalid_field", { verb, request: kind }, who);
      }
      // The person's own take back (caller: person, which no request can set) is their act on their
      // own item: checked against nothing else, so it always works.
      if (kind === "revoke") return { status: "valid", verb, request: { ...request, request: kind } };
      // publish takes a local folder: the host has nothing to push for a service address.
      if (kind === "publish" && isServiceAddress(rest.target)) return refuse("invalid_field", { verb, request: kind }, "target");
      // A Thread with nobody in it reaches nobody: guard 1 does not apply, reach still does.
      const reaches = !(kind === "start_thread" && rest.with === undefined);
      if (reaches) {
        // Guard 1, the act: what the person asked for, before who and what. Fails closed.
        const act = kind === "visibility" ? (rest.public ? "public" : "private") : kind;
        if (!(context.person_asked ?? []).includes(act)) return refuse("not_from_person", null, "request");
        // Guard 1, who and what: from the person's own words. Fails closed.
        const spoken: Array<[string, unknown]> = [];
        if (kind !== "start_thread" && rest.target !== undefined) spoken.push(["target", rest.target]);
        if (rest.with !== undefined) spoken.push(["with", rest.with]);
        if (rest.grade !== undefined) spoken.push(["grade", rest.grade]);
        for (const [field, value] of spoken) {
          if (!fromPerson(value as string, context)) return refuse("not_from_person", null, field);
        }
      }
      const accountLiteral = kind === "start_thread" && (rest.target as string | undefined)?.trim() === "ideaspaces";
      if (kind !== "publish" && isServiceAddress(rest.target) && !accountLiteral && !inReach(rest.target as string, context)) {
        return refuse("out_of_reach", null, "target");
      }
      return { status: "valid", verb, request: { ...request, request: kind } };
    }
    case "write": {
      const bad = checkFields(verb, rest, VERB_FIELDS.write, []);
      if (bad) return bad;
      const hasContent = rest.body !== undefined || rest.edits !== undefined || rest.frontmatter !== undefined;
      if (!hasContent && rest.history === undefined) return refuse("missing_field", { verb }, "body");
      if (hasContent && !isNonEmptyString(rest.target)) return refuse("missing_field", { verb }, "target");
      if (rest.body !== undefined && rest.edits !== undefined) return refuse("invalid_field", { verb }, "edits");
      if (rest.body !== undefined && typeof rest.body !== "string") return refuse("invalid_field", { verb }, "body");
      if (rest.edits !== undefined) {
        const ok = Array.isArray(rest.edits) && rest.edits.length > 0
          && rest.edits.every((edit) => isRecord(edit) && isNonEmptyString(edit.find) && typeof edit.replace === "string");
        if (!ok) return refuse("invalid_field", { verb }, "edits");
      }
      if (rest.frontmatter !== undefined) {
        if (!isRecord(rest.frontmatter)) return refuse("invalid_field", { verb }, "frontmatter");
        if (!(rest.target as string).toLowerCase().endsWith(".md")) return refuse("invalid_field", { verb }, "frontmatter");
      }
      if (rest.history !== undefined && !isStringList(rest.history)) return refuse("invalid_field", { verb }, "history");
      if (rest.message !== undefined && (rest.history === undefined || !isNonEmptyString(rest.message))) return refuse("invalid_field", { verb }, "message");
      if (rest.as_read !== undefined && !isPathRevision(rest.as_read)) return refuse("invalid_field", { verb }, "as_read");
      if (isServiceAddress(rest.target)) return refuse("local_only", { verb: "post", target: rest.target as string }, "target");
      if (isNonEmptyString(rest.target)) {
        const entry = context.entries?.find((candidate) => candidate.path === (rest.target as string).trim());
        if (entry) {
          return refuse("keeps_time", { verb: "post", target: entry.folder, request: "entry", kind: "correction", supersedes: entry.id }, "target");
        }
      }
      return { status: "valid", verb, request };
    }
  }
}

function isPathRevision(value: unknown): value is PathRevision {
  return isRecord(value) && ["worktree", "index", "head"].every((slot) => value[slot] === null || typeof value[slot] === "string");
}

export interface VerbAnswer {
  said: string;
  facts: { outcome: VerbOutcome } & Partial<Record<FactField, unknown>>;
}

export type VerbAnswerProblemCode =
  | "answer_not_object"
  | "said_missing"
  | "said_not_first"
  | "said_forbidden_word"
  | "said_contains_hash"
  | "said_git_command"
  | "facts_missing"
  | "outcome_invalid"
  | "unknown_fact"
  | "fact_invalid"
  | "short_change"
  | "reason_code_missing"
  | "reason_code_invalid"
  | "next_missing"
  | "next_invalid"
  | "next_git_command"
  | "credential_in_answer"
  | "list_invalid"
  | "list_field_not_allowed"
  | "list_name_too_long"
  | "list_name_multiline"
  | "list_name_unmarked"
  | "access_invalid"
  | "access_without_lists"
  | "who_not_a_handle";

export interface VerbAnswerProblem {
  code: VerbAnswerProblemCode;
  field?: string;
}

export type VerbAnswerCheck = { status: "valid" } | { status: "invalid"; problems: VerbAnswerProblem[] };

// A hash is seven or more hex characters with both a digit and a letter: a plain number
// ("1000000") or a word spelled in hex letters ("defaced") is not one.
const HASH_RUN = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,}\b/i;
const GIT_COMMAND = /(^|[\s`'"(])git\s+[a-z-]+/i;
const REASON_CODE = /^[a-z][a-z0-9_]*$/;
const FULL_ID = /^[0-9a-f]{40,}$/;

function containsForbiddenWord(text: string, words: string[]): string | undefined {
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, "i").test(text)) return word;
  }
  return undefined;
}

function anyStringMatches(value: unknown, pattern: RegExp): boolean {
  if (typeof value === "string") return pattern.test(value);
  if (Array.isArray(value)) return value.some((item) => anyStringMatches(item, pattern));
  if (isRecord(value)) return Object.values(value).some((item) => anyStringMatches(item, pattern));
  return false;
}

/** True when any string in the value, a key or a value at any depth, contains a secret. */
function containsSecret(value: unknown, secrets: string[]): boolean {
  if (typeof value === "string") return secrets.some((secret) => value.includes(secret));
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, secrets));
  if (isRecord(value)) return Object.entries(value).some(([key, item]) => containsSecret(key, secrets) || containsSecret(item, secrets));
  return false;
}

/**
 * Check one answer against schema/verbs.md: `said` first and free of Git words, hashes and
 * commands; `facts` under the closed field set with a valid `outcome`; a refusal with a
 * `reason_code` and a `next` that is a verb call or `null`.
 */
export function checkVerbAnswer(input: unknown, context: VerbContext = {}): VerbAnswerCheck {
  const problems: VerbAnswerProblem[] = [];
  if (!isRecord(input)) return { status: "invalid", problems: [{ code: "answer_not_object" }] };
  const keys = Object.keys(input);
  if (!isNonEmptyString(input.said)) problems.push({ code: "said_missing", field: "said" });
  else {
    if (keys[0] !== "said") problems.push({ code: "said_not_first", field: "said" });
    const word = containsForbiddenWord(input.said, context.forbidden_words ?? []);
    if (word) problems.push({ code: "said_forbidden_word", field: word });
    if (HASH_RUN.test(input.said)) problems.push({ code: "said_contains_hash", field: "said" });
    if (GIT_COMMAND.test(input.said)) problems.push({ code: "said_git_command", field: "said" });
  }
  for (const key of keys) {
    if (key !== "said" && key !== "facts") problems.push({ code: "unknown_fact", field: key });
  }
  if (!isRecord(input.facts)) {
    problems.push({ code: "facts_missing", field: "facts" });
    return { status: "invalid", problems };
  }
  const facts = input.facts;
  if (!(OUTCOMES as readonly string[]).includes(facts.outcome as string)) problems.push({ code: "outcome_invalid", field: "outcome" });
  for (const key of Object.keys(facts)) {
    if (!(FACT_FIELDS as readonly string[]).includes(key)) problems.push({ code: "unknown_fact", field: key });
  }
  for (const flag of ["saved", "history", "public"]) {
    if (facts[flag] !== undefined && typeof facts[flag] !== "boolean") problems.push({ code: "fact_invalid", field: flag });
  }
  if (facts.shared !== undefined && facts.shared !== true && facts.shared !== false && facts.shared !== "not_checked") {
    problems.push({ code: "fact_invalid", field: "shared" });
  }
  for (const id of ["change", "pin", "now"]) {
    if (facts[id] !== undefined && (typeof facts[id] !== "string" || !FULL_ID.test(facts[id] as string))) {
      problems.push({ code: id === "change" ? "short_change" : "fact_invalid", field: id });
    }
  }
  if (facts.list !== undefined) checkList(facts.list, problems);
  if (facts.access !== undefined) checkAccess(facts.access, problems, context);
  if (facts.outcome === "refused" || facts.outcome === "partial") {
    if (facts.reason_code === undefined) problems.push({ code: "reason_code_missing", field: "reason_code" });
    else if (typeof facts.reason_code !== "string" || !REASON_CODE.test(facts.reason_code)) problems.push({ code: "reason_code_invalid", field: "reason_code" });
  }
  if (facts.outcome === "refused") {
    if (!("next" in facts)) problems.push({ code: "next_missing", field: "next" });
    else if (facts.next !== null) {
      if (!isRecord(facts.next) || !(VERBS as readonly string[]).includes(facts.next.verb as string)) problems.push({ code: "next_invalid", field: "next" });
      else if (anyStringMatches(facts.next, GIT_COMMAND)) problems.push({ code: "next_git_command", field: "next" });
    }
  } else if (facts.next !== undefined) {
    problems.push({ code: "next_invalid", field: "next" });
  }
  // Guard 2: no string anywhere in the answer, a key or a value, carries a credential the host holds.
  // The problem names the field, never the value; a field name that would carry one is named by the
  // slot that holds it (`facts` or `answer`), and so is any earlier problem that would echo it.
  const secrets = (context.secrets ?? []).filter((secret) => secret.length > 0);
  if (secrets.length) {
    for (const [key, value] of Object.entries(input)) {
      if (key === "facts") {
        for (const [field, fact] of Object.entries(facts)) {
          if (containsSecret(field, secrets)) problems.push({ code: "credential_in_answer", field: "facts" });
          else if (containsSecret(fact, secrets)) problems.push({ code: "credential_in_answer", field });
        }
      } else if (containsSecret(key, secrets)) {
        problems.push({ code: "credential_in_answer", field: "answer" });
      } else if (containsSecret(value, secrets)) {
        problems.push({ code: "credential_in_answer", field: key });
      }
    }
    const factKeys = new Set(Object.keys(facts));
    const blanked = problems.map((problem) =>
      problem.field !== undefined && containsSecret(problem.field, secrets)
        ? { code: "credential_in_answer" as const, field: factKeys.has(problem.field) ? "facts" : "answer" }
        : problem,
    );
    const seen = new Set<string>();
    problems.length = 0;
    for (const problem of blanked) {
      const id = `${problem.code}:${problem.field ?? ""}`;
      if (!seen.has(id)) { seen.add(id); problems.push(problem); }
    }
  }
  return problems.length ? { status: "invalid", problems } : { status: "valid" };
}

/** A list: items with the allowed fields only, names one line, cut, and marked as others', handles by shape. */
function checkList(list: unknown, problems: VerbAnswerProblem[]): void {
  if (!Array.isArray(list)) { problems.push({ code: "list_invalid", field: "list" }); return; }
  const allowed = new Set<string>(LIST_ITEM_FIELDS);
  list.forEach((item, index) => {
    const at = `list[${index}]`;
    if (!isRecord(item) || !isNonEmptyString(item.address) || !isNonEmptyString(item.kind)) { problems.push({ code: "list_invalid", field: at }); return; }
    for (const key of Object.keys(item)) {
      if (!allowed.has(key)) problems.push({ code: "list_field_not_allowed", field: `${at}.${key}` });
    }
    // Text others wrote outside `name` has a fixed shape: an address, a kind from the closed set, a
    // level that is one word, an instant. A sentence in any of them is refused.
    if (!isServiceAddress(item.address)) problems.push({ code: "list_invalid", field: `${at}.address` });
    if (!(LIST_KINDS as readonly string[]).includes(item.kind)) problems.push({ code: "list_invalid", field: `${at}.kind` });
    if (item.level !== undefined && (typeof item.level !== "string" || !LEVEL.test(item.level))) problems.push({ code: "list_invalid", field: `${at}.level` });
    if (item.time !== undefined && (typeof item.time !== "string" || !ISO_INSTANT.test(item.time))) problems.push({ code: "list_invalid", field: `${at}.time` });
    if (item.who !== undefined && !isHandle(item.who)) problems.push({ code: "who_not_a_handle", field: `${at}.who` });
    if (item.name !== undefined) {
      if (typeof item.name !== "string") problems.push({ code: "list_invalid", field: `${at}.name` });
      else {
        if (CONTROL_OR_BREAK.test(item.name)) problems.push({ code: "list_name_multiline", field: `${at}.name` });
        if ([...item.name].length > LIST_NAME_MAX) problems.push({ code: "list_name_too_long", field: `${at}.name` });
        if (item.by_others !== true) problems.push({ code: "list_name_unmarked", field: `${at}.by_others` });
      }
    }
    if (item.by_others !== undefined && typeof item.by_others !== "boolean") problems.push({ code: "list_invalid", field: `${at}.by_others` });
  });
}

/** Who can read an item: `not_checked`, or public, people by handle and level, teams by host and level, pending as a count. */
function checkAccess(access: unknown, problems: VerbAnswerProblem[], context: VerbContext): void {
  if (access === "not_checked") return;
  if (!isRecord(access)) { problems.push({ code: "access_invalid", field: "access" }); return; }
  // An item's readers are a list: filled only in a conversation with the person, never for a
  // listener or a launched child, which get `not_checked`.
  if (context.lists !== true) problems.push({ code: "access_without_lists", field: "access" });
  for (const key of Object.keys(access)) {
    if (!["public", "people", "teams", "pending"].includes(key)) problems.push({ code: "access_invalid", field: `access.${key}` });
  }
  if (typeof access.public !== "boolean") problems.push({ code: "access_invalid", field: "access.public" });
  if (!Array.isArray(access.people)) problems.push({ code: "access_invalid", field: "access.people" });
  else access.people.forEach((person, index) => {
    if (!isRecord(person) || typeof person.level !== "string" || !LEVEL.test(person.level) || Object.keys(person).some((key) => key !== "who" && key !== "level")) {
      problems.push({ code: "access_invalid", field: `access.people[${index}]` });
    } else if (!isHandle(person.who)) problems.push({ code: "who_not_a_handle", field: `access.people[${index}].who` });
  });
  if (!Array.isArray(access.teams)) problems.push({ code: "access_invalid", field: "access.teams" });
  else access.teams.forEach((team, index) => {
    if (!isRecord(team) || typeof team.level !== "string" || !LEVEL.test(team.level) || typeof team.hostname !== "string" || !HOSTNAME.test(team.hostname) || Object.keys(team).some((key) => key !== "hostname" && key !== "level")) {
      problems.push({ code: "access_invalid", field: `access.teams[${index}]` });
    }
  });
  if (typeof access.pending !== "number" || !Number.isInteger(access.pending) || access.pending < 0) problems.push({ code: "access_invalid", field: "access.pending" });
}

function renderFact(value: unknown): string {
  if (value === null) return "none";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/** The one human-readable render: `said`, a blank line, then the facts one per line in FACT_FIELDS order. */
export function renderVerbAnswer(answer: VerbAnswer): string {
  const lines = [answer.said, ""];
  for (const field of FACT_FIELDS) {
    const value = (answer.facts as Record<string, unknown>)[field];
    if (value === undefined) continue;
    lines.push(`${field}: ${renderFact(value)}`);
  }
  return lines.join("\n");
}
