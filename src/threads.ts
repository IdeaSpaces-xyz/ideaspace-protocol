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
  "mark",
] as const;

export type KnownThreadKind = (typeof THREAD_KINDS)[number];

export type ThreadKind = KnownThreadKind | (string & {});

/** Structured Layer 1/2 frontmatter of one thread post. */
export interface ThreadPostFrontmatter {
  /** Globally unique identifier minted by the writer. */
  id: string;
  /** Authored ISO instant or legacy calendar day; optional for older posts. */
  date?: string;
  /** Parent post id(s). Single string or array of strings. */
  in_reply_to?: string | string[];
  /** Ancestor chain of post ids, oldest first. */
  references?: string[];
  /** Post role/type. Defaults to "post". */
  kind?: ThreadKind;
  /** Mark value when kind is "mark" (e.g. "claimed", "done"). */
  mark?: string;
  /** Primary entity binding or parent attachment on opening post (e.g. post:msg_..., note:@root//pos). */
  attached_to?: string;
  /** Superseded post id when kind is "correction" or retracting a mark. */
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

/** Warning for a dropped or invalid frontmatter field on an otherwise valid post. */
export interface ThreadPostFieldWarning {
  field: string;
  warning: string;
}

/** Folded mark metadata on a target post. */
export interface ThreadMark {
  author: string;
  mark: string;
  id: string;
  date?: string;
}

/** One parsed immutable thread post. */
export interface ThreadPost {
  id: string;
  path: string;
  /** Display date: authored ISO instant or calendar day, else filename fallback. */
  date?: string;
  /** Filename-derived instant or day for ordering; not an authored date. */
  fileDate?: string;
  /** Invalid authored date is diagnostic, never a reason to reject the post. */
  dateWarning?: "invalid_date";
  /** Field-level warnings for dropped/invalid frontmatter fields. */
  warnings?: ThreadPostFieldWarning[];
  frontmatter: ThreadPostFrontmatter;
  body: string;
  inReplyTo: string[];
  references: string[];
  kind: string;
  mark?: string;
  attachedTo?: ThreadAttachment;
  supersedes?: string;
  mapResult?: MapParseResult;
  marks?: ThreadMark[];
}

export type ThreadPostParseResult =
  | { status: "valid"; post: ThreadPost }
  | { status: "invalid"; issues: string[] };

/** A child Thread's open typed attachment. `raw` preserves the authored value when parsed. */
export interface ThreadAttachment {
  kind: string;
  value: string;
  raw?: string;
}

export type ThreadAttachmentParseResult =
  | { status: "valid"; attachment: ThreadAttachment }
  | { status: "absent"; warning?: "invalid_attached_to" }
  | { status: "invalid"; issue: "invalid_context" | "invalid_frontmatter" | "invalid_attached_to" };

/** Parse an attached_to value into a structured ThreadAttachment. */
export function parseThreadAttachment(value: unknown): ThreadAttachment | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();

  const colon = raw.indexOf(":");
  if (colon > 0) {
    const type = raw.slice(0, colon);
    const val = raw.slice(colon + 1);
    // The type namespace is open. Post targets alone have a checked local grammar.
    if (/^[a-z][a-z0-9_]*$/.test(type) && val.length > 0 &&
      (type !== "post" || isPostAttachmentTarget(val))) {
      return { kind: type, value: val, raw };
    }
  }

  if (/^msg_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw)) return { kind: "id", value: raw, raw };
  if (/^_threads\/[^/.][^/]*\/[^/.][^/]*\.md$/.test(raw) && !raw.endsWith("/README.md")) {
    return { kind: "path", value: raw, raw };
  }
  return null;
}

function isPostAttachmentTarget(value: string): boolean {
  return /^msg_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) ||
    (/^_threads\/[^/.][^/]*\/[^/.][^/]*\.md$/.test(value) && !value.endsWith("/README.md"));
}

