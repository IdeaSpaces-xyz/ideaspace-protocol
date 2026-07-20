/**
 * Shared surface state — the conventions conformant surfaces must agree on to
 * coexist, living OUTSIDE the content tree.
 *
 * The spec reserves the underscore namespace inside a space (invariant 6). The
 * same move applies in two out-of-tree namespaces that surfaces share:
 *
 *   - `~/.ideaspaces/` — user-level, per-project caches (session id, open Change)
 *   - `refs/ideaspaces/` — git refs (the last-seen marker)
 *
 * These are not content and not shape — they are the interop state two tools
 * must derive identically or silently split. This module is the single source
 * of truth for that derivation; consumers (MCP server, the Claude plugin hook,
 * Pi) previously each kept a copy, locked together only by golden-value tests.
 * The checkable, language-neutral form is `schema/surface-state.md`.
 *
 * Read-only by design. Writing these files/refs stays a surface concern (see
 * `schema/surface-state.md` — a surface writes; the protocol derives and reads),
 * consistent with the read-only shape-primitive rule.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runGit } from "./git.js";
import { CHANGE_ID_PATTERN } from "./trailers.js";

// ── User-level cache paths ──────────────────────────────────────────

/**
 * The per-project cache key: the first 16 hex chars of the sha256 of the
 * resolved project dir. Keyed by dir (not session) because the reader — an MCP
 * server — only ever knows the project dir. Distinct dirs (incl. git worktrees)
 * are isolated; two sessions in the *same* dir share one file (last write wins).
 */
export function projectCacheKey(projectDir: string): string {
  return createHash("sha256").update(resolve(projectDir)).digest("hex").slice(0, 16);
}

/** Absolute path of a per-project cache file under `~/.ideaspaces/<kind>/`. */
function cachePath(homeDir: string, kind: string, projectDir: string): string {
  return join(homeDir, ".ideaspaces", kind, projectCacheKey(projectDir));
}

/**
 * Where the Claude Code session id is cached for a project dir — the
 * Conversation-trailer bridge (a hook writes it, the server reads it). See
 * `schema/surface-state.md`.
 */
export function sessionIdCachePath(homeDir: string, projectDir: string): string {
  return cachePath(homeDir, "sessions", projectDir);
}

/**
 * Where the open Change is persisted for a project dir. Deliberately shared
 * across surfaces (same derivation, same record) so a Change opened in one
 * surface is visible in another launched in the same dir. See
 * `schema/surface-state.md`.
 */
export function changeCachePath(homeDir: string, projectDir: string): string {
  return cachePath(homeDir, "changes", projectDir);
}

// ── The open-Change record ──────────────────────────────────────────

/** The persisted open Change. Shape is stable across surfaces. */
export interface PersistedChange {
  /** The open Change-Id (matches CHANGE_ID_PATTERN). */
  change_id: string;
  /** The decision handle the Change was minted from, when known. */
  handle?: string;
  /** Epoch ms the Change was opened — feeds "opened Nd ago" surfacing. */
  opened_at: number;
  /** The session that opened it — the silent-re-arm discriminator. */
  session_id?: string;
}

/**
 * Parse and validate a persisted-Change record from raw JSON text. Returns
 * undefined for malformed JSON, a non-object, or a missing/invalid change_id —
 * the cache fails open (treated as "no open Change") rather than throwing.
 */
export function parsePersistedChange(raw: string): PersistedChange | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const rec = parsed as Record<string, unknown>;
  if (typeof rec.change_id !== "string" || !CHANGE_ID_PATTERN.test(rec.change_id)) return undefined;
  return {
    change_id: rec.change_id,
    handle: typeof rec.handle === "string" ? rec.handle : undefined,
    opened_at: typeof rec.opened_at === "number" ? rec.opened_at : 0,
    session_id: typeof rec.session_id === "string" ? rec.session_id : undefined,
  };
}

/**
 * Read and validate the persisted Change at `file`. Absent, unreadable, or
 * malformed → undefined. Async, matching the library's I/O convention.
 */
export async function readPersistedChange(file: string): Promise<PersistedChange | undefined> {
  try {
    return parsePersistedChange(await readFile(file, "utf-8"));
  } catch {
    return undefined;
  }
}

/** The three arming outcomes for a persisted Change on a new resolution. */
export type ArmingDecision = "arm" | "surface" | "none";

/**
 * May a persisted Change re-arm silently for the current session?
 *
 * - `"arm"` — the record's session matches the current one (a same-session
 *   restart): restore silently.
 * - `"surface"` — any other or unknown session, INCLUDING another surface
 *   (session ids never collide across surfaces): show it; require an explicit
 *   resume. This is what makes cross-surface silent stamping impossible.
 * - `"none"` — nothing persisted.
 *
 * Conservative on missing identity: if either side lacks a session id, never
 * arm — a Change without matching provenance surfaces instead of stamping.
 */
export function armingDecision(
  rec: PersistedChange | undefined,
  currentSessionId: string | undefined,
): ArmingDecision {
  if (!rec) return "none";
  if (rec.session_id && currentSessionId && rec.session_id === currentSessionId) return "arm";
  return "surface";
}

// ── The last-seen git ref ───────────────────────────────────────────

/**
 * The git ref that marks HEAD as of a surface's last session — the baseline a
 * "since last session" diff is computed against. Surfaces write it (at session
 * end / after orientation); the protocol only reads it.
 */
export const SEEN_REF = "refs/ideaspaces/seen";

/**
 * The commit sha `refs/ideaspaces/seen` points at in `repoRoot`, or undefined
 * when the ref is unset (a first session) or the path is not a repo. Read-only.
 */
export async function readSeenRef(repoRoot: string): Promise<string | undefined> {
  const res = await runGit(repoRoot, ["rev-parse", "--verify", "--quiet", SEEN_REF]);
  return res.ok ? res.out.trim() || undefined : undefined;
}
