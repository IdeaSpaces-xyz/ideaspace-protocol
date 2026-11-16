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
import {
  parseMap,
  parseMapPositionAddress,
  type MapBlock,
  type MapBuildInput,
  type MapParseResult,
} from "./maps.js";

/** Exact, case-sensitive threads directory name. */
export const THREADS_DIRECTORY = "_threads";

/**
 * A hosted Thread id: `x_`, then the host's characters. Opaque in length: check this pattern and
 * never a length, so a change in how a host mints ids needs no client release.
 */
export const HOSTED_THREAD_ID = /^x_[A-Za-z0-9_-]+$/;

/** The kinds a reader acts on. A writer uses only these; a label goes in `tags`. Other values stay readable. */
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
  /**
   * The Thread's place in the tree: one post reference (`post:msg_…`, a canonical post path, or an
   * addressed post `post:@<root>//…`). On the opening post it is the origin; on a later post it
   * moves the Thread.
   */
  parent?: string;
  /** What the Thread is about or grew out of: open typed links `<type>:<id>`, any number. Never a tree edge. */
  about?: string | string[];
  /**
   * Legacy, before 0.33.0: a `post:` value (or bare alias) reads as `parent`; any other typed link
   * reads as `about`; a post that carries the new field is read by it alone. Writers keep it beside
   * the new fields during the compatibility window, which each consumer closes where it ships; see
   * "Consumer migration: 0.32.0 → 0.33.0" in schema/threads.md.
   */
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
  /**
   * The post reference this post sets as the Thread's parent: its `parent` field, else a legacy
   * `attached_to` that names a post. Absent when the post sets no parent.
   */
  parent?: ThreadAttachment;
  /**
   * The typed links this post sets as what the Thread is about: its `about` field (an empty list
   * clears), else a legacy non-post `attached_to` as one link. Absent when the post sets none.
   */
  about?: ThreadAttachment[];
  /** The authored legacy `attached_to`, kept as written. Readers act on `parent` and `about`. */
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
  | { status: "absent"; warning?: "invalid_attached_to" | "invalid_parent" }
  | { status: "invalid"; issue: "invalid_context" | "invalid_frontmatter" | "invalid_attached_to" };

const POST_ID = /^msg_[A-Za-z0-9][A-Za-z0-9_-]*$/;
const POST_PATH = /^_threads\/[^/.][^/]*\/[^/.][^/]*\.md$/;

/** Parse a typed link (`parent`, `about`, legacy `attached_to`) into a structured ThreadAttachment. */
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
      // `id` and `path` are internal bare-alias kinds, not typed tree edges.
      // Preserve these open typed values as metadata without reinterpreting them.
      return { kind: type === "id" || type === "path" ? `typed:${type}` : type, value: val, raw };
    }
  }

  if (POST_ID.test(raw)) return { kind: "id", value: raw, raw };
  if (isPostPath(raw)) return { kind: "path", value: raw, raw };
  return null;
}

/** A post reference: `post:` typed, or one of its bare aliases. The only kinds that make a tree edge. */
export function isPostReference(attachment: ThreadAttachment): boolean {
  return attachment.kind === "post" || attachment.kind === "id" || attachment.kind === "path";
}

function isPostPath(value: string): boolean {
  return POST_PATH.test(value) && !value.endsWith("/README.md");
}

function isPostAttachmentTarget(value: string): boolean {
  return POST_ID.test(value) || isPostPath(value) || addressedPostTarget(value) !== null;
}

/**
 * An addressed post in a named root: `@n_…//<selector>` or `@name//<selector>`, where the selector is
 * a canonical post path or a folder's `msg_…` id (`_threads/<thread>/msg_…`, or `msg_…` at the
 * root). The reader's own root (`//…`) is not a parent form: a post in the same root uses the
 * plain forms.
 */
function addressedPostTarget(value: string): { root: string; selector: string } | null {
  if (!value.startsWith("@")) return null;
  const parsed = parseMapPositionAddress(value);
  if (parsed.status !== "valid" || parsed.address.root.kind === "self") return null;
  const selector = parsed.address.position;
  const last = selector.split("/").at(-1) ?? "";
  if (!isPostPath(selector) && !POST_ID.test(last)) return null;
  const root = parsed.address.root.kind === "identity" ? parsed.address.root.rootNodeId : parsed.address.root.name;
  return { root, selector };
}

