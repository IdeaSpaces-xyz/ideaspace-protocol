import { isAbsolute } from "node:path";
import { appendTrailers, isValidChangeId } from "./trailers.js";
import type { Op, Trailers } from "./trailers.js";

/**
 * Pure contract types and preflight validators for local repository effects.
 *
 * This module does not read or mutate the filesystem, invoke Git, or discover
 * ambient identity. The effect implementations are intentionally a separate,
 * opt-in package subpath; PF0 defines only the portable request/result shape.
 */

export type LocalEffectOperation = "write_markdown" | "commit_paths";
export type LocalEffectReadOperation = "path_revision";

/** Opaque Git object id, or `null` when the selected path is absent there. */
export type PathObjectId = string | null;

/** One selected path at the three concurrency boundaries used by local effects. */
export interface PathRevision {
  worktree: PathObjectId;
  index: PathObjectId;
  head: PathObjectId;
}

/** Destructive override available only to a reconciled Markdown write. */
export type WriteRevisionPrecondition = PathRevision | "any";

/** JSON/YAML data accepted by the language-neutral frontmatter patch. */
export type LocalEffectValue =
  | null
  | boolean
  | number
  | string
  | LocalEffectValue[]
  | { [key: string]: LocalEffectValue };

export interface FrontmatterUpdate {
  mode?: "preserve" | "replace";
  set: Record<string, LocalEffectValue>;
  remove: string[];
}

export interface WriteMarkdownRequest {
  operation: "write_markdown";
  /** Canonical absolute Git worktree root supplied by the caller. */
  root: string;
  /** Portable, slash-separated path relative to `root`. */
  path: string;
  expected_revision: WriteRevisionPrecondition;
  frontmatter: FrontmatterUpdate;
  /** Markdown body only. It is never parsed as another frontmatter block. */
  body: string;
  /** Stage only this path after the atomic replacement. */
  stage: boolean;
}

export interface CommitPathInput {
  path: string;
  expected_revision: PathRevision;
}

/** Canonical trailer fields, expressed without Git's presentation casing. */
export interface LocalEffectTrailers {
  op?: Op;
  conversation?: string;
  turn?: number;
  co_authored_by?: string[];
  change_id?: string;
}

export interface LocalEffectIdentity {
  name: string;
  email: string;
}

export interface CommitPathsRequest {
  operation: "commit_paths";
  /** Canonical absolute Git worktree root supplied by the caller. */
  root: string;
  /** Non-empty, duplicate-free exact path set. Directories are not expanded. */
  paths: CommitPathInput[];
  /** Non-empty message before the structured trailers are merged. */
  message: string;
  trailers: LocalEffectTrailers;
  author: LocalEffectIdentity;
  committer: LocalEffectIdentity;
}

export type LocalEffectPhase =
  | "preflight"
  | "revision_check"
  | "write"
  | "stage"
  | "commit";

export type LocalEffectFailureCode =
  | "invalid_request"
  | "invalid_root"
  | "not_git_repository"
  | "invalid_path"
  | "path_escape"
  | "reserved_git_path"
  | "symlink_refused"
  | "ignored_local_path"
  | "revision_mismatch"
  | "malformed_frontmatter"
  | "invalid_frontmatter_patch"
  | "atomic_write_failed"
  | "stage_failed"
  | "invalid_message"
  | "invalid_identity"
  | "invalid_trailers"
  | "uncommittable_path"
  | "nothing_to_commit"
  | "git_unavailable"
  | "git_executor_failed"
  | "commit_failed";

export interface SelectedPathRevision {
  path: string;
  revision: PathRevision;
}

interface LocalEffectResultBase {
  operation: LocalEffectOperation;
  affected_paths: string[];
}

export interface WriteMarkdownOk extends LocalEffectResultBase {
  status: "ok";
  operation: "write_markdown";
  path_revisions: SelectedPathRevision[];
}

