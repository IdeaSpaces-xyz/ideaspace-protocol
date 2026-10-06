/**
 * Portable `_threads/` contract, post parsing, timeline reconstruction, and path resolution.
 *
 * `_threads/` is the second standard named extension: collaboration threads with
 * immutable dated posts, thread Agreement, curated README lens, and root-relative
 * Map pointers.
 *
 * This module is pure and browser-safe (no Node filesystem or network I/O).
 */

import { parseFrontmatter, stripFrontmatter } from "./frontmatter.js";
import { parseMap, type MapBuildInput, type MapParseResult } from "./maps.js";

/** Exact, case-sensitive threads directory name. */
export const THREADS_DIRECTORY = "_threads";

/** Valid post kinds in a collaboration thread. */
export const THREAD_KINDS = [
  "post",
  "snapshot",
  "reframe",
  "correction",
  "closure",
] as const;

export type ThreadKind = (typeof THREAD_KINDS)[number];

const KIND_SET = new Set<string>(THREAD_KINDS);

/** Structured Layer 1/2 frontmatter of one thread post. */
export interface ThreadPostFrontmatter {
  /** Globally unique identifier minted by the writer. */
  id: string;
  /** Authored ISO 8601 instant; optional for posts predating this field. */
  date?: string;
  /** Parent post id(s). Single string or array of strings. */
  in_reply_to?: string | string[];
  /** Ancestor chain of post ids, oldest first. */
  references?: string[];
  /** Post role/type. Defaults to "post". */
  kind?: ThreadKind;
  /** Superseded post id when kind is "correction". */
  supersedes?: string;
  /** Optional Map block capturing citations and coordinates. */
  map?: MapBuildInput;
  /** Human-readable title or subject. */
  name?: string;
  /** Dense summary for search and orientation. */
  summary?: string;
  /** Retrieval descriptors. */
  tags?: string[];
  /** Actor identity reference. */
  actor_ref?: string;
  /** Human-readable author name. */
  author?: string;
  [key: string]: unknown;
}

/** One parsed immutable thread post. */
export interface ThreadPost {
  id: string;
  path: string;
  /** Authored date if present, else a valid file-name stamp when available. */
  date?: string;
  frontmatter: ThreadPostFrontmatter;
  body: string;
  inReplyTo: string[];
  references: string[];
  kind: ThreadKind;
  supersedes?: string;
  mapResult?: MapParseResult;
}

export type ThreadPostParseResult =
  | { status: "valid"; post: ThreadPost }
  | { status: "invalid"; issues: string[] };

/**
 * Parse and validate one markdown thread post.
 *
 * Inputs are the raw markdown content and an optional repository or file path.
 * The post must contain valid frontmatter with a non-empty `id`.
 */
export function parseThreadPost(
  content: string,
  path: string = "",
): ThreadPostParseResult {
  const fm = parseFrontmatter(content);
  if (!fm) {
    return { status: "invalid", issues: ["missing_or_malformed_frontmatter"] };
  }

  const issues: string[] = [];
  let date: string | undefined;
  if ("date" in fm) {
    if (typeof fm.date !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(fm.date) ||
        !Number.isFinite(Date.parse(fm.date))) issues.push("invalid_date");
    else date = fm.date;
  } else {
    // Legacy posts locate their time only in the file name. An ordinal-day
    // filename supplies its date at midnight; an unrecognised name invents none.
    const file = path.split(/[\\/]/).at(-1) ?? "";
    const stamp = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z(?:-|\.md$)/.exec(file);
    const day = /^(\d{4}-\d{2}-\d{2})-/.exec(file);
    const candidate = stamp
      ? `${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}.${stamp[5] ?? "000"}Z`
      : day ? `${day[1]}T00:00:00.000Z` : undefined;
    if (candidate && !Number.isNaN(Date.parse(candidate)) && new Date(candidate).toISOString() === candidate) date = candidate;
  }

  if (typeof fm.id !== "string" || fm.id.trim().length === 0) {
    issues.push("invalid_id");
  }

  let kind: ThreadKind = "post";
  if ("kind" in fm) {
    if (typeof fm.kind !== "string" || !KIND_SET.has(fm.kind)) {
      issues.push("invalid_kind");
    } else {
      kind = fm.kind as ThreadKind;
    }
  }

  const inReplyTo: string[] = [];
  if ("in_reply_to" in fm) {
    if (typeof fm.in_reply_to === "string") {
      if (fm.in_reply_to.trim().length > 0) {
        inReplyTo.push(fm.in_reply_to.trim());
      } else {
        issues.push("invalid_in_reply_to");
      }
    } else if (Array.isArray(fm.in_reply_to)) {
      for (const item of fm.in_reply_to) {
        if (typeof item === "string" && item.trim().length > 0) {
          inReplyTo.push(item.trim());
        } else {
          issues.push("invalid_in_reply_to");
          break;
        }
      }
    } else {
      issues.push("invalid_in_reply_to");
    }
  }

  const references: string[] = [];
  if ("references" in fm) {
    if (Array.isArray(fm.references)) {
      for (const item of fm.references) {
        if (typeof item === "string" && item.trim().length > 0) {
          references.push(item.trim());
        } else {
          issues.push("invalid_references");
          break;
        }
      }
    } else {
      issues.push("invalid_references");
    }
  }

  let supersedes: string | undefined;
  if ("supersedes" in fm) {
    if (typeof fm.supersedes === "string" && fm.supersedes.trim().length > 0) {
      supersedes = fm.supersedes.trim();
    } else {
      issues.push("invalid_supersedes");
    }
  }

  let mapResult: MapParseResult | undefined;
  if ("map" in fm) {
    mapResult = parseMap(fm.map);
    if (mapResult.status === "invalid") {
      issues.push("invalid_map");
    }
  }

  if (issues.length > 0) {
    return { status: "invalid", issues };
  }

  const body = stripFrontmatter(content);
  const post: ThreadPost = {
    id: fm.id as string,
    path,
    ...(date ? { date } : {}),
    frontmatter: fm as unknown as ThreadPostFrontmatter,
    body,
    inReplyTo,
    references,
    kind,
    supersedes,
    mapResult,
  };

  return { status: "valid", post };
}

