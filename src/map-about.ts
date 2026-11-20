/**
 * A Map about anything (`schema/map-about.md`).
 *
 * A Map is about what its carrier is about: the Note or entry whose frontmatter holds the `map`
 * block. A Note is about its `about` links when it declares them, else itself. These are the pure
 * operations: read a Note's `about` (with the legacy single `attached_to`), decide whether two
 * typed links name one entity, and select, among Notes a reader already holds, the Maps about one
 * entity. No filesystem, no Git, no network, no index: the reader supplies the candidates.
 */

import { parseThreadAttachment, type ThreadAttachment } from "./post-links.js";
import { parseMap, parseMapPositionAddress, type MapBlock } from "./maps.js";

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
 * malformed, is read by that field alone, as an entry is in `time.md`. An invalid link is dropped
 * with `invalid_about`; a field with no valid link left reads as absent, never as "about itself".
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
      const parsed = parseThreadAttachment(item);
      if (parsed) links.push(parsed);
      else dropped = true;
    }
    if (dropped) warnings.push({ field: "about", warning: "invalid_about" });
    if (links.length > 0 || !dropped) return { status: "valid", links, source: "about", warnings };
    return { status: "absent", warnings };
  }
  if ("attached_to" in fm) {
    const parsed = parseThreadAttachment(fm.attached_to);
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

/** The link types whose value may be a position address, `@<root>//<position>` or `//<position>`. */
export const ABOUT_POSITION_TYPES = ["note", "folder", "file", "thread", "post"] as const;

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
 * no case folding, no trailing slash, no scheme default. An unknown type compares as a string.
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