export interface CommitPathsOk extends LocalEffectResultBase {
  status: "ok";
  operation: "commit_paths";
  commit_oid: string;
  path_revisions: SelectedPathRevision[];
}

export interface LocalEffectPartial extends LocalEffectResultBase {
  status: "partial";
  completed_phases: LocalEffectPhase[];
  path_revisions: SelectedPathRevision[];
  code: LocalEffectFailureCode;
  phase: LocalEffectPhase;
  path?: string;
  message: string;
  detail?: string;
  recovery_hint: string;
}

export interface LocalEffectError extends LocalEffectResultBase {
  status: "error";
  code: LocalEffectFailureCode;
  phase: LocalEffectPhase;
  path?: string;
  message: string;
  detail?: string;
}

export type WriteMarkdownResult = WriteMarkdownOk | LocalEffectPartial | LocalEffectError;
export type CommitPathsResult = CommitPathsOk | LocalEffectPartial | LocalEffectError;
export type LocalEffectResult = WriteMarkdownResult | CommitPathsResult;

export interface PathRevisionReadOk {
  status: "ok";
  operation: "path_revision";
  path: string;
  revision: PathRevision;
}

export interface PathRevisionReadError {
  status: "error";
  operation: "path_revision";
  code: LocalEffectFailureCode;
  phase: "preflight" | "revision_check";
  path?: string;
  message: string;
  detail?: string;
}

export type PathRevisionReadResult = PathRevisionReadOk | PathRevisionReadError;

/** The only Git capability local-effect reads and implementations may invoke. */
export interface LocalGitResult {
  ok: boolean;
  stdout: string;
  stderr?: string;
  code: number | null;
}

/**
 * Execute one stock-Git argument array in `root`, without a shell. The caller
 * chooses the executable; the protocol never discovers or configures it.
 */
export type LocalGitRunner = (
  root: string,
  args: readonly string[],
) => Promise<LocalGitResult>;

export interface LocalEffectValidationIssue {
  code: LocalEffectFailureCode;
  field: string;
  message: string;
}

export interface LocalEffectValidationResult<T> {
  ok: boolean;
  issues: LocalEffectValidationIssue[];
  value?: T;
}

const OPS: ReadonlySet<string> = new Set<Op>([
  "create",
  "update",
  "move",
  "delete",
  "restructure",
  "capture",
]);

const CO_AUTHOR = /^[^<>\r\n]+ <agent:[^<>\s]+@ideaspaces>$/;
const SIMPLE_EMAIL = /^[^<>\s@]+@[^<>\s@]+$/;

/** Pure validation for the portable repository-relative path grammar. */
export function validateLocalEffectPath(
  value: unknown,
  markdownOnly = false,
): LocalEffectValidationIssue | null {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    return issue("invalid_path", "path", "path must be a non-empty string without NUL");
  }
  if (value.includes("\\")) {
    return issue("invalid_path", "path", "path must use '/' separators");
  }
  if (value.startsWith("/")) {
    return issue("path_escape", "path", "absolute paths are outside the effect root");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === ".")) {
    return issue("invalid_path", "path", "path may not contain empty or '.' segments");
  }
  if (segments.includes("..")) {
    return issue("path_escape", "path", "path may not traverse with '..'");
  }
  if (segments.some((segment) => segment.toLowerCase() === ".git")) {
    return issue("reserved_git_path", "path", ".git is outside the local-effect boundary");
  }
  if (markdownOnly && !value.endsWith(".md")) {
    return issue("invalid_path", "path", "write_markdown accepts only '.md' paths");
  }
  return null;
}

