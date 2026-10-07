/**
 * Portable Map frontmatter primitives.
 *
 * A map-note is an ordinary Markdown Note whose optional `map` block carries
 * ordered addresses and exact Git pins. Parsing is pure and mutation-free.
 * An invalid block makes only the Map projection unavailable; it never makes
 * the surrounding Note unreadable.
 */

import { classifyRepositoryPath } from "./repository-path.js";
import { parseRootNodeId } from "./root-identity.js";

export const MAP_DEPTHS = ["name", "summary", "surface", "children", "full"] as const;
export type MapDepth = (typeof MAP_DEPTHS)[number];

/**
 * Standard subject kinds recognized in the access vocabulary.
 */
export const SUBJECT_KINDS = [
  "person",
  "team",
  "organisation",
  "agent",
  "public",
] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/**
 * The capability ladder, ordered from lowest privilege / disclosure to highest.
 *
 *   view     — observe Map members at declared disclosure ceilings (name, summary, surface, children, full)
 *   read     — open and read full Note/document content bodies
 *   history  — inspect commit graphs, timelines, and post transcripts
 *   copy     — fork spaces or clone repositories
 *   write    — create and update content
 *   push     — transport commits to a repository remote
 *   manage   — administer access grants and participants
 */
export const CAPABILITY_LADDER = [
  "view",
  "read",
  "history",
  "copy",
  "write",
  "push",
  "manage",
] as const;
export type Capability = (typeof CAPABILITY_LADDER)[number];

/**
 * The capability rung required for Map disclosure.
 * A Map's disclosure ceiling is the view rung.
 */
export const MAP_DISCLOSURE_CAPABILITY: Capability = "view";

export interface MapRoot extends Record<string, unknown> {
  /** Canonical absolute repository URL: `<web-origin>/repos/{root_node_id}`. */
  repo?: string;
  /** Portable repository-root identity; current and legacy reader forms are accepted. */
  root_node_id?: string;
  /** Optional full commit pin. Space roots without one resolve at HEAD. */
  sha?: string;
  /**
   * Optional name this root answers to in this Map's position addresses.
   * Local to the Map: it identifies nothing without the Map that declares it.
   */
  name?: string;
}

/** Observed target information, distinct from a curator's labels. Not a live-state guarantee. */
export interface MapDisclosure extends Record<string, unknown> {
  name?: string;
  summary?: string;
}

export interface MapPositionMember extends Record<string, unknown> {
  /** Zero-based index into `roots`. */
  root: number;
  /** Portable repository-relative protocol position, or `.` for the root. */
  position: string;
  /** Optional ceiling. Without one, progressive disclosure is the reader's choice. */
  depth?: MapDepth;
  /** Observed name/summary; top-level name/summary remain curator-authored annotations. */
  disclosure?: MapDisclosure;
}

export interface MapAddressMember extends Record<string, unknown> {
  /** Open `<type>:<id>` address; URLs naturally use their scheme as the type. */
  address: string;
  name?: string;
  summary?: string;
  /** External addresses can promise no representation beyond summary. */
  depth?: "name" | "summary";
  /**
   * Optional opaque latest-post equality revision (e.g. `n_<24hex>`).
   * Supports equality comparison only; proves no content bytes or ordering.
   */
  revision?: string;
  disclosure?: MapDisclosure;
}

export type MapMember = MapPositionMember | MapAddressMember;

export interface MapBlock extends Record<string, unknown> {
  roots: MapRoot[];
  members: MapMember[];
}

/** Ordered, already-selected inputs. Construction does not discover, fetch, or grant anything. */
export interface MapBuildInput extends Record<string, unknown> {
  roots?: readonly MapRoot[];
  members?: readonly MapMember[];
}

export type MapParseIssueCode =
  | "invalid_map_type"
  | "invalid_roots_type"
  | "invalid_root_type"
  | "missing_root_identity"
  | "invalid_repo"
  | "invalid_root_node_id"
  | "root_identity_mismatch"
  | "retired_space_field"
  | "invalid_pin"
  | "invalid_root_name"
  | "duplicate_root_name"
  | "invalid_members_type"
  | "invalid_member_type"
  | "invalid_member_shape"
  | "invalid_root_index"
  | "invalid_position"
  | "invalid_depth"
  | "invalid_address"
  | "invalid_name"
  | "invalid_summary"
  | "invalid_revision"
  | "invalid_disclosure"
  | "disclosure_exceeds_depth";

export interface MapParseIssue {
  path: string;
  code: MapParseIssueCode;
}

