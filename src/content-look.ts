import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import {
  assembleContentFocus,
  assembleContentTree,
  renderContentFocus,
  type AssembleContentFocusOpts,
  type ContentFocusDiagnostic,
  type ContentFocusManifest,
} from "./awareness.js";
import { parseFrontmatter, stripFrontmatter } from "./frontmatter.js";
import { parseThreadPost, type ThreadPostFieldWarning } from "./threads.js";
import {
  inspectMarkdown,
  summarizeMarkdown,
  type MarkdownHeading,
} from "./markdown-inspection.js";
import {
  MAP_DEPTHS,
  type MapDepth,
  type MapDisclosure,
} from "./maps.js";
import { classifyRepositoryPath } from "./repository-path.js";
import type { ContractSource } from "./agreement.js";

export interface AssembleContentLookOpts {
  /** Absolute or cwd-relative local Markdown file or Content directory. */
  position: string;
  /** Requested representation. Defaults to summary. */
  depth?: MapDepth;
  /** Explicit reference frame when both Foundation and Agreement resolve. */
  contractSource?: ContractSource;
  /** Cap on contract, skill, and directory-child summaries. Default: 200 characters. */
  summaryExcerptLength?: number;
  /** Soft cap on direct directory children. Default: 50. */
  maxChildren?: number;
}

export interface ContentLookDirectoryChild {
  kind: "directory" | "markdown";
  name: string;
  /** Repository-relative or reference-root-relative portable position. */
  position: string;
  summary?: string;
  markdownFiles?: number;
}

export interface ContentLookSectionChild extends MarkdownHeading {
  kind: "section";
  name: string;
}

export type ContentLookChild = ContentLookDirectoryChild | ContentLookSectionChild;

/** Rootless local projection. A consumer adds root ordinal 0 only after it has a safe pinned root. */
export interface ContentLookProjectedMember extends Record<string, unknown> {
  position: string;
  depth: MapDepth;
  disclosure?: MapDisclosure;
}

export interface ContentLookTarget {
  placement: "history";
  /** Canonical absolute local target. Never part of a portable Map. */
  path: string;
  /** Repository-relative, or reference-root-relative, portable position. */
  position: string;
  kind: "directory" | "markdown";
  depth: MapDepth;
  /** Hash of exactly the target representation returned at this rung. */
  revision: string;
  name: string;
  /** Present from summary upward; null means the target declares no summary. */
  summary?: string | null;
  /** Present at surface, and at full. Null means a directory has no README surface. */
  surface?: string | null;
  /** Present at children; also present at full for directories. */
  children?: ContentLookChild[];
  /** Direct children omitted by the caller's soft cap. */
  omittedChildren?: number;
  /** Post diagnostics, with authored position, even when the post cannot be parsed. */
  warnings?: Array<ThreadPostFieldWarning & { post: string }>;
  /** The target in Map member vocabulary, without fabricating a root ordinal. */
  member: ContentLookProjectedMember;
}

export interface ContentLookManifest {
  status: "ok";
  kind: "content-look";
  contractRole: "reference";
  /** Applicable target frame with its ambient tree removed; reference only. */
  reference: ContentFocusManifest;
  target: ContentLookTarget;
}

export interface ContentLookDiagnostic extends Omit<ContentFocusDiagnostic, "kind"> {
  kind: "content-look";
}

export type ContentLookResult = ContentLookManifest | ContentLookDiagnostic;

/**
 * Read one local Content target at one canonical Map rung.
 *
 * The enclosing Foundation/Agreement frame is assembled through Content focus,
 * then fixed as reference context with its ambient tree removed. The requested
 * target is the only Content projection deepened by this operation. No caller
 * contract, working directory, Git state, or filesystem content is mutated.
 */