/** Reconstructed thread DAG node. */
export interface ThreadNode {
  post: ThreadPost;
  parents: string[];
  children: ThreadNode[];
}

/** Reconstructed thread timeline with topological order and DAG indices. */
export interface ThreadTimeline {
  /** Root posts (posts without in-thread parents). */
  roots: ThreadNode[];
  /** Linearized topological order of posts. */
  posts: ThreadPost[];
  /** Post lookup by unique id. */
  postsById: Map<string, ThreadPost>;
  /** Direct children lookup by parent id. */
  childrenByParentId: Map<string, ThreadPost[]>;
}

/**
 * Reconstruct a thread DAG and linearized timeline from an unordered list of posts.
 *
 * Handles out-of-order posts, multi-parent joins (merges), corrections, and closures.
 * Secondary ordering uses post path/filename or id for stable deterministic output.
 */
export function reconstructThreadTimeline(posts: ThreadPost[]): ThreadTimeline {
  const postsById = new Map<string, ThreadPost>();
  const childrenByParentId = new Map<string, ThreadPost[]>();

  for (const post of posts) {
    postsById.set(post.id, post);
  }

  // Sort posts deterministically by path / id first as initial baseline
  const sortedInput = [...posts].sort((a, b) => {
    if (a.path && b.path && a.path !== b.path) {
      return a.path.localeCompare(b.path);
    }
    return a.id.localeCompare(b.id);
  });

  for (const post of sortedInput) {
    for (const parentId of post.inReplyTo) {
      const existing = childrenByParentId.get(parentId) ?? [];
      existing.push(post);
      childrenByParentId.set(parentId, existing);
    }
  }

  const nodeMap = new Map<string, ThreadNode>();
  for (const post of sortedInput) {
    nodeMap.set(post.id, {
      post,
      parents: [...post.inReplyTo],
      children: [],
    });
  }

  const rootNodes: ThreadNode[] = [];
  for (const post of sortedInput) {
    const node = nodeMap.get(post.id)!;
    // A post is a root if it has no in_reply_to or none of its in_reply_to parents exist in this thread
    const hasKnownParent = post.inReplyTo.some((pId) => nodeMap.has(pId));
    if (!hasKnownParent) {
      rootNodes.push(node);
    }
    for (const pId of post.inReplyTo) {
      const parentNode = nodeMap.get(pId);
      if (parentNode) {
        parentNode.children.push(node);
      }
    }
  }

  // Topological sort: Kahn's algorithm with priority queue (deterministic secondary order)
  const inDegree = new Map<string, number>();
  for (const post of sortedInput) {
    // Only count dependencies that exist within this collection of posts
    const validParents = post.inReplyTo.filter((pId) => postsById.has(pId));
    inDegree.set(post.id, validParents.length);
  }

  const ready: ThreadPost[] = [];
  for (const post of sortedInput) {
    if ((inDegree.get(post.id) ?? 0) === 0) {
      ready.push(post);
    }
  }

  const linearized: ThreadPost[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => {
      if (a.path && b.path && a.path !== b.path) {
        return a.path.localeCompare(b.path);
      }
      return a.id.localeCompare(b.id);
    });
    const next = ready.shift()!;
    linearized.push(next);

    const children = childrenByParentId.get(next.id) ?? [];
    for (const child of children) {
      const currentDeg = inDegree.get(child.id) ?? 0;
      if (currentDeg > 0) {
        const newDeg = currentDeg - 1;
        inDegree.set(child.id, newDeg);
        if (newDeg === 0) {
          ready.push(child);
        }
      }
    }
  }

  // In case of cycles or disconnected orphan chains, append any remaining posts deterministically
  if (linearized.length < sortedInput.length) {
    const visited = new Set(linearized.map((p) => p.id));
    for (const post of sortedInput) {
      if (!visited.has(post.id)) {
        linearized.push(post);
        visited.add(post.id);
      }
    }
  }

  return {
    roots: rootNodes,
    posts: linearized,
    postsById,
    childrenByParentId,
  };
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