export type MapBuildResult =
  | { status: "valid"; map: MapBlock }
  | { status: "invalid"; issues: MapParseIssue[] };

export type MapParseResult = { status: "absent" } | MapBuildResult;

export type CanonicalRepoUrlParseResult =
  | { status: "valid"; repo: string; rootNodeId: string }
  | { status: "invalid"; code: "invalid_repo" };

const DEPTHS = new Set<string>(MAP_DEPTHS);
const SUBJECT_KIND_SET = new Set<string>(SUBJECT_KINDS);
const CAPABILITY_SET = new Set<string>(CAPABILITY_LADDER);
export const REVISION_PATTERN = /^n_(?:[0-9a-f]{12}|[0-9a-f]{24})$/;
const ADDRESS_PATTERN = /^[a-z][a-z0-9_]*:.+$/;
const PIN_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REPO_PATH_PATTERN = /^\/repos\/(n_(?:[0-9a-f]{12}|[0-9a-f]{24}))$/;
const HTTP_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Normalize and validate a subject kind.
 * Accepts "organization" as an alias for "organisation".
 * Returns canonical SubjectKind or null if invalid.
 */
export function normalizeSubjectKind(input: string): SubjectKind | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "organization") return "organisation";
  return SUBJECT_KIND_SET.has(trimmed) ? (trimmed as SubjectKind) : null;
}

/** Check whether a value is a valid canonical SubjectKind. */
export function isValidSubjectKind(input: unknown): input is SubjectKind {
  return typeof input === "string" && SUBJECT_KIND_SET.has(input);
}

/** Check whether a value is a valid Capability on the ladder. */
export function isValidCapability(input: unknown): input is Capability {
  return typeof input === "string" && CAPABILITY_SET.has(input);
}

/**
 * Return the rank of a capability on the ladder (0 for "view" up to 6 for "manage").
 * Returns -1 for unrecognized capabilities.
 */
export function capabilityRank(capability: string): number {
  return CAPABILITY_LADDER.indexOf(capability as Capability);
}

/**
 * Validate and preserve a canonical absolute repository URL.
 *
 * The path is exactly `/repos/{root_node_id}`. HTTPS is required except for
 * configured-style loopback development URLs, which may use HTTP and a port.
 * Credentials, query, fragment, encoding, aliases, and non-canonical URL forms
 * are refused. Origin trust and authorization remain consumer concerns.
 */
export function parseCanonicalRepoUrl(value: unknown): CanonicalRepoUrlParseResult {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return invalidRepo();
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidRepo();
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && HTTP_LOOPBACK_HOSTS.has(url.hostname)))
  ) {
    return invalidRepo();
  }

  const pathMatch = url.pathname.match(REPO_PATH_PATTERN);
  if (!pathMatch || `${url.origin}${url.pathname}` !== value) return invalidRepo();
  const parsed = parseRootNodeId(pathMatch[1]);
  if (parsed.status !== "valid") return invalidRepo();
  return { status: "valid", repo: value, rootNodeId: parsed.rootNodeId };
}

/** Parse an optional `map` frontmatter value into its portable standard projection. */
export function parseMap(value: unknown): MapParseResult {
  if (value === undefined) return { status: "absent" };
  return parseMapBlock(value);
}

/**
 * Build a normalized Map from ordered selections, using the parser's validation.
 * Does not inspect local bindings, verify remote availability, or sanitize unknown fields.
 * Invalid input yields issues, never a partial Map. No input is mutated.
 */
export function buildMap(input: MapBuildInput): MapBuildResult {
  return parseMapBlock(input);
}

/** A moment Map is a valid Map whose roots all have pins and whose position
 * members all declare ceilings. Generic Space Maps may mix these freely. */
export function isPinnedMomentMap(input: unknown): boolean {
  const parsed = parseMap(input);
  if (parsed.status !== "valid") return false;
  return parsed.map.roots.every((root) => typeof root.sha === "string" && PIN_PATTERN.test(root.sha)) &&
    parsed.map.members.every((member) => !('position' in member) ||
      (typeof member.depth === "string" && DEPTHS.has(member.depth)));
}

/** A name a root answers to inside one Map. Never a root identity form. */
const MAP_ROOT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Whether a value is a valid Map root name: a short token that cannot be read as an identity. */
export function isMapRootName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    MAP_ROOT_NAME_PATTERN.test(value) &&
    parseRootNodeId(value).status !== "valid"
  );
}