export async function assembleContentLook(
  opts: AssembleContentLookOpts,
): Promise<ContentLookResult | null> {
  const depth = opts.depth ?? "summary";
  if (!MAP_DEPTHS.includes(depth)) {
    throw new RangeError(`Content look depth must be one of: ${MAP_DEPTHS.join(", ")}`);
  }

  const requested = resolve(opts.position);
  const path = await fs.realpath(requested);
  const stat = await fs.stat(path);
  const kind = stat.isDirectory()
    ? "directory"
    : stat.isFile() && extname(path).toLowerCase() === ".md"
      ? "markdown"
      : null;
  if (!kind) return null;

  const framePosition = kind === "directory" ? path : dirname(path);
  const focusOpts: AssembleContentFocusOpts = {
    position: framePosition,
    ...(opts.contractSource ? { contractSource: opts.contractSource } : {}),
    ...(opts.summaryExcerptLength !== undefined
      ? { summaryExcerptLength: opts.summaryExcerptLength }
      : {}),
    treeMaxEntries: 0,
  };
  const focused = await assembleContentFocus(focusOpts);
  if (!focused) return null;
  if (focused.status !== "ok") return { ...focused, kind: "content-look" };

  const base = focused.position.repoRoot ?? focused.spaceRoot;
  const position = portablePosition(base, path);
  if (!isLookTarget(position, kind, focused.position.repoRoot !== null)) return null;

  const target = kind === "markdown"
    ? await readMarkdownTarget(path, position, depth)
    : await readDirectoryTarget(
        path,
        position,
        depth,
        opts.maxChildren ?? 50,
        opts.summaryExcerptLength ?? 200,
      );

  return {
    status: "ok",
    kind: "content-look",
    contractRole: "reference",
    reference: { ...focused, tree: null },
    target,
  };
}

/** Render the canonical reference frame followed by exactly one target representation. */
export function renderContentLook(result: ContentLookResult): string {
  if (result.status !== "ok") {
    return renderContentFocus({ ...result, kind: "content-focus" });
  }
  const reference = renderContentFocus(result.reference);
  const target = renderTarget(result.target);
  return reference ? `${reference}\n\n${target}` : target;
}

async function readMarkdownTarget(
  path: string,
  position: string,
  depth: MapDepth,
): Promise<ContentLookTarget> {
  const source = await fs.readFile(path, "utf-8");
  const isPost = isThreadPostPosition(position);
  const frontmatter = parseFrontmatter(source);
  let name: string;
  let summary: string | null;
  let warnings: ContentLookTarget["warnings"];

  if (isPost) {
    const postResult = parseThreadPost(source, position);
    if (postResult.status === "valid") {
      name = nonEmptyString(postResult.post.frontmatter.name) ??
        nonEmptyString(postResult.post.id) ??
        basename(path, extname(path));
      summary = nonEmptyString(postResult.post.frontmatter.summary) ??
        summarizeMarkdown(source);
      warnings = postResult.post.warnings?.map((warning) => ({ post: position, ...warning }));
    } else {
      name = nonEmptyString(frontmatter?.name) ?? basename(path, extname(path));
      summary = summarizeMarkdown(source);
      warnings = postResult.issues.map((warning) => ({ post: position, field: "frontmatter", warning }));
    }
  } else {
    name = nonEmptyString(frontmatter?.name) ?? basename(path, extname(path));
    summary = summarizeMarkdown(source);
  }

  const target = baseTarget(path, position, "markdown", depth, name, summary);
  if (warnings?.length) target.warnings = warnings;

  if (depth === "surface" || depth === "full") {
    target.surface = stripFrontmatter(source);
  } else if (depth === "children") {
    const outline = inspectMarkdown(source, { mode: "outline" });
    target.children = outline.mode === "outline"
      ? outline.headings.map((heading) => ({ ...heading, kind: "section", name: heading.text }))
      : [];
  }

  return finishTarget(target);
}

