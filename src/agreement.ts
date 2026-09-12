import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { inspectFrontmatterSyntax, parseFrontmatter } from "./frontmatter.js";
import { parseRootNodeId } from "./root-identity.js";

export const CONTRACT_SOURCES = ["foundation", "agreement"] as const;
export type ContractSource = (typeof CONTRACT_SOURCES)[number];

export const PROMPT_PLACEMENTS = ["head", "history", "tail"] as const;
export type PromptPlacement = (typeof PROMPT_PLACEMENTS)[number];

export const CONTENT_REPRESENTATIONS = ["summary", "full"] as const;
export type ContentRepresentation = (typeof CONTENT_REPRESENTATIONS)[number];

export type AgreementIssueCode =
  | "agreement_frontmatter_malformed"
  | "invalid_root_node_id"
  | "invalid_context"
  | "invalid_full_loads"
  | "invalid_full_load_path"
  | "duplicate_full_load"
  | "missing_full_load";

export interface AgreementIssue {
  /** Absolute Agreement or declared-load path. */
  path: string;
  code: AgreementIssueCode;
  detail: string;
}

export interface AgreementContextFile {
  /** Direct `_agent/` Markdown basename without `.md`. */
  name: string;
  /** Absolute file path. */
  path: string;
  /** Absolute position carrying this `_agent/`. */
  sourcePosition: string;
  content: string;
  representation: ContentRepresentation;
}

export interface AgreementLevel {
  /** Absolute position carrying this `_agent/`. */
  dir: string;
  /** Absolute Agreement path when this level declares one. */
  agreementPath: string | null;
  files: AgreementContextFile[];
}

export interface ComposedAgreement {
  position: string;
  /** Agreement ceiling, or null when no Agreement exists. */
  spaceRoot: string | null;
  /** Every `_agent/` level from the Agreement ceiling to the position. */
  stack: AgreementLevel[];
  /** Selected Agreements only, root-first. */
  agreements: AgreementContextFile[];
  /** Root identity declared by the Agreement that established the ceiling. */
  rootNodeId?: string;
  issues: AgreementIssue[];
}

interface ScannedLevel {
  dir: string;
  agentDir: string;
  agreementPath: string | null;
  agreementContent: string | null;
  rootNodeId?: string;
  fullLoads: string[];
  issues: AgreementIssue[];
}

/**
 * Compose the Agreement frame along one position path.
 *
 * A valid `root_node_id` on the nearest Agreement is the ceiling. Without one,
 * Git supplies the ceiling; outside Git the outermost Agreement found does.
 * Every Agreement from that ceiling to the position remains in the stack.
 */
export async function composeAgreementAlongPath(
  position: string,
  repoRoot: string | null = null,
): Promise<ComposedAgreement> {
  const start = resolve(position);
  const boundary = repoRoot ? resolve(repoRoot) : null;
  const scanned: ScannedLevel[] = [];
  let identityRoot: string | null = null;
  let rootNodeId: string | undefined;

  let dir = start;
  while (true) {
    const level = await scanLevel(dir);
    if (level) {
      scanned.push(level);
      if (level.rootNodeId) {
        identityRoot = dir;
        rootNodeId = level.rootNodeId;
        break;
      }
    }

    if (boundary && dir === boundary) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    // A canonical repository boundary always wins over filesystem ancestry.
    if (boundary && !isWithin(boundary, parent)) break;
    dir = parent;
  }

  const agreementLevels = scanned.filter((level) => level.agreementPath !== null);
  const spaceRoot = identityRoot ?? boundary ?? agreementLevels.at(-1)?.dir ?? null;
  if (!spaceRoot || agreementLevels.length === 0) {
    return {
      position: start,
      spaceRoot: null,
      stack: [],
      agreements: [],
      issues: [],
    };
  }

  const selected = scanned
    .filter((level) => isWithin(spaceRoot, level.dir))
    .reverse();
  const issues = selected.flatMap((level) => level.issues);
  const stack: AgreementLevel[] = [];

  for (const level of selected) {
    const files = await readLevelFiles(level, issues);
    stack.push({ dir: level.dir, agreementPath: level.agreementPath, files });
  }

  return {
    position: start,
    spaceRoot,
    stack,
    agreements: stack.flatMap((level) =>
      level.files.filter((file) => file.name === "agreement"),
    ),
    ...(rootNodeId ? { rootNodeId } : {}),
    issues,
  };
}