/** Which root a position address names: by identity, by name in one Map, or the reader's own root. */
export type MapPositionAddressRoot =
  | { kind: "identity"; rootNodeId: string }
  | { kind: "name"; name: string }
  | { kind: "self" };

/** One root and one repository-relative position in it; `.` is the root itself. */
export interface MapPositionAddress {
  root: MapPositionAddressRoot;
  position: string;
}

export type MapPositionAddressParseResult =
  | { status: "valid"; address: MapPositionAddress }
  | {
      status: "invalid";
      code: "invalid_address_form" | "invalid_root_reference" | "invalid_position";
    };

export type MapPositionAddressUnresolvedCode =
  | "root_not_in_map"
  | "unknown_name"
  | "ambiguous_root"
  | "ambiguous_name"
  | "self_unknown";

export type MapPositionAddressResolution =
  | { status: "resolved"; rootIndex: number; root: MapRoot; position: string }
  | { status: "unresolved"; code: MapPositionAddressUnresolvedCode }
  | Extract<MapPositionAddressParseResult, { status: "invalid" }>;

/** What a reader knows beyond the Map when it resolves an address. */
export interface MapPositionAddressContext {
  /** The reading vantage's own root identity; `//…` addresses resolve only when it is known. */
  self?: string;
  /**
   * Names roots answer to when the Map gives them none, by root index — a hosted slug or an
   * Agreement name the reader already knows. Ignored for roots that declare `name`.
   */
  defaultNames?: readonly (string | undefined)[];
}

/**
 * Parse one position address.
 *
 * `@n_…//position` names a root by identity and is valid anywhere. `@name//position` names a
 * root by its name in one Map. `//position` names the reader's own root. An empty position is the
 * root itself (`.`). Positions are canonical repository-relative paths: no leading or trailing
 * slash, no `.`/`..` segments, no backslash or NUL, and nothing inside `.git`. Unlike Map
 * members, an address may point inside `_agent/` or an extension; access is still the reader's.
 */
export function parseMapPositionAddress(value: unknown): MapPositionAddressParseResult {
  if (typeof value !== "string") return { status: "invalid", code: "invalid_address_form" };

  let root: MapPositionAddressRoot;
  let rest: string;
  if (value.startsWith("//")) {
    root = { kind: "self" };
    rest = value.slice(2);
  } else if (value.startsWith("@")) {
    const separator = value.indexOf("//");
    if (separator < 0) return { status: "invalid", code: "invalid_address_form" };
    const reference = value.slice(1, separator);
    const identity = parseRootNodeId(reference);
    if (identity.status === "valid") {
      root = { kind: "identity", rootNodeId: identity.rootNodeId };
    } else if (isMapRootName(reference)) {
      root = { kind: "name", name: reference };
    } else {
      return { status: "invalid", code: "invalid_root_reference" };
    }
    rest = value.slice(separator + 2);
  } else {
    return { status: "invalid", code: "invalid_address_form" };
  }

  if (rest === "") return { status: "valid", address: { root, position: "." } };
  if (!isAddressPosition(rest)) return { status: "invalid", code: "invalid_position" };
  return { status: "valid", address: { root, position: rest } };
}

/** Format a position address; the inverse of `parseMapPositionAddress`. Throws on invalid input. */
export function formatMapPositionAddress(address: MapPositionAddress): string {
  const { root, position } = address;
  let prefix: string;
  if (root.kind === "self") {
    prefix = "";
  } else if (root.kind === "identity" && parseRootNodeId(root.rootNodeId).status === "valid") {
    prefix = `@${root.rootNodeId}`;
  } else if (root.kind === "name" && isMapRootName(root.name)) {
    prefix = `@${root.name}`;
  } else {
    throw new TypeError("Map position address has an invalid root reference");
  }
  if (position !== "." && !isAddressPosition(position)) {
    throw new TypeError("Map position address has an invalid position");
  }
  return `${prefix}//${position === "." ? "" : position}`;
}

/**
 * Find the root an address names in one Map.
 *
 * Identity matches `root_node_id` (or the identity carried by `repo`). A name matches a root's
 * declared `name`; a root that declares none answers to its entry in `context.defaultNames`. A
 * declared name wins over a default one. A root absent from the Map, an unknown name, or a
 * reference matching more than one root is a typed result, never a path. Nothing is read.
 */
