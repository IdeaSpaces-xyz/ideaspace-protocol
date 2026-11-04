/** Portable access words and set operations. No identity lookup, policy store or enforcement. */
export const SUBJECT_KINDS = ["person", "team", "organisation", "agent", "public"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const CAPABILITIES = ["discover", "view", "comment", "edit", "copy", "reshare"] as const;
export type Capability = (typeof CAPABILITIES)[number];
/** The ordered spine only, not a total order over rights. Never authorize by rank. */
export const CAPABILITY_LADDER = ["discover", "view", "comment", "edit"] as const;
export const CAPABILITY_OPTIONS = ["copy", "reshare"] as const;
export type CapabilityOption = (typeof CAPABILITY_OPTIONS)[number];
export const CAPABILITY_OPTION_IMPLIED_AT: Partial<Record<CapabilityOption, Capability>> = { copy: "edit" };
export const MAP_DISCLOSURE_CAPABILITY: Capability = "view";
export const ACCESS_LEVELS = ["viewer", "commenter", "editor", "owner"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACCESS_TARGET_KINDS = ["vault", "space", "repo", "folder", "note", "thread", "conversation"] as const;
export type AccessTargetKind = (typeof ACCESS_TARGET_KINDS)[number];

export function normalizeSubjectKind(input: string): SubjectKind | null {
  const value = input.trim().toLowerCase();
  if (value === "organization") return "organisation";
  return isValidSubjectKind(value) ? value : null;
}
export function isValidSubjectKind(input: unknown): input is SubjectKind {
  return typeof input === "string" && (SUBJECT_KINDS as readonly string[]).includes(input);
}
export function isValidCapability(input: unknown): input is Capability {
  return typeof input === "string" && (CAPABILITIES as readonly string[]).includes(input);
}
export function isValidCapabilityOption(input: unknown): input is CapabilityOption {
  return typeof input === "string" && (CAPABILITY_OPTIONS as readonly string[]).includes(input);
}
/** @deprecated Display order of the spine only; options and unknown names return -1. */
export function capabilityRank(capability: string): number {
  return (CAPABILITY_LADDER as readonly string[]).indexOf(capability);
}

/** Implication closure, in CAPABILITIES order. Does not decide who holds these rights. */
export function expandCapabilities(input: readonly Capability[]): Capability[] {
  const rights = new Set(input);
  if (rights.has("edit")) { rights.add("comment"); rights.add("copy"); }
  if (rights.has("comment") || rights.has("copy") || rights.has("reshare")) rights.add("view");
  if (rights.has("view")) rights.add("discover");
  return CAPABILITIES.filter((right) => rights.has(right));
}

export type AccessLevelProfile =
  | { status: "grantable"; capabilities: Capability[] }
  | { status: "owner" }
  | { status: "open" }
  | { status: "not_applicable" };

/** Owner is a relationship, never a stronger grant that a resharer can pass on. */
export function accessLevelProfile(target: AccessTargetKind, level: AccessLevel): AccessLevelProfile {
  if (level === "owner") return { status: "owner" };
  if (target === "conversation") return { status: "not_applicable" };
  if (target === "space") return { status: "open" };
  if (target === "thread" && level === "editor") return { status: "not_applicable" };
  return { status: "grantable", capabilities: expandCapabilities([{
    viewer: "view", commenter: "comment", editor: "edit",
  }[level] as Capability]) };
}

/** Already-resolved sets only. Every open still requires a fresh host access check. */
export function intersectAccessCapabilities(person: readonly Capability[], ceiling: readonly Capability[]): Capability[] {
  const agent = new Set(expandCapabilities(ceiling));
  return expandCapabilities(person).filter((right) => agent.has(right));
}
/** Tests the rights bound only, not the caller's authority, target state or grant validity. */
export function canPassAccess(held: readonly Capability[], requested: readonly Capability[]): boolean {
  const rights = new Set(expandCapabilities(held));
  return rights.has("reshare") && expandCapabilities(requested).every((right) => rights.has(right));
}

export interface AccessSubject extends Record<string, unknown> {
  kind: SubjectKind;
  /** Opaque identity. An organisation means its members; public uses '*'. */
  id: string;
}
export interface AccessGrant extends Record<string, unknown> {
  target: { kind: Exclude<AccessTargetKind, "conversation">; id: string; [key: string]: unknown };
  subject: AccessSubject;
  capabilities: Capability[];
}
export type AccessGrantParseResult =
  | { status: "valid"; grant: AccessGrant }
  | { status: "invalid"; issues: string[] };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const identity = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Validate the portable statement only. No grants are written or access decisions made. */
export function parseAccessGrant(input: unknown): AccessGrantParseResult {
  if (!record(input)) return { status: "invalid", issues: ["invalid_grant"] };
  const issues: string[] = [];
  const { target, subject, capabilities } = input;
  if (!record(target) || !identity(target.id) || target.kind === "conversation" ||
      !(ACCESS_TARGET_KINDS as readonly unknown[]).includes(target.kind)) issues.push("invalid_target");
  if (!record(subject) || !isValidSubjectKind(subject.kind) || !identity(subject.id) ||
      (subject.kind === "public" && subject.id !== "*")) issues.push("invalid_subject");
  if (!Array.isArray(capabilities) || capabilities.length === 0 || !capabilities.every(isValidCapability))
    issues.push("invalid_capabilities");
  if (record(target) && target.kind === "thread" && Array.isArray(capabilities) && capabilities.includes("edit"))
    issues.push("thread_has_no_editor");
  if (record(subject) && subject.kind === "public" && Array.isArray(capabilities) &&
      capabilities.some((right) => ["comment", "edit", "reshare"].includes(right)))
    issues.push("invalid_public_capabilities");
  return issues.length ? { status: "invalid", issues } : { status: "valid", grant: input as unknown as AccessGrant };
}

export type LegacyCapabilityMapping =
  | { status: "mapped"; capabilities: Capability[] }
  | { status: "ignored" }
  | { status: "open" };

/** Explicit migration of stored capability names, not of ownership or roles. */
export function mapLegacyCapability(target: AccessTargetKind, name: string): LegacyCapabilityMapping {
  if (target === "conversation") return { status: "ignored" };
  // Content aliases retain their target scope; they do not authorize whole-repo transport.
  if (["git_fetch", "space_copy", "git_push", "push"].includes(name)) {
    if (!["repo", "folder", "note"].includes(target)) return { status: "ignored" };
    return { status: "mapped", capabilities: expandCapabilities([name === "git_push" || name === "push" ? "edit" : "copy"]) };
  }
  // This action is a host governance check, not the stored manage capability.
  if (name === "manage_access") return { status: "open" };
  const mapped = name === "read" || name === "history" ? "view"
    : name === "find" ? "discover"
    : name === "write" ? (target === "thread" ? "comment" : "edit")
    : name === "manage" ? "reshare" : name;
  if (!isValidCapability(mapped) || (target === "thread" && mapped === "edit")) return { status: "ignored" };
  return { status: "mapped", capabilities: expandCapabilities([mapped]) };
}