async function readDirectoryTarget(
  path: string,
  position: string,
  depth: MapDepth,
  maxChildren: number,
  summaryExcerptLength: number,
): Promise<ContentLookTarget> {
  if (!Number.isInteger(maxChildren) || maxChildren < 0) {
    throw new RangeError("Content look maxChildren must be a non-negative integer");
  }

  const isThreadFolder = isThreadFolderPosition(position);
  const isAgentDir = isAgentPosition(position);

  if (isThreadFolder) {
    const readme = await readDirectoryReadme(path);
    const readmeFm = readme.content === null ? null : parseFrontmatter(readme.content);
    const readmeSummary = readme.content === null ? null : summarizeMarkdown(readme.content);

    let agreementFm: Record<string, unknown> | null = null;
    let agreementSummary: string | null = null;
    try {
      const agreementPath = join(path, "_agent", "agreement.md");
      const agreementContent = await fs.readFile(agreementPath, "utf-8");
      agreementFm = parseFrontmatter(agreementContent);
      agreementSummary = summarizeMarkdown(agreementContent);
    } catch {}

    const name = nonEmptyString(readmeFm?.name) ??
      nonEmptyString(agreementFm?.name)?.replace(/^(Agreement|Foundation)\s*[—–-]\s*/i, "").trim() ??
      basename(path);
    const summary = (readme.content !== null ? readmeSummary : null) ??
      (agreementFm !== null ? (nonEmptyString(agreementFm.summary) ?? agreementSummary) : null);

    const target = baseTarget(path, position, "directory", depth, name, summary);

    if (depth === "surface" || depth === "full") {
      target.surface = readme.content === null ? null : stripFrontmatter(readme.content);
    }
    if (depth === "children" || depth === "full") {
      let entries: Array<{ name: string; isDir: boolean }> = [];
      try {
        const dirents = await fs.readdir(path, { withFileTypes: true });
        entries = dirents.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
      } catch {}

      const postFiles = entries
        .filter((e) => !e.isDir && e.name.endsWith(".md") && e.name !== "README.md" && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort();

      const children: ContentLookDirectoryChild[] = [];
      const warnings: NonNullable<ContentLookTarget["warnings"]> = [];
      for (const fileName of postFiles) {
        const postPath = join(path, fileName);
        try {
          const content = await fs.readFile(postPath, "utf-8");
          const postResult = parseThreadPost(content, joinPortable(position, fileName));
          let postName: string;
          let postSummary: string | undefined;
          if (postResult.status === "valid") {
            warnings.push(...(postResult.post.warnings ?? []).map((warning) => ({ post: joinPortable(position, fileName), ...warning })));
            postName = nonEmptyString(postResult.post.frontmatter.name) ??
              nonEmptyString(postResult.post.id) ??
              basename(fileName, ".md");
            postSummary = nonEmptyString(postResult.post.frontmatter.summary) ??
              (summarizeMarkdown(content) || undefined);
          } else {
            warnings.push(...postResult.issues.map((warning) => ({ post: joinPortable(position, fileName), field: "frontmatter", warning })));
            const fm = parseFrontmatter(content);
            postName = nonEmptyString(fm?.name) ?? basename(fileName, ".md");
            postSummary = (fm?.summary ? String(fm.summary) : summarizeMarkdown(content)) || undefined;
          }
          children.push({
            kind: "markdown",
            name: postName,
            position: joinPortable(position, fileName),
            ...(postSummary ? { summary: postSummary } : {}),
          });
        } catch {
          children.push({
            kind: "markdown",
            name: basename(fileName, ".md"),
            position: joinPortable(position, fileName),
          });
        }
      }

      target.children = children.slice(0, maxChildren);
      if (warnings.length) target.warnings = warnings;
      const omitted = Math.max(0, children.length - target.children.length);
      if (omitted) target.omittedChildren = omitted;
    }

    return finishTarget(target);
  }

  if (isAgentDir) {
    const readme = await readDirectoryReadme(path);
    const frontmatter = readme.content === null ? null : parseFrontmatter(readme.content);
    const name = nonEmptyString(frontmatter?.name) ?? basename(path);
    const summary = readme.content === null ? null : summarizeMarkdown(readme.content);
    const target = baseTarget(path, position, "directory", depth, name, summary);

    if (depth === "surface" || depth === "full") {
      target.surface = readme.content === null ? null : stripFrontmatter(readme.content);
    }
    if (depth === "children" || depth === "full") {
      let entries: Array<{ name: string; isDir: boolean }> = [];
      try {
        const dirents = await fs.readdir(path, { withFileTypes: true });
        entries = dirents.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
      } catch {}

      const files = entries
        .filter((e) => !e.name.startsWith(".") && e.name !== "README.md")
        .sort((a, b) => a.name.localeCompare(b.name));

      const children: ContentLookDirectoryChild[] = [];
      for (const entry of files) {
        const entryPath = join(path, entry.name);
        if (entry.isDir) {
          children.push({
            kind: "directory",
            name: entry.name,
            position: joinPortable(position, entry.name),
          });
        } else {
          let childSummary: string | undefined;
          let childName = entry.name;
          if (entry.name.endsWith(".md")) {
            try {
              const content = await fs.readFile(entryPath, "utf-8");
              const fm = parseFrontmatter(content);
              childName = nonEmptyString(fm?.name) ?? basename(entry.name, ".md");
              childSummary = (fm?.summary ? String(fm.summary) : summarizeMarkdown(content)) || undefined;
            } catch {}
          }
          children.push({
            kind: "markdown",
            name: childName,
            position: joinPortable(position, entry.name),
            ...(childSummary ? { summary: childSummary } : {}),
          });
        }
      }

      target.children = children.slice(0, maxChildren);
      const omitted = Math.max(0, children.length - target.children.length);
      if (omitted) target.omittedChildren = omitted;
    }

    return finishTarget(target);
  }

  const readme = await readDirectoryReadme(path);
  const frontmatter = readme.content === null ? null : parseFrontmatter(readme.content);
  const name = nonEmptyString(frontmatter?.name) ?? basename(path);
  const summary = readme.content === null ? null : summarizeMarkdown(readme.content);
  const target = baseTarget(path, position, "directory", depth, name, summary);

  if (depth === "surface" || depth === "full") {
    target.surface = readme.content === null ? null : stripFrontmatter(readme.content);
  }
  if (depth === "children" || depth === "full") {
    const tree = await assembleContentTree({
      position: path,
      depth: 1,
      // README is the directory surface, not one of its children. Pull one
      // extra entry so filtering it cannot consume the caller's child budget.
      maxEntries: maxChildren + 1,
      summaryExcerptLength,
    });
    const rawEntries = tree?.entries ?? [];
    const entries = rawEntries
      .filter((entry) => entry.name !== "README.md")
      .slice(0, maxChildren);
    target.children = entries.map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      position: joinPortable(position, entry.name),
      ...(entry.summary ? { summary: entry.summary } : {}),
      ...(entry.markdownFiles !== undefined ? { markdownFiles: entry.markdownFiles } : {}),
    }));
    const rawTotal = rawEntries.length + (tree?.omittedEntries ?? 0);
    const contentTotal = Math.max(0, rawTotal - (readme.exists ? 1 : 0));
    const omitted = Math.max(0, contentTotal - target.children.length);
    if (omitted) target.omittedChildren = omitted;
  }

  return finishTarget(target);
}

