/**
 * Portable root identity primitives.
 *
 * A Space may declare one optional `root_node_id` in its root
 * `_agent/foundation.md`. Current writers mint `n_` plus 24 lowercase
 * hexadecimal characters (96 random bits); readers also accept the legacy
 * 12-character payload. Missing identity is valid progressive enhancement.
 *
 * These helpers are platform-neutral and mutation-free. Callers decide whether
 * origin or registry evidence is trusted before supplying it to the evaluator.
 */

/** Current root IDs carry 96 random bits as 24 lowercase hexadecimal digits. */
export const ROOT_NODE_ID_BYTES = 12;

/** Current writer form. */
export const CURRENT_ROOT_NODE_ID_PATTERN = /^n_[0-9a-f]{24}$/;

/** Reader form: current 96-bit IDs plus legacy 48-bit IDs. */
export const ROOT_NODE_ID_PATTERN = /^n_(?:[0-9a-f]{12}|[0-9a-f]{24})$/;

export type RootNodeIdFormat = "current" | "legacy";

export type RootNodeIdParseResult =
  | { status: "absent" }
  | { status: "valid"; rootNodeId: string; format: RootNodeIdFormat }
  | { status: "invalid"; code: "invalid_type" | "invalid_format" };

/** Parse one optional root ID without normalizing or replacing legacy values. */
export function parseRootNodeId(value: unknown): RootNodeIdParseResult {
  if (value === undefined) return { status: "absent" };
  if (typeof value !== "string") return { status: "invalid", code: "invalid_type" };
  if (!ROOT_NODE_ID_PATTERN.test(value)) {
    return { status: "invalid", code: "invalid_format" };
  }
  return {
    status: "valid",
    rootNodeId: value,
    format: CURRENT_ROOT_NODE_ID_PATTERN.test(value) ? "current" : "legacy",
  };
}

/** Whether a value is a current or legacy root ID accepted by readers. */
export function isValidRootNodeId(value: unknown): value is string {
  return parseRootNodeId(value).status === "valid";
}

/**
 * Deterministically format exactly 12 entropy bytes as a current root ID.
 *
 * Keeping entropy outside this primitive makes generation vectors portable
 * across languages and lets runtimes inject their own CSPRNG boundary.
 */
export function rootNodeIdFromBytes(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== ROOT_NODE_ID_BYTES) {
    throw new Error(`root_node_id generation requires exactly ${ROOT_NODE_ID_BYTES} bytes`);
  }
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `n_${hex}`;
}

export type RootNodeIdEntropy = (length: number) => Uint8Array;

/** Mint a current root ID with injectable entropy; defaults to the platform CSPRNG. */
export function mintRootNodeId(entropy: RootNodeIdEntropy = secureEntropy): string {
  return rootNodeIdFromBytes(entropy(ROOT_NODE_ID_BYTES));
}

function secureEntropy(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("root_node_id generation requires a cryptographic random source");
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export type RootIdentityEvidenceSource =
  | "declaration"
  | "canonical_origin"
  | "local_registry";

/**
 * IDs extracted by a caller from the three portable compatibility sources.
 *
 * The protocol does not discover remotes, contact a Keeper, or read a registry.
 * A caller supplies only evidence it has already decided is trusted.
 */
export interface RootIdentityEvidence {
  declaration?: unknown;
  canonicalOrigin?: unknown;
  localRegistry?: unknown;
}

export interface RootIdentityEvidenceFact {
  source: RootIdentityEvidenceSource;
  rootNodeId: string;
  format: RootNodeIdFormat;
}

export interface InvalidRootIdentityEvidence {
  source: RootIdentityEvidenceSource;
  code: "invalid_type" | "invalid_format";
}

export type RootIdentityState =
  | "absent"
  | "local_only"
  | "legacy_unstamped"
  | "aligned"
  | "drift"
  | "ambiguous"
  | "invalid";

export interface RootIdentityEvaluation {
  state: RootIdentityState;
  /** Safe agreed/proposed identity. Omitted when evidence cannot select one. */
  rootNodeId?: string;
  /** Every valid supplied fact, in declaration/origin/registry order. */
  evidence: RootIdentityEvidenceFact[];
  /** Present only when one or more supplied facts are malformed. */
  invalidEvidence?: InvalidRootIdentityEvidence[];
}

/**
 * Evaluate already-supplied declaration/origin/registry evidence without I/O.
 *
 * - no evidence → `absent`
 * - declaration only → `local_only`
 * - one established ID and no declaration → `legacy_unstamped`
 * - declaration and established evidence agree → `aligned`
 * - declaration disagrees with one established ID → `drift`
 * - canonical origin and local registry disagree → `ambiguous`
 * - malformed supplied evidence → `invalid`
 *
 * Drift, ambiguity, and invalid evidence deliberately omit `rootNodeId`, so a
 * caller cannot accidentally turn conflict into a silent rebind.
 */
export function evaluateRootIdentity(
  input: RootIdentityEvidence,
): RootIdentityEvaluation {
  const supplied: Array<[RootIdentityEvidenceSource, unknown]> = [
    ["declaration", input.declaration],
    ["canonical_origin", input.canonicalOrigin],
    ["local_registry", input.localRegistry],
  ];
  const evidence: RootIdentityEvidenceFact[] = [];
  const invalidEvidence: InvalidRootIdentityEvidence[] = [];

  for (const [source, value] of supplied) {
    const parsed = parseRootNodeId(value);
    if (parsed.status === "absent") continue;
    if (parsed.status === "invalid") {
      invalidEvidence.push({ source, code: parsed.code });
      continue;
    }
    evidence.push({ source, rootNodeId: parsed.rootNodeId, format: parsed.format });
  }

  if (invalidEvidence.length > 0) {
    return { state: "invalid", evidence, invalidEvidence };
  }

  const declaration = evidence.find((fact) => fact.source === "declaration");
  const established = evidence.filter((fact) => fact.source !== "declaration");
  const establishedIds = new Set(established.map((fact) => fact.rootNodeId));

  if (establishedIds.size > 1) return { state: "ambiguous", evidence };
  if (!declaration && establishedIds.size === 0) return { state: "absent", evidence };
  if (declaration && establishedIds.size === 0) {
    return { state: "local_only", rootNodeId: declaration.rootNodeId, evidence };
  }

  const establishedRootNodeId = established[0]!.rootNodeId;
  if (!declaration) {
    return { state: "legacy_unstamped", rootNodeId: establishedRootNodeId, evidence };
  }
  if (declaration.rootNodeId === establishedRootNodeId) {
    return { state: "aligned", rootNodeId: declaration.rootNodeId, evidence };
  }
  return { state: "drift", evidence };
}