export function validateWriteMarkdownRequest(
  input: unknown,
): LocalEffectValidationResult<WriteMarkdownRequest> {
  const issues: LocalEffectValidationIssue[] = [];
  if (!isRecord(input)) {
    return invalidResult("request", "write_markdown request must be an object");
  }
  if (input.operation !== "write_markdown") {
    issues.push(issue("invalid_request", "operation", "operation must be write_markdown"));
  }
  validateRoot(input.root, issues);
  const pathIssue = validateLocalEffectPath(input.path, true);
  if (pathIssue) issues.push(pathIssue);
  validateWritePrecondition(input.expected_revision, issues);
  validateFrontmatterUpdate(input.frontmatter, issues);
  if (typeof input.body !== "string") {
    issues.push(issue("invalid_request", "body", "body must be a UTF-8 string"));
  }
  if (typeof input.stage !== "boolean") {
    issues.push(issue("invalid_request", "stage", "stage must be boolean"));
  }
  return finishValidation(input, issues);
}

export function validateCommitPathsRequest(
  input: unknown,
): LocalEffectValidationResult<CommitPathsRequest> {
  const issues: LocalEffectValidationIssue[] = [];
  if (!isRecord(input)) {
    return invalidResult("request", "commit_paths request must be an object");
  }
  if (input.operation !== "commit_paths") {
    issues.push(issue("invalid_request", "operation", "operation must be commit_paths"));
  }
  validateRoot(input.root, issues);

  if (!Array.isArray(input.paths) || input.paths.length === 0) {
    issues.push(issue("invalid_request", "paths", "paths must be a non-empty array"));
  } else {
    const seen = new Set<string>();
    input.paths.forEach((entry, index) => {
      const field = `paths[${index}]`;
      if (!isRecord(entry)) {
        issues.push(issue("invalid_request", field, "path entry must be an object"));
        return;
      }
      const pathIssue = validateLocalEffectPath(entry.path);
      if (pathIssue) issues.push({ ...pathIssue, field: `${field}.path` });
      if (typeof entry.path === "string") {
        if (seen.has(entry.path)) {
          issues.push(issue("invalid_request", `${field}.path`, "paths must not repeat"));
        }
        seen.add(entry.path);
      }
      validateRevision(entry.expected_revision, `${field}.expected_revision`, issues);
    });
  }

  if (typeof input.message !== "string" || input.message.trim().length === 0) {
    issues.push(issue("invalid_message", "message", "message must contain non-whitespace text"));
  } else if (input.message.includes("\0")) {
    issues.push(issue("invalid_message", "message", "message may not contain NUL"));
  }
  validateIdentity(input.author, "author", issues);
  validateIdentity(input.committer, "committer", issues);
  validateTrailers(input.trailers, input.message, issues);
  return finishValidation(input, issues);
}

function validateRoot(value: unknown, issues: LocalEffectValidationIssue[]): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\n") ||
    !isAbsolute(value)
  ) {
    issues.push(issue("invalid_root", "root", "root must be an absolute host path"));
  }
}

function validateWritePrecondition(
  value: unknown,
  issues: LocalEffectValidationIssue[],
): void {
  if (value === "any") return;
  validateRevision(value, "expected_revision", issues);
}

function validateRevision(
  value: unknown,
  field: string,
  issues: LocalEffectValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issue("invalid_request", field, "path revision must be an object"));
    return;
  }
  for (const place of ["worktree", "index", "head"] as const) {
    const oid = value[place];
    if (oid !== null && (typeof oid !== "string" || oid.length === 0 || /\s|\0/.test(oid))) {
      issues.push(
        issue(
          "invalid_request",
          `${field}.${place}`,
          `${place} must be null or a non-empty opaque object id`,
        ),
      );
    }
  }
}

