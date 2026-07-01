/**
 * Commit-trailer format — the Change layer.
 *
 * The checkable form is [`../schema/trailers.md`](../schema/trailers.md); this is
 * its reference implementation. It is **pure string in / string out and never
 * invokes git** — surfaces do the committing; this only turns structured trailers
 * into message text, parses them back, and mints/validates a `Change-Id`.
 *
 * The trailer set (canonical keys): `Op`, `Conversation`, `Turn`,
 * `Co-authored-by` (0–n), `Change-Id`. Only `Co-authored-by` is multi-valued.
 *
 * `Change-Id` is Gerrit's convention applied to the cross-*repo* axis: an
 * idea-snapshot coordinate reused across every commit of one decision. Format
 * `chg_<slug>-<suffix>` — a human-readable slug plus a short random suffix for
 * offline collision-safety. Minted locally; the id is a handle, the meaning
 * lives in the linked Note.
 *
 * Parser scope is deliberately simpler than `git interpret-trailers`: the
 * trailer block is the trailing contiguous run of `Key: value` lines separated
 * from the body by a blank line (or the whole message); single-line values only,
 * no folding; keys are case-insensitive on read, canonical-cased on write.
 * Unknown trailers are ignored, never an error — the layer is additive.
 */

/** What kind of change a commit is. The meaning lives in the body, not here. */
export type Op =
  | "create"
  | "update"
  | "move"
  | "delete"
  | "restructure"
  | "capture";

/** The structured trailer set carried at the foot of a commit message. */
export interface Trailers {
  op?: Op;
  conversation?: string;
  turn?: number;
  /** Every agent that drove or assisted the commit. Multi-valued. */
  coAuthoredBy?: string[];
  changeId?: string;
}

/** A valid `Change-Id`: `chg_` + lowercase slug and/or suffix, hyphen-joined. */
export const CHANGE_ID_PATTERN = /^chg_[a-z0-9]+(-[a-z0-9]+)*$/;

/** Canonical key casing emitted on write (git-conventional). */
const CANONICAL_KEYS = {
  op: "Op",
  conversation: "Conversation",
  turn: "Turn",
  coAuthoredBy: "Co-authored-by",
  changeId: "Change-Id",
} as const;

/** Lowercased canonical key → typed field (the case-insensitive read map). */
const FIELD_BY_KEY: Record<string, keyof Trailers> = {
  op: "op",
  conversation: "conversation",
  turn: "turn",
  "co-authored-by": "coAuthoredBy",
  "change-id": "changeId",
};

/** A single trailer line: a token key, a colon, an optional value. */
const TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/;

const SUFFIX_LENGTH = 4;
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

// ── Change-Id ──────────────────────────────────────────────────────────────

/** Whether a string is a well-formed `Change-Id`. */
export function isValidChangeId(id: string): boolean {
  return CHANGE_ID_PATTERN.test(id);
}

/**
 * Normalize free text into a `Change-Id` slug: lowercase, non-alphanumeric runs
 * collapsed to single hyphens, edges trimmed. Callers should pass a short handle
 * (2–4 words) — brevity is the caller's job, not this function's.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Assemble a `Change-Id` from a slug and a suffix. Pure and deterministic — the
 * randomness lives in {@link mintChangeId}. The slug is normalized; an empty
 * slug yields `chg_<suffix>`. Throws if the result isn't a valid `Change-Id`.
 */
export function formatChangeId(slug: string, suffix: string): string {
  const normSuffix = suffix.toLowerCase();
  if (!/^[a-z0-9]+$/.test(normSuffix)) {
    throw new Error(`invalid Change-Id suffix: ${JSON.stringify(suffix)}`);
  }
  const normSlug = slugify(slug);
  const id = normSlug ? `chg_${normSlug}-${normSuffix}` : `chg_${normSuffix}`;
  if (!isValidChangeId(id)) {
    throw new Error(
      `could not format a valid Change-Id from ${JSON.stringify({ slug, suffix })}`,
    );
  }
  return id;
}

/**
 * Mint a fresh `Change-Id` locally from a decision handle. Offline by design —
 * no network, no commit dependency, minted at capture. `rng` returns the suffix
 * and is injectable for tests; the default is a short base36 token from the
 * platform CSPRNG.
 */
export function mintChangeId(text: string, rng: () => string = randomSuffix): string {
  return formatChangeId(text, rng());
}

/** The `git log --grep` pattern that finds every commit of a Change. */
export function changeIdGrep(id: string): string {
  return `${CANONICAL_KEYS.changeId}: ${id}`;
}

