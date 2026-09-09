/**
 * Portable Map frontmatter primitives.
 *
 * A map-note is an ordinary Markdown Note whose optional `map` block carries
 * ordered addresses and exact Git pins. Parsing is pure and mutation-free.
 * An invalid block makes only the Map projection unavailable; it never makes
 * the surrounding Note unreadable.
 */

import { parseRootNodeId } from "./root-identity.js";

export const MAP_DEPTHS = ["name", "summary", "surface", "children", "full"] as const;
export type MapDepth = (typeof MAP_DEPTHS)[number];

export interface MapRoot extends Record<string, unknown> {
  /** Canonical absolute repository URL: `<web-origin>/repos/{root_node_id}`. */
  repo?: string;
  /** Portable repository-root identity; current and legacy reader forms are accepted. */
  root_node_id?: string;
  /** Full resolved Git commit object id. */
  sha: string;
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
  /** Maximum representation a reader may disclose. */
  depth: MapDepth;
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
  | "invalid_members_type"
  | "invalid_member_type"
  | "invalid_member_shape"
  | "invalid_root_index"
  | "invalid_position"
  | "invalid_depth"
  | "invalid_address"
  | "invalid_name"
  | "invalid_summary"
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
const ADDRESS_PATTERN = /^[a-z][a-z0-9_]*:.+$/;
const PIN_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REPO_PATH_PATTERN = /^\/repos\/(n_(?:[0-9a-f]{12}|[0-9a-f]{24}))$/;
const HTTP_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
    if (typeof input.sha !== "string" || !PIN_PATTERN.test(input.sha)) {
      issues.push({ path: `${base}.sha`, code: "invalid_pin" });
    }

    const rootNodeId = declaredRootNodeId ?? repoRootNodeId;
    roots.push({
      ...input,
      ...(repo === undefined ? {} : { repo }),
      ...(rootNodeId === undefined ? {} : { root_node_id: rootNodeId }),
      sha: typeof input.sha === "string" ? input.sha : "",
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
      members.push(input as MapAddressMember);
      continue;
    }

    if (!Number.isInteger(input.root) || (input.root as number) < 0 || (input.root as number) >= rootCount) {
      issues.push({ path: `${base}.root`, code: "invalid_root_index" });
    }
    if (!isMapPosition(input.position)) {
      issues.push({ path: `${base}.position`, code: "invalid_position" });
    }
    if (typeof input.depth !== "string" || !DEPTHS.has(input.depth)) {
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
    (segment) => segment === "." || segment === ".." || segment.startsWith("_") || segment.toLowerCase() === ".git",
  );
}

function invalidRepo(): CanonicalRepoUrlParseResult {
  return { status: "invalid", code: "invalid_repo" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
