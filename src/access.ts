/** Portable access words and set operations. No identity lookup, policy store or enforcement. */
export const SUBJECT_KINDS = ["person", "team", "organisation", "agent", "public"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];
/** Organisations own and receive grants, but never act. Agents act, but never own. */
export const ACTING_SUBJECT_KINDS = ["person", "agent"] as const;
export const OWNING_SUBJECT_KINDS = ["person", "organisation"] as const;
export type ActingSubjectKind = (typeof ACTING_SUBJECT_KINDS)[number];
export function isActingSubjectKind(input: unknown): input is ActingSubjectKind {
  return (ACTING_SUBJECT_KINDS as readonly unknown[]).includes(input);
}

export const CAPABILITIES = ["discover", "view", "comment", "edit", "fork", "pull", "reshare"] as const;
export type Capability = (typeof CAPABILITIES)[number];
/** The ordered spine only, not a total order over rights. Never authorize by rank. */
export const CAPABILITY_LADDER = ["discover", "view", "comment", "edit"] as const;
export const CAPABILITY_OPTIONS = ["fork", "pull", "reshare"] as const;
export type CapabilityOption = (typeof CAPABILITY_OPTIONS)[number];
export const CAPABILITY_OPTION_IMPLIED_AT: Partial<Record<CapabilityOption, Capability>> = { fork: "edit", pull: "edit" };
/** Company membership grants discovery, never an implicit content-reading default. */
export const COMPANY_MEMBER_CAPABILITIES = ["discover"] as const;
export const MAP_DISCLOSURE_CAPABILITY: Capability = "view";
export const ACCESS_LEVELS = ["viewer", "commenter", "editor", "owner"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACCESS_TARGET_KINDS = ["vault", "space", "repo", "folder", "note", "thread", "conversation"] as const;
export type AccessTargetKind = (typeof ACCESS_TARGET_KINDS)[number];
const CONTENT_COPY_TARGETS: readonly string[] = ["repo", "folder", "note"];

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

/** Implication closure only, in CAPABILITIES order. Target scope and operation requirements still apply. */
export function expandCapabilities(input: readonly Capability[]): Capability[] {
  const rights = new Set(input);
  if (rights.has("edit")) rights.add("comment");
  for (const [option, impliedAt] of Object.entries(CAPABILITY_OPTION_IMPLIED_AT)) {
    if (impliedAt && rights.has(impliedAt)) rights.add(option as CapabilityOption);
  }
  if (rights.has("comment") || rights.has("fork") || rights.has("pull") || rights.has("reshare")) rights.add("view");
  if (rights.has("view")) rights.add("discover");
  return CAPABILITIES.filter((right) => rights.has(right));
}

export type AccessLevelProfile =
  | { status: "grantable"; capabilities: Capability[] }
  | { status: "owner" }
  | { status: "open" }
  | { status: "not_applicable" };

/** Owner is a relationship, never a stronger grant that a resharer can pass on. */
export function accessLevelProfile(
  target: AccessTargetKind,
  level: AccessLevel,
  context: { companyVault?: boolean } = {},
): AccessLevelProfile {
  if (level === "owner") return { status: "owner" };
  if (target === "conversation") return { status: "not_applicable" };
  if (target === "space") return { status: "open" };
  if (target === "thread" && level === "editor") return { status: "not_applicable" };
  const capability = { viewer: "view", commenter: "comment", editor: "edit" }[level] as Capability;
  const rights: Capability[] = [capability];
  if (level === "editor" && context.companyVault) rights.push("reshare");
  return { status: "grantable", capabilities: expandCapabilities(rights) };
}

export type CopyOperationRequirements =
  | { status: "applicable"; history: "none"; closedBranches: "omit" }
  | { status: "applicable"; history: "whole" }
  | { status: "requires_branch_check" }
  | { status: "refused"; reason: "copy_not_supported" | "pull_requires_whole_repo" | "closed_branch" };

/** Requirements over supplied facts, not authorization or a Git exporter. Unknown is never permission. */
export function copyOperationRequirements(
  target: AccessTargetKind,
  operation: "fork" | "pull",
  hasClosedBranch?: boolean,
): CopyOperationRequirements {
  if (!CONTENT_COPY_TARGETS.includes(target))
    return { status: "refused", reason: "copy_not_supported" };
  if (operation === "fork") return { status: "applicable", history: "none", closedBranches: "omit" };
  if (target !== "repo") return { status: "refused", reason: "pull_requires_whole_repo" };
  if (typeof hasClosedBranch !== "boolean") return { status: "requires_branch_check" };
  return hasClosedBranch
    ? { status: "refused", reason: "closed_branch" }
    : { status: "applicable", history: "whole" };
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
  if (record(target) && target.kind === "thread" && Array.isArray(capabilities) &&
      capabilities.some((right) => right === "fork" || right === "pull")) issues.push("thread_has_no_copy");
  if (record(subject) && subject.kind === "public" && Array.isArray(capabilities) &&
      capabilities.some((right) => ["comment", "edit", "reshare"].includes(right)))
    issues.push("invalid_public_capabilities");
  return issues.length ? { status: "invalid", issues } : { status: "valid", grant: input as unknown as AccessGrant };
}

/** Ownership is separate from grants: agents never own, and Conversations have a human owner. */
export interface AccessOwnership extends Record<string, unknown> {
  target: { kind: AccessTargetKind; id: string; [key: string]: unknown };
  owner: { kind: "person" | "organisation"; id: string; [key: string]: unknown };
}
export type AccessOwnershipParseResult =
  | { status: "valid"; ownership: AccessOwnership }
  | { status: "invalid"; issues: string[] };
export function parseAccessOwnership(input: unknown): AccessOwnershipParseResult {
  if (!record(input)) return { status: "invalid", issues: ["invalid_ownership"] };
  const { target, owner } = input;
  const issues: string[] = [];
  if (!record(target) || !identity(target.id) || !(ACCESS_TARGET_KINDS as readonly unknown[]).includes(target.kind))
    issues.push("invalid_target");
  if (!record(owner) || !identity(owner.id) || !(OWNING_SUBJECT_KINDS as readonly unknown[]).includes(owner.kind))
    issues.push("invalid_owner");
  if (record(target) && target.kind === "conversation" && record(owner) && owner.kind !== "person")
    issues.push("conversation_requires_human_owner");
  return issues.length ? { status: "invalid", issues } : { status: "valid", ownership: input as unknown as AccessOwnership };
}

export type LegacyCapabilityMapping =
  | { status: "mapped"; capabilities: Capability[] }
  | { status: "ignored" };

/** Explicit migration of stored words, not permission to widen their target scope. */
export function mapLegacyCapability(target: AccessTargetKind, name: string): LegacyCapabilityMapping {
  if (target === "conversation") return { status: "ignored" };
  if (["git_fetch", "space_copy", "git_push", "push"].includes(name) &&
      !CONTENT_COPY_TARGETS.includes(target)) return { status: "ignored" };
  const aliases: Record<string, Capability> = {
    read: "view", history: "view", find: "discover",
    write: target === "thread" ? "comment" : "edit",
    manage: "reshare", manage_access: "reshare",
    git_push: "edit", push: "edit", git_fetch: "pull", space_copy: "fork",
  };
  const rights = name === "copy" || name === "allow_copying"
    ? ["fork", "pull"] as Capability[]
    : [Object.hasOwn(aliases, name) ? aliases[name] : name];
  if (!rights.every(isValidCapability) ||
      (target === "thread" && rights.some((right) => ["edit", "fork", "pull"].includes(right))))
    return { status: "ignored" };
  return { status: "mapped", capabilities: expandCapabilities(rights) };
}
