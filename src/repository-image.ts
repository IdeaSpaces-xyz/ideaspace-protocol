/**
 * Read a repository's identity image: the optional `image:` field in its root
 * `README.md`, resolved by the `_assets/` rules and checked on disk.
 *
 * A problem is a result, never a throw, an I/O error included: a reader
 * shows its default (an icon, an avatar glyph, initials) and may say why.
 * Nothing is fetched, written or followed outside the root.
 */

import { promises as fs } from "node:fs";
import { join, relative, resolve, sep, isAbsolute } from "node:path";
import {
  REPOSITORY_IMAGE_FIELD,
  REPOSITORY_IMAGE_MAX_BYTES,
  REPOSITORY_IMAGE_SOURCE,
  checkRepositoryImageBytes,
  resolveRepositoryImageDeclaration,
  type RepositoryImageMediaType,
  type RepositoryImageProblemCode,
} from "./assets.js";
import { parseFrontmatter } from "./frontmatter.js";

export interface RepositoryImage {
  /** Repository-relative, `/`-separated: `_assets/avatar.png`. */
  path: string;
  /** Canonical absolute local file. Never part of a portable Map. */
  absolutePath: string;
  mediaType: RepositoryImageMediaType;
  bytes: number;
}

export type RepositoryImageRead =
  | { status: "none" }
  | { status: "ok"; image: RepositoryImage }
  | {
      status: "problem";
      code: RepositoryImageProblemCode;
      /** The declared value when it was a string, as written. */
      declared?: string;
      message: string;
    };

const KIB = REPOSITORY_IMAGE_MAX_BYTES / 1024;

/**
 * Read `<root>/README.md` front matter and check its `image` field.
 * `root` is the repository root.
 */
export async function readRepositoryImage(root: string): Promise<RepositoryImageRead> {
  try {
    return await readChecked(root);
  } catch {
    // Any I/O error (a README or file it may not read, a root that went away) is a result too.
    return { status: "problem", code: "unreadable", message: problemMessage("unreadable") };
  }
}

async function readChecked(root: string): Promise<RepositoryImageRead> {
  const rootReal = await fs.realpath(resolve(root));
  let readme: string;
  try {
    const stat = await fs.lstat(join(rootReal, REPOSITORY_IMAGE_SOURCE));
    if (!stat.isFile()) return { status: "none" };
    readme = await fs.readFile(join(rootReal, REPOSITORY_IMAGE_SOURCE), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "none" };
    throw error;
  }
  const value = parseFrontmatter(readme)?.[REPOSITORY_IMAGE_FIELD];
  const declaration = resolveRepositoryImageDeclaration(value);
  if (declaration.status === "none") return { status: "none" };
  const declared = typeof value === "string" ? value : undefined;
  const problem = (code: RepositoryImageProblemCode): RepositoryImageRead => ({
    status: "problem",
    code,
    ...(declared !== undefined ? { declared } : {}),
    message: problemMessage(code, declared),
  });
  if (declaration.status === "invalid") return problem(declaration.code);

  try {
    const target = join(rootReal, ...declaration.path.split("/"));
    let real: string;
    try {
      real = await fs.realpath(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return problem("missing");
      throw error;
    }
    if (!within(rootReal, real)) return problem("outside_root");
    const stat = await fs.stat(real);
    if (!stat.isFile()) return problem("missing");
    if (stat.size > REPOSITORY_IMAGE_MAX_BYTES) return problem("too_large");
    const bytes = await fs.readFile(real);
    const checked = checkRepositoryImageBytes(declaration.mediaType, bytes);
    if (!checked.ok) return problem(checked.code);
    return {
      status: "ok",
      image: { path: declaration.path, absolutePath: real, mediaType: declaration.mediaType, bytes: bytes.length },
    };
  } catch {
    return problem("unreadable");
  }
}

/** One sentence: what happened and what to do. The reader still shows its default. */
export function problemMessage(code: RepositoryImageProblemCode, declared?: string): string {
  const named = declared !== undefined ? `README.md's image "${declared}"` : "README.md's image";
  switch (code) {
    case "not_a_string":
      return "README.md's image must be one path, such as image: _assets/avatar.png.";
    case "invalid_reference":
      return `${named} isn't a relative path: write a path inside the repo, such as _assets/avatar.png, not a URL or an absolute path.`;
    case "outside_root":
      return `${named} points outside this repo; put the file in the repo's _assets/ folder.`;
    case "not_in_assets":
      return `${named} isn't in an _assets/ folder; move the file into _assets/ and point at it there.`;
    case "unsupported_type":
      return `${named} isn't a PNG, JPEG, WebP or SVG file; use one of those (.png, .jpg, .jpeg, .webp, .svg).`;
    case "missing":
      return `${named} names a file that isn't there; add it, or fix the path.`;
    case "too_large":
      return `${named} is larger than ${KIB} KiB; save a smaller one (512 pixels across is plenty).`;
    case "type_mismatch":
      return `${named} doesn't contain what its extension says; save it again as that type, or rename it.`;
    case "unsafe_svg":
      return `${named} is an SVG with a script, an event handler or a link outside itself; remove them, or use a PNG.`;
    case "unreadable":
      return declared !== undefined
        ? `${named} couldn't be read; check the file's permissions.`
        : "README.md or its image couldn't be read; check the files' permissions.";
  }
}

function within(root: string, target: string): boolean {
  if (target === root) return false;
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
