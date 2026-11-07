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

export const CAPABILITIES = ["discover", "view", "history", "comment", "edit", "fork", "pull", "reshare"] as const;
export type Capability = (typeof CAPABILITIES)[number];
/** The ordered spine only, not a total order over rights. Never authorize by rank. */
export const CAPABILITY_LADDER = ["discover", "view", "comment", "edit"] as const;
export const CAPABILITY_OPTIONS = ["history", "fork", "pull", "reshare"] as const;
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
  if (rights.has("history") || rights.has("comment") || rights.has("fork") || rights.has("pull") || rights.has("reshare")) rights.add("view");
  if (rights.has("view")) rights.add("discover");
  return CAPABILITIES.filter((right) => rights.has(right));
}

export type AccessLevelProfile =
  | { status: "grantable"; capabilities: Capability[] }
  | { status: "owner" }
  | { status: "not_applicable" };

/** Owner is a relationship, never a stronger grant that a resharer can pass on. */
export function accessLevelProfile(
  target: AccessTargetKind,
  level: AccessLevel,
  context: { companyVault?: boolean } = {},
): AccessLevelProfile {
  if (level === "owner") return { status: "owner" };
  if (target === "conversation") return { status: "not_applicable" };
  if (target === "vault") return { status: "not_applicable" };
  if (target === "space") return level === "commenter" ? { status: "not_applicable" }
    : { status: "grantable", capabilities: level === "editor" ? ["discover", "view", "edit"] : ["discover", "view"] };
  if (target === "thread" && level === "editor") return { status: "not_applicable" };
  const capability = { viewer: "view", commenter: "comment", editor: "edit" }[level] as Capability;
  const rights: Capability[] = [capability];
  if (level === "editor" && context.companyVault) rights.push("reshare");
  return { status: "grantable", capabilities: expandCapabilities(rights) };
}

export type CopyOperationRequirements =
  | { status: "applicable"; history: "none" }
  | { status: "applicable"; history: "whole" }
  | { status: "refused"; reason: "copy_not_supported" | "pull_requires_whole_repo" | "closed_branch" };

