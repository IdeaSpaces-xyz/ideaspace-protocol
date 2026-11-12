/**
 * Portable `_assets/` reference resolution.
 *
 * `_assets/` is supporting payload beneath a content position. It is not
 * searchable knowledge or ambient agent context. Resolution is deliberately
 * lexical: callers provide an already-extracted, decoded relative Markdown
 * destination path; this module performs no Markdown parsing or filesystem I/O.
 */

import { classifyRepositoryPath } from "./repository-path.js";

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
  const classification = classifyRepositoryPath(path, "file");
  if (
    classification.status === "ok" &&
    classification.role === "extension" &&
    classification.extension === ASSET_DIRECTORY
  ) {
    return { status: "asset", path };
  }
  return { status: "other", path };
}

function parseSourcePath(value: unknown): string[] | null {
  if (typeof value !== "string" || !isPortablePathText(value)) return null;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("//")) return null;

  const classification = classifyRepositoryPath(value, "file");
  if (classification.status !== "ok" || classification.role !== "knowledge") return null;
  return value.split("/");
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

// ---------------------------------------------------------------------------
// Identity image: one optional `image:` field in a Space root's README.md.
// Pure and browser-safe, like the rest of this module: the lexical declaration
// check and the byte checks take values, never paths to open. The filesystem
// reader is `readRepositoryImage` in `repository-image.ts`.
// ---------------------------------------------------------------------------

/** The README front-matter field that names a Space's identity image. */
export const REPOSITORY_IMAGE_FIELD = "image";

/** The Markdown file the field is read from, relative to the Space root. */
export const REPOSITORY_IMAGE_SOURCE = "README.md";

/** The largest identity image a reader accepts: 256 KiB. */
export const REPOSITORY_IMAGE_MAX_BYTES = 262_144;

export type RepositoryImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

/** Lower-case file extension → media type. Nothing else is an identity image. */
export const REPOSITORY_IMAGE_TYPES: Readonly<Record<string, RepositoryImageMediaType>> = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
});

/** Why a declared image is not shown. Each is reported; none fails the Space. */
export type RepositoryImageProblemCode =
  | "not_a_string"
  | "invalid_reference"
  | "outside_root"
  | "not_in_assets"
  | "unsupported_type"
  | "missing"
  | "too_large"
  | "type_mismatch"
  | "unsafe_svg";

export type RepositoryImageDeclaration =
  | { status: "none" }
  | { status: "declared"; path: string; mediaType: RepositoryImageMediaType }
  | {
      status: "invalid";
      code: "not_a_string" | "invalid_reference" | "outside_root" | "not_in_assets" | "unsupported_type";
    };

/**
 * Check one `image` front-matter value lexically, as written in the Space
 * root's `README.md`. It resolves by `resolveAssetReference` from `README.md`:
 * relative, no fallback, never above the root, and it must land in `_assets/`.
 * The extension names the type. No file is read.
 */
export function resolveRepositoryImageDeclaration(value: unknown): RepositoryImageDeclaration {
  if (value === undefined || value === null) return { status: "none" };
  if (typeof value !== "string") return { status: "invalid", code: "not_a_string" };
  const resolved = resolveAssetReference(REPOSITORY_IMAGE_SOURCE, value);
  if (resolved.status === "invalid") return { status: "invalid", code: "invalid_reference" };
  if (resolved.status === "outside") return { status: "invalid", code: "outside_root" };
  if (resolved.status === "other") return { status: "invalid", code: "not_in_assets" };
  const name = resolved.path.slice(resolved.path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!Object.prototype.hasOwnProperty.call(REPOSITORY_IMAGE_TYPES, extension)) {
    return { status: "invalid", code: "unsupported_type" };
  }
  return { status: "declared", path: resolved.path, mediaType: REPOSITORY_IMAGE_TYPES[extension] };
}

export type RepositoryImageBytesCheck =
  | { ok: true }
  | { ok: false; code: "too_large" | "type_mismatch" | "unsafe_svg" };

/**
 * Check an identity image's bytes against its declared type: at most
 * `REPOSITORY_IMAGE_MAX_BYTES`, the type's signature for PNG, JPEG and WebP,
 * and for SVG the rule in `checkSvgImageText`.
 */
export function checkRepositoryImageBytes(
  mediaType: RepositoryImageMediaType,
  bytes: Uint8Array,
): RepositoryImageBytesCheck {
  if (bytes.length > REPOSITORY_IMAGE_MAX_BYTES) return { ok: false, code: "too_large" };
  switch (mediaType) {
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? { ok: true } : { ok: false, code: "type_mismatch" };
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]) ? { ok: true } : { ok: false, code: "type_mismatch" };
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
        ? { ok: true }
        : { ok: false, code: "type_mismatch" };
    case "image/svg+xml": {
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return { ok: false, code: "type_mismatch" };
      }
      const svg = checkSvgImageText(text);
      return svg === "ok" ? { ok: true } : { ok: false, code: svg === "not_svg" ? "type_mismatch" : "unsafe_svg" };
    }
  }
}

/**
 * The SVG rule, lexical and refusing what it does not recognise. It is a
 * filter in front of image-only rendering, not a sanitizer: an accepted SVG is
 * still drawn only as an image, never inlined into a page's DOM.
 *
 * `not_svg` when the first element is not `<svg>`; `unsafe` when the text has
 * a DOCTYPE or entity declaration, a script-capable element, an event
 * attribute, a reference that is not a `#fragment`, an `@import`, a
 * `javascript:` string, an animated `href`, or any backslash (a CSS escape
 * could spell the rest).
 */
export function checkSvgImageText(text: string): "ok" | "not_svg" | "unsafe" {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  // A declaration is refused before anything else: it isn't an element, so it can't decide the type.
  if (/<!(?:DOCTYPE|ENTITY)/i.test(source)) return "unsafe";
  const prolog = source.replace(/^(?:\s+|<\?xml[^>]*\?>|<!--[\s\S]*?-->)*/, "");
  if (!/^<svg[\s>/]/.test(prolog)) return "not_svg";
  if (/<\s*\/?\s*(?:[\w.-]+:)?(?:script|foreignObject|iframe|embed|object|handler|listener)\b/i.test(source)) return "unsafe";
  if (/[\s"'/](?:[\w.-]+:)?on[\w.-]*\s*=/i.test(source)) return "unsafe";
  if (/\\/.test(source) || /@import/i.test(source) || /javascript:/i.test(source)) return "unsafe";
  if (/attributeName\s*=\s*["']?\s*(?:[\w.-]+:)?href\b/i.test(source)) return "unsafe";
  for (const match of source.matchAll(/[\s"'/](?:[\w.-]+:)?(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/gi)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!value.startsWith("#")) return "unsafe";
  }
  for (const match of source.matchAll(/url\s*\(\s*(["']?)([^)]*)\)/gi)) {
    const value = match[2].replace(/["']\s*$/, "").trim();
    if (!value.startsWith("#")) return "unsafe";
  }
  return "ok";
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((value, at) => bytes[at] === value);
}