function randomSuffix(): string {
  const bytes = new Uint8Array(SUFFIX_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += BASE36[b % 36];
  return out;
}

// ── parse / build / append ───────────────────────────────────────────────────

/**
 * Extract the trailer set from a commit message. Returns an empty object when
 * there is no trailer block. Unknown trailer keys are ignored.
 */
export function parseTrailers(message: string): Trailers {
  const block = findTrailerBlock(message.split("\n"));
  const result: Trailers = {};
  if (!block) return result;
  for (const line of block.lines) {
    const m = TRAILER_LINE.exec(line);
    if (!m) continue;
    const field = FIELD_BY_KEY[m[1].toLowerCase()];
    if (!field) continue; // unknown trailer — not ours, leave it be
    const value = m[2].trim();
    if (field === "coAuthoredBy") {
      (result.coAuthoredBy ??= []).push(value);
    } else if (field === "turn") {
      const n = Number.parseInt(value, 10);
      if (Number.isInteger(n)) result.turn = n;
    } else if (field === "op") {
      result.op = value as Op;
    } else if (field === "conversation") {
      result.conversation = value;
    } else if (field === "changeId") {
      result.changeId = value;
    }
  }
  return result;
}

/**
 * Render a trailer set as a block of `Key: value` lines in canonical order
 * (Op, Conversation, Turn, Co-authored-by…, Change-Id). No leading or trailing
 * blank line. Throws on an invalid `Change-Id`.
 */
export function buildTrailers(t: Trailers): string {
  const lines: string[] = [];
  if (t.op !== undefined) lines.push(`${CANONICAL_KEYS.op}: ${t.op}`);
  if (t.conversation !== undefined) {
    lines.push(`${CANONICAL_KEYS.conversation}: ${t.conversation}`);
  }
  if (t.turn !== undefined) lines.push(`${CANONICAL_KEYS.turn}: ${t.turn}`);
  for (const ca of t.coAuthoredBy ?? []) {
    lines.push(`${CANONICAL_KEYS.coAuthoredBy}: ${ca}`);
  }
  if (t.changeId !== undefined) {
    assertChangeId(t.changeId);
    lines.push(`${CANONICAL_KEYS.changeId}: ${t.changeId}`);
  }
  return lines.join("\n");
}

/**
 * Merge trailers into a commit message. **Append-only**: existing trailer lines
 * are preserved verbatim and in place (so we don't fight other tools); only new
 * trailers are appended, in canonical order among themselves. A single-valued
 * trailer already present with the *same* value is a no-op; with a *different*
 * value it throws a conflict. `Co-authored-by` values are unioned (deduped).
 * When the message has no trailer block, one is created, separated from the body
 * by exactly one blank line.
 */
export function appendTrailers(message: string, add: Trailers): string {
  if (add.changeId !== undefined) assertChangeId(add.changeId);

  const lines = message.split("\n");
  const block = findTrailerBlock(lines);
  const existing = block ? parseTrailers(message) : {};
  const additions = diffTrailers(existing, add);
  if (additions.length === 0) return message;

  if (block) {
    const before = lines.slice(0, block.end + 1);
    const after = lines.slice(block.end + 1);
    return [...before, ...additions, ...after].join("\n");
  }

  // No existing block — create one after the body, one blank line between.
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  const body = lines.slice(0, end + 1);
  const sep = body.length > 0 ? [""] : [];
  return [...body, ...sep, ...additions].join("\n");
}

interface TrailerBlock {
  /** Inclusive line indices of the block within the split message. */
  start: number;
  end: number;
  lines: string[];
}

/**
 * Locate the trailer block: the trailing contiguous run of `Key: value` lines,
 * separated from the body by a blank line (or spanning the whole message).
 * Returns null when the last paragraph isn't trailers — so a body line like
 * `Note: see above` is never mistaken for one.
 */
function findTrailerBlock(rawLines: string[]): TrailerBlock | null {
  let end = rawLines.length - 1;
  while (end >= 0 && rawLines[end].trim() === "") end--;
  if (end < 0) return null;

  let above = end;
  while (above >= 0 && TRAILER_LINE.test(rawLines[above])) above--;
  const start = above + 1;
  if (start > end) return null; // last non-blank line isn't a trailer

  // The run must be its own paragraph: the line above is blank, or it's the top.
  if (above >= 0 && rawLines[above].trim() !== "") return null;

  return { start, end, lines: rawLines.slice(start, end + 1) };
}

/** New trailer lines to append, canonical order; throws on single-valued conflict. */
function diffTrailers(existing: Trailers, add: Trailers): string[] {
  const out: string[] = [];
  if (add.op !== undefined) pushSingle(out, CANONICAL_KEYS.op, existing.op, add.op);
  if (add.conversation !== undefined) {
    pushSingle(out, CANONICAL_KEYS.conversation, existing.conversation, add.conversation);
  }
  if (add.turn !== undefined) {
    pushSingle(
      out,
      CANONICAL_KEYS.turn,
      existing.turn === undefined ? undefined : String(existing.turn),
      String(add.turn),
    );
  }
  for (const ca of add.coAuthoredBy ?? []) {
    if (!(existing.coAuthoredBy ?? []).includes(ca)) {
      out.push(`${CANONICAL_KEYS.coAuthoredBy}: ${ca}`);
    }
  }
  if (add.changeId !== undefined) {
    pushSingle(out, CANONICAL_KEYS.changeId, existing.changeId, add.changeId);
  }
  return out;
}

function pushSingle(
  out: string[],
  key: string,
  existingVal: string | undefined,
  addVal: string,
): void {
  if (existingVal !== undefined) {
    if (existingVal !== addVal) {
      throw new Error(
        `trailer conflict on ${key}: existing ${JSON.stringify(existingVal)} != ${JSON.stringify(addVal)}`,
      );
    }
    return; // same value — no-op
  }
  out.push(`${key}: ${addVal}`);
}

function assertChangeId(id: string): void {
  if (!isValidChangeId(id)) {
    throw new Error(
      `invalid Change-Id: ${JSON.stringify(id)} (must match ${CHANGE_ID_PATTERN})`,
    );
  }
}
