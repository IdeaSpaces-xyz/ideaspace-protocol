/**
 * A Map about anything (`schema/map-about.md`).
 *
 * A Map is about what its carrier is about: the Note or entry whose frontmatter holds the `map`
 * block. A Note is about its `about` links when it declares them, else itself. These are the pure
 * operations: read a Note's `about` (with the legacy single `attached_to`), each link checked by
 * the shape its type has; decide whether two typed links name one entity; select, among Notes a
 * reader already holds, the Maps about one entity; and read a Map that came from someone else as
 * a list, so nothing in it reaches the model as the person's word. No filesystem, no Git, no
 * network, no index: the reader supplies the candidates.
 */

import { parseThreadAttachment, type ThreadAttachment } from "./post-links.js";
import {
  parseMap,
  parseMapPositionAddress,
  type MapAddressMember,
  type MapBlock,
  type MapDisclosure,
  type MapMember,
  type MapPositionMember,
} from "./maps.js";

import { isHandle } from "./verbs.js";

const ROOT_ID = /^n_(?:[0-9a-f]{12}|[0-9a-f]{24})$/;
const HOSTED_THREAD = /^x_[A-Za-z0-9_-]+$/;
const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** An agent id: one token, no space, at most 128 characters (`n_…`, `repo:n_…`, a host's own id). */
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
/** Control and format characters, and the line and paragraph separators: never shown from others' text. */
const UNSHOWN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
/** The same class without the global flag, for a stateless test. */
const HAS_UNSHOWN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const WHITESPACE = /\s/u;
/** The longest one-line name or summary read from someone else's Map (verbs.md, Lists, rule 2). */
export const OTHERS_LINE_LIMIT = 120;

/** The link types whose value may be a position address, `@<root>//<position>` or `//<position>`. */
export const ABOUT_POSITION_TYPES = ["note", "folder", "file", "thread", "post"] as const;

function isPositionAddress(value: string): boolean {
  return (value.startsWith("@") || value.startsWith("//")) && parseMapPositionAddress(value).status === "valid";
}

function isHttpsUrl(value: string): boolean {
  if (!value.startsWith("//") || WHITESPACE.test(value) || HAS_UNSHOWN.test(value)) return false;
  try {
    const url = new URL(`https:${value}`);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Does a typed link have the shape its type gives it? `about` is read by a model as authored, so a
 * link is an address or nothing: a position for `note`, `folder`, `file` and `thread`; a post
 * reference for `post`; `repo:n_…`; `thread:x_…`; `person:@handle`; `agent:<id>`; `hostname:<host>`;
 * an `https` URL. Any other type, and free text under a known type, is no address.
 */
export function isAddressShaped(link: ThreadAttachment): boolean {
  const value = link.value;
  switch (link.kind) {
    case "note":
    case "folder":
    case "file":
      return isPositionAddress(value);
    case "thread":
      return isPositionAddress(value) || HOSTED_THREAD.test(value);
    case "post":
    case "id":
    case "path":
      return true; // the post-reference grammar already validated the target
    case "repo":
      return ROOT_ID.test(value);
    case "person":
      return isHandle(value); // the one handle check, verbs.md's, shared with lists and access
    case "agent":
      return AGENT_ID.test(value);
    case "hostname":
      return HOST.test(value);
    case "https":
      return isHttpsUrl(value);
    default:
      return false;
  }
}

/** Parse one `about` link: a typed link with the shape its type gives it, else null. */
export function parseAboutLink(value: unknown): ThreadAttachment | null {
  const parsed = parseThreadAttachment(value);
  return parsed && isAddressShaped(parsed) ? parsed : null;
}

/** A diagnostic on a Note's `about`, named by field; the Note stays readable. */
export interface AboutWarning {
  field: "about" | "attached_to";
  warning: "invalid_about" | "invalid_attached_to";
}

export type AboutParseResult =
  | { status: "absent"; warnings: AboutWarning[] }
  | { status: "valid"; links: ThreadAttachment[]; source: "about" | "attached_to"; warnings: AboutWarning[] };

/**
 * What a Note says it is about: its `about` field (a typed link or a list of them; `[]` is a valid
 * empty list), else its legacy single `attached_to` as one link. A Note that carries `about`, even
 * malformed, is read by that field alone, as an entry is in `time.md`. A link without the shape of
 * an address is dropped with `invalid_about`; a field with no valid link left reads as absent,
 * never as "about itself".
 */
export function parseAbout(frontmatter: unknown): AboutParseResult {
  const warnings: AboutWarning[] = [];
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) return { status: "absent", warnings };
  const fm = frontmatter as Record<string, unknown>;
  if ("about" in fm) {
    const items = Array.isArray(fm.about) ? fm.about : [fm.about];
    const links: ThreadAttachment[] = [];
    let dropped = false;
    for (const item of items) {
      const parsed = parseAboutLink(item);
      if (parsed) links.push(parsed);
      else dropped = true;
    }
    if (dropped) warnings.push({ field: "about", warning: "invalid_about" });
    if (links.length > 0 || !dropped) return { status: "valid", links, source: "about", warnings };
    return { status: "absent", warnings };
  }
  if ("attached_to" in fm) {
    const parsed = parseAboutLink(fm.attached_to);
    if (parsed) return { status: "valid", links: [parsed], source: "attached_to", warnings };
    warnings.push({ field: "attached_to", warning: "invalid_attached_to" });
  }
  return { status: "absent", warnings };
}

/** What the reader knows about the root its Notes are in, and the Map the links were read with. */
export interface AboutContext {
  /** The identity of the root the carriers are in; `//<position>` links name it. */
  rootNodeId?: string;
  /** Map root names to identities, from the Map the links were read with. */
  rootNames?: Record<string, string>;
}

interface NormalizedLink {
  kind: string;
  /** Resolved root identity when the value is a position address and the root is known. */
  root?: string;
  /** Canonical position when the value is a position address. */
  position?: string;
  /** The comparison key. Two links name one entity when their keys are equal. */
  key: string;
}

function normalizeLink(link: ThreadAttachment, context: AboutContext): NormalizedLink | null {
  if (!isAddressShaped(link)) return null;
  const kind = link.kind;
  if ((ABOUT_POSITION_TYPES as readonly string[]).includes(kind) && (link.value.startsWith("@") || link.value.startsWith("//"))) {
    const parsed = parseMapPositionAddress(link.value);
    if (parsed.status !== "valid") return null;
    const root = parsed.address.root;
    const identity = root.kind === "identity" ? root.rootNodeId
      : root.kind === "name" ? context.rootNames?.[root.name]
      : context.rootNodeId;
    // An unresolvable root compares only with itself, as written; it never guesses a root.
    const key = identity ? `${kind}:@${identity}//${parsed.address.position}` : `${kind}:${link.value}`;
    return { kind, ...(identity ? { root: identity } : {}), position: parsed.address.position, key };
  }
  return { kind, key: `${kind}:${link.value}` };
}

/**
 * Do two typed links name one entity? Equal type and value, after resolving a position address's
 * root: `//` to the reader's own root, a Map root name to its identity. Nothing else is normalized:
 * no case folding, no trailing slash, no scheme default. A link without the shape of an address
 * names no entity, so it equals nothing, itself included.
 */
export function sameEntity(a: string | ThreadAttachment, b: string | ThreadAttachment, context: AboutContext = {}): boolean {
  const left = typeof a === "string" ? parseThreadAttachment(a) : a;
  const right = typeof b === "string" ? parseThreadAttachment(b) : b;
  if (!left || !right) return false;
  const l = normalizeLink(left, context);
  const r = normalizeLink(right, context);
  return l !== null && r !== null && l.key === r.key;
}

/** A Note as the reader holds it: its portable position in the reader's root and its parsed frontmatter. */
export interface AboutMapCarrier {
  position: string;
  frontmatter: unknown;
}

export interface AboutMapHit {
  /** The carrier's position. */
  position: string;
  /** `carried`: the entity's own Map. `beside`: a Note whose `about` names the entity. */
  form: "carried" | "beside";
  map: MapBlock;
  /** The carrier's `about` links as authored; empty for a carried Map. */
  about: string[];
}

export interface AboutMapsResult {
  status: "ok";
  entity: string;
  /** Carried first, then beside, in the order the carriers were supplied. */
  hits: AboutMapHit[];
  /** Carriers that would have matched but could not be read as asked, named, never guessed. */
  skipped: Array<{ position: string; code: "invalid_map" | "invalid_about" }>;
}

export type AboutMapsOutcome = AboutMapsResult | { status: "invalid"; code: "invalid_entity" };

/** The Note that carries an entity's own Map, when the entity is one that can carry frontmatter in this root. */
function ownCarrierPosition(entity: NormalizedLink, context: AboutContext): string | null {
  if (entity.kind === "repo") {
    return context.rootNodeId !== undefined && entity.key === `repo:${context.rootNodeId}` ? "README.md" : null;
  }
  if (entity.position === undefined) return null;
  if (entity.root !== undefined && entity.root !== context.rootNodeId) return null;
  if (entity.kind === "note") return entity.position === "" ? null : entity.position;
  if (entity.kind === "folder") return entity.position === "" || entity.position === "." ? "README.md" : `${entity.position}/README.md`;
  return null;
}

/**
 * The Maps about one entity among the Notes a reader already holds. The entity's own Map (the
 * `map` block of the Note that is the entity, or of a folder's `README.md`) is `carried`; a Note
 * whose `about` names the entity is `beside`. A Note that lists the entity as a member is not about
 * it. A Thread's own Map is its current Map (`time.md`), read from its posts, not from here.
 */
export function aboutMaps(entity: string, carriers: readonly AboutMapCarrier[], context: AboutContext = {}): AboutMapsOutcome {
  const parsedEntity = parseThreadAttachment(entity);
  const target = parsedEntity ? normalizeLink(parsedEntity, context) : null;
  if (!target) return { status: "invalid", code: "invalid_entity" };
  const own = ownCarrierPosition(target, context);

  const carried: AboutMapHit[] = [];
  const beside: AboutMapHit[] = [];
  const skipped: AboutMapsResult["skipped"] = [];
  for (const carrier of carriers) {
    const fm = carrier.frontmatter;
    if (!fm || typeof fm !== "object" || Array.isArray(fm) || !("map" in fm)) continue;
    const about = parseAbout(fm);
    let form: AboutMapHit["form"] | null = null;
    if (about.status === "valid") {
      if (about.links.some((link) => { const n = normalizeLink(link, context); return n !== null && n.key === target.key; })) form = "beside";
    } else if (about.warnings.length > 0) {
      // A malformed `about` makes the Note about nothing, never about itself.
      if (carrier.position === own) skipped.push({ position: carrier.position, code: "invalid_about" });
      continue;
    } else if (carrier.position === own) {
      form = "carried";
    }
    if (!form) continue;
    const parsedMap = parseMap((fm as Record<string, unknown>).map);
    if (parsedMap.status !== "valid") { skipped.push({ position: carrier.position, code: "invalid_map" }); continue; }
    const hit: AboutMapHit = {
      position: carrier.position,
      form,
      map: parsedMap.map,
      about: about.status === "valid" ? about.links.map((link) => link.raw ?? `${link.kind}:${link.value}`) : [],
    };
    (form === "carried" ? carried : beside).push(hit);
  }
  return { status: "ok", entity, hits: [...carried, ...beside], skipped };
}

/** One member of a Map from others that was dropped or cut, by index and field. */
export interface MapFromOthersWarning {
  member: number;
  field: string;
  warning: "person_not_a_handle";
}

export interface MapFromOthers {
  map: MapBlock;
  warnings: MapFromOthersWarning[];
}

/** One line from someone else's text: control, format and separator characters removed, cut to the limit. */
function oneLine(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(UNSHOWN, "");
  return cleaned.length > OTHERS_LINE_LIMIT ? cleaned.slice(0, OTHERS_LINE_LIMIT) : cleaned;
}

function disclosureFromOthers(value: unknown): MapDisclosure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const given = value as Record<string, unknown>;
  const name = oneLine(given.name);
  const summary = oneLine(given.summary);
  if (name === undefined && summary === undefined) return undefined;
  return { ...(name !== undefined ? { name } : {}), ...(summary !== undefined ? { summary } : {}) };
}

/**
 * Read a valid Map that someone else posted, as a list (`verbs.md`, Lists): a `person:` member that
 * is not a handle by shape is dropped and named; every member keeps its address or position, its
 * ceiling and revision, and its name, summary and observed disclosure as one line each, control
 * and format characters removed, cut to 120 characters, and marked `by_others: true`; any other
 * field others wrote is left out. The result is a view to show; it is never reach, and nothing in
 * it is a name the person said. The person's own Maps are not read through this.
 */
export function readMapFromOthers(map: MapBlock): MapFromOthers {
  const warnings: MapFromOthersWarning[] = [];
  const members: MapMember[] = [];
  map.members.forEach((entry, index) => {
    if ("address" in entry) {
      const member = entry as MapAddressMember;
      const address = String(member.address);
      if (address.startsWith("person:") && !isHandle(address.slice("person:".length))) {
        warnings.push({ member: index, field: `members[${index}].address`, warning: "person_not_a_handle" });
        return;
      }
      const name = oneLine(member.name);
      const summary = oneLine(member.summary);
      const disclosure = disclosureFromOthers(member.disclosure);
      members.push({
        address,
        ...(member.depth !== undefined ? { depth: member.depth } : {}),
        ...(member.revision !== undefined ? { revision: member.revision } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(disclosure ? { disclosure } : {}),
        by_others: true,
      });
      return;
    }
    const member = entry as MapPositionMember;
    const disclosure = disclosureFromOthers(member.disclosure);
    members.push({
      root: member.root,
      position: member.position,
      ...(member.depth !== undefined ? { depth: member.depth } : {}),
      ...(disclosure ? { disclosure } : {}),
      by_others: true,
    });
  });
  return { map: { roots: map.roots, members }, warnings };
}
