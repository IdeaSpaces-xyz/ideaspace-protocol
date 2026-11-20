/**
 * Time: folders that keep it, entries that set state. The portable contract is `schema/time.md`.
 *
 * A folder keeps time by placement (`_threads/<thread>/`, a Thread) or because its own Agreement
 * says `keeps_time: true`. Its entries are immutable Markdown files with an `id`, ordered by
 * filename; they form a reply DAG, are corrected and marked, set the folder's state (`parent`,
 * `about`, `closed`, the current Map, a `reframe`'s `name` and `summary`), and are selected in time
 * with `as_of`, `since` and `newest`. `threads.ts` re-exports everything here under its Thread names
 * and adds what belongs to the Threads kind.
 *
 * This module is pure and browser-safe (no Node filesystem or network I/O).
 */

import { parseFrontmatter, stripFrontmatter } from "./frontmatter.js";
import {
  parseMap,
  type MapBlock,
  type MapBuildInput,
  type MapParseResult,
} from "./maps.js";
import {
  isPostPath,
  isPostReference,
  parseThreadAttachment,
  type ThreadAttachment,
  type ThreadAttachmentParseResult,
} from "./post-links.js";

/** The kinds a writer offers. A label goes in `tags`; other values stay readable as unknown kinds. */
export const ENTRY_KINDS = ["post", "reframe", "correction", "mark"] as const;

/** Kinds a reader still acts on but a writer no longer writes: `snapshot` is an entry with a Map, `closure` is `closed: true`. */
export const LEGACY_ENTRY_KINDS = ["snapshot", "closure"] as const;

export type KnownEntryKind = (typeof ENTRY_KINDS)[number] | (typeof LEGACY_ENTRY_KINDS)[number];

export type EntryKind = KnownEntryKind | (string & {});

/** How a folder keeps time: by being a Thread, or because its Agreement declares it. */
export type TimeKeeping = "placement" | "agreement";

/**
 * Does an Agreement's frontmatter turn time on for its folder? Only the boolean `true` does; any
 * other declared value is reported and read as not keeping time.
 */
export function readsTime(
  frontmatter: Record<string, unknown> | null | undefined,
): { keeps: boolean; warning?: "invalid_keeps_time" } {
  if (!frontmatter || !("keeps_time" in frontmatter)) return { keeps: false };
  const value = frontmatter.keeps_time;
  if (value === true) return { keeps: true };
  if (value === false) return { keeps: false };
  return { keeps: false, warning: "invalid_keeps_time" };
}

/** Structured Layer 1/2 frontmatter of one entry. */
export interface EntryFrontmatter {
  /** Globally unique identifier minted by the writer. */
  id: string;
  /** Authored ISO instant or legacy calendar day; optional for older entries. */
  date?: string;
  /** Parent entry id(s) in the same folder. Single string or array of strings. */
  in_reply_to?: string | string[];
  /** Ancestor chain of entry ids, oldest first. */
  references?: string[];
  /** What a reader acts on. Defaults to "post". */
  kind?: EntryKind;
  /** Mark value when kind is "mark" (e.g. "claimed", "done"). */
  mark?: string;
  /**
   * The folder's place in a tree: one post reference (`post:msg_…`, a canonical post path, or an
   * addressed post `post:@<root>//…`). On the opening entry it is the origin; on a later entry it
   * moves the folder. The Threads kind's edge; see schema/threads.md.
   */
  parent?: string;
  /** What the folder is about or grew out of: open typed links `<type>:<id>`, any number. Never a tree edge. */
  about?: string | string[];
  /**
   * Legacy, before 0.33.0: a `post:` value (or bare alias) reads as `parent`; any other typed link
   * reads as `about`; an entry that carries the new field is read by it alone.
   */
  attached_to?: string;
  /** Superseded entry id when kind is "correction" or retracting a mark. */
  supersedes?: string;
  /**
   * Who the entry asks: one addressee or a list. Each is a name as an author would write it or a
   * typed `<type>:<id>` address, claimed as `author` is. It grants, notifies and restricts nothing.
   */
  to?: string | string[];
  /** Sets the folder's closed state: `true` closes, `false` reopens. A legacy `kind: closure` reads as `true`. */
  closed?: boolean;
  /** Optional Map block capturing citations and coordinates. An entry that carries one sets the current Map. */
  map?: MapBuildInput;
  /** Human-readable title or subject. On a `reframe`, the folder's own name. */
  name?: string;
  /** Dense summary for search and orientation. On a `reframe`, the folder's own summary. */
  summary?: string;
  /** Retrieval descriptors. */
  tags?: string[];
  /** Actor identity reference. */
  actor_ref?: string;
  /** Human-readable author name. */
  author?: string;
  [key: string]: unknown;
}