async function scanLevel(dir: string): Promise<ScannedLevel | null> {
  const agentDir = join(dir, "_agent");
  if (!(await isDirectory(agentDir))) return null;

  const agreementPath = join(agentDir, "agreement.md");
  const agreementContent = await readRegularFile(agreementPath);
  if (agreementContent === null) {
    return {
      dir,
      agentDir,
      agreementPath: null,
      agreementContent: null,
      fullLoads: [],
      issues: [],
    };
  }

  const issues: AgreementIssue[] = [];
  const syntax = inspectFrontmatterSyntax(agreementContent);
  if (syntax.status === "malformed") {
    issues.push({
      path: agreementPath,
      code: "agreement_frontmatter_malformed",
      detail: syntax.message,
    });
    return {
      dir,
      agentDir,
      agreementPath,
      agreementContent,
      fullLoads: [],
      issues,
    };
  }

  const frontmatter = parseFrontmatter(agreementContent);
  let rootNodeId: string | undefined;
  if (frontmatter && "root_node_id" in frontmatter) {
    const parsed = parseRootNodeId(frontmatter.root_node_id);
    if (parsed.status === "valid") rootNodeId = parsed.rootNodeId;
    else {
      issues.push({
        path: agreementPath,
        code: "invalid_root_node_id",
        detail: parsed.status === "invalid" ? parsed.code : "absent root_node_id declaration",
      });
    }
  }

  const fullLoads = parseFullLoads(frontmatter, agreementPath, issues);
  return {
    dir,
    agentDir,
    agreementPath,
    agreementContent,
    ...(rootNodeId ? { rootNodeId } : {}),
    fullLoads,
    issues,
  };
}

function parseFullLoads(
  frontmatter: Record<string, unknown> | null,
  agreementPath: string,
  issues: AgreementIssue[],
): string[] {
  if (!frontmatter || !("context" in frontmatter)) return [];
  const context = frontmatter.context;
  if (!isRecord(context)) {
    issues.push({
      path: agreementPath,
      code: "invalid_context",
      detail: "`context` must be an object",
    });
    return [];
  }
  if (!("full" in context)) return [];
  if (!Array.isArray(context.full) || !context.full.every((value) => typeof value === "string")) {
    issues.push({
      path: agreementPath,
      code: "invalid_full_loads",
      detail: "`context.full` must be an array of Markdown basenames",
    });
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (const value of context.full) {
    if (!isDirectMarkdownBasename(value) || value === "agreement.md" || value === "foundation.md") {
      issues.push({
        path: agreementPath,
        code: "invalid_full_load_path",
        detail: `invalid context.full path: ${value}`,
      });
      continue;
    }
    if (seen.has(value)) {
      issues.push({
        path: agreementPath,
        code: "duplicate_full_load",
        detail: `duplicate context.full path: ${value}`,
      });
      continue;
    }
    seen.add(value);
    names.push(value);
  }
  return names;
}

async function readLevelFiles(
  level: ScannedLevel,
  issues: AgreementIssue[],
): Promise<AgreementContextFile[]> {
  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(level.agentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const regularMarkdown = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const available = new Set(regularMarkdown);
  for (const name of level.fullLoads) {
    if (!available.has(name)) {
      issues.push({
        path: join(level.agentDir, name),
        code: "missing_full_load",
        detail: `declared full load does not exist as a regular file: ${name}`,
      });
    }
  }

  const files: AgreementContextFile[] = [];
  if (level.agreementPath && level.agreementContent !== null) {
    files.push({
      name: "agreement",
      path: level.agreementPath,
      sourcePosition: level.dir,
      content: level.agreementContent,
      representation: "full",
    });
  }

  for (const name of regularMarkdown) {
    if (name === "agreement.md" || name === "foundation.md") continue;
    const content = await readRegularFile(join(level.agentDir, name));
    if (content === null) continue;
    files.push({
      name: basename(name, ".md"),
      path: join(level.agentDir, name),
      sourcePosition: level.dir,
      content,
      representation: level.fullLoads.includes(name) ? "full" : "summary",
    });
  }
  return files;
}

function isDirectMarkdownBasename(value: string): boolean {
  return (
    value.length > 3 &&
    value.endsWith(".md") &&
    value === basename(value) &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !/[*!?\[\]{}]/.test(value) &&
    value !== ".md" &&
    value !== "..md"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !rel.split(sep).includes(".."));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readRegularFile(path: string): Promise<string | null> {
  try {
    if (!(await fs.lstat(path)).isFile()) return null;
    return await fs.readFile(path, "utf-8");
  } catch {
    return null;
  }
}
