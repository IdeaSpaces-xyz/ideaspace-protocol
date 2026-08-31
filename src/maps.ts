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
  /** Canonical remote locator: lowercase host plus repository path, without scheme or `.git`. */
  space?: string;
  /** Portable Space identity; current and legacy reader forms are accepted. */
  root_node_id?: string;
  /** Full resolved Git commit object id. */
  sha: string;
}

export interface MapPositionMember extends Record<string, unknown> {
  /** Zero-based index into `roots`. */
  space: number;
  /** Portable repository-relative protocol position, or `.` for the root. */
  position: string;
  /** Maximum representation a reader may disclose. */
  depth: MapDepth;
}

export interface MapAddressMember extends Record<string, unknown> {
  /** Open `<type>:<id>` address; URLs naturally use their scheme as the type. */
  address: string;
  name?: string;
  summary?: string;
  /** External addresses can promise no representation beyond summary. */
  depth?: "name" | "summary";
}

export type MapMember = MapPositionMember | MapAddressMember;

export interface MapBlock extends Record<string, unknown> {
  roots: MapRoot[];
  members: MapMember[];
}

export type MapParseIssueCode =
  | "invalid_map_type"
  | "invalid_roots_type"
  | "invalid_root_type"
  | "missing_root_identity"
  | "invalid_space"
  | "invalid_root_node_id"
  | "invalid_pin"
  | "invalid_members_type"
  | "invalid_member_type"
  | "invalid_member_shape"
  | "invalid_root_index"
  | "invalid_position"
  | "invalid_depth"
  | "invalid_address"
  | "invalid_name"
  | "invalid_summary";

export interface MapParseIssue {
  path: string;
  code: MapParseIssueCode;
}

export type MapParseResult =
  | { status: "absent" }
  | { status: "valid"; map: MapBlock }
  | { status: "invalid"; issues: MapParseIssue[] };

export type MapSpaceNormalization =
  | { status: "valid"; space: string }
  | { status: "invalid"; code: "invalid_space" };

const DEPTHS = new Set<string>(MAP_DEPTHS);
const ADDRESS_PATTERN = /^[a-z][a-z0-9_]*:.+$/;
const PIN_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HOST_PATTERN = /^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]+)?$/;
const URL_PROTOCOLS = new Set(["http:", "https:", "ssh:", "git:"]);

/**
 * Normalize a Git remote to the portable Map form `host[:port]/path`.
 *
 * Common HTTP(S), SSH, Git, and scp-style remotes converge. Credentials,
 * scheme, a leading slash, trailing slash, and one `.git` suffix do not enter
 * the identity. Local/file remotes, queries, fragments, dot segments, and
 * whitespace are refused.
 */
export function canonicalizeMapSpace(value: unknown): MapSpaceNormalization {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return invalidSpace();
  }

  let host = "";
  let path = "";

  if (value.includes("://")) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return invalidSpace();
    }
    if (!URL_PROTOCOLS.has(url.protocol) || url.search || url.hash || !url.hostname) {
      return invalidSpace();
    }
    const port = normalizedPort(url.protocol, url.port);
    host = `${url.hostname.toLowerCase()}${port ? `:${port}` : ""}`;
    path = url.pathname.replace(/^\/+/, "");
  } else {
    const canonical = value.match(/^([^/@:\s]+(?::[0-9]+)?)\/(.+)$/);
    if (canonical) {
      host = canonical[1]!.toLowerCase();
      path = canonical[2]!;
    } else {
      const scp = value.match(/^(?:[^@/:\s]+@)?([^/:\s]+):(.+)$/);
      if (!scp) return invalidSpace();
      host = scp[1]!.toLowerCase();
      path = scp[2]!;
    }
  }

  if (!HOST_PATTERN.test(host)) return invalidSpace();
  const normalizedPath = normalizeRemotePath(path);
  if (normalizedPath === null) return invalidSpace();
  return { status: "valid", space: `${host}/${normalizedPath}` };
}

/** Parse an optional `map` frontmatter value into its portable standard projection. */
export function parseMap(value: unknown): MapParseResult {
  if (value === undefined) return { status: "absent" };
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

    let space: string | undefined;
    if ("space" in input) {
      const normalized = canonicalizeMapSpace(input.space);
      if (normalized.status === "invalid") {
        issues.push({ path: `${base}.space`, code: "invalid_space" });
      } else {
        space = normalized.space;
      }
    }

    let rootNodeId: string | undefined;
    if ("root_node_id" in input) {
      const parsed = parseRootNodeId(input.root_node_id);
      if (parsed.status !== "valid") {
        issues.push({ path: `${base}.root_node_id`, code: "invalid_root_node_id" });
      } else {
        rootNodeId = parsed.rootNodeId;
      }
    }

    if (!("space" in input) && !("root_node_id" in input)) {
      issues.push({ path: base, code: "missing_root_identity" });
    }
    if (typeof input.sha !== "string" || !PIN_PATTERN.test(input.sha)) {
      issues.push({ path: `${base}.sha`, code: "invalid_pin" });
    }

    roots.push({
      ...input,
      ...(space === undefined ? {} : { space }),
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

    const isAddress = "address" in input;
    const isPosition = "space" in input || "position" in input;
    if (isAddress === isPosition) {
      issues.push({ path: base, code: "invalid_member_shape" });
      continue;
    }

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

    if (!Number.isInteger(input.space) || (input.space as number) < 0 || (input.space as number) >= rootCount) {
      issues.push({ path: `${base}.space`, code: "invalid_root_index" });
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

function normalizeRemotePath(value: string): string | null {
  if (
    value.length === 0 ||
    /[\s\\?#\0]/.test(value) ||
    value.includes("//")
  ) {
    return null;
  }
  let path = value.replace(/^\/+|\/+$/g, "");
  if (path.endsWith(".git")) path = path.slice(0, -4);
  if (!path) return null;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

function normalizedPort(protocol: string, port: string): string {
  if (!port) return "";
  if (
    (protocol === "http:" && port === "80") ||
    (protocol === "https:" && port === "443") ||
    (protocol === "ssh:" && port === "22") ||
    (protocol === "git:" && port === "9418")
  ) {
    return "";
  }
  return port;
}

function invalidSpace(): MapSpaceNormalization {
  return { status: "invalid", code: "invalid_space" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