/** Warning for a dropped or invalid frontmatter field on an otherwise valid entry. */
export interface EntryFieldWarning {
  field: string;
  warning: string;
}

/** Folded mark metadata on a target entry. */
export interface EntryMark {
  author: string;
  mark: string;
  id: string;
  date?: string;
}

/** One parsed immutable entry. */
export interface Entry {
  id: string;
  path: string;
  /** Display date: authored ISO instant or calendar day, else filename fallback. */
  date?: string;
  /** Filename-derived instant or day for ordering; not an authored date. */
  fileDate?: string;
  /** Invalid authored date is diagnostic, never a reason to reject the entry. */
  dateWarning?: "invalid_date";
  /** Field-level warnings for dropped/invalid frontmatter fields. */
  warnings?: EntryFieldWarning[];
  frontmatter: EntryFrontmatter;
  body: string;
  inReplyTo: string[];
  references: string[];
  kind: string;
  mark?: string;
  /**
   * The post reference this entry sets as the folder's parent: its `parent` field, else a legacy
   * `attached_to` that names a post. Absent when the entry sets no parent.
   */
  parent?: ThreadAttachment;
  /**
   * The typed links this entry sets as what the folder is about: its `about` field (an empty list
   * clears), else a legacy non-post `attached_to` as one link. Absent when the entry sets none.
   */
  about?: ThreadAttachment[];
  /** The authored legacy `attached_to`, kept as written. Readers act on `parent` and `about`. */
  attachedTo?: ThreadAttachment;
  supersedes?: string;
  /** Addressees from `to`, trimmed, in authored order without repeats. Absent when no one is named. */
  to?: string[];
  /** The closed state this entry sets: its boolean `closed` field, else `true` for a legacy `kind: closure`. Absent when it sets none. */
  closed?: boolean;
  mapResult?: MapParseResult;
  marks?: EntryMark[];
}

export type EntryParseResult =
  | { status: "valid"; post: Entry }
  | { status: "invalid"; issues: string[] };

/** A read in a declared folder may also find an ordinary Note: a file whose frontmatter declares no `id`. */
export type EntryReadResult = EntryParseResult | { status: "note" };

function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const value = `${day}T00:00:00.000Z`;
  return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function authoredDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validDay(value) ? value : undefined;
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value) ||
      !validDay(value.slice(0, 10)) || Number.isNaN(Date.parse(value))) return undefined;
  // Compare instants by parsed time, never by a lexicographic mix of Z and offsets.
  return new Date(value).toISOString();
}