/** Read the relation only from a Thread Agreement; ordinary Notes keep subject semantics. */
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
  if (!("attached_to" in frontmatter)) {
    return { status: "absent" };
  }
  const attachment = parseThreadAttachment(frontmatter.attached_to);
  if (!attachment || (attachment.kind !== "post" && attachment.kind !== "id" && attachment.kind !== "path")) {
    return { status: "absent", warning: "invalid_attached_to" };
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

/** Resolve against only supplied root snapshots; an authored pin is never replaced by HEAD. */
export function resolveThreadParent(
  attachment: ThreadAttachment,
  roots: ThreadAttachmentRoot[],
  authoredPin?: string,
): ThreadParentResolution {
  if (attachment.kind !== "post" && attachment.kind !== "id" && attachment.kind !== "path") {
    return { status: "none", attachment };
  }
  const targetVal = attachment.value;
  const matches: ResolvedThreadParent[] = [];
  for (const root of roots) {
    if (authoredPin !== undefined && root.pin !== authoredPin) continue;
    for (const post of root.posts) {
      // Snapshots contain canonical positions, not stripped worktree tree paths.
      if (parseThreadAttachment(post.path)?.kind !== "path") continue;
      if (post.id === targetVal || post.path === targetVal) {
        matches.push({ root: root.root, pin: root.pin, path: post.path, id: post.id });
      }
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

function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const value = `${day}T00:00:00.000Z`;
  return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function authoredPostDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validDay(value) ? value : undefined;
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value) ||
      !validDay(value.slice(0, 10)) || Number.isNaN(Date.parse(value))) return undefined;
  // Compare instants by parsed time, never by a lexicographic mix of Z and offsets.
  return new Date(value).toISOString();
}

function dateFromFileName(path: string): string | undefined {
  const file = path.split(/[\\/]/).at(-1) ?? "";
  const stamp = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z(?:-|\.md$)/.exec(file);
  const minute = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(?:-|\.md$)/.exec(file);
  const day = /^(\d{4}-\d{2}-\d{2})-/.exec(file);
  const candidate = stamp ? `${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}.${stamp[5] ?? "000"}Z`
    : minute ? `${minute[1]}T${minute[2]}:${minute[3]}:00.000Z` : undefined;
  if (!candidate) return day && validDay(day[1]) ? day[1] : undefined;
  if (!validDay(candidate.slice(0, 10)) || Number.isNaN(Date.parse(candidate))) return undefined;
  return new Date(candidate).toISOString() === candidate ? candidate : undefined;
}

/**
 * Parse and validate one markdown thread post.
 *
 * Inputs are the raw markdown content and an optional repository or file path.
 * The post must contain valid frontmatter with a non-empty `id`.
 * Dropped/invalid optional fields generate warnings rather than invalidating the post.
 */
export function parseThreadPost(
  content: string,
  path: string = "",
): ThreadPostParseResult {
  const fm = parseFrontmatter(content);
  if (!fm) {
    return { status: "invalid", issues: ["missing_or_malformed_frontmatter"] };
  }

  if (typeof fm.id !== "string" || fm.id.trim().length === 0) {
    return { status: "invalid", issues: ["invalid_id"] };
  }

  const warnings: ThreadPostFieldWarning[] = [];
  const fileDate = dateFromFileName(path);
  const authored = "date" in fm ? authoredPostDate(fm.date) : undefined;
  const dateWarning = "date" in fm && !authored ? ("invalid_date" as const) : undefined;
  if (dateWarning) {
    warnings.push({ field: "date", warning: "invalid_date" });
  }
  const date = dateWarning ? undefined : authored ?? fileDate;

  let kind: string = "post";
  if ("kind" in fm) {
    if (typeof fm.kind === "string" && fm.kind.trim().length > 0) {
      kind = fm.kind;
    } else {
      warnings.push({ field: "kind", warning: "invalid_kind" });
    }
  }

  let mark: string | undefined;
  if ("mark" in fm) {
    if (typeof fm.mark === "string" && fm.mark.trim().length > 0) {
      mark = fm.mark;
    } else {
      warnings.push({ field: "mark", warning: "invalid_mark" });
    }
  }

  const inReplyTo: string[] = [];
  if ("in_reply_to" in fm) {
    let valid = true;
    if (typeof fm.in_reply_to === "string") {
      if (fm.in_reply_to.trim().length > 0) {
        inReplyTo.push(fm.in_reply_to.trim());
      } else {
        valid = false;
      }
    } else if (Array.isArray(fm.in_reply_to)) {
      for (const item of fm.in_reply_to) {
        if (typeof item === "string" && item.trim().length > 0) {
          inReplyTo.push(item.trim());
        } else {
          valid = false;
          break;
        }
      }
    } else {
      valid = false;
    }
    if (!valid) {
      inReplyTo.length = 0;
      warnings.push({ field: "in_reply_to", warning: "invalid_in_reply_to" });
    }
  }

  const references: string[] = [];
  if ("references" in fm) {
    let valid = true;
    if (Array.isArray(fm.references)) {
      for (const item of fm.references) {
        if (typeof item === "string" && item.trim().length > 0) {
          references.push(item.trim());
        } else {
          valid = false;
          break;
        }
      }
    } else {
      valid = false;
    }
    if (!valid) {
      references.length = 0;
      warnings.push({ field: "references", warning: "invalid_references" });
    }
  }

  if (kind === "mark") {
    if (!mark && !("mark" in fm)) warnings.push({ field: "mark", warning: "missing_mark" });
    if (inReplyTo.length !== 1 && !warnings.some((w) => w.field === "in_reply_to")) {
      warnings.push({ field: "in_reply_to", warning: "mark_requires_one_target" });
    }
  }

  let supersedes: string | undefined;
  if ("supersedes" in fm) {
    if (typeof fm.supersedes === "string" && fm.supersedes.trim().length > 0) {
      supersedes = fm.supersedes.trim();
    } else {
      warnings.push({ field: "supersedes", warning: "invalid_supersedes" });
    }
  }

  let attachedTo: ThreadAttachment | undefined;
  if ("attached_to" in fm) {
    const parsed = parseThreadAttachment(fm.attached_to);
    if (parsed) {
      attachedTo = parsed;
    } else {
      warnings.push({ field: "attached_to", warning: "invalid_attached_to" });
    }
  }

  let mapResult: MapParseResult | undefined;
  if ("map" in fm) {
    const parsed = parseMap(fm.map);
    if (parsed.status === "valid") {
      mapResult = parsed;
    } else if (parsed.status === "invalid") {
      // An invalid member must not erase independent, valid Map members.
      const members = (fm.map as { members?: unknown })?.members;
      const badIndices = new Set<number>();
      let onlyMembers = true;
      for (const issue of parsed.issues) {
        const match = /^map\.members\[(\d+)\](?:\.|$)/.exec(issue.path);
        if (match) badIndices.add(Number(match[1]));
        else onlyMembers = false;
        warnings.push({ field: issue.path, warning: issue.code });
      }
      if (onlyMembers && Array.isArray(members) && badIndices.size) {
        const filtered = members.filter((_, i) => !badIndices.has(i));
        const repaired = parseMap({ ...(fm.map as object), members: filtered });
        if (repaired.status === "valid") mapResult = repaired;
      }
    }
  }

  const body = stripFrontmatter(content);
  const post: ThreadPost = {
    id: fm.id,
    path,
    ...(date ? { date } : {}),
    ...(fileDate ? { fileDate } : {}),
    ...(dateWarning ? { dateWarning } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    frontmatter: fm as unknown as ThreadPostFrontmatter,
    body,
    inReplyTo,
    references,
    kind,
    ...(mark ? { mark } : {}),
    ...(attachedTo ? { attachedTo } : {}),
    ...(supersedes ? { supersedes } : {}),
    ...(mapResult ? { mapResult } : {}),
  };

  return { status: "valid", post };
}

/** One caller-supplied post file. The protocol never reads the filesystem for this operation. */
export interface ThreadPostSource {
  path: string;
  content: string;
}

export interface ThreadPostInspection {
  posts: ThreadPost[];
  unreadable: Array<{ path: string; issues: string[] }>;
  warnings: Array<ThreadPostFieldWarning & { post: string }>;
  parent: ThreadAttachment | "unknown" | null;
  closed: boolean | "unknown";
  writable: boolean;
  /** Actionable message, only when the opening post cannot be read. */
  writeRefusal?: string;
}

/**
 * Inspect a caller-selected snapshot. Never infer an opening post from parsed survivors:
 * an unreadable opening file would otherwise silently become an unrelated root.
 * A later unreadable post may have been a closure, so closed is unknown unless
 * a readable closure settles it. Only an unreadable opening prevents writes:
 * without its id, a reply with no target cannot branch from the Thread.
 */
export function inspectThreadPosts(
  sources: ThreadPostSource[],
  legacyAgreement?: ThreadAttachmentParseResult,
): ThreadPostInspection {
  const sorted = [...sources].sort((a, b) => compareOrdinal(a.path, b.path));
  const posts: ThreadPost[] = [];
  const unreadable: ThreadPostInspection["unreadable"] = [];
  const warnings: ThreadPostInspection["warnings"] = [];
  for (const source of sorted) {
    const result = parseThreadPost(source.content, source.path);
    if (result.status === "invalid") {
      unreadable.push({ path: source.path, issues: result.issues });
      warnings.push(...result.issues.map((warning) => ({ post: source.path, field: "frontmatter", warning })));
    } else {
      posts.push(result.post);
      warnings.push(...(result.post.warnings ?? []).map((warning) => ({ post: source.path, ...warning })));
    }
  }
  if (legacyAgreement?.status === "absent" && legacyAgreement.warning) {
    warnings.push({ post: "_agent/agreement.md", field: "attached_to", warning: legacyAgreement.warning });
  }
  const opening = sorted[0];
  // An empty Thread may still be starting: there is no broken opening to repair.
  const openingUnreadable = Boolean(opening && unreadable.some((entry) => entry.path === opening.path));
  const firstPost = posts.find((post) => post.path === opening?.path);
  const parent = !opening ? null : openingUnreadable ? "unknown" :
    firstPost?.attachedTo ?? (legacyAgreement?.status === "valid" ? legacyAgreement.attachment : null);
  const closed = posts.some((post) => post.kind === "closure") ? true :
    unreadable.length ? "unknown" : false;
  const writeRefusal = openingUnreadable
    ? `Opening post ${opening?.path ?? "(missing)"} is unreadable; writes refused. Any Thread writer may repair it with a commit explaining why.`
    : undefined;
  return {
    posts, unreadable, warnings, parent, closed,
    writable: !openingUnreadable,
    ...(writeRefusal ? { writeRefusal } : {}),
  };
}

/** Portable code-unit order; never depend on a caller's locale for opening-post selection. */
function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function foldableMark(post: ThreadPost): boolean {
  return post.kind === "mark" && post.inReplyTo.length === 1 &&
    typeof post.mark === "string" && post.mark.trim().length > 0;
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
 * Valid marks are folded onto their target and excluded from the main timeline.
 * Malformed marks remain visible in the timeline with their field warnings.
 * No caller-owned post is mutated. Secondary order is portable code-unit order.
 */
export function reconstructThreadTimeline(posts: ThreadPost[]): ThreadTimeline {
  const postsById = new Map<string, ThreadPost>();
  const childrenByParentId = new Map<string, ThreadPost[]>();

  // Copy input posts: folding must not attach marks to caller-owned objects, and
  // repeated reconstruction must not carry stale marks from a previous result.
  const projected = posts.map((post) => {
    const copy = { ...post };
    delete copy.marks;
    return copy;
  });
  for (const post of projected) {
    postsById.set(post.id, post);
  }

  // Identify superseded post ids (retractions/corrections)
  const superseded = new Set<string>();
  for (const post of projected) {
    if (post.kind === "correction" && post.supersedes) {
      superseded.add(post.supersedes);
    }
  }

  // Fold marks onto target posts: collect (author, mark), drop superseded, dedup per author
  const targetMarks = new Map<string, Map<string, ThreadMark>>();
  const isFoldable = (post: ThreadPost) => foldableMark(post) &&
    postsById.get(post.inReplyTo[0])?.kind !== "mark" && postsById.has(post.inReplyTo[0]);
  for (const post of projected) {
    if (foldableMark(post) && !isFoldable(post)) {
      post.warnings = [...(post.warnings ?? []), { field: "in_reply_to", warning: "mark_target_missing" }];
    }
  }
  const markPosts = projected.filter(isFoldable);
  const nonMarkPosts = projected.filter((p) => !isFoldable(p));

  const sortedMarkPosts = [...markPosts].sort((a, b) => {
    if (a.path && b.path && a.path !== b.path) {
      return compareOrdinal(a.path, b.path);
    }
    return compareOrdinal(a.id, b.id);
  });

  for (const markPost of sortedMarkPosts) {
    if (superseded.has(markPost.id)) continue;
    if (markPost.inReplyTo.length !== 1) continue;
    const targetId = markPost.inReplyTo[0];
    const markVal = markPost.mark ?? (typeof markPost.frontmatter.mark === "string" ? markPost.frontmatter.mark.trim() : "");
    if (!markVal) continue;
    const author =
      (typeof markPost.frontmatter.author === "string" ? markPost.frontmatter.author : "") ||
      (typeof markPost.frontmatter.actor_ref === "string" ? markPost.frontmatter.actor_ref : "");
    // An absent author is not evidence that two marks came from the same author.
    const authorKey = author ? `${author}\0${markVal}` : `anonymous\0${markPost.id}`;
    let authorMap = targetMarks.get(targetId);
    if (!authorMap) {
      authorMap = new Map();
      targetMarks.set(targetId, authorMap);
    }
    if (!authorMap.has(authorKey)) {
      authorMap.set(authorKey, {
        author,
        mark: markVal,
        id: markPost.id,
        ...(markPost.date ? { date: markPost.date } : {}),
      });
    }
  }

  for (const [targetId, authorMap] of targetMarks.entries()) {
    const targetPost = postsById.get(targetId);
    if (targetPost) {
      targetPost.marks = Array.from(authorMap.values());
    }
  }

  // Sort posts deterministically by path / id first as initial baseline
  const sortedInput = [...nonMarkPosts].sort((a, b) => {
    if (a.path && b.path && a.path !== b.path) {
      return compareOrdinal(a.path, b.path);
    }
    return compareOrdinal(a.id, b.id);
  });

  // Keep marks in the reply DAG even though they are not timeline entries.
  for (const post of [...sortedInput, ...sortedMarkPosts].sort((a, b) =>
    compareOrdinal(a.path, b.path) || compareOrdinal(a.id, b.id))) {
    for (const parentId of post.inReplyTo) {
      const existing = childrenByParentId.get(parentId) ?? [];
      existing.push(post);
      childrenByParentId.set(parentId, existing);
    }
  }

  const nodeMap = new Map<string, ThreadNode>();
  for (const post of [...sortedInput, ...sortedMarkPosts]) {
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
  }
  for (const post of [...sortedInput, ...sortedMarkPosts]) {
    const node = nodeMap.get(post.id)!;
    for (const pId of post.inReplyTo) {
      nodeMap.get(pId)?.children.push(node);
    }
  }

  // Topological sort: Kahn's algorithm with priority queue (deterministic secondary order)
  const inDegree = new Map<string, number>();
  for (const post of sortedInput) {
    // Only count dependencies that exist within this collection of non-mark posts
    const validParents = post.inReplyTo.filter((pId) => {
      const parent = postsById.get(pId);
      return parent && !isFoldable(parent);
    });
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
        return compareOrdinal(a.path, b.path);
      }
      return compareOrdinal(a.id, b.id);
    });
    const next = ready.shift()!;
    linearized.push(next);

    const children = childrenByParentId.get(next.id) ?? [];
    for (const child of children) {
      if (isFoldable(child)) continue;
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
