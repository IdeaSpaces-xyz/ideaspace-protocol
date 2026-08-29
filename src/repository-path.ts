/**
 * Pure classification of one portable repository-relative path.
 *
 * The target kind is explicit because the underscore extension point applies
 * to directories, not files that merely share an extension-container name.
 * No filesystem, Git, symlink, or existence lookup occurs.
 */

export type RepositoryPathTargetKind = "file" | "directory";

export type RepositoryPathClassification =
  | { status: "ok"; role: "knowledge" | "agent-context" | "ordinary" | "reserved" }
  | { status: "ok"; role: "extension"; extension: string }
  | { status: "invalid"; code: "invalid_path" | "invalid_kind" };

/** Exact, case-sensitive core agent-context directory name. */
const AGENT_DIRECTORY = "_agent";

/**
 * Classify one portable repository-relative path by its first owning boundary.
 *
 * Inputs use `/` on every host. Empty, absolute, non-canonical, backslash, and
 * NUL-containing paths are invalid. Exact `_agent/` owns core context; every
 * other `_`-prefixed directory owns an opaque extension subtree. `.git` is a
 * reserved boundary and is matched case-insensitively for safety.
 */
export function classifyRepositoryPath(
  path: unknown,
  kind: unknown,
): RepositoryPathClassification {
  if (kind !== "file" && kind !== "directory") {
    return { status: "invalid", code: "invalid_kind" };
  }
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("//") ||
    path.includes("\\") ||
    path.includes("\0")
  ) {
    return { status: "invalid", code: "invalid_path" };
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { status: "invalid", code: "invalid_path" };
  }

  const directorySegments = kind === "directory" ? segments : segments.slice(0, -1);
  for (const segment of directorySegments) {
    if (segment.toLowerCase() === ".git") {
      return { status: "ok", role: "reserved" };
    }
    if (segment.startsWith("_")) {
      if (segment === AGENT_DIRECTORY) {
        return { status: "ok", role: "agent-context" };
      }
      return { status: "ok", role: "extension", extension: segment };
    }
  }

  if (kind === "file" && segments.at(-1)!.endsWith(".md")) {
    return { status: "ok", role: "knowledge" };
  }
  return { status: "ok", role: "ordinary" };
}
