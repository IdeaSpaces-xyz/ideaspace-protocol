/**
 * Conformance validation — is a directory a conformant ideaspace?
 *
 * This checks the *shape* a space must have per [`../SPEC.md`](../SPEC.md)'s
 * Conformance section and [`../schema/agent-contract.md`](../schema/agent-contract.md):
 * a root `_agent/` (it's a space at all), the named-but-absent contract files as
 * drift signals, optional root identity, portable `_agent/skills/` identities,
 * recognized `_assets/` supporting payload, knowledge `.md` frontmatter against
 * [`../schema/frontmatter.schema.json`](../schema/frontmatter.schema.json), and
 * graceful-ignore of underscore-prefixed infrastructure folders.
 *
 * It dogfoods the reference library — `readContract` / `CONTRACT_FILES` for the
 * `_agent/` contract and `inspectFrontmatterSyntax` for malformed-frontmatter
 * detection — and adds only the schema-key checks the lib doesn't cover. The
 * frontmatter schema is *read at runtime* (not imported) so a non-TS runtime
 * could load the same JSON; key constraints are enforced with `yaml` + a single
 * `RegExp` rather than a validator dependency.
 *
 * Read-only: never writes the filesystem and never reads outside `root`.
 */

import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { parseDocument } from "yaml";
import { CONTRACT_FILES, readContract } from "./space.js";
import { discoverSkillEntries } from "./awareness.js";
import { inspectFrontmatterSyntax } from "./frontmatter.js";
import { parseRootNodeId } from "./root-identity.js";
import { ASSET_DIRECTORY } from "./assets.js";

export interface ConformanceIssue {
  level: "error" | "warn";
  /** Stable rule id, e.g. `no-space`, `frontmatter-malformed`, `attached-to-pattern`. */
  rule: string;
  /** Path the issue is about, relative to `root` (or "." for the root itself). */
  path: string;
  detail: string;
}

export interface ConformanceReport {
  /** True when there are no `error`-level issues. */
  ok: boolean;
  issues: ConformanceIssue[];
  /** Number of knowledge `.md` files examined. */
  notesChecked: number;
}

/** Root contract files whose absence is surfaced as a drift signal (not noise). */
const DRIFT_CONTRACT_FILES = ["guide", "purpose", "now"] as const;

/** Portable Agent Skills id: 1–64 lowercase ASCII alphanumerics, single-hyphen joined. */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Loaded subset of the frontmatter schema's key constraints. */
interface SchemaConstraints {
  attachedToPattern: RegExp | null;
  /** Set when the bundled schema could not be read — surfaced as an error issue. */
  loadError: string | null;
}

/**
 * Validate a directory against the ideaspace shape.
 *
 * `ok` is true when no `error`-level issues are found; `warn`-level issues
 * (missing foundation/contract files, skipped infra folders) are drift signals
 * that never fail conformance.
 */
export async function validateSpace(root: string): Promise<ConformanceReport> {
  const issues: ConformanceIssue[] = [];

  // 1. Is this a space at all? Root must carry an `_agent/` directory.
  const agentDir = join(root, "_agent");
  if (!(await isDirectory(agentDir))) {
    issues.push({
      level: "error",
      rule: "no-space",
      path: ".",
      detail: "no `_agent/` directory at root — this is not an ideaspace",
    });
    return { ok: false, issues, notesChecked: 0 };
  }

  // 2. Foundation handshake + named-but-absent contract files (drift, not error).
  const contract = await readContract(agentDir);
  if (!contract.foundation) {
    issues.push({
      level: "warn",
      rule: "no-foundation",
      path: "_agent/foundation.md",
      detail: "a space without a foundation is just folders — the handshake is missing",
    });
  } else {
    checkFoundation(contract.foundation.content, issues);
  }
  for (const name of DRIFT_CONTRACT_FILES) {
    if (!contract[name]) {
      issues.push({
        level: "warn",
        rule: "contract-drift",
        path: `_agent/${name}.md`,
        detail: `named-but-absent \`${name}.md\` — direction may not be captured (drift signal, not an error)`,
      });
    }
  }

  // 3. `_agent/skills/` ids and frontmatter names must be portable and identical.
  await checkSkills(root, issues);

  // 4. Knowledge `.md` frontmatter against the runtime-loaded schema.
  const constraints = await loadSchemaConstraints();
  if (constraints.loadError) {
    issues.push({
      level: "error",
      rule: "schema-unavailable",
      path: ".",
      detail: constraints.loadError,
    });
  }
  let notesChecked = 0;
  for await (const file of walkKnowledge(root, issues)) {
    notesChecked++;
    await checkNote(root, file, constraints, issues);
  }

  const ok = !issues.some((i) => i.level === "error");
  return { ok, issues, notesChecked };
}