function validateFrontmatterUpdate(
  value: unknown,
  issues: LocalEffectValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(
      issue("invalid_frontmatter_patch", "frontmatter", "frontmatter must be an object"),
    );
    return;
  }
  if (value.mode !== undefined && value.mode !== "preserve" && value.mode !== "replace") {
    issues.push(
      issue(
        "invalid_frontmatter_patch",
        "frontmatter.mode",
        "mode must be preserve or replace",
      ),
    );
  }
  if (!isRecord(value.set)) {
    issues.push(
      issue("invalid_frontmatter_patch", "frontmatter.set", "set must be an object"),
    );
  } else {
    for (const [key, item] of Object.entries(value.set)) {
      if (key.length === 0 || key.includes("\0") || key.includes("\n")) {
        issues.push(
          issue(
            "invalid_frontmatter_patch",
            `frontmatter.set.${key}`,
            "frontmatter keys must be non-empty single-line strings",
          ),
        );
      }
      if (!isLocalEffectValue(item, new Set())) {
        issues.push(
          issue(
            "invalid_frontmatter_patch",
            `frontmatter.set.${key}`,
            "frontmatter values must use the finite JSON/YAML data model",
          ),
        );
      }
    }
  }
  if (!Array.isArray(value.remove)) {
    issues.push(
      issue("invalid_frontmatter_patch", "frontmatter.remove", "remove must be an array"),
    );
    return;
  }
  const seen = new Set<string>();
  for (const [index, key] of value.remove.entries()) {
    if (typeof key !== "string" || key.length === 0 || key.includes("\0") || key.includes("\n")) {
      issues.push(
        issue(
          "invalid_frontmatter_patch",
          `frontmatter.remove[${index}]`,
          "removed keys must be non-empty single-line strings",
        ),
      );
      continue;
    }
    if (seen.has(key)) {
      issues.push(
        issue(
          "invalid_frontmatter_patch",
          `frontmatter.remove[${index}]`,
          "removed keys must not repeat",
        ),
      );
    }
    seen.add(key);
    if (isRecord(value.set) && Object.hasOwn(value.set, key)) {
      issues.push(
        issue(
          "invalid_frontmatter_patch",
          `frontmatter.remove[${index}]`,
          "a key may not appear in both set and remove",
        ),
      );
    }
  }
}

function validateIdentity(
  value: unknown,
  field: string,
  issues: LocalEffectValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issue("invalid_identity", field, `${field} must be an object`));
    return;
  }
  if (
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    /[\0\r\n<>]/.test(value.name)
  ) {
    issues.push(
      issue("invalid_identity", `${field}.name`, `${field} name must be non-empty and single-line`),
    );
  }
  if (typeof value.email !== "string" || !SIMPLE_EMAIL.test(value.email)) {
    issues.push(
      issue("invalid_identity", `${field}.email`, `${field} email must be explicit and valid`),
    );
  }
}

function validateTrailers(
  value: unknown,
  message: unknown,
  issues: LocalEffectValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(issue("invalid_trailers", "trailers", "trailers must be an object"));
    return;
  }
  const trailers = toTrailers(value, issues);
  if (typeof message !== "string" || !trailers) return;

  // Existing protocol trailers in the base message are permitted only when
  // valid, cardinality-correct, and non-conflicting with structured values.
  validateExistingTrailerBlock(message, issues);
  try {
    appendTrailers(message, trailers);
  } catch (error) {
    issues.push(
      issue(
        "invalid_trailers",
        "trailers",
        error instanceof Error ? error.message : "trailer values conflict",
      ),
    );
  }
}

