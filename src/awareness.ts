import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { SpaceContract } from "./space.js";
import { stripFrontmatter, extractSummary } from "./frontmatter.js";
import { recentActivity } from "./git.js";

export interface AssembleAwarenessOpts {
  /** Absolute path to the space root. */
  root: string;
  /** Parsed five-file contract from `findSpaceRoot`. */
  contract: SpaceContract;
  /** Optional commit SHA from a previous session — surfaces a "since last session" diff. */
  lastSha?: string;
  /** Cap on changes listed before truncation. Default: 15. */
  maxChanges?: number;
  /** Cap on the Now first-line excerpt. Default: 200 characters. */
  nowExcerptLength?: number;
  /** Cap on per-summary length when surfacing contract / skill summaries. Default: 200 characters. */
  summaryExcerptLength?: number;
}

const SKIP_DIRS = new Set([
  "_agent",
  "node_modules",
  ".git",
  ".github",
  ".vscode",
  ".idea",
  "dist",
  "build",
]);

const CONTRACT_ORDER = ["foundation", "guide", "purpose", "now", "next"] as const;

/**
 * Format the awareness block surfaced at session start.
 *
 * Shape (sections present only when there's content for them):
 *   Now: <first content line of now.md>
 *
 *   Tree (N files):
 *     dir1/ (count)
 *     dir2/
 *     file1.md
 *
 *   Agent context:
 *     foundation — <summary>
 *     guide — <summary>
 *     ...
 *
 *   Operating skills:
 *     commit — <summary>
 *
 *   Since last session (M changes):
 *     M  path/changed.md
 *     A  path/added.md
 *     ... and N more
 *
 * Each contract / skill entry shows its Layer 1 frontmatter summary so the
 * agent can orient without reading every file. Files without a summary fall
 * back to the first content line.
 *
 * No external dependencies. Git changes shell out to the local `git` binary.
 */
export async function assembleAwareness(
  opts: AssembleAwarenessOpts,
): Promise<string> {
  const {
    root,
    contract,
    lastSha,
    maxChanges = 15,
    nowExcerptLength = 200,
    summaryExcerptLength = 200,
  } = opts;
  const sections: string[] = [];

  const nowLine = extractNowLine(contract, nowExcerptLength);
  if (nowLine) sections.push(`Now: ${nowLine}`);

  const tree = await buildTreeSection(root);
  if (tree) sections.push(tree);

  const agentContext = buildAgentContextSection(contract, summaryExcerptLength);
  if (agentContext) sections.push(agentContext);

  const skills = await buildSkillsSection(root, summaryExcerptLength);
  if (skills) sections.push(skills);

  if (lastSha) {
    const { changedFiles } = await recentActivity(root, lastSha);
    if (changedFiles.length) {
      const total = changedFiles.length;
      const head = changedFiles.slice(0, maxChanges);
      const lines = [`Since last session (${total} changes):`];
      for (const c of head) lines.push(`  ${c.status}\t${c.path}`);
      if (total > maxChanges) lines.push(`  ... and ${total - maxChanges} more`);
      sections.push(lines.join("\n"));
    }
  }

  return sections.join("\n\n");
}

function buildAgentContextSection(
  contract: SpaceContract,
  max: number,
): string | null {
  const present = CONTRACT_ORDER.filter((name) => contract[name]);
  if (!present.length) return null;
  const lines = ["Agent context:"];
  for (const name of present) {
    const entry = contract[name]!;
    const blurb = describeFile(entry.content, max);
    lines.push(blurb ? `  ${name} — ${blurb}` : `  ${name}`);
  }
  return lines.join("\n");
}

async function buildSkillsSection(root: string, max: number): Promise<string | null> {
  const skillsDir = join(root, "_agent", "skills");
  let entries: string[];
  try {
    entries = (await fs.readdir(skillsDir))
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch {
    return null;
  }
  if (!entries.length) return null;

  // Parallel reads — matches `readContract` in space.ts.
  const blurbs = await Promise.all(
    entries.map(async (file) => {
      try {
        const content = await fs.readFile(join(skillsDir, file), "utf-8");
        return describeFile(content, max);
      } catch {
        return null;
      }
    }),
  );

  const lines = ["Operating skills:"];
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i].replace(/\.md$/, "");
    const blurb = blurbs[i];
    lines.push(blurb ? `  ${name} — ${blurb}` : `  ${name}`);
  }
  return lines.join("\n");
}

function describeFile(content: string, max: number): string | null {
  const summary = extractSummary(content);
  if (summary) return truncate(summary, max);
  // Fallback: first non-blank, non-heading body line. Layer-1 files should
  // carry a summary; this fallback is for imperfect or legacy files only.
  const body = stripFrontmatter(content);
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    return truncate(line, max);
  }
  return null;
}

function extractNowLine(contract: SpaceContract, max: number): string | null {
  if (!contract.now) return null;
  const body = stripFrontmatter(contract.now.content);
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith(">")) {
      const stripped = line.replace(/^>+\s*/, "").trim();
      if (stripped) return truncate(stripped, max);
      continue;
    }
    return truncate(line, max);
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`;
}

async function buildTreeSection(root: string): Promise<string | null> {
  let entries: Array<{ name: string; isDir: boolean }>;
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    entries = dirents
      .filter((e) => !e.name.startsWith(".") || e.name === ".gitignore")
      .map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return null;
  }

  const dirs = entries
    .filter((e) => e.isDir && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();
  const files = entries
    .filter((e) => !e.isDir && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();

  if (!dirs.length && !files.length) return null;

  const totalFiles = await countMarkdown(root);
  const lines: string[] = [`Tree (${totalFiles} files):`];

  for (const d of dirs) {
    const count = await countMarkdown(join(root, d));
    lines.push(count ? `  ${d}/ (${count})` : `  ${d}/`);
  }
  for (const f of files) lines.push(`  ${f}`);

  return lines.join("\n");
}

async function countMarkdown(dir: string): Promise<number> {
  let count = 0;
  let dirents: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of dirents) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      count += await countMarkdown(join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}