/**
 * Read the frontmatter schema at runtime and extract the constraints we enforce.
 *
 * Never throws: a missing or malformed bundled schema is returned as `loadError`
 * so `validateSpace` always resolves with a report (surfacing it as an error
 * issue) rather than rejecting — one consistent failure mode for callers.
 */
async function loadSchemaConstraints(): Promise<SchemaConstraints> {
  // Resolved relative to this module so it works from `src/` (dev) and `dist/`
  // (shipped) — both sit one level under the package root, next to `schema/`.
  try {
    const schemaUrl = new URL("../schema/frontmatter.schema.json", import.meta.url);
    const raw = await fs.readFile(schemaUrl, "utf-8");
    const schema = JSON.parse(raw) as {
      properties?: { attached_to?: { pattern?: string } };
    };
    const pattern = schema.properties?.attached_to?.pattern;
    if (!pattern) {
      return {
        attachedToPattern: null,
        loadError: "frontmatter schema is missing properties.attached_to.pattern",
      };
    }
    return { attachedToPattern: new RegExp(pattern), loadError: null };
  } catch (err) {
    return {
      attachedToPattern: null,
      loadError: `could not load frontmatter schema: ${(err as Error).message}`,
    };
  }
}

/** Validate optional root identity without requiring or minting it. */
function checkFoundation(content: string, issues: ConformanceIssue[]): void {
  const path = "_agent/foundation.md";
  const syntax = inspectFrontmatterSyntax(content);
  if (syntax.status === "malformed") {
    issues.push({
      level: "error",
      rule: "foundation-frontmatter-malformed",
      path,
      detail: `foundation frontmatter does not parse: ${syntax.message}`,
    });
    return;
  }

  const fm = parseFrontmatter(content);
  if (fm === null || !("root_node_id" in fm)) return;
  const parsed = parseRootNodeId(fm.root_node_id);
  if (parsed.status === "valid") return;
  const detail = parsed.status === "invalid" && parsed.code === "invalid_format"
    ? "`root_node_id` must match ^n_(?:[0-9a-f]{12}|[0-9a-f]{24})$"
    : "`root_node_id` must be a string when declared";
  issues.push({
    level: "error",
    rule: "root-node-id-invalid",
    path,
    detail,
  });
}

/** Check one knowledge note's frontmatter syntax and schema-key constraints. */
async function checkNote(
  root: string,
  absPath: string,
  constraints: SchemaConstraints,
  issues: ConformanceIssue[],
): Promise<void> {
  const rel = relative(root, absPath);
  const content = await fs.readFile(absPath, "utf-8");

  const syntax = inspectFrontmatterSyntax(content);
  if (syntax.status === "none") return; // no frontmatter — fine, nothing required
  if (syntax.status === "malformed") {
    issues.push({
      level: "error",
      rule: "frontmatter-malformed",
      path: rel,
      detail: `frontmatter does not parse: ${syntax.message}`,
    });
    return;
  }

  const fm = parseFrontmatter(content);
  if (fm === null) return; // empty/non-object frontmatter — nothing to constrain

  // `name` / `summary` are strings if present.
  for (const key of ["name", "summary"] as const) {
    if (key in fm && typeof fm[key] !== "string") {
      issues.push({
        level: "error",
        rule: `${key}-type`,
        path: rel,
        detail: `\`${key}\` must be a string`,
      });
    }
  }

  // `tags` is an array of strings if present.
  if ("tags" in fm) {
    const tags = fm.tags;
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
      issues.push({
        level: "error",
        rule: "tags-type",
        path: rel,
        detail: "`tags` must be an array of strings",
      });
    }
  }

  // `attached_to` is a string matching the schema pattern if present.
  if ("attached_to" in fm) {
    const value = fm.attached_to;
    if (typeof value !== "string") {
      issues.push({
        level: "error",
        rule: "attached-to-type",
        path: rel,
        detail: "`attached_to` must be a single string",
      });
    } else if (constraints.attachedToPattern && !constraints.attachedToPattern.test(value)) {
      issues.push({
        level: "error",
        rule: "attached-to-pattern",
        path: rel,
        detail: `\`attached_to: ${value}\` does not match ${constraints.attachedToPattern.source}`,
      });
    }
  }
}

