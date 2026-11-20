/**
 * Portable `_threads/` contract: the Threads kind over `time.ts`.
 *
 * `_threads/` is the second standard named extension: collaboration threads, each a folder that
 * keeps time by placement. What every such folder shares (entries, order, the DAG, corrections and
 * marks, entries setting state, the current Map, the time selections) lives in `time.ts` and is
 * re-exported here under its Thread names, so no name a consumer imports is removed. This module
 * adds what belongs to the kind: placement, the tree (`parent`) and its resolution, hosted ids,
 * and worktree path resolution.
 *
 * This module is pure and browser-safe (no Node filesystem or network I/O).
 */

import { parseFrontmatter } from "./frontmatter.js";
import {
  POST_ID,
  addressedPostTarget,
  isPostPath,
  isPostReference,
  matchesPostSelector,
  parseThreadAttachment,
  type ThreadAttachment,
  type ThreadAttachmentParseResult,
} from "./post-links.js";
import {
  currentMap,
  inspectEntries,
  parseEntry,
  reconstructTimeline,
  resolveEntryById,
  type CurrentMap,
  type CurrentMapOptions,
  type Entry,
  type EntryInspection,
  type EntryParseResult,
  type EntrySource,
  type EntryTimeline,
} from "./time.js";

export { parseThreadAttachment, isPostReference };
export type { ThreadAttachment, ThreadAttachmentParseResult };

/** Exact, case-sensitive threads directory name. */
export const THREADS_DIRECTORY = "_threads";

/**
 * A hosted Thread id: `x_`, then the host's characters. Opaque in length: check this pattern and
 * never a length, so a change in how a host mints ids needs no client release.
 */
export const HOSTED_THREAD_ID = /^x_[A-Za-z0-9_-]+$/;

/**
 * The standard kinds a reader acts on. A writer uses `post`, `reframe`, `correction` and `mark`
 * (`ENTRY_KINDS` in time.ts); `snapshot` and `closure` are legacy forms of the `map` and `closed`
 * fields, still read. A label goes in `tags`; other values stay readable as unknown kinds.
 */
export const THREAD_KINDS = [
  "post",
  "snapshot",
  "reframe",
  "correction",
  "closure",
  "mark",
] as const;

export type KnownThreadKind = (typeof THREAD_KINDS)[number];

export type ThreadKind = KnownThreadKind | (string & {});

// The time types, under their Thread names.
export type ThreadPostFrontmatter = import("./time.js").EntryFrontmatter;
export type ThreadPostFieldWarning = import("./time.js").EntryFieldWarning;
export type ThreadMark = import("./time.js").EntryMark;
export type ThreadPost = Entry;
export type ThreadPostParseResult = EntryParseResult;
export type ThreadPostSource = EntrySource;
export type ThreadPostInspection = EntryInspection;
export type CurrentThreadMapOptions = CurrentMapOptions;
export type CurrentThreadMapSkip = import("./time.js").CurrentMapSkip;
export type CurrentThreadMap = CurrentMap;
export type ThreadNode = import("./time.js").EntryNode;
export type ThreadTimeline = EntryTimeline;

/**
 * Parse and validate one markdown thread post: `parseEntry` under the Thread rule, where a post
 * without a valid `id` is unreadable.
 */
export function parseThreadPost(content: string, path: string = ""): ThreadPostParseResult {
  return parseEntry(content, path);
}

/**
 * Inspect a caller-selected Thread snapshot: `inspectEntries` over canonical direct
 * `_threads/<thread>/<post>.md` files, with the Thread Agreement's fallback parent.
 */
export function inspectThreadPosts(
  sources: ThreadPostSource[],
  agreementAttachment?: ThreadAttachmentParseResult,
): ThreadPostInspection {
  return inspectEntries(sources, { ...(agreementAttachment ? { agreementAttachment } : {}) });
}

/** The current Thread Map: `currentMap` over canonical direct post files. */
export function currentThreadMap(
  posts: ThreadPostSource[],
  options: CurrentThreadMapOptions = {},
): CurrentThreadMap {
  return currentMap(posts, options);
}

/** Reconstruct a Thread's reply DAG and linearized timeline: `reconstructTimeline`. */
export function reconstructThreadTimeline(posts: ThreadPost[]): ThreadTimeline {
  return reconstructTimeline(posts);
}

/**
 * Select one post from an explicitly supplied root or Thread snapshot by id, among canonical post
 * paths only. See `resolveEntryById` for the matching rule.
 */
export function resolveThreadPostById(
  id: string,
  posts: readonly { path: string; id: string }[],
): { status: "resolved"; post: { path: string; id: string } } | { status: "unresolved" | "ambiguous" } {
  return resolveEntryById(id, posts.filter((post) => parseThreadAttachment(post.path)?.kind === "path"));
}

/**
 * Read the Thread's parent from a Thread Agreement; ordinary Notes keep subject semantics.
 * `parent` is read first, then the legacy `attached_to`; both carry the post-only grammar.
 */