function baseTarget(
  path: string,
  position: string,
  kind: "directory" | "markdown",
  depth: MapDepth,
  name: string,
  summary: string | null,
): ContentLookTarget {
  const disclosure: MapDisclosure = { name };
  const target: ContentLookTarget = {
    placement: "history",
    path,
    position,
    kind,
    depth,
    revision: "",
    name,
    member: { position, depth, disclosure },
  };
  if (depth !== "name") {
    target.summary = summary;
    if (summary !== null) disclosure.summary = summary;
  }
  return target;
}

function finishTarget(target: ContentLookTarget): ContentLookTarget {
  const represented = {
    kind: target.kind,
    name: target.name,
    ...(target.summary !== undefined ? { summary: target.summary } : {}),
    ...(target.surface !== undefined ? { surface: target.surface } : {}),
    ...(target.children !== undefined ? { children: target.children } : {}),
    ...(target.omittedChildren !== undefined ? { omittedChildren: target.omittedChildren } : {}),
    ...(target.warnings !== undefined ? { warnings: target.warnings } : {}),
  };
  target.revision = contentRevision(JSON.stringify(represented));
  return target;
}

async function readDirectoryReadme(
  path: string,
): Promise<{ exists: boolean; content: string | null }> {
  const readme = join(path, "README.md");
  try {
    const stat = await fs.lstat(readme);
    if (!stat.isFile()) return { exists: true, content: null };
    return { exists: true, content: await fs.readFile(readme, "utf-8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, content: null };
    }
    throw error;
  }
}

function renderTarget(target: ContentLookTarget): string {
  const lines = [
    "Look:",
    `  position: ${target.position}`,
    `  kind: ${target.kind}`,
    `  depth: ${target.depth}`,
    `  revision: ${target.revision}`,
    "  placement: history",
    `  name: ${target.name}`,
  ];
  if ("summary" in target) lines.push(`  summary: ${target.summary ?? "(none)"}`);
  if (target.warnings?.length) {
    lines.push("", "Warnings:");
    for (const warning of target.warnings) lines.push(`  ${warning.post}: ${warning.field}: ${warning.warning}`);
  }
  if ("surface" in target) {
    lines.push("", "Surface:");
    if (target.surface === null) lines.push("  (none)");
    else for (const line of (target.surface ?? "").trimEnd().split("\n")) lines.push(`  ${line}`);
  }
  if (target.children) {
    lines.push("", "Children:");
    if (!target.children.length) lines.push("  (none)");
    for (const child of target.children) {
      if (child.kind === "section") {
        const duplicate = child.occurrence > 1 ? `, occurrence ${child.occurrence}` : "";
        lines.push(`  ${"#".repeat(child.level)} ${child.name} (line ${child.line}${duplicate})`);
      } else {
        const suffix = child.kind === "directory" ? "/" : "";
        const summary = child.summary ? ` — ${child.summary}` : "";
        lines.push(`  ${child.position}${suffix}${summary}`);
      }
    }
    if (target.omittedChildren) lines.push(`  … and ${target.omittedChildren} more`);
  }
  return lines.join("\n");
}

function portablePosition(base: string, target: string): string {
  const value = relative(base, target).split(sep).join("/");
  return value || ".";
}

function isLookTarget(
  position: string,
  kind: "directory" | "markdown",
  hasRepoRoot: boolean,
): boolean {
  if (!hasRepoRoot || position === ".") return true;
  const classified = classifyRepositoryPath(position, kind === "directory" ? "directory" : "file");
  if (classified.status !== "ok") return false;
  if (classified.role === "reserved") return false;
  if (classified.role === "ordinary" || classified.role === "knowledge") return true;
  if (classified.role === "agent-context") return true;
  if (classified.role === "extension") {
    return classified.extension === "_threads";
  }
  return false;
}

function isThreadPostPosition(position: string): boolean {
  const segments = position.split("/");
  const threadsIdx = segments.indexOf("_threads");
  if (threadsIdx === -1) return false;
  if (segments.length >= threadsIdx + 3) {
    const fileName = segments[segments.length - 1];
    if (fileName.toLowerCase() === "readme.md") return false;
    if (segments.includes("_agent")) return false;
    return fileName.endsWith(".md");
  }
  return false;
}

function isThreadFolderPosition(position: string): boolean {
  const segments = position.split("/");
  const threadsIdx = segments.indexOf("_threads");
  if (threadsIdx === -1) return false;
  return segments.length === threadsIdx + 2 && !segments[threadsIdx + 1].startsWith(".");
}

function isAgentPosition(position: string): boolean {
  const segments = position.split("/");
  return segments.includes("_agent");
}

function joinPortable(parent: string, child: string): string {
  return parent === "." ? child : `${parent}/${child}`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contentRevision(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf-8").digest("hex")}`;
}