export function resolveMapPositionAddress(
  map: Pick<MapBlock, "roots">,
  address: MapPositionAddress | string,
  context: MapPositionAddressContext = {},
): MapPositionAddressResolution {
  let parsed: MapPositionAddress;
  if (typeof address === "string") {
    const result = parseMapPositionAddress(address);
    if (result.status === "invalid") return result;
    parsed = result.address;
  } else {
    parsed = address;
  }

  const roots = map.roots ?? [];
  const resolved = (rootIndex: number): MapPositionAddressResolution => ({
    status: "resolved",
    rootIndex,
    root: roots[rootIndex],
    position: parsed.position,
  });

  if (parsed.root.kind === "name") {
    const name = parsed.root.name;
    const declared = indicesWhere(roots, (root) => root.name === name);
    if (declared.length === 1) return resolved(declared[0]);
    if (declared.length > 1) return { status: "unresolved", code: "ambiguous_name" };
    // A root whose declared name is invalid (only reachable when the Map skipped parsing) is
    // treated as undeclared and answers to its default.
    const defaults = indicesWhere(
      roots,
      (root, index) => !isMapRootName(root.name) && context.defaultNames?.[index] === name,
    );
    if (defaults.length === 1) return resolved(defaults[0]);
    return { status: "unresolved", code: defaults.length > 1 ? "ambiguous_name" : "unknown_name" };
  }

  let rootNodeId: string;
  if (parsed.root.kind === "self") {
    if (context.self === undefined || parseRootNodeId(context.self).status !== "valid") {
      return { status: "unresolved", code: "self_unknown" };
    }
    rootNodeId = context.self;
  } else {
    rootNodeId = parsed.root.rootNodeId;
  }
  const matches = indicesWhere(roots, (root) => rootIdentity(root) === rootNodeId);
  if (matches.length === 1) return resolved(matches[0]);
  return { status: "unresolved", code: matches.length > 1 ? "ambiguous_root" : "root_not_in_map" };
}

function rootIdentity(root: MapRoot): string | undefined {
  if (typeof root.root_node_id === "string") return root.root_node_id;
  if (root.repo === undefined) return undefined;
  const parsed = parseCanonicalRepoUrl(root.repo);
  return parsed.status === "valid" ? parsed.rootNodeId : undefined;
}

function indicesWhere(
  roots: readonly MapRoot[],
  predicate: (root: MapRoot, index: number) => boolean,
): number[] {
  const indices: number[] = [];
  roots.forEach((root, index) => {
    if (isRecord(root) && predicate(root, index)) indices.push(index);
  });
  return indices;
}

function isAddressPosition(value: string): boolean {
  const classified = classifyRepositoryPath(value, "file");
  return classified.status === "ok" && classified.role !== "reserved";
}

function parseMapBlock(value: unknown): MapBuildResult {
  if (!isRecord(value)) {
    return { status: "invalid", issues: [{ path: "map", code: "invalid_map_type" }] };
  }

  const issues: MapParseIssue[] = [];
  const roots = parseRoots(value.roots, issues);
  const members = parseMembers(value.members, roots.length, issues);
  if (issues.length > 0) return { status: "invalid", issues };
  return { status: "valid", map: { ...value, roots, members } };
}

function parseRoots(value: unknown, issues: MapParseIssue[]): MapRoot[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ path: "map.roots", code: "invalid_roots_type" });
    return [];
  }

  const roots: MapRoot[] = [];
  const names = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const input = value[index];
    const base = `map.roots[${index}]`;
    if (!isRecord(input)) {
      issues.push({ path: base, code: "invalid_root_type" });
      continue;
    }

    if ("space" in input) {
      issues.push({ path: `${base}.space`, code: "retired_space_field" });
    }

    let repo: string | undefined;
    let repoRootNodeId: string | undefined;
    if ("repo" in input) {
      const normalized = parseCanonicalRepoUrl(input.repo);
      if (normalized.status === "invalid") {
        issues.push({ path: `${base}.repo`, code: "invalid_repo" });
      } else {
        repo = normalized.repo;
        repoRootNodeId = normalized.rootNodeId;
      }
    }

    let declaredRootNodeId: string | undefined;
    if ("root_node_id" in input) {
      const parsed = parseRootNodeId(input.root_node_id);
      if (parsed.status !== "valid") {
        issues.push({ path: `${base}.root_node_id`, code: "invalid_root_node_id" });
      } else {
        declaredRootNodeId = parsed.rootNodeId;
      }
    }

    if (!("repo" in input) && !("root_node_id" in input) && !("space" in input)) {
      issues.push({ path: base, code: "missing_root_identity" });
    }
    if (
      repoRootNodeId !== undefined &&
      declaredRootNodeId !== undefined &&
      repoRootNodeId !== declaredRootNodeId
    ) {
      issues.push({ path: base, code: "root_identity_mismatch" });
    }
    if (input.sha !== undefined && (typeof input.sha !== "string" || !PIN_PATTERN.test(input.sha))) {
      issues.push({ path: `${base}.sha`, code: "invalid_pin" });
    }

    // An optional name set to undefined is absent, as a builder with an optional field produces.
    if (input.name !== undefined) {
      if (!isMapRootName(input.name)) {
        issues.push({ path: `${base}.name`, code: "invalid_root_name" });
      } else if (names.has(input.name)) {
        issues.push({ path: `${base}.name`, code: "duplicate_root_name" });
      } else {
        names.add(input.name);
      }
    }

    const rootNodeId = declaredRootNodeId ?? repoRootNodeId;
    roots.push({
      ...input,
      ...(repo === undefined ? {} : { repo }),
      ...(rootNodeId === undefined ? {} : { root_node_id: rootNodeId }),
      ...(typeof input.sha === "string" ? { sha: input.sha } : {}),
    });
  }
  return roots;
}