/** Check skill entry ids and frontmatter names across this space, excluding nested spaces. */
async function checkSkills(root: string, issues: ConformanceIssue[]): Promise<void> {
  for await (const entry of walkSkillEntries(root)) {
    const rel = relative(root, entry.path);
    if (!isPortableSkillName(entry.name)) {
      issues.push({
        level: "error",
        rule: "skill-id-invalid",
        path: rel,
        detail: `skill id \`${entry.name}\` must match ${SKILL_NAME_RE.source} and be at most 64 characters`,
      });
    }

    const content = await fs.readFile(entry.path, "utf-8");
    const syntax = inspectFrontmatterSyntax(content);
    if (syntax.status === "malformed") {
      issues.push({
        level: "error",
        rule: "skill-frontmatter-malformed",
        path: rel,
        detail: `skill frontmatter does not parse: ${syntax.message}`,
      });
      continue;
    }

    const fm = parseFrontmatter(content);
    if (fm === null || !("name" in fm)) {
      issues.push({
        level: "error",
        rule: "skill-name-missing",
        path: rel,
        detail: "skill frontmatter must declare `name`",
      });
      continue;
    }
    if (typeof fm.name !== "string") {
      issues.push({
        level: "error",
        rule: "skill-name-type",
        path: rel,
        detail: "skill frontmatter `name` must be a string",
      });
      continue;
    }
    if (!isPortableSkillName(fm.name)) {
      issues.push({
        level: "error",
        rule: "skill-name-invalid",
        path: rel,
        detail: `skill frontmatter \`name: ${fm.name}\` must match ${SKILL_NAME_RE.source} and be at most 64 characters`,
      });
    }
    if (fm.name !== entry.name) {
      issues.push({
        level: "error",
        rule: "skill-name-mismatch",
        path: rel,
        detail: `skill frontmatter \`name: ${fm.name}\` must equal entry id \`${entry.name}\``,
      });
    }
  }
}

function isPortableSkillName(name: string): boolean {
  return name.length <= 64 && SKILL_NAME_RE.test(name);
}

interface SkillEntrypoint {
  /** Identity from the flat-file stem or Agent Skills directory. */
  name: string;
  path: string;
}

async function* walkSkillEntries(root: string): AsyncGenerator<SkillEntrypoint> {
  yield* walkSkillPositions(root, true);
}

async function* walkSkillPositions(dir: string, isRoot: boolean): AsyncGenerator<SkillEntrypoint> {
  if (!isRoot && await isFile(join(dir, "_agent", "foundation.md"))) return;

  // Reuse awareness's canonical single-level scanner so directory-vs-flat
  // precedence, README exclusion, and regular-file checks cannot drift.
  for (const entry of await discoverSkillEntries([dir])) {
    yield { name: entry.name, path: entry.path };
  }

  let children: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    children = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of children.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.name === "node_modules") continue;
    yield* walkSkillPositions(join(dir, entry.name), false);
  }
}

/** Parse the leading frontmatter block into a plain object, or null if absent/non-object. */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const DELIM = "---";
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trimEnd() !== DELIM) return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trimEnd() === DELIM) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const source = lines.slice(1, end).join("\n");
  const value = parseDocument(source).toJS();
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Yield absolute paths of knowledge `.md` files under `root`.
 *
 * Knowledge is everything NOT under an underscore-prefixed directory, excluding
 * `README.md` (a position descriptor, not a Note). `_assets/` is recognized
 * supporting payload and is skipped silently. Other underscore folders besides
 * `_agent/` are unknown infrastructure — skipped gracefully, with one `warn` per
 * folder so the caller can see what was ignored. Never descends outside `root`.
 */
async function* walkKnowledge(
  root: string,
  issues: ConformanceIssue[],
): AsyncGenerator<string> {
  yield* walkDir(root, root, issues, true);
}

async function* walkDir(
  dir: string,
  root: string,
  issues: ConformanceIssue[],
  isRoot: boolean,
): AsyncGenerator<string> {
  // A deeper foundation starts another space. Its knowledge and agent context
  // are validated from that root, never as part of its parent's report.
  if (!isRoot && await isFile(join(dir, "_agent", "foundation.md"))) return;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) {
        // Underscore folder — never knowledge. `_agent/` is handled separately;
        // recognized `_assets/` is supporting payload; unknown extensions are
        // gracefully ignored and surfaced as one warning.
        if (entry.name !== "_agent" && entry.name !== ASSET_DIRECTORY) {
          issues.push({
            level: "warn",
            rule: "infra-skipped",
            path: relative(root, abs),
            detail: "unknown underscore-prefixed infrastructure folder — skipped (graceful-ignore)",
          });
        }
        continue;
      }
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      yield* walkDir(abs, root, issues, false);
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
      yield abs;
    }
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isFile();
  } catch {
    return false;
  }
}
