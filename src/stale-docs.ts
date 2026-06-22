import { promises as fs } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseDocument } from "yaml";
import { lastCommitTime } from "./git.js";

/**
 * Stale-doc drift detection — split into policy and comparison.
 *
 *   - `collectDocDependencies` is the **policy**: it reads each doc's
 *     `code_paths` frontmatter to learn what code the doc describes. If the
 *     registry ever moves to a central manifest, only this changes.
 *   - `staleDocSignals` is the **comparison**: a pure git-timestamp check with
 *     no frontmatter knowledge. A doc is stale when any code path it depends on
 *     was committed more recently than the doc itself.
 *
 * Drift is computed from commit time (`git log -1 --format=%ct`), never
 * filesystem mtime — mtimes drift across clone/rebase and would lie.
 */

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

export interface DocDependency {
  /** Doc path, relative to `repoRoot`. */
  path: string;
  /** Code paths the doc declares, relative to `repoRoot`. */
  codePaths: string[];
}

/** Code committed more recently than the doc that describes it. */
export interface StaleSignal {
  kind: "stale";
  /** Doc path, relative to `repoRoot`. */
  doc: string;
  /** Unix committer time (seconds) of the doc's last commit. */
  docTime: number;
  /** The code path whose newer commit triggered the signal. */
  newestCode: string;
  /** Unix committer time (seconds) of that code path's last commit. */
  codeTime: number;
  /** How far the code outran the doc, in seconds (`codeTime - docTime`). */
  staleBySeconds: number;
}

/**
 * The doc declares `code_paths` that no longer exist in the tree — the registry
 * has rotted. Surfaced so precision-first opt-in can't silently degrade: a doc
 * pointing at vanished code is drift the agent should know about.
 */
export interface BrokenRefSignal {
  kind: "broken";
  /** Doc path, relative to `repoRoot`. */
  doc: string;
  /** Declared code paths that don't resolve to a file or directory. */
  missing: string[];
}

export type DriftSignal = StaleSignal | BrokenRefSignal;

/**
 * Scan `docDir` (recursively) for markdown declaring `code_paths` frontmatter.
 * Only docs that opt in are returned — no `code_paths`, no entry, no false
 * positives. Paths are normalized relative to `repoRoot`.
 */
export async function collectDocDependencies(
  repoRoot: string,
  docDir: string,
): Promise<DocDependency[]> {
  const root = resolve(repoRoot);
  const start = resolve(root, docDir);
  const out: DocDependency[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDir: boolean }>;
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })).map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
      }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = join(dir, entry.name);
      if (entry.isDir) {
        if (!SKIP_DIRS.has(entry.name)) await walk(abs);
      } else if (entry.name.endsWith(".md")) {
        const content = await readFileOrNull(abs);
        if (!content) continue;
        const codePaths = readCodePaths(content);
        if (codePaths.length) {
          out.push({ path: relative(root, abs), codePaths });
        }
      }
    }
  }

  await walk(start);
  return out;
}

/**
 * Drift signals for each doc, of two kinds:
 *
 *   - `stale`  — a code dependency was committed more recently than the doc.
 *   - `broken` — a declared `code_paths` entry no longer exists in the tree.
 *
 * Both are emitted independently, so one doc can produce both (some paths gone,
 * others stale). Fresh docs and docs with no comparable history produce
 * nothing. The `broken` check is what keeps precision-first opt-in honest —
 * without it, a rotted registry would just silently stop detecting drift.
 */
export async function staleDocSignals(
  repoRoot: string,
  docs: DocDependency[],
): Promise<DriftSignal[]> {
  const root = resolve(repoRoot);
  const signals: DriftSignal[] = [];

  // Sequential by design: git lookups run one at a time. Session-start drift
  // checks aren't latency-critical and the doc set is small (status-bearing
  // docs only), so we trade a little wall-clock for fewer concurrent spawns.
  for (const { path, codePaths } of docs) {
    // Broken references are independent of doc commit history — a doc pointing
    // at vanished code is drift even if the doc itself is uncommitted.
    const missing: string[] = [];
    for (const code of codePaths) {
      if (!(await exists(join(root, code)))) missing.push(code);
    }
    if (missing.length) signals.push({ kind: "broken", doc: path, missing });

    const docTime = await lastCommitTime(repoRoot, path);
    if (docTime == null) continue; // uncommitted doc — nothing to compare against

    let newestCode = "";
    let codeTime = -1;
    for (const code of codePaths) {
      if (missing.includes(code)) continue; // vanished — covered by broken signal
      const t = await lastCommitTime(repoRoot, code);
      if (t != null && t > codeTime) {
        codeTime = t;
        newestCode = code;
      }
    }
    if (codeTime < 0) continue; // no existing code path had history

    if (codeTime > docTime) {
      signals.push({
        kind: "stale",
        doc: path,
        docTime,
        newestCode,
        codeTime,
        staleBySeconds: codeTime - docTime,
      });
    }
  }

  return signals;
}

/** Read the `code_paths` list from a doc's frontmatter. Tolerant of absence. */
function readCodePaths(content: string): string[] {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return [];
  const lines = content.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return [];

  try {
    const data = parseDocument(lines.slice(1, end).join("\n")).toJSON();
    const raw = data?.code_paths;
    if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
    if (typeof raw === "string") return [raw];
    return [];
  } catch {
    return [];
  }
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/** True if a file or directory exists at `path`. */
async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}