function toTrailers(
  value: Record<string, unknown>,
  issues: LocalEffectValidationIssue[],
): Trailers | null {
  const out: Trailers = {};
  if (value.op !== undefined) {
    if (typeof value.op !== "string" || !OPS.has(value.op)) {
      issues.push(issue("invalid_trailers", "trailers.op", "op is not in the protocol vocabulary"));
    } else {
      out.op = value.op as Op;
    }
  }
  if (value.conversation !== undefined) {
    if (!singleLine(value.conversation)) {
      issues.push(
        issue("invalid_trailers", "trailers.conversation", "conversation must be non-empty and single-line"),
      );
    } else {
      out.conversation = value.conversation;
    }
  }
  if (value.turn !== undefined) {
    if (!Number.isInteger(value.turn) || (value.turn as number) < 0) {
      issues.push(issue("invalid_trailers", "trailers.turn", "turn must be a non-negative integer"));
    } else {
      out.turn = value.turn as number;
    }
  }
  if (value.co_authored_by !== undefined) {
    if (
      !Array.isArray(value.co_authored_by) ||
      value.co_authored_by.some((entry) => typeof entry !== "string" || !CO_AUTHOR.test(entry))
    ) {
      issues.push(
        issue(
          "invalid_trailers",
          "trailers.co_authored_by",
          "co-authored-by values must match '<Name> <agent:<id>@ideaspaces>'",
        ),
      );
    } else if (new Set(value.co_authored_by).size !== value.co_authored_by.length) {
      issues.push(
        issue("invalid_trailers", "trailers.co_authored_by", "co-authored-by values must not repeat"),
      );
    } else {
      out.coAuthoredBy = value.co_authored_by as string[];
    }
  }
  if (value.change_id !== undefined) {
    if (typeof value.change_id !== "string" || !isValidChangeId(value.change_id)) {
      issues.push(
        issue("invalid_trailers", "trailers.change_id", "change_id is not a valid Change-Id"),
      );
    } else {
      out.changeId = value.change_id;
    }
  }
  return out;
}

function validateExistingTrailerBlock(
  message: string,
  issues: LocalEffectValidationIssue[],
): void {
  const lines = message.split("\n");
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  if (end < 0) return;

  const trailerLine = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/;
  let above = end;
  while (above >= 0 && trailerLine.test(lines[above])) above--;
  const start = above + 1;
  if (start > end || (above >= 0 && lines[above].trim() !== "")) return;

  const seen = new Set<string>();
  const coAuthors = new Set<string>();
  for (const line of lines.slice(start, end + 1)) {
    const match = trailerLine.exec(line)!;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (!["op", "conversation", "turn", "co-authored-by", "change-id"].includes(key)) {
      continue;
    }
    if (key !== "co-authored-by" && seen.has(key)) {
      issues.push(issue("invalid_trailers", "message", `base message repeats ${match[1]}`));
      continue;
    }
    seen.add(key);
    if (key === "op" && !OPS.has(value)) {
      issues.push(issue("invalid_trailers", "message", "base message contains an invalid Op"));
    } else if (key === "conversation" && !singleLine(value)) {
      issues.push(
        issue("invalid_trailers", "message", "base message contains an invalid Conversation"),
      );
    } else if (key === "turn" && !/^\d+$/.test(value)) {
      issues.push(issue("invalid_trailers", "message", "base message contains an invalid Turn"));
    } else if (key === "co-authored-by") {
      if (!CO_AUTHOR.test(value) || coAuthors.has(value)) {
        issues.push(
          issue("invalid_trailers", "message", "base message contains an invalid Co-authored-by"),
        );
      }
      coAuthors.add(value);
    } else if (key === "change-id" && !isValidChangeId(value)) {
      issues.push(
        issue("invalid_trailers", "message", "base message contains an invalid Change-Id"),
      );
    }
  }
}

function singleLine(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/[\0\r\n]/.test(value);
}

function isLocalEffectValue(value: unknown, seen: Set<object>): value is LocalEffectValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    const ok = value.every((entry) => isLocalEffectValue(entry, seen));
    seen.delete(value);
    return ok;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    const ok = Object.values(value).every((entry) => isLocalEffectValue(entry, seen));
    seen.delete(value);
    return ok;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(
  code: LocalEffectFailureCode,
  field: string,
  message: string,
): LocalEffectValidationIssue {
  return { code, field, message };
}

function invalidResult<T>(field: string, message: string): LocalEffectValidationResult<T> {
  return { ok: false, issues: [issue("invalid_request", field, message)] };
}

function finishValidation<T>(
  input: Record<string, unknown>,
  issues: LocalEffectValidationIssue[],
): LocalEffectValidationResult<T> {
  return issues.length === 0
    ? { ok: true, issues, value: input as T }
    : { ok: false, issues };
}