/** The valid filename instant or day of an entry path, independent of its authored date. */
export function dateFromFileName(path: string): string | undefined {
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

export interface ParseEntryOptions {
  /**
   * How the folder keeps time. `placement` (default, a Thread): a file without a valid `id` is
   * unreadable. `agreement` (a declared folder): a file whose frontmatter declares no `id` is an
   * ordinary Note, `status: note`; a declared `id` that is not a non-empty string is still unreadable.
   */
  keeping?: TimeKeeping;
}

/**
 * Parse and validate one Markdown entry.
 *
 * Inputs are the raw Markdown content and an optional repository or file path. The entry must
 * contain valid frontmatter with a non-empty `id`. Dropped or invalid optional fields generate
 * warnings rather than invalidating the entry. In a declared folder a file with no `id` is a Note.
 */
export function parseEntry(content: string, path?: string): EntryParseResult;
export function parseEntry(content: string, path: string, options: ParseEntryOptions): EntryReadResult;
export function parseEntry(content: string, path: string = "", options: ParseEntryOptions = {}): EntryReadResult {
  const fm = parseFrontmatter(content);
  if (!fm) {
    return { status: "invalid", issues: ["missing_or_malformed_frontmatter"] };
  }

  if (!("id" in fm) && options.keeping === "agreement") return { status: "note" };
  if (typeof fm.id !== "string" || fm.id.trim().length === 0) {
    return { status: "invalid", issues: ["invalid_id"] };
  }

  const warnings: EntryFieldWarning[] = [];
  const fileDate = dateFromFileName(path);
  const authored = "date" in fm ? authoredDate(fm.date) : undefined;
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

  // `to`: who the entry asks. A malformed value drops the whole field; an empty one names no one.
  let to: string[] | undefined;
  if ("to" in fm && fm.to !== null && fm.to !== undefined) {
    const named = parseAddressees(fm.to);
    if (named) {
      if (named.length) to = named;
    } else {
      warnings.push({ field: "to", warning: "invalid_to" });
    }
  }

  // `closed` is the field; `kind: closure` is its legacy form. An entry that carries the field is
  // read by it alone, so a dropped malformed field sets nothing even on a closure.
  let closed: boolean | undefined;
  if ("closed" in fm) {
    if (typeof fm.closed === "boolean") closed = fm.closed;
    else warnings.push({ field: "closed", warning: "invalid_closed" });
  } else if (kind === "closure") {
    closed = true;
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

  // Legacy `attached_to`: a post reference was the parent; anything else was what the folder is
  // about. It fills in only when the entry carries no new field at all: an entry that carries
  // `parent` or `about`, even malformed, is read by the new field alone, and the legacy one stays as authored.
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

  // A legacy snapshot without a Map is kept and named; it is not hidden and sets no Map.
  if (kind === "snapshot" && !mapResult) {
    warnings.push({ field: "map", warning: "snapshot_requires_map" });
  }

  const body = stripFrontmatter(content);
  const post: Entry = {
    id: fm.id,
    path,
    ...(date ? { date } : {}),
    ...(fileDate ? { fileDate } : {}),
    ...(dateWarning ? { dateWarning } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    frontmatter: fm as unknown as EntryFrontmatter,
    body,
    inReplyTo,
    references,
    kind,
    ...(mark ? { mark } : {}),
    ...(parent ? { parent } : {}),
    ...(about ? { about } : {}),
    ...(attachedTo ? { attachedTo } : {}),
    ...(supersedes ? { supersedes } : {}),
    ...(to ? { to } : {}),
    ...(closed !== undefined ? { closed } : {}),
    ...(mapResult ? { mapResult } : {}),
  };

  return { status: "valid", post };
}

/** The longest addressee a reader keeps, in UTF-16 code units, and the most addressees on one entry. */
export const ADDRESSEE_MAX_LENGTH = 200;
export const ADDRESSEES_MAX = 20;

/**
 * Parse an entry's `to`: a string or a list of strings, each nonempty after trimming, one line, at
 * most {@link ADDRESSEE_MAX_LENGTH} long; at most {@link ADDRESSEES_MAX} distinct. Returns the
 * trimmed addressees in authored order without repeats (an empty list names no one), or null when
 * the value is not that shape. Pure: addressees are claims, compared exactly and never resolved.
 */
export function parseAddressees(value: unknown): string[] | null {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
  if (!list) return null;
  const named: string[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") return null;
    const trimmed = entry.trim();
    if (!trimmed || /[\r\n]/.test(trimmed) || trimmed.length > ADDRESSEE_MAX_LENGTH) return null;
    if (!named.includes(trimmed)) named.push(trimmed);
  }
  return named.length > ADDRESSEES_MAX ? null : named;
}

/** One caller-supplied entry file. The protocol never reads the filesystem for these operations. */
export interface EntrySource {
  path: string;
  content: string;
}

/** Portable code-unit order; never depend on a caller's locale for opening selection. */
export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Is `path` a direct entry file of the folder? With a `folder` position, a direct `.md` child of it
 * that is not `README.md` and does not start with `.`; without one, a canonical Thread post path
 * `_threads/<thread>/<post>.md`.
 */
export function isEntryPath(path: string, folder?: string): boolean {
  if (folder === undefined) return isPostPath(path);
  const prefix = folder === "." || folder === "" ? "" : `${folder.replace(/\/+$/, "")}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return name.length > 0 && !name.includes("/") && !name.startsWith(".") && name.endsWith(".md") && name !== "README.md";
}

/** A moment or an entry to select by. By entry the order is the filename's; by moment it is each entry's time. */
export type TimeCursor = { path: string } | { id: string } | { at: string };

export type ResolvedTimeCursor =
  | { kind: "path"; path: string }
  | { kind: "id"; id: string; path: string }
  | { kind: "at"; at: string };

export type TimeCursorResolution =
  | { status: "ok"; cursor: ResolvedTimeCursor; instant?: number }
  | { status: "unresolved" | "ambiguous" | "invalid"; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant a normalized `date` or `fileDate` stands for: a day is its start. */
function instantOf(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(ms) ? undefined : ms;
}

/** An entry's time: its authored date (an instant, or the start of its day), else its filename's. */
export function entryInstant(entry: { date?: string; fileDate?: string; path: string }): number | undefined {
  return instantOf(entry.date ?? entry.fileDate ?? dateFromFileName(entry.path));
}

/**
 * Resolve a cursor against the supplied items. A `path` must be one of theirs; an `id` must name
 * exactly one; an `at` must be a calendar-valid instant or day. A day cursor is the end of its day,
 * so `as_of` a day includes everything written that day and `since` a day starts the next.
 */
export function resolveTimeCursor(
  cursor: TimeCursor,
  items: readonly { path: string; id?: string }[],
): TimeCursorResolution {
  if ("at" in cursor) {
    const normalized = authoredDate(cursor.at);
    if (!normalized) return { status: "invalid", reason: `${JSON.stringify(cursor.at)} is not a calendar-valid ISO instant or day.` };
    const start = instantOf(normalized)!;
    const instant = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? start + DAY_MS - 1 : start;
    return { status: "ok", cursor: { kind: "at", at: normalized }, instant };
  }
  if ("path" in cursor) {
    if (!items.some((item) => item.path === cursor.path)) {
      return { status: "unresolved", reason: `${cursor.path} is not among the supplied entries.` };
    }
    return { status: "ok", cursor: { kind: "path", path: cursor.path } };
  }
  const matches = items.filter((item) => item.id === cursor.id);
  if (matches.length === 0) return { status: "unresolved", reason: `${cursor.id} is not the id of a supplied entry.` };
  if (matches.length > 1) return { status: "ambiguous", reason: `${cursor.id} is the id of ${matches.length} supplied entries.` };
  return { status: "ok", cursor: { kind: "id", id: cursor.id, path: matches[0].path } };
}

/** Which side of a resolved cursor an item falls on; `undefined` when a moment cannot place it. */
function placeAgainst(
  item: { path: string; time?: number },
  resolution: Extract<TimeCursorResolution, { status: "ok" }>,
): "before" | "at" | "after" | undefined {
  if (resolution.cursor.kind === "at") {
    if (item.time === undefined || resolution.instant === undefined) return undefined;
    return item.time < resolution.instant ? "before" : item.time === resolution.instant ? "at" : "after";
  }
  const order = compareOrdinal(item.path, resolution.cursor.path);
  return order < 0 ? "before" : order === 0 ? "at" : "after";
}

export interface TimeWindow {
  /** The entries at or before this cursor. */
  asOf?: TimeCursor;
  /** The entries after this cursor. */
  since?: TimeCursor;
  /** The last `n` entries, after the other two. A positive integer. */
  newest?: number;
}

export type EntrySelection =
  | {
    status: "ok";
    /** The selected entries, in filename order. */
    entries: Entry[];
    /** Entries a moment could not place: no authored or filename time. Excluded, never guessed. */
    undated: string[];
    cursors: { asOf?: ResolvedTimeCursor; since?: ResolvedTimeCursor };
  }
  | { status: "unresolved" | "ambiguous" | "invalid"; reason: string };

/**
 * Select entries in time: `as_of` a cursor (at or before it), `since` a cursor (after it), and
 * `newest` (the last `n`). Pure; the caller supplies the folder's parsed entries in any order.
 */
export function selectEntries(entries: readonly Entry[], window: TimeWindow): EntrySelection {
  if (window.newest !== undefined && (!Number.isInteger(window.newest) || window.newest < 1)) {
    return { status: "invalid", reason: `newest must be a positive integer, got ${String(window.newest)}` };
  }
  let selected = [...entries].sort((a, b) => compareOrdinal(a.path, b.path));
  const undated = new Set<string>();
  const cursors: { asOf?: ResolvedTimeCursor; since?: ResolvedTimeCursor } = {};
  for (const side of ["asOf", "since"] as const) {
    const cursor = window[side];
    if (!cursor) continue;
    const resolution = resolveTimeCursor(cursor, selected);
    if (resolution.status !== "ok") return resolution;
    cursors[side] = resolution.cursor;
    selected = selected.filter((entry) => {
      const place = placeAgainst({ path: entry.path, time: entryInstant(entry) }, resolution);
      if (place === undefined) { undated.add(entry.path); return false; }
      return side === "asOf" ? place !== "after" : place === "after";
    });
  }
  if (window.newest !== undefined) selected = selected.slice(-window.newest);
  return { status: "ok", entries: selected, undated: [...undated], cursors };
}

export interface InspectEntriesOptions {
  /** How the folder keeps time. Default `placement`: every supplied direct file is an entry. */
  keeping?: TimeKeeping;
  /**
   * The folder's portable position; its direct `.md` children (not `README.md`, not dotfiles) are
   * its entries. Default: canonical `_threads/<thread>/<post>.md` paths, the Thread rule.
   */
  folder?: string;
  /** The folder Agreement's fallback `parent`, parsed by the Threads kind. */
  agreementAttachment?: ThreadAttachmentParseResult;
  /** Read the folder as of this cursor: later entries set nothing and supersede nothing. */
  asOf?: TimeCursor;
}

/** The entry a state field's current value came from. */
export interface EntryHandle {
  id: string;
  path: string;
  kind: string;
}

export interface EntryInspection {
  /** Readable entries, in code-unit filename order. */
  posts: Entry[];
  /** Declared folder only: direct files whose frontmatter declares no `id`. Ordinary Notes, outside the timeline. */
  notes: string[];
  unreadable: Array<{ path: string; issues: string[] }>;
  warnings: Array<EntryFieldWarning & { post: string }>;
  /**
   * Current parent: the `parent` of the newest entry after the opening that carries one, whatever
   * its kind; else the folder Agreement's valid `parent` or legacy `attached_to`; else the opening's
   * (`origin`). `unknown` only when nothing later sets it, the Agreement declares none, and the
   * opening is unreadable.
   */
  parent: ThreadAttachment | "unknown" | null;
  /** Where the current parent came from. `null` when there is none. */
  source: "post" | "agreement" | "origin" | null;
  /** The entry whose `parent` is current: the newest later one that set it, or the opening when `source` is `origin`. */
  parentPost?: EntryHandle;
  /** Where the folder started: the opening's `parent` (a legacy post `attached_to` counts), immutable. */
  origin: ThreadAttachment | "unknown" | null;
  /** What the folder is about: the `about` of the newest entry that carries one. Empty when none does. */
  about: ThreadAttachment[];
  /** The entry whose `about` is current. */
  aboutPost?: EntryHandle;
  /**
   * The newest readable entry that sets `closed` decides; `false` when none does. `unknown` when an
   * entry newer than that one is unreadable: the one exception to the state rule, because writers act on it.
   */
  closed: boolean | "unknown";
  /** The entry whose `closed` is current. */
  closedPost?: EntryHandle;
  /** The folder's own name: the newest readable `reframe` carrying `name`; for a Thread, else the opening's. */
  name: string | null;
  /** The reframe whose `name` is current. */
  namePost?: EntryHandle;
  /** The folder's own summary: the newest readable `reframe` carrying `summary`; for a Thread, else the opening's. */
  summary: string | null;
  /** The reframe whose `summary` is current. */
  summaryPost?: EntryHandle;
  /** Ids of readable entries superseded by a readable `correction`, in filename order. */
  superseded: string[];
  writable: boolean;
  /** Actionable message, only when the opening cannot be read. */
  writeRefusal?: string;
  /** How the `asOf` cursor resolved, when one was given. */
  asOf?: TimeCursorResolution;
}

/**
 * Inspect a caller-selected folder that keeps time. Never infer an opening from parsed survivors:
 * an unreadable opening file would otherwise silently become an unrelated root. The newest readable
 * entry that carries a state field decides its value; `closed` alone reads `unknown` when a newer
 * entry is unreadable. Only an unreadable opening prevents writes: without its id, a reply with no
 * target cannot branch from the folder.
 */
export function inspectEntries(
  sources: EntrySource[],
  options: InspectEntriesOptions = {},
): EntryInspection {
  const keeping = options.keeping ?? "placement";
  // A caller supplies direct files of one folder, not a README or nested payload.
  const sorted = sources.filter((source) => isEntryPath(source.path, options.folder))
    .sort((a, b) => compareOrdinal(a.path, b.path));

  type Record_ = { source: EntrySource; result: EntryReadResult; time?: number };
  let records: Record_[] = sorted.map((source) => {
    const result = parseEntry(source.content, source.path, { keeping });
    const time = result.status === "valid" ? entryInstant(result.post) : instantOf(dateFromFileName(source.path));
    return { source, result, ...(time !== undefined ? { time } : {}) };
  });

  let asOf: TimeCursorResolution | undefined;
  if (options.asOf) {
    const items = records.flatMap((record) => record.result.status === "note" ? []
      : [{ path: record.source.path, ...(record.result.status === "valid" ? { id: record.result.post.id } : {}) }]);
    const resolution = resolveTimeCursor(options.asOf, items);
    if (resolution.status !== "ok") { asOf = resolution; records = []; }
    else {
      // The portable result names the cursor as resolved; the instant it compares by stays internal.
      asOf = { status: "ok", cursor: resolution.cursor };
      records = records.filter((record) => record.result.status === "note" ||
        placeAgainst({ path: record.source.path, time: record.time }, resolution) !== "after");
    }
  }

  const posts: Entry[] = [];
  const notes: string[] = [];
  const unreadable: EntryInspection["unreadable"] = [];
  const warnings: EntryInspection["warnings"] = [];
  const entryFiles: EntrySource[] = [];
  for (const { source, result } of records) {
    if (result.status === "note") { notes.push(source.path); continue; }
    entryFiles.push(source);
    if (result.status === "invalid") {
      unreadable.push({ path: source.path, issues: result.issues });
      warnings.push(...result.issues.map((warning) => ({ post: source.path, field: "frontmatter", warning })));
    } else {
      posts.push(result.post);
      warnings.push(...(result.post.warnings ?? []).map((warning) => ({ post: source.path, ...warning })));
    }
  }
  const agreementAttachment = options.agreementAttachment;
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
  const opening = entryFiles[0];
  // An empty folder may still be starting: there is no broken opening to repair.
  const openingUnreadable = Boolean(opening && unreadable.some((entry) => entry.path === opening.path));
  const firstPost = posts.find((post) => post.path === opening?.path);
  const origin = !opening ? null : openingUnreadable ? "unknown" : firstPost?.parent ?? null;
  const handle = (post: Entry): EntryHandle => ({ id: post.id, path: post.path, kind: post.kind });
  // `posts` is in code-unit filename order; the newest entry that sets a field wins.
  const newestFirst = [...posts].reverse();
  const mover = newestFirst.find((post) => post.parent && post.path !== opening?.path);
  let parent: EntryInspection["parent"];
  let source: EntryInspection["source"];
  let parentPost: Entry | undefined;
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

  // `closed`: the newest readable entry that sets it, unless an unreadable entry is newer.
  const closedPost = newestFirst.find((post) => post.closed !== undefined);
  const unreadableAfter = (path: string | undefined) =>
    unreadable.some((entry) => path === undefined || compareOrdinal(entry.path, path) > 0);
  const closed: EntryInspection["closed"] = unreadableAfter(closedPost?.path) ? "unknown" : closedPost?.closed ?? false;

  const stringField = (post: Entry | undefined, field: "name" | "summary"): string | null => {
    const value = post?.frontmatter[field];
    return typeof value === "string" && value.trim() ? value : null;
  };
  const reframes = newestFirst.filter((post) => post.kind === "reframe");
  const namePost = reframes.find((post) => stringField(post, "name") !== null);
  const summaryPost = reframes.find((post) => stringField(post, "summary") !== null);
  const fallback = keeping === "placement" ? firstPost : undefined;
  const name = stringField(namePost, "name") ?? stringField(fallback, "name");
  const summary = stringField(summaryPost, "summary") ?? stringField(fallback, "summary");

  const superseded = posts.filter((post) => supersededIds(posts).has(post.id)).map((post) => post.id);

  const writeRefusal = openingUnreadable
    ? `Opening post ${opening?.path ?? "(missing)"} is unreadable; writes refused. Any Thread writer may repair it with a commit explaining why.`
    : undefined;
  return {
    posts, notes, unreadable, warnings, parent, source,
    ...(parentPost ? { parentPost: handle(parentPost) } : {}),
    origin, about,
    ...(aboutPost ? { aboutPost: handle(aboutPost) } : {}),
    closed,
    ...(closedPost ? { closedPost: handle(closedPost) } : {}),
    name,
    ...(namePost ? { namePost: handle(namePost) } : {}),
    summary,
    ...(summaryPost ? { summaryPost: handle(summaryPost) } : {}),
    superseded,
    writable: !openingUnreadable,
    ...(writeRefusal ? { writeRefusal } : {}),
    ...(asOf ? { asOf } : {}),
  };
}

/** Ids superseded by a readable `correction` among these entries. Only a correction supersedes. */
export function supersededIds(entries: readonly Entry[]): Set<string> {
  const superseded = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "correction" && entry.supersedes) superseded.add(entry.supersedes);
  }
  return superseded;
}

function foldableMark(post: Entry): boolean {
  return post.kind === "mark" && post.inReplyTo.length === 1 &&
    typeof post.mark === "string" && post.mark.trim().length > 0;
}

/** How a caller read the folder for {@link currentMap}. */
export interface CurrentMapOptions {
  /**
   * False when `posts` holds only the newest entries rather than every direct entry. Default true:
   * then the earliest filename is the opening.
   */
  complete?: boolean;
  /** The opening entry, read separately when the newest entries do not reach it. */
  opening?: EntrySource;
  /** Examine at most this many entries, newest first, before falling back to the opening. A positive integer; default all. */
  lookback?: number;
  /** How the folder keeps time; in a declared folder, files without an `id` are Notes and not examined. */
  keeping?: TimeKeeping;
  /** The folder's portable position; default the canonical Thread rule. See {@link isEntryPath}. */
  folder?: string;
}

/** An entry newer than the chosen one that might have carried the current Map but cannot be read as one. */
export interface CurrentMapSkip {
  path: string;
  id?: string;
  /** `invalid_map`: an entry whose Map block failed to parse. `unreadable`: the entry itself did not parse. */
  reason: "invalid_map" | "unreadable" | "snapshot_requires_map";
}

/** The Map a folder stands on now, and the entry it came from. */
export interface CurrentMap {
  /**
   * `post`: the newest entry after the opening that carries a valid Map, of any kind. `opening`: no
   * examined later entry carries one, so the opening's. `none`: no entry has one; see `reason`.
   */
  status: "post" | "opening" | "none";
  /** The entry the Map came from, with its kind. */
  post?: EntryHandle;
  map?: MapBlock;
  /** Members dropped from the chosen entry's Map, with the entry's field warnings. */
  warnings: EntryFieldWarning[];
  /** Newer candidates that were passed over, newest first. Never silently ignored. */
  skipped: CurrentMapSkip[];
  /**
   * How far the search went. `examined` counts entries looked at before the opening. `stopped`
   * is true when no later entry's Map was found and entries older than the last one examined, short
   * of the opening, were not examined, by the cap or by a partial read.
   */
  lookback: { examined: number; limit?: number; stopped: boolean };
  /** Why there is no Map, when `status` is `none`. */
  reason?: "empty" | "no_map" | "opening_unknown";
}

/**
 * The current Map: the Map of the newest entry that carries one, whatever its kind. A folder has
 * many Maps over time, one per entry that carried one; the current one is the newest. Newest is
 * code-unit filename order, whose stamp is the instant of writing. A Map that fails to parse is
 * skipped and named. Pure: the caller supplies the folder's direct entry files.
 */
export function currentMap(
  posts: EntrySource[],
  options: CurrentMapOptions = {},
): CurrentMap {
  const limit = options.lookback;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new RangeError(`lookback must be a positive integer, got ${String(limit)}`);
  }
  const keeping = options.keeping ?? "placement";
  const canonical = (source: EntrySource) => isEntryPath(source.path, options.folder) &&
    // In a declared folder a file without an `id` is a Note: not an entry, never examined.
    (keeping === "placement" || parseEntry(source.content, source.path, { keeping }).status !== "note");
  const byPath = new Map<string, EntrySource>();
  for (const source of [...(options.opening ? [options.opening] : []), ...posts]) {
    if (canonical(source) && !byPath.has(source.path)) byPath.set(source.path, source);
  }
  const sorted = [...byPath.values()].sort((a, b) => compareOrdinal(a.path, b.path));
  const complete = options.complete !== false;
  const openingSource = options.opening && canonical(options.opening)
    ? options.opening
    : complete ? sorted[0] : undefined;
  const candidates = sorted.filter((source) => source.path !== openingSource?.path).reverse();
  // A partial read reaches the opening only when the opening is among the entries it read.
  const reachedOpening = complete ||
    (openingSource !== undefined && posts.some((source) => source.path === openingSource.path));

  const skipped: CurrentMapSkip[] = [];
  /** An entry's Map when it carries a valid one; otherwise names what was passed over. */
  const read = (source: EntrySource): { post: Entry; map: MapBlock } | undefined => {
    const parsed = parseEntry(source.content, source.path);
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
  const found = (status: "post" | "opening", hit: { post: Entry; map: MapBlock }, lookback: CurrentMap["lookback"]): CurrentMap => ({
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
  // Older entries than those examined were left: by the cap, or because the read never reached them.
  const stopped = examined < candidates.length || !reachedOpening;
  const lookback = { examined, ...(limit !== undefined ? { limit } : {}), stopped };
  if (!openingSource) return { status: "none", warnings: [], skipped, lookback, reason: complete ? "empty" : "opening_unknown" };
  const hit = read(openingSource);
  if (hit) return found("opening", hit, lookback);
  return { status: "none", warnings: [], skipped, lookback, reason: "no_map" };
}

/** An entry's Map: valid (members a parser dropped stay dropped), absent (no block, or an empty `map:`), or invalid. */
function mapOf(post: Entry): MapBlock | "absent" | "invalid" {
  if (post.mapResult?.status === "valid") return post.mapResult.map;
  const authored = post.frontmatter.map;
  return authored === undefined || authored === null ? "absent" : "invalid";
}

function mapWarnings(post: Entry): EntryFieldWarning[] {
  return (post.warnings ?? []).filter((warning) => warning.field === "map" || warning.field.startsWith("map."));
}

/** Reconstructed DAG node. */
export interface EntryNode {
  post: Entry;
  parents: string[];
  children: EntryNode[];
}

/** Reconstructed timeline with topological order and DAG indices. */
export interface EntryTimeline {
  /** Root entries (entries without in-folder parents). */
  roots: EntryNode[];
  /** Linearized topological order of entries. */
  posts: Entry[];
  /** Entry lookup by unique id. */
  postsById: Map<string, Entry>;
  /** Direct children lookup by parent id. */
  childrenByParentId: Map<string, Entry[]>;
}

/**
 * Reconstruct a reply DAG and linearized timeline from an unordered list of entries.
 *
 * Handles out-of-order entries, multi-parent joins, corrections, and closures. Valid marks are
 * folded onto their target and excluded from the main timeline; malformed marks remain visible with
 * their field warnings. No caller-owned entry is mutated. Secondary order is portable code-unit order.
 */
export function reconstructTimeline(posts: Entry[]): EntryTimeline {
  const postsById = new Map<string, Entry>();
  const childrenByParentId = new Map<string, Entry[]>();

  // Copy input entries: folding must not attach marks to caller-owned objects, and
  // repeated reconstruction must not carry stale marks from a previous result.
  const projected = posts.map((post) => {
    const copy = { ...post };
    delete copy.marks;
    return copy;
  });
  for (const post of projected) {
    postsById.set(post.id, post);
  }

  const superseded = supersededIds(projected);

  // Fold marks onto target entries: collect (author, mark), drop superseded, dedup per author
  const targetMarks = new Map<string, Map<string, EntryMark>>();
  const isFoldable = (post: Entry) => foldableMark(post) &&
    postsById.get(post.inReplyTo[0])?.kind !== "mark" && postsById.has(post.inReplyTo[0]);
  for (const post of projected) {
    if (foldableMark(post) && !isFoldable(post)) {
      post.warnings = [...(post.warnings ?? []), { field: "in_reply_to", warning: "mark_target_missing" }];
    }
  }
  const markPosts = projected.filter(isFoldable);
  const nonMarkPosts = projected.filter((p) => !isFoldable(p));

  const byPathThenId = (a: Entry, b: Entry) => {
    if (a.path && b.path && a.path !== b.path) return compareOrdinal(a.path, b.path);
    return compareOrdinal(a.id, b.id);
  };
  const sortedMarkPosts = [...markPosts].sort(byPathThenId);

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

  // Sort entries deterministically by path / id first as initial baseline
  const sortedInput = [...nonMarkPosts].sort(byPathThenId);

  // Keep marks in the reply DAG even though they are not timeline entries.
  for (const post of [...sortedInput, ...sortedMarkPosts].sort((a, b) =>
    compareOrdinal(a.path, b.path) || compareOrdinal(a.id, b.id))) {
    for (const parentId of post.inReplyTo) {
      const existing = childrenByParentId.get(parentId) ?? [];
      existing.push(post);
      childrenByParentId.set(parentId, existing);
    }
  }

  const nodeMap = new Map<string, EntryNode>();
  for (const post of [...sortedInput, ...sortedMarkPosts]) {
    nodeMap.set(post.id, {
      post,
      parents: [...post.inReplyTo],
      children: [],
    });
  }

  const rootNodes: EntryNode[] = [];
  for (const post of sortedInput) {
    const node = nodeMap.get(post.id)!;
    // An entry is a root if it has no in_reply_to or none of its in_reply_to parents exist in this folder
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
    // Only count dependencies that exist within this collection of non-mark entries
    const validParents = post.inReplyTo.filter((pId) => {
      const parent = postsById.get(pId);
      return parent && !isFoldable(parent);
    });
    inDegree.set(post.id, validParents.length);
  }

  const ready: Entry[] = [];
  for (const post of sortedInput) {
    if ((inDegree.get(post.id) ?? 0) === 0) {
      ready.push(post);
    }
  }

  const linearized: Entry[] = [];
  while (ready.length > 0) {
    ready.sort(byPathThenId);
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

  // In case of cycles or disconnected orphan chains, append any remaining entries deterministically
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
 * Select one entry from supplied entries by id. An exact id wins. The common eight-hex `msg_`
 * shorthand is accepted only at a hyphen boundary and only when it identifies one entry; copied ids
 * or shared prefixes are ambiguous, never a first-match guess. No root is discovered here.
 */
export function resolveEntryById(
  id: string,
  posts: readonly { path: string; id: string }[],
): { status: "resolved"; post: { path: string; id: string } } | { status: "unresolved" | "ambiguous" } {
  if (!/^msg_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) return { status: "unresolved" };
  const exact = posts.filter((post) => post.id === id);
  const matches = exact.length || !/^msg_[0-9a-f]{8}$/.test(id)
    ? exact : posts.filter((post) => post.id.startsWith(`${id}-`));
  return matches.length === 1 ? { status: "resolved", post: { ...matches[0] } }
    : { status: matches.length ? "ambiguous" : "unresolved" };
}