/** Does a supplied post answer an addressed selector: its exact path, or its id inside the named folder. */
function matchesPostSelector(post: { path: string; id: string }, selector: string): boolean {
  if (post.path === selector) return true;
  const slash = selector.lastIndexOf("/");
  const folder = slash < 0 ? "" : selector.slice(0, slash);
  const id = slash < 0 ? selector : selector.slice(slash + 1);
  if (!POST_ID.test(id) || post.id !== id) return false;
  const postFolder = post.path.slice(0, post.path.lastIndexOf("/"));
  return folder === "" || postFolder === folder;
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

/**
 * Select one post from an explicitly supplied root or Thread snapshot by id.
 * An exact id wins. The common eight-hex msg_ shorthand is accepted only at
 * a hyphen boundary and only when it identifies one post; copied ids or shared
 * prefixes are ambiguous, never a first-match guess. No root is discovered here.
 */
export function resolveThreadPostById(
  id: string,
  posts: readonly { path: string; id: string }[],
): { status: "resolved"; post: { path: string; id: string } } | { status: "unresolved" | "ambiguous" } {
  if (!/^msg_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) return { status: "unresolved" };
  const candidates = posts.filter((post) => parseThreadAttachment(post.path)?.kind === "path");
  const exact = candidates.filter((post) => post.id === id);
  const matches = exact.length || !/^msg_[0-9a-f]{8}$/.test(id)
    ? exact : candidates.filter((post) => post.id.startsWith(`${id}-`));
  return matches.length === 1 ? { status: "resolved", post: { ...matches[0] } }
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

  let parent: ThreadAttachment | undefined;
  if ("parent" in fm) {
    const parsed = parseThreadAttachment(fm.parent);
    if (parsed && isPostReference(parsed)) {
      parent = parsed;
    } else {
      warnings.push({ field: "parent", warning: "invalid_parent" });
    }
  }

  let about: ThreadAttachment[] | undefined;
  if ("about" in fm) {
    const items = Array.isArray(fm.about) ? fm.about : [fm.about];
    const kept: ThreadAttachment[] = [];
    let dropped = false;
    for (const item of items) {
      const parsed = parseThreadAttachment(item);
      if (parsed) kept.push(parsed);
      else dropped = true;
    }
    // One bad link does not erase the good ones; a field with nothing valid is dropped.
    if (dropped) warnings.push({ field: "about", warning: "invalid_about" });
    if (kept.length > 0 || !dropped) about = kept;
  }

  // Legacy `attached_to`: a post reference was the parent; anything else was what the Thread is
  // about. It fills in only when the post carries no new field at all: a post that carries `parent`
  // or `about`, even malformed, is read by the new field alone, and the legacy one stays as authored.
  if (attachedTo) {
    if (isPostReference(attachedTo)) {
      if (!("parent" in fm)) parent = attachedTo;
    } else if (!("about" in fm)) {
      about = [attachedTo];
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

  // Snapshot is a writer requirement, not a reason to hide authored history.
  if (kind === "snapshot" && !mapResult) {
    warnings.push({ field: "map", warning: "snapshot_requires_map" });
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
    ...(parent ? { parent } : {}),
    ...(about ? { about } : {}),
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
  /**
   * Current parent: the `parent` of the newest post after the opening that carries one, whatever
   * its kind; else the Thread Agreement's valid `parent` or legacy `attached_to`; else the opening
   * post's (`origin`). `unknown` only when nothing later sets it, the Agreement declares none, and
   * the opening post is unreadable.
   */
  parent: ThreadAttachment | "unknown" | null;
  /** Where the current parent came from. `null` when there is none. */
  source: "post" | "agreement" | "origin" | null;
  /** The post whose `parent` is current: the newest later post that set one, or the opening when `source` is `origin`. */
  parentPost?: { id: string; path: string; kind: string };
  /** Where the Thread started: the opening post's `parent` (a legacy post `attached_to` counts), immutable. */
  origin: ThreadAttachment | "unknown" | null;
  /** What the Thread is about: the `about` of the newest post that carries one. Empty when none does. */
  about: ThreadAttachment[];
  /** The post whose `about` is current. */
  aboutPost?: { id: string; path: string; kind: string };
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
 *
 * The newest later post that carries `parent` decides the current parent (the same rule as the
 * current Map); the Thread Agreement's field is the next fallback; the opening post's `parent`
 * is the immutable origin and the last. `about` is the newest post's that carries one.
 */
export function inspectThreadPosts(
  sources: ThreadPostSource[],
  agreementAttachment?: ThreadAttachmentParseResult,
): ThreadPostInspection {
  // A caller supplies direct canonical post files, not a README or nested payload.
  const sorted = sources.filter((source) => parseThreadAttachment(source.path)?.kind === "path")
    .sort((a, b) => compareOrdinal(a.path, b.path));
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
  if (agreementAttachment?.status === "absent" && agreementAttachment.warning) {
    const field = agreementAttachment.warning === "invalid_parent" ? "parent" : "attached_to";
    warnings.push({ post: "_agent/agreement.md", field, warning: agreementAttachment.warning });
  }
  const byId = new Map(posts.map((post) => [post.id, post]));
  for (const post of posts) {
    if (foldableMark(post) && (!byId.has(post.inReplyTo[0]) || byId.get(post.inReplyTo[0])?.kind === "mark")) {
      warnings.push({ post: post.path, field: "in_reply_to", warning: "mark_target_missing" });
    }
  }
  const opening = sorted[0];
  // An empty Thread may still be starting: there is no broken opening to repair.
  const openingUnreadable = Boolean(opening && unreadable.some((entry) => entry.path === opening.path));
  const firstPost = posts.find((post) => post.path === opening?.path);
  const origin = !opening ? null : openingUnreadable ? "unknown" : firstPost?.parent ?? null;
  const handle = (post: ThreadPost) => ({ id: post.id, path: post.path, kind: post.kind });
  // `posts` is in code-unit filename order; the newest later post that sets a field wins.
  const newestFirst = [...posts].reverse();
  const mover = newestFirst.find((post) => post.parent && post.path !== opening?.path);
  let parent: ThreadPostInspection["parent"];
  let source: ThreadPostInspection["source"];
  let parentPost: ThreadPost | undefined;
  if (mover?.parent) {
    parent = mover.parent; source = "post"; parentPost = mover;
  } else if (agreementAttachment?.status === "valid") {
    parent = agreementAttachment.attachment; source = "agreement";
  } else {
    parent = origin; source = origin === null ? null : "origin";
    if (origin !== null && origin !== "unknown") parentPost = firstPost;
  }
  const aboutPost = newestFirst.find((post) => post.about !== undefined);
  const about = aboutPost?.about ?? [];
  const closed = posts.some((post) => post.kind === "closure") ? true :
    unreadable.length ? "unknown" : false;
  const writeRefusal = openingUnreadable
    ? `Opening post ${opening?.path ?? "(missing)"} is unreadable; writes refused. Any Thread writer may repair it with a commit explaining why.`
    : undefined;
  return {
    posts, unreadable, warnings, parent, source,
    ...(parentPost ? { parentPost: handle(parentPost) } : {}),
    origin, about,
    ...(aboutPost ? { aboutPost: handle(aboutPost) } : {}),
    closed,
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

/** How a caller read the Thread for {@link currentThreadMap}. */
export interface CurrentThreadMapOptions {
  /**
   * False when `posts` holds only the newest posts rather than every direct post. Default true:
   * then the earliest filename is the opening post.
   */
  complete?: boolean;
  /** The opening post, read separately when the newest posts do not reach it. */
  opening?: ThreadPostSource;
  /** Examine at most this many posts, newest first, before falling back to the opening post. A positive integer; default all. */
  lookback?: number;
}

/** A post newer than the chosen one that might have carried the current Map but cannot be read as one. */
export interface CurrentThreadMapSkip {
  path: string;
  id?: string;
  /** `invalid_map`: a post whose Map block failed to parse. `unreadable`: the post itself did not parse. */
  reason: "invalid_map" | "unreadable" | "snapshot_requires_map";
}

/** The Map a Thread stands on now, and the post it came from. */
export interface CurrentThreadMap {
  /**
   * `post`: the newest post after the opening that carries a valid Map, of any kind. `opening`: no
   * examined later post carries one, so the opening post's. `none`: no post has one; see `reason`.
   */
  status: "post" | "opening" | "none";
  /** The post the Map came from, with its kind. */
  post?: { id: string; path: string; kind: string };
  map?: MapBlock;
  /** Members dropped from the chosen post's Map, with the post's field warnings. */
  warnings: ThreadPostFieldWarning[];
  /** Newer candidates that were passed over, newest first. Never silently ignored. */
  skipped: CurrentThreadMapSkip[];
  /**
   * How far the search went. `examined` counts posts looked at before the opening post. `stopped`
   * is true when no later post's Map was found and posts older than the last one examined, short of
   * the opening, were not examined, by the cap or by a partial read.
   */
  lookback: { examined: number; limit?: number; stopped: boolean };
  /** Why there is no Map, when `status` is `none`. */
  reason?: "empty" | "no_map" | "opening_unknown";
}

/**
 * The current Thread Map: the Map of the newest post that carries one, whatever its kind. A Thread
 * has many Maps over time, one per post that carried one; the current one is the newest. Newest is
 * code-unit filename order, whose stamp is the instant of writing. A Map that fails to parse is
 * skipped and named. Pure: the caller supplies canonical direct post files.
 */
export function currentThreadMap(
  posts: ThreadPostSource[],
  options: CurrentThreadMapOptions = {},
): CurrentThreadMap {
  const limit = options.lookback;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new RangeError(`lookback must be a positive integer, got ${String(limit)}`);
  }
  const canonical = (source: ThreadPostSource) => parseThreadAttachment(source.path)?.kind === "path";
  const byPath = new Map<string, ThreadPostSource>();
  for (const source of [...(options.opening ? [options.opening] : []), ...posts]) {
    if (canonical(source) && !byPath.has(source.path)) byPath.set(source.path, source);
  }
  const sorted = [...byPath.values()].sort((a, b) => compareOrdinal(a.path, b.path));
  const complete = options.complete !== false;
  const openingSource = options.opening && canonical(options.opening)
    ? options.opening
    : complete ? sorted[0] : undefined;
  const candidates = sorted.filter((source) => source.path !== openingSource?.path).reverse();
  // A partial read reaches the opening only when the opening is among the posts it read.
  const reachedOpening = complete ||
    (openingSource !== undefined && posts.some((source) => source.path === openingSource.path));

  const skipped: CurrentThreadMapSkip[] = [];
  /** A post's Map when it carries a valid one; otherwise names what was passed over. */
  const read = (source: ThreadPostSource): { post: ThreadPost; map: MapBlock } | undefined => {
    const parsed = parseThreadPost(source.content, source.path);
    if (parsed.status === "invalid") {
      skipped.push({ path: source.path, reason: "unreadable" });
      return undefined;
    }
    const map = mapOf(parsed.post);
    if (map === "absent") {
      if (parsed.post.kind === "snapshot") {
        skipped.push({ path: parsed.post.path, id: parsed.post.id, reason: "snapshot_requires_map" });
      }
      return undefined;
    }
    if (map === "invalid") {
      skipped.push({ path: parsed.post.path, id: parsed.post.id, reason: "invalid_map" });
      return undefined;
    }
    return { post: parsed.post, map };
  };
  const found = (status: "post" | "opening", hit: { post: ThreadPost; map: MapBlock }, lookback: CurrentThreadMap["lookback"]): CurrentThreadMap => ({
    status, post: { id: hit.post.id, path: hit.post.path, kind: hit.post.kind }, map: hit.map,
    warnings: mapWarnings(hit.post), skipped, lookback,
  });

  let examined = 0;
  for (const source of candidates) {
    if (limit !== undefined && examined >= limit) break;
    examined++;
    const hit = read(source);
    if (hit) return found("post", hit, { examined, ...(limit !== undefined ? { limit } : {}), stopped: false });
  }
  // Older posts than those examined were left: by the cap, or because the read never reached them.
  const stopped = examined < candidates.length || !reachedOpening;
  const lookback = { examined, ...(limit !== undefined ? { limit } : {}), stopped };
  if (!openingSource) return { status: "none", warnings: [], skipped, lookback, reason: complete ? "empty" : "opening_unknown" };
  const hit = read(openingSource);
  if (hit) return found("opening", hit, lookback);
  return { status: "none", warnings: [], skipped, lookback, reason: "no_map" };
}

/** A post's Map: valid (members a parser dropped stay dropped), absent (no block, or an empty `map:`), or invalid. */
function mapOf(post: ThreadPost): MapBlock | "absent" | "invalid" {
  if (post.mapResult?.status === "valid") return post.mapResult.map;
  const authored = post.frontmatter.map;
  return authored === undefined || authored === null ? "absent" : "invalid";
}

function mapWarnings(post: ThreadPost): ThreadPostFieldWarning[] {
  return (post.warnings ?? []).filter((warning) => warning.field === "map" || warning.field.startsWith("map."));
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
