import { randomUUID } from "node:crypto";
import {
  lstat as nodeLstat,
  mkdir,
  open,
  readFile,
  realpath as nodeRealpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseDocument, stringify } from "yaml";
import { pathRevision } from "./git.js";
import {
  validateCommitPathsRequest,
  validateWriteMarkdownRequest,
} from "./local-effects.js";
import type {
  CommitPathsRequest,
  CommitPathsResult,
  LocalEffectCapabilities,
  LocalEffectError,
  LocalEffectFailureCode,
  LocalEffectFileSystem,
  LocalEffectOperation,
  LocalEffectPartial,
  LocalEffectPhase,
  LocalGitResult,
  PathRevision,
  SelectedPathRevision,
  WriteMarkdownRequest,
  WriteMarkdownResult,
} from "./local-effects.js";
import { appendTrailers } from "./trailers.js";
import type { Trailers } from "./trailers.js";

/** Node's explicit filesystem adapter for the opt-in local-effect boundary. */
export const nodeLocalEffectFileSystem: LocalEffectFileSystem = {
  realpath: (path) => nodeRealpath(path),
  async lstat(path) {
    try {
      const stat = await nodeLstat(path);
      return {
        kind: stat.isSymbolicLink()
          ? "symlink"
          : stat.isFile()
            ? "file"
            : stat.isDirectory()
              ? "directory"
              : "other",
        mode: stat.mode,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  readUtf8: (path) => readFile(path, "utf8"),
  async atomicWriteUtf8(path, content) {
    await mkdir(dirname(path), { recursive: true });
    let mode = 0o666;
    try {
      mode = (await nodeLstat(path)).mode & 0o777;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporary = join(
      dirname(path),
      `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporary, "wx", mode);
      await handle.writeFile(content, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, path);
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  },
};

/** Safely create or update one Markdown document and optionally stage it. */
export async function writeMarkdown(
  request: WriteMarkdownRequest,
  capabilities: LocalEffectCapabilities,
): Promise<WriteMarkdownResult> {
  const validation = validateWriteMarkdownRequest(request);
  if (!validation.ok) {
    const first = validation.issues[0];
    return effectError(
      "write_markdown",
      first?.code ?? "invalid_request",
      "preflight",
      first?.message ?? "The write request is invalid.",
      typeof request?.path === "string" ? request.path : undefined,
    );
  }
  const capabilityError = validateCapabilities("write_markdown", capabilities);
  if (capabilityError) return capabilityError;

  const reviewed = await readSelectedRevision(
    "write_markdown",
    request.root,
    request.path,
    capabilities,
  );
  if (isEffectError(reviewed)) return reviewed;
  const ignoreError = await ignoredLocalPath(
    "write_markdown",
    request.root,
    request.path,
    reviewed,
    capabilities,
  );
  if (ignoreError) return ignoreError;
  if (
    request.expected_revision !== "any" &&
    !sameRevision(reviewed, request.expected_revision)
  ) {
    return effectError(
      "write_markdown",
      "revision_mismatch",
      "revision_check",
      "The reviewed path revision no longer matches.",
      request.path,
    );
  }

  let rendered = await prepareMarkdown(request, reviewed, capabilities);
  if (isEffectError(rendered)) return rendered;

  // Re-check the same path at the last safe point before replacement. Exact
  // CAS refuses intervening worktree/index/HEAD movement; `any` permits it but
  // preserve mode must merge against the newly current document.
  const writeBoundary = await readSelectedRevision(
    "write_markdown",
    request.root,
    request.path,
    capabilities,
  );
  if (isEffectError(writeBoundary)) return writeBoundary;
  const boundaryIgnoreError = await ignoredLocalPath(
    "write_markdown",
    request.root,
    request.path,
    writeBoundary,
    capabilities,
  );
  if (boundaryIgnoreError) return boundaryIgnoreError;
  if (
    request.expected_revision !== "any" &&
    !sameRevision(writeBoundary, request.expected_revision)
  ) {
    return effectError(
      "write_markdown",
      "revision_mismatch",
      "revision_check",
      "The reviewed path revision no longer matches.",
      request.path,
    );
  }
  if (request.expected_revision === "any" && !sameRevision(writeBoundary, reviewed)) {
    rendered = await prepareMarkdown(request, writeBoundary, capabilities);
    if (isEffectError(rendered)) return rendered;
  }

  try {
    await capabilities.filesystem.atomicWriteUtf8(
      hostPath(request.root, request.path),
      rendered,
    );
  } catch (error) {
    return effectError(
      "write_markdown",
      "atomic_write_failed",
      "write",
      "The document could not be replaced atomically.",
      request.path,
      detail(error),
    );
  }

  const afterWrite = await readSelectedRevision(
    "write_markdown",
    request.root,
    request.path,
    capabilities,
  );
  if (isEffectError(afterWrite)) {
    return effectPartial(
      "write_markdown",
      ["revision_check", "write"],
      afterWrite.code,
      afterWrite.phase,
      request.path,
      afterWrite.message,
      [{ path: request.path, revision: reviewed }],
      "Review the current path revision before retrying.",
      afterWrite.detail,
    );
  }
  if (!request.stage) {
    return {
      status: "ok",
      operation: "write_markdown",
      affected_paths: [request.path],
      path_revisions: [{ path: request.path, revision: afterWrite }],
    };
  }

  const staged = await runGit(capabilities, request.root, [
    "add",
    "-A",
    "--",
    literalPathspec(request.path),
  ]);
  if (!staged.ok) {
    const current = await bestEffortRevisions(
      request.root,
      [request.path],
      capabilities,
      [{ path: request.path, revision: afterWrite }],
    );
    return effectPartial(
      "write_markdown",
      ["revision_check", "write"],
      "stage_failed",
      "stage",
      request.path,
      "The document was written but could not be staged.",
      current,
      "Review the current path revision before staging or retrying.",
      gitDetail(staged),
    );
  }

  const finalRevision = await readSelectedRevision(
    "write_markdown",
    request.root,
    request.path,
    capabilities,
  );
  if (isEffectError(finalRevision)) {
    return effectPartial(
      "write_markdown",
      ["revision_check", "write", "stage"],
      finalRevision.code,
      finalRevision.phase,
      request.path,
      finalRevision.message,
      [{ path: request.path, revision: afterWrite }],
      "Review the current path revision before retrying.",
      finalRevision.detail,
    );
  }
  return {
    status: "ok",
    operation: "write_markdown",
    affected_paths: [request.path],
    path_revisions: [{ path: request.path, revision: finalRevision }],
  };
}

/** Commit exactly the reviewed path set without adopting bystander index work. */
export async function commitPaths(
  request: CommitPathsRequest,
  capabilities: LocalEffectCapabilities,
): Promise<CommitPathsResult> {
  const validation = validateCommitPathsRequest(request);
  if (!validation.ok) {
    const first = validation.issues[0];
    return effectError(
      "commit_paths",
      first?.code ?? "invalid_request",
      "preflight",
      first?.message ?? "The commit request is invalid.",
      request?.paths?.[0]?.path,
    );
  }
  const capabilityError = validateCapabilities("commit_paths", capabilities);
  if (capabilityError) return capabilityError;

  const initial: SelectedPathRevision[] = [];
  for (const selected of request.paths) {
    const revision = await readSelectedRevision(
      "commit_paths",
      request.root,
      selected.path,
      capabilities,
    );
    if (isEffectError(revision)) return revision;
    const ignoreError = await ignoredLocalPath(
      "commit_paths",
      request.root,
      selected.path,
      revision,
      capabilities,
    );
    if (ignoreError) return ignoreError;
    if (revision.worktree === null && revision.index === null && revision.head === null) {
      return effectError(
        "commit_paths",
        "uncommittable_path",
        "preflight",
        "The selected path has no committable state.",
        selected.path,
      );
    }
    if (!sameRevision(revision, selected.expected_revision)) {
      return effectError(
        "commit_paths",
        "revision_mismatch",
        "revision_check",
        "The reviewed path revision no longer matches.",
        selected.path,
      );
    }
    initial.push({ path: selected.path, revision });
  }

  // The worktree state is what exact-path staging would commit. Detect an empty
  // selected tree change before touching an index that may belong to others.
  if (initial.every(({ revision }) => revision.worktree === revision.head)) {
    return effectError(
      "commit_paths",
      "nothing_to_commit",
      "commit",
      "The selected paths produce no tree change.",
    );
  }

  let message: string;
  try {
    message = appendTrailers(request.message, toTrailers(request));
  } catch (error) {
    return effectError(
      "commit_paths",
      "invalid_trailers",
      "preflight",
      "The structured trailers conflict with the commit message.",
      undefined,
      detail(error),
    );
  }

  const stageBoundary = await readAllSelected(
    request.root,
    request.paths.map(({ path }) => path),
    capabilities,
  );
  if (isEffectError(stageBoundary)) return stageBoundary;
  for (const [index, current] of stageBoundary.entries()) {
    const selected = request.paths[index]!;
    const boundaryIgnoreError = await ignoredLocalPath(
      "commit_paths",
      request.root,
      selected.path,
      current.revision,
      capabilities,
    );
    if (boundaryIgnoreError) return boundaryIgnoreError;
    if (!sameRevision(current.revision, selected.expected_revision)) {
      return effectError(
        "commit_paths",
        "revision_mismatch",
        "revision_check",
        "The reviewed path revision no longer matches.",
        selected.path,
      );
    }
  }

  // An already-staged deletion has no worktree or index entry left for
  // `git add` to match. It is already in the required post-stage state.
  const pathsToStage = stageBoundary
    .filter(({ revision }) => !(revision.worktree === null && revision.index === null))
    .map(({ path }) => path);
  if (pathsToStage.length > 0) {
    const stage = await runGit(capabilities, request.root, [
      "add",
      "-A",
      "--",
      ...pathsToStage.map(literalPathspec),
    ]);
    if (!stage.ok) {
      const current = await bestEffortRevisions(
        request.root,
        request.paths.map(({ path }) => path),
        capabilities,
        initial,
      );
      const durable = current.some((entry, index) =>
        entry.revision.index !== initial[index]?.revision.index
      );
      if (durable) {
        return effectPartial(
          "commit_paths",
          ["revision_check", "stage"],
          "stage_failed",
          "stage",
          undefined,
          "Some selected index state changed before staging failed.",
          current,
          "Review every selected path revision before retrying.",
          gitDetail(stage),
        );
      }
      return effectError(
        "commit_paths",
        "stage_failed",
        "stage",
        "The selected paths could not be staged.",
        undefined,
        gitDetail(stage),
      );
    }
  }

  const stagedRevisions = await readAllSelected(
    request.root,
    request.paths.map(({ path }) => path),
    capabilities,
  );
  if (isEffectError(stagedRevisions)) {
    return effectPartial(
      "commit_paths",
      ["revision_check", "stage"],
      stagedRevisions.code,
      stagedRevisions.phase,
      stagedRevisions.path,
      stagedRevisions.message,
      initial,
      "Review every selected path revision before retrying.",
      stagedRevisions.detail,
    );
  }
  for (const [index, current] of stagedRevisions.entries()) {
    const before = initial[index]!.revision;
    const expected: PathRevision = {
      worktree: before.worktree,
      index: before.worktree,
      head: before.head,
    };
    if (!sameRevision(current.revision, expected)) {
      return effectPartial(
        "commit_paths",
        ["revision_check", "stage"],
        "revision_mismatch",
        "revision_check",
        current.path,
        "A selected path changed at the commit boundary.",
        stagedRevisions,
        "Review every selected path revision before retrying.",
      );
    }
  }

  const commit = await runGit(capabilities, request.root, [
    "-c",
    `user.name=${request.committer.name}`,
    "-c",
    `user.email=${request.committer.email}`,
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--only",
    "--cleanup=verbatim",
    `--author=${request.author.name} <${request.author.email}>`,
    "-m",
    message,
    "--",
    ...request.paths.map(({ path }) => literalPathspec(path)),
  ]);
  if (!commit.ok) {
    const current = await bestEffortRevisions(
      request.root,
      request.paths.map(({ path }) => path),
      capabilities,
      stagedRevisions,
    );
    return effectPartial(
      "commit_paths",
      ["revision_check", "stage"],
      "commit_failed",
      "commit",
      undefined,
      "The selected paths were staged but the commit failed.",
      current,
      "Review the current index and selected path revisions before retrying.",
      gitDetail(commit),
    );
  }

  const oidResult = await runGit(capabilities, request.root, ["rev-parse", "--verify", "HEAD"]);
  const membership = await runGit(capabilities, request.root, [
    "diff-tree",
    "--root",
    "--no-commit-id",
    "--name-only",
    "-r",
    "-z",
    "HEAD",
  ]);
  const finalRevisions = await readAllSelected(
    request.root,
    request.paths.map(({ path }) => path),
    capabilities,
  );
  if (!oidResult.ok || !membership.ok || isEffectError(finalRevisions)) {
    const fallback = isEffectError(finalRevisions) ? stagedRevisions : finalRevisions;
    return effectPartial(
      "commit_paths",
      ["revision_check", "stage", "commit"],
      "git_executor_failed",
      "commit",
      undefined,
      "The commit completed but its resulting facts could not be verified.",
      fallback,
      "Inspect HEAD and the selected path revisions before continuing.",
      [gitDetail(oidResult), gitDetail(membership)].filter(Boolean).join("\n") ||
        (isEffectError(finalRevisions) ? finalRevisions.detail : undefined),
    );
  }

  const actualPaths = membership.stdout.split("\0").filter(Boolean);
  const expectedPaths = request.paths.map(({ path }) => path);
  if (!samePathSet(actualPaths, expectedPaths)) {
    return effectPartial(
      "commit_paths",
      ["revision_check", "stage", "commit"],
      "commit_failed",
      "commit",
      undefined,
      "The commit completed with unexpected path membership.",
      finalRevisions,
      "Inspect the new commit before continuing.",
      `expected ${JSON.stringify(expectedPaths)}, received ${JSON.stringify(actualPaths)}`,
    );
  }

  const commitOid = oidResult.stdout.trim();
  if (!commitOid) {
    return effectPartial(
      "commit_paths",
      ["revision_check", "stage", "commit"],
      "git_executor_failed",
      "commit",
      undefined,
      "The commit completed but Git returned no object id.",
      finalRevisions,
      "Inspect HEAD before continuing.",
    );
  }
  return {
    status: "ok",
    operation: "commit_paths",
    affected_paths: expectedPaths,
    commit_oid: commitOid,
    path_revisions: finalRevisions,
  };
}

function validateCapabilities(
  operation: LocalEffectOperation,
  capabilities: LocalEffectCapabilities,
): LocalEffectError | null {
  if (
    !capabilities ||
    typeof capabilities.git !== "function" ||
    !capabilities.filesystem ||
    typeof capabilities.filesystem.realpath !== "function" ||
    typeof capabilities.filesystem.lstat !== "function" ||
    typeof capabilities.filesystem.readUtf8 !== "function" ||
    typeof capabilities.filesystem.atomicWriteUtf8 !== "function"
  ) {
    return effectError(
      operation,
      "invalid_request",
      "preflight",
      "Explicit Git and filesystem capabilities are required.",
    );
  }
  return null;
}

async function readSelectedRevision(
  operation: LocalEffectOperation,
  root: string,
  path: string,
  capabilities: LocalEffectCapabilities,
): Promise<PathRevision | LocalEffectError> {
  const result = await pathRevision(root, path, capabilities.git, capabilities.filesystem);
  if (result.status === "error") {
    return effectError(
      operation,
      result.code,
      result.phase,
      result.message,
      result.path,
      result.detail,
    );
  }
  return result.revision;
}

async function readAllSelected(
  root: string,
  paths: string[],
  capabilities: LocalEffectCapabilities,
): Promise<SelectedPathRevision[] | LocalEffectError> {
  const revisions: SelectedPathRevision[] = [];
  for (const path of paths) {
    const result = await pathRevision(root, path, capabilities.git, capabilities.filesystem);
    if (result.status === "error") {
      return effectError(
        "commit_paths",
        result.code,
        result.phase,
        result.message,
        result.path,
        result.detail,
      );
    }
    revisions.push({ path, revision: result.revision });
  }
  return revisions;
}

async function bestEffortRevisions(
  root: string,
  paths: string[],
  capabilities: LocalEffectCapabilities,
  fallback: SelectedPathRevision[],
): Promise<SelectedPathRevision[]> {
  const current = await readAllSelected(root, paths, capabilities);
  return isEffectError(current) ? fallback : current;
}

async function ignoredLocalPath(
  operation: LocalEffectOperation,
  root: string,
  path: string,
  revision: PathRevision,
  capabilities: LocalEffectCapabilities,
): Promise<LocalEffectError | null> {
  if (revision.index !== null || revision.head !== null) return null;
  // `check-ignore` accepts pathnames, not pathspecs. `--` keeps an option-like
  // filename literal; adding Git's pathspec magic would instead change the
  // pathname being checked.
  const ignored = await runGit(capabilities, root, [
    "check-ignore",
    "--quiet",
    "--",
    path,
  ]);
  if (ignored.code === 0) {
    return effectError(
      operation,
      "ignored_local_path",
      "preflight",
      "An untracked ignored path is local-only and cannot be selected.",
      path,
    );
  }
  if (ignored.code === 1) return null;
  return effectError(
    operation,
    ignored.code === null ? "git_unavailable" : "git_executor_failed",
    "preflight",
    "Git could not determine whether the selected path is ignored.",
    path,
    gitDetail(ignored),
  );
}

async function prepareMarkdown(
  request: WriteMarkdownRequest,
  revision: PathRevision,
  capabilities: LocalEffectCapabilities,
): Promise<string | LocalEffectError> {
  try {
    const existing = revision.worktree === null
      ? null
      : await capabilities.filesystem.readUtf8(hostPath(request.root, request.path));
    return renderMarkdown(existing, request);
  } catch (error) {
    if (error instanceof MalformedFrontmatterError) {
      return effectError(
        "write_markdown",
        "malformed_frontmatter",
        "preflight",
        "Existing frontmatter is malformed; use replace mode to repair it.",
        request.path,
        error.message,
      );
    }
    return effectError(
      "write_markdown",
      "invalid_path",
      "preflight",
      "The selected Markdown path could not be read.",
      request.path,
      detail(error),
    );
  }
}

function renderMarkdown(existing: string | null, request: WriteMarkdownRequest): string {
  const mode = request.frontmatter.mode ?? "preserve";
  const fields = mode === "preserve" ? parseExistingFrontmatter(existing) : {};
  for (const key of request.frontmatter.remove) delete fields[key];
  Object.assign(fields, request.frontmatter.set);
  const yaml = stringify(fields, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${request.body}`;
}

function parseExistingFrontmatter(content: string | null): Record<string, unknown> {
  if (content === null || (!content.startsWith("---\n") && !content.startsWith("---\r\n"))) {
    return {};
  }
  const lines = content.split(/\r?\n/);
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end < 0) throw new MalformedFrontmatterError("missing closing ---");
  const document = parseDocument(lines.slice(1, end).join("\n"), { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new MalformedFrontmatterError(document.errors[0]!.message);
  }
  const value: unknown = document.toJS();
  if (value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new MalformedFrontmatterError("frontmatter root must be a map");
  }
  return value as Record<string, unknown>;
}

class MalformedFrontmatterError extends Error {}

function toTrailers(request: CommitPathsRequest): Trailers {
  return {
    ...(request.trailers.op === undefined ? {} : { op: request.trailers.op }),
    ...(request.trailers.conversation === undefined
      ? {}
      : { conversation: request.trailers.conversation }),
    ...(request.trailers.turn === undefined ? {} : { turn: request.trailers.turn }),
    ...(request.trailers.co_authored_by === undefined
      ? {}
      : { coAuthoredBy: request.trailers.co_authored_by }),
    ...(request.trailers.change_id === undefined
      ? {}
      : { changeId: request.trailers.change_id }),
  };
}

async function runGit(
  capabilities: LocalEffectCapabilities,
  root: string,
  args: readonly string[],
): Promise<LocalGitResult> {
  try {
    return await capabilities.git(root, args);
  } catch (error) {
    return { ok: false, stdout: "", stderr: detail(error), code: null };
  }
}

function hostPath(root: string, path: string): string {
  return join(root, ...path.split("/"));
}

function literalPathspec(path: string): string {
  return `:(literal)${path}`;
}

function sameRevision(left: PathRevision, right: PathRevision): boolean {
  return left.worktree === right.worktree && left.index === right.index && left.head === right.head;
}

function samePathSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((path, index) => path === sortedRight[index]);
}

function effectError(
  operation: LocalEffectOperation,
  code: LocalEffectFailureCode,
  phase: LocalEffectPhase,
  message: string,
  path?: string,
  errorDetail?: string,
): LocalEffectError {
  return {
    status: "error",
    operation,
    affected_paths: [],
    code,
    phase,
    ...(path === undefined ? {} : { path }),
    message,
    ...(errorDetail === undefined || errorDetail.length === 0 ? {} : { detail: errorDetail }),
  };
}

function effectPartial(
  operation: LocalEffectOperation,
  completedPhases: LocalEffectPhase[],
  code: LocalEffectFailureCode,
  phase: LocalEffectPhase,
  path: string | undefined,
  message: string,
  revisions: SelectedPathRevision[],
  recoveryHint: string,
  errorDetail?: string,
): LocalEffectPartial {
  return {
    status: "partial",
    operation,
    affected_paths: revisions.map(({ path: selectedPath }) => selectedPath),
    completed_phases: completedPhases,
    path_revisions: revisions,
    code,
    phase,
    ...(path === undefined ? {} : { path }),
    message,
    ...(errorDetail === undefined || errorDetail.length === 0 ? {} : { detail: errorDetail }),
    recovery_hint: recoveryHint,
  };
}

function isEffectError(value: unknown): value is LocalEffectError {
  return typeof value === "object" && value !== null && "status" in value && value.status === "error";
}

function gitDetail(result: LocalGitResult): string | undefined {
  return result.stderr?.trim() || (result.code === null ? "Git capability was unavailable." : undefined);
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