/** Copy shape only, not authorization or an exporter. A closed fact is reserved and refused in v1. */
export function copyOperationRequirements(
  target: AccessTargetKind,
  operation: "fork" | "pull",
  hasClosedBranch?: boolean,
): CopyOperationRequirements {
  if (!CONTENT_COPY_TARGETS.includes(target))
    return { status: "refused", reason: "copy_not_supported" };
  if (operation === "fork") return hasClosedBranch ? { status: "refused", reason: "closed_branch" } : { status: "applicable", history: "none" };
  if (target !== "repo") return { status: "refused", reason: "pull_requires_whole_repo" };
  // Closing is reserved for 1.1. A supplied closed fact cannot be evaluated by v1.
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
  target: { kind: Exclude<AccessTargetKind, "vault" | "conversation">; id: string; [key: string]: unknown };
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
  if (!record(target) || !identity(target.id) || ["vault", "conversation"].includes(String(target.kind)) ||
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
  target: { kind: Exclude<AccessTargetKind, "folder" | "note">; id: string; [key: string]: unknown };
  owner: { kind: "person" | "organisation"; id: string; [key: string]: unknown };
}
export type AccessOwnershipParseResult =
  | { status: "valid"; ownership: AccessOwnership }
  | { status: "invalid"; issues: string[] };
export function parseAccessOwnership(input: unknown): AccessOwnershipParseResult {
  if (!record(input)) return { status: "invalid", issues: ["invalid_ownership"] };
  const { target, owner } = input;
  const issues: string[] = [];
  if (!record(target) || !identity(target.id) || ["folder", "note"].includes(String(target.kind)) ||
      !(ACCESS_TARGET_KINDS as readonly unknown[]).includes(target.kind)) issues.push("invalid_target");
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
  if (target === "conversation" || target === "vault") return { status: "ignored" };
  if (["git_fetch", "space_copy", "git_push", "push"].includes(name) &&
      !CONTENT_COPY_TARGETS.includes(target)) return { status: "ignored" };
  const aliases: Record<string, Capability> = {
    read: "view", find: "discover",
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
  return { status: "mapped", capabilities: target === "space"
    ? expandCapabilities(rights).filter((r) => ["discover", "view", "edit", "reshare"].includes(r))
    : expandCapabilities(rights) };
}

/** Version-one evaluation: an immutable, freshly supplied snapshot, never a policy store. */
export interface AccessTarget { kind: AccessTargetKind; id: string }
export type AccessRelation = Capability | "owner";
export interface AccessObject extends AccessTarget {
  /** Complete root-first content ancestry, derived by the host. Empty on non-content roots. */
  ancestors: AccessTarget[];
  /** Repo → Vault only. Ownership defaults to the Vault's fresh owner unless transferred. */
  vault?: string;
  /** Vault metadata, never a content inheritance edge. */
  homeSpace?: string;
  company?: string;
  /** Positive admission facts for hosted Threads. A pending knock supplies no admission. */
  admittedAgents?: string[];
}
export interface AccessActor {
  /** null is anonymous. Bare agents and organisations are not actors. */
  person: string | null;
  session?: { person: string; agent: string; allowedActs: Capability[]; expiresAt: number };
}
export interface AccessFacts {
  objects: AccessObject[];
  grants: AccessGrant[];
  ownership: AccessOwnership[];
  memberships: { person: string; group: { kind: "organisation" | "team"; id: string } }[];
  /** Control of an org is explicit fresh evidence, not membership or a token role. */
  organisationOwners: { person: string; organisation: string }[];
  /** Compatibility audience: read only, canonical humans only. Not an org or agent grant. */
  signedInRead: AccessTarget[];
  /** Whether the host supplied a complete candidate listing (not an authority assertion). */
  complete: boolean;
}
export interface AccessAnswer { allowed: boolean; missing: AccessRelation | null; knock: boolean }
export interface AccessPath {
  source: "grant" | "owner" | "company_discover" | "signed_in";
  target: AccessTarget;
  subject: AccessSubject | AccessOwnership["owner"];
  /** Source first, then descendants to the requested object. */
  via: AccessTarget[];
}
const sameTarget = (a: AccessTarget, b: AccessTarget): boolean => !!a && !!b && a.kind === b.kind && a.id === b.id;
const targetKey = (a: AccessTarget): string => JSON.stringify([a.kind, a.id]);
const targetIdentity = ({ kind, id }: AccessTarget): AccessTarget => ({ kind, id });
const hiddenAnswer = (): AccessAnswer => ({ allowed: false, missing: null, knock: false });
const applicableRelations = (kind: AccessTargetKind): AccessRelation[] => {
  if (kind === "conversation") return ["discover", "view", "owner"];
  if (kind === "space") return ["discover", "view", "edit", "reshare", "owner"];
  if (kind === "thread") return ["discover", "view", "comment", "reshare", "owner"];
  if (kind === "vault") return ["owner"];
  return [...CAPABILITIES.filter((r) => r !== "pull" || kind === "repo"), "owner"];
};

/** Validate the supplied identity/ancestry, never repair or guess it. */
function accessObject(facts: AccessFacts, target: AccessTarget): AccessObject | undefined {
  const matches = facts.objects.filter((o) => sameTarget(o, target));
  if (matches.length !== 1) return;
  const object = matches[0];
  if (!identity(object.id) || !Array.isArray(object.ancestors) ||
      !(ACCESS_TARGET_KINDS as readonly string[]).includes(object.kind)) return;
  if (object.kind !== "folder" && object.kind !== "note") return object.ancestors.length === 0 ? object : undefined;
  const chain = object.ancestors;
  if (!chain.length || chain[0].kind !== "repo") return;
  const keys = [...chain, object].map(targetKey);
  if (new Set(keys).size !== keys.length) return;
  for (let i = 0; i < chain.length; i++) {
    if (i > 0 && chain[i].kind !== "folder") return;
    const parent = facts.objects.filter((o) => sameTarget(o, chain[i]));
    if (parent.length !== 1 || !identity(parent[0].id) || !Array.isArray(parent[0].ancestors) ||
        parent[0].ancestors.length !== i || !parent[0].ancestors.every((a, n) => sameTarget(a, chain[n]))) return;
  }
  return object;
}
function validActor(actor: AccessActor, now: number): boolean {
  if (!actor || !(actor.person === null || identity(actor.person)) || !Number.isFinite(now)) return false;
  const s = actor.session;
  return !s || (!!actor.person && s.person === actor.person && identity(s.agent) &&
    Number.isFinite(s.expiresAt) && s.expiresAt > now && Array.isArray(s.allowedActs) && s.allowedActs.every(isValidCapability));
}
function subjectMatches(facts: AccessFacts, subject: AccessSubject | AccessOwnership["owner"], person: string | null, agent?: string): boolean {
  if (agent) return subject.kind === "agent" && subject.id === agent;
  if (subject.kind === "public") return subject.id === "*";
  if (!person) return false;
  if (subject.kind === "person") return subject.id === person;
  return ["organisation", "team"].includes(subject.kind) && facts.memberships.some((m) =>
    m.person === person && m.group.kind === subject.kind && m.group.id === subject.id);
}
function ownerPaths(facts: AccessFacts, object: AccessObject, person: string | null): AccessPath[] {
  if (!person) return [];
  const root = object.ancestors[0] ?? object;
  let rows = facts.ownership.filter((o) => sameTarget(o.target, root));
  const repo = facts.objects.find((o) => sameTarget(o, root));
  if (!rows.length && root.kind === "repo" && repo?.vault) {
    if (!accessObject(facts, { kind: "vault", id: repo.vault })) return [];
    rows = facts.ownership.filter((o) => o.target.kind === "vault" && o.target.id === repo.vault);
  }
  // A missing or conflicting owner never becomes authority; Note-level overrides are ignored.
  if (rows.length !== 1 || parseAccessOwnership(rows[0]).status !== "valid") return [];
  const row = rows[0];
  const owns = row.owner.kind === "person" ? row.owner.id === person : facts.organisationOwners.some((o) =>
    o.person === person && o.organisation === row.owner.id);
  return owns ? [{ source: "owner", target: row.target, subject: row.owner,
    via: [...(row.target.kind === "vault" && root.kind === "repo" ? [row.target] : []), ...object.ancestors, targetIdentity(object)] }] : [];
}
function relationPaths(facts: AccessFacts, object: AccessObject, relation: AccessRelation, person: string | null, agent?: string): AccessPath[] {
  if (!applicableRelations(object.kind).includes(relation)) return [];
  if (object.kind === "conversation") return agent ? [] : ownerPaths(facts, object, person);
  const paths = agent ? [] : ownerPaths(facts, object, person);
  if (relation === "owner") return paths;
  const chain = [...object.ancestors, targetIdentity(object)];
  for (const grant of facts.grants) {
    if (parseAccessGrant(grant).status !== "valid" || !subjectMatches(facts, grant.subject, person, agent)) continue;
    const index = chain.findIndex((t) => sameTarget(t, grant.target));
    const applicable = grant.capabilities.filter((r) => applicableRelations(grant.target.kind).includes(r));
    if (index < 0 || !expandCapabilities(applicable).includes(relation)) continue;
    paths.push({ source: "grant", target: grant.target, subject: grant.subject, via: chain.slice(index) });
  }
  if (!agent && person) {
    const repo = facts.objects.find((o) => sameTarget(o, chain[0]));
    const vault = facts.objects.filter((o) => o.kind === "vault" && o.id === repo?.vault);
    const company = vault.length === 1 ? vault[0].company : undefined;
    if (relation === "discover" && company && facts.memberships.some((m) =>
      m.person === person && m.group.kind === "organisation" && m.group.id === company)) {
      paths.push({ source: "company_discover", target: chain[0], subject: { kind: "organisation", id: company }, via: chain });
    }
    if (["view", "discover"].includes(relation) && facts.signedInRead.some((t) => sameTarget(t, object))) {
      paths.push({ source: "signed_in", target: targetIdentity(object), subject: { kind: "person", id: person }, via: [targetIdentity(object)] });
    }
  }
  return paths;
}
function evaluatedPaths(facts: AccessFacts, actor: AccessActor, target: AccessTarget, relation: AccessRelation, now: number): AccessPath[] {
  if (!validActor(actor, now) || ![...CAPABILITIES, "owner"].includes(relation)) return [];
  let object = accessObject(facts, target);
  // Access to a Vault is access to its Home Space, not an inherited content grant.
  if (object?.kind === "vault" && relation !== "owner") object = object.homeSpace
    ? accessObject(facts, { kind: "space", id: object.homeSpace }) : undefined;
  if (!object) return [];
  const person = relationPaths(facts, object, relation, actor.person);
  if (!actor.session) return person;
  const s = actor.session;
  if (relation === "owner" || !expandCapabilities(s.allowedActs).includes(relation) || !person.length) return [];
  if (object.kind === "thread" && relation !== "discover" && !object.admittedAgents?.includes(s.agent)) return [];
  const ceiling = relationPaths(facts, object, relation, null, s.agent);
  return ceiling.length ? [...person, ...ceiling] : [];
}

/** One check includes person ∩ agent grants ∩ consented acts; no I/O, cache, or ambient clock. */
export function check(facts: AccessFacts, actor: AccessActor, target: AccessTarget, relation: AccessRelation, now: number): AccessAnswer {
  if (evaluatedPaths(facts, actor, target, relation, now).length) return { allowed: true, missing: null, knock: false };
  return evaluatedPaths(facts, actor, target, "discover", now).length
    ? { allowed: false, missing: relation, knock: true } : hiddenAnswer();
}

/** Enumerate only supplied candidates. A whole-tree consumer must demand a complete listing. */
export function list(facts: AccessFacts, actor: AccessActor, kind: AccessTargetKind, relation: AccessRelation, now: number, requireComplete = false): { status: "complete" | "partial" | "incomplete"; items: AccessTarget[] } {
  const complete = facts.complete && facts.objects.every((o) => !!accessObject(facts, o));
  if (requireComplete && !complete) return { status: "incomplete", items: [] };
  const items = facts.objects.filter((o) => o.kind === kind && check(facts, actor, o, relation, now).allowed)
    .map(({ kind, id }) => ({ kind, id }));
  return { status: complete ? "complete" : "partial", items };
}

/** Share-sheet query over supplied candidates, guarded by the requester's sharing authority. */
export function who(facts: AccessFacts, requester: AccessActor, candidates: readonly AccessActor[], target: AccessTarget, relation: AccessRelation, now: number): { actor: AccessActor; paths: AccessPath[] }[] {
  if (!check(facts, requester, target, "reshare", now).allowed && !check(facts, requester, target, "owner", now).allowed) return [];
  return candidates.flatMap((actor) => {
    const paths = evaluatedPaths(facts, actor, target, relation, now);
    return paths.length ? [{ actor, paths }] : [];
  });
}

/** Creation-time statement, removable like any other grant; never inferred from membership. */
export function companyRepoViewerGrant(repo: string, organisation: string): AccessGrant {
  return { target: { kind: "repo", id: repo }, subject: { kind: "organisation", id: organisation }, capabilities: ["view"] };
}