function parseMembers(
  value: unknown,
  rootCount: number,
  issues: MapParseIssue[],
): MapMember[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ path: "map.members", code: "invalid_members_type" });
    return [];
  }

  const members: MapMember[] = [];
  for (let index = 0; index < value.length; index++) {
    const input = value[index];
    const base = `map.members[${index}]`;
    if (!isRecord(input)) {
      issues.push({ path: base, code: "invalid_member_type" });
      continue;
    }

    if ("space" in input) {
      issues.push({ path: `${base}.space`, code: "retired_space_field" });
      continue;
    }

    const isAddress = "address" in input;
    const isPosition = "root" in input || "position" in input;
    if (isAddress === isPosition) {
      issues.push({ path: base, code: "invalid_member_shape" });
      continue;
    }

    validateDisclosure(input, base, issues);

    if (isAddress) {
      if (typeof input.address !== "string" || !ADDRESS_PATTERN.test(input.address)) {
        issues.push({ path: `${base}.address`, code: "invalid_address" });
      }
      if ("name" in input && typeof input.name !== "string") {
        issues.push({ path: `${base}.name`, code: "invalid_name" });
      }
      if ("summary" in input && typeof input.summary !== "string") {
        issues.push({ path: `${base}.summary`, code: "invalid_summary" });
      }
      if ("depth" in input && input.depth !== "name" && input.depth !== "summary") {
        issues.push({ path: `${base}.depth`, code: "invalid_depth" });
      }
      if (
        "revision" in input &&
        (typeof input.revision !== "string" || !REVISION_PATTERN.test(input.revision))
      ) {
        issues.push({ path: `${base}.revision`, code: "invalid_revision" });
      }
      members.push(input as MapAddressMember);
      continue;
    }

    if (!Number.isInteger(input.root) || (input.root as number) < 0 || (input.root as number) >= rootCount) {
      issues.push({ path: `${base}.root`, code: "invalid_root_index" });
    }
    if (!isMapPosition(input.position)) {
      issues.push({ path: `${base}.position`, code: "invalid_position" });
    }
    if (input.depth !== undefined && (typeof input.depth !== "string" || !DEPTHS.has(input.depth))) {
      issues.push({ path: `${base}.depth`, code: "invalid_depth" });
    }
    members.push(input as MapPositionMember);
  }
  return members;
}

function validateDisclosure(
  member: Record<string, unknown>,
  base: string,
  issues: MapParseIssue[],
): void {
  if (!("disclosure" in member)) return;
  const disclosure = member.disclosure;
  if (!isRecord(disclosure)) {
    issues.push({ path: `${base}.disclosure`, code: "invalid_disclosure" });
    return;
  }
  for (const field of ["name", "summary"] as const) {
    if (field in disclosure && typeof disclosure[field] !== "string") {
      issues.push({ path: `${base}.disclosure.${field}`, code: `invalid_${field}` });
    }
  }
  if (member.depth === "name" && "summary" in disclosure) {
    issues.push({ path: `${base}.disclosure.summary`, code: "disclosure_exceeds_depth" });
  }
}

function isMapPosition(value: unknown): value is string {
  if (value === ".") return true;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return false;
  }
  const segments = value.split("/");
  return !segments.some(
    (segment) =>
      segment === "." ||
      segment === ".." ||
      segment.toLowerCase() === ".git" ||
      (segment.startsWith("_") && segment !== "_threads"),
  );
}

function invalidRepo(): CanonicalRepoUrlParseResult {
  return { status: "invalid", code: "invalid_repo" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