export function parseThreadAgreementAttachment(
  content: string,
  agreementPath: string,
): ThreadAttachmentParseResult {
  if (!/^_threads\/[^/.][^/]*\/_agent\/agreement\.md$/.test(agreementPath)) {
    return { status: "invalid", issue: "invalid_context" };
  }
  // A plain-Markdown Agreement has no declared parent; a broken YAML block is invalid.
  if (!/^---\r?\n/.test(content)) return { status: "absent" };
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return { status: "invalid", issue: "invalid_frontmatter" };
  const field = "parent" in frontmatter ? "parent" : "attached_to" in frontmatter ? "attached_to" : undefined;
  if (!field) {
    return { status: "absent" };
  }
  const attachment = parseThreadAttachment(frontmatter[field]);
  // The Agreement's fallback names a post in the same root; the addressed form belongs on posts.
  if (!attachment || !isPostReference(attachment) || attachment.value.startsWith("@")) {
    return { status: "absent", warning: field === "parent" ? "invalid_parent" : "invalid_attached_to" };
  }
  return { status: "valid", attachment };
}

/** Caller-supplied, authorized root snapshot. The protocol never fetches or selects HEAD. */
export interface ThreadAttachmentRoot {
  root: string;
  pin: string;
  posts: { path: string; id: string }[];
}

export interface ResolvedThreadParent {
  root: string;
  pin: string;
  path: string;
  id: string;
}

export type ThreadParentResolution =
  | { status: "resolved"; parent: ResolvedThreadParent }
  | { status: "none"; attachment: ThreadAttachment }
  | { status: "unresolved" | "ambiguous" };

/**
 * Resolve against only supplied root snapshots; an authored pin is never replaced by HEAD. An
 * addressed post (`post:@<root>//…`) resolves only in the supplied root whose `root` label is the
 * address's root identity or name, by exact path or by id inside the named folder.
 */
export function resolveThreadParent(
  attachment: ThreadAttachment,
  roots: ThreadAttachmentRoot[],
  authoredPin?: string,
): ThreadParentResolution {
  if (!isPostReference(attachment)) {
    return { status: "none", attachment };
  }
  const targetVal = attachment.value;
  const addressed = attachment.kind === "post" ? addressedPostTarget(targetVal) : null;
  const matchId = attachment.kind === "id" || (attachment.kind === "post" && POST_ID.test(targetVal));
  const matchPath = attachment.kind === "path" || (attachment.kind === "post" && !matchId && isPostPath(targetVal));
  if (!matchId && !matchPath && !addressed) return { status: "unresolved" };
  const matches: ResolvedThreadParent[] = [];
  for (const root of roots) {
    if (authoredPin !== undefined && root.pin !== authoredPin) continue;
    if (addressed && root.root !== addressed.root) continue;
    for (const post of root.posts) {
      // Snapshots contain canonical positions, not stripped worktree tree paths.
      if (parseThreadAttachment(post.path)?.kind !== "path") continue;
      const hit = addressed ? matchesPostSelector(post, addressed.selector)
        : (matchId && post.id === targetVal) || (matchPath && post.path === targetVal);
      if (hit) matches.push({ root: root.root, pin: root.pin, path: post.path, id: post.id });
    }
  }
  return matches.length === 1 ? { status: "resolved", parent: matches[0] }
    : { status: matches.length ? "ambiguous" : "unresolved" };
}

/** Reverse lookup uses the same resolver, so path and id yield the same child link. */
export function childThreadsOfPost(
  parent: ResolvedThreadParent,
  children: { threadPath: string; attachment: ThreadAttachment; authoredPin?: string }[],
  roots: ThreadAttachmentRoot[],
): string[] {
  return children.filter((child) => {
    const result = resolveThreadParent(child.attachment, roots, child.authoredPin);
    return result.status === "resolved" && result.parent.root === parent.root &&
      result.parent.pin === parent.pin && result.parent.path === parent.path && result.parent.id === parent.id;
  }).map((child) => child.threadPath);
}

/**
 * Check whether a repository-relative path targets the `_threads/` extension.
 */
export function isThreadPosition(position: string): boolean {
  if (position === THREADS_DIRECTORY) return true;
  if (position.startsWith(`${THREADS_DIRECTORY}/`)) return true;
  const segments = position.split("/");
  return segments.includes(THREADS_DIRECTORY);
}

/**
 * Resolve an authored Map member position under `_threads/` against a pinned Git tree.
 *
 * In a unified repository (or knowledge Space), `_threads/...` is committed directly
 * in the repository root tree and matches the authored position.
 *
 * In a code repository where `_threads/` is backed by a separate `threads` worktree
 * branch, the commit tree at that pinned root is rooted at the `_threads/` directory
 * itself (so items exist at `<thread>/...`).
 *
 * This function resolves the path by testing:
 * 1. The exact authored position (`_threads/...`).
 * 2. If not found and the position starts with `_threads/`, the stripped path (`...`).
 *
 * Returns the resolved path inside the target tree, or null if neither matches.
 */
export function resolveThreadGitPath(
  position: string,
  treeHasPath: (path: string) => boolean,
): string | null {
  if (treeHasPath(position)) {
    return position;
  }
  if (position === THREADS_DIRECTORY) {
    if (treeHasPath(".") || treeHasPath("")) {
      return ".";
    }
    return null;
  }
  if (position.startsWith(`${THREADS_DIRECTORY}/`)) {
    const stripped = position.slice(THREADS_DIRECTORY.length + 1);
    if (treeHasPath(stripped)) {
      return stripped;
    }
  }
  return null;
}

/** Who a post asks (`to`): the entry operation under the Thread names. */
export { parseAddressees, ADDRESSEE_MAX_LENGTH as THREAD_ADDRESSEE_MAX_LENGTH, ADDRESSEES_MAX as THREAD_ADDRESSEES_MAX } from "./time.js";
