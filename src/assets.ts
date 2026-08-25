/**
 * Portable `_assets/` reference resolution.
 *
 * `_assets/` is supporting payload beneath a content position. It is not
 * searchable knowledge or ambient agent context. Resolution is deliberately
 * lexical: callers provide an already-extracted, decoded relative Markdown
 * destination path; this module performs no Markdown parsing or filesystem I/O.
 */

/** Exact, case-sensitive supporting-material directory name. */
export const ASSET_DIRECTORY = "_assets";

export type AssetReferenceResolution =
  | { status: "asset"; path: string }
  | { status: "other"; path: string }
  | { status: "outside" }
  | {
      status: "invalid";
      code: "invalid_source_path" | "invalid_reference_path";
    };

/** URI schemes are not relative repository paths. */
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Resolve one portable relative reference from its containing Markdown file.
 *
 * Inputs use `/` regardless of host OS. `sourcePath` is a canonical
 * repository-relative `.md` path outside infrastructure. `referencePath` is
 * the already-extracted and decoded path component of a relative Markdown
 * destination — titles, query strings, and fragments are caller concerns.
 *
 * No existence check, ancestor search, root fallback, symlink walk, or write
 * occurs. Escapes above the Space root are reported as `outside`.
 */
export function resolveAssetReference(
  sourcePath: unknown,
  referencePath: unknown,
): AssetReferenceResolution {
  const source = parseSourcePath(sourcePath);
  if (!source) return { status: "invalid", code: "invalid_source_path" };

  const reference = parseReferencePath(referencePath);
  if (!reference) return { status: "invalid", code: "invalid_reference_path" };

  const resolved = source.slice(0, -1);
  for (const segment of reference) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return { status: "outside" };
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }

  const path = resolved.length === 0 ? "." : resolved.join("/");
  const directorySegments = resolved.slice(0, -1);
  const firstInfrastructure = directorySegments.find(
    (segment) => segment.startsWith("_") || segment.toLowerCase() === ".git",
  );
  if (firstInfrastructure === ASSET_DIRECTORY) return { status: "asset", path };
  return { status: "other", path };
}

function parseSourcePath(value: unknown): string[] | null {
  if (typeof value !== "string" || !isPortablePathText(value)) return null;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("//")) return null;

  const segments = value.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  const filename = segments.at(-1)!;
  if (!filename.endsWith(".md")) return null;
  if (
    segments
      .slice(0, -1)
      .some((segment) => segment.startsWith("_") || segment.toLowerCase() === ".git")
  ) {
    return null;
  }
  return segments;
}

function parseReferencePath(value: unknown): string[] | null {
  if (typeof value !== "string" || !isPortablePathText(value)) return null;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("//")) return null;
  if (SCHEME_RE.test(value)) return null;

  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0)) return null;
  return segments;
}

function isPortablePathText(value: string): boolean {
  return value.length > 0 && !value.includes("\\") && !value.includes("\0");
}
