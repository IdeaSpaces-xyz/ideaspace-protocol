/**
 * Layer 1+2 frontmatter helpers.
 *
 * Layer 1: `name`, `summary` (the writing standard's required fields).
 * Layer 2: `tags`, `attached_to` (entity binding, retrieval).
 *
 * `stripFrontmatter` returns the body — useful for code that needs the prose
 * without parsing semantically. `composeFrontmatter` writes a stable, minimal
 * yaml block; consumers using replace-semantics (`is_write`, `ideaspaces write`)
 * own all fields they want set.
 *
 * `inspectFrontmatterSyntax` uses a YAML parser for the read/validation path:
 * files may be hand-edited or written by third-party tools, and reserved
 * character cases (e.g. unquoted leading backticks) are easy to miss with
 * regex. Semantic parsing/merge-semantics (e.g., existing tags) is still
 * deferred until a use case earns it.
 */

import { parseDocument } from "yaml";

export interface Frontmatter {
  name?: string;
  summary?: string;
  /** Skill trigger hint (SDK skill catalog). Notes use `summary` instead. */
  description?: string;
  tags?: string[];
  attached_to?: string[];
}

const DELIM = "---";

export type FrontmatterSyntax =
  | { status: "none" }
  | { status: "valid" }
  | { status: "malformed"; message: string; line?: number; column?: number };

/**
 * Returns the body of a markdown file with the leading frontmatter block
 * removed. If the input has no frontmatter, returns it unchanged.
 *
 * The frontmatter is recognized as a `---` line at offset 0 followed by a
 * later `---` line. Trailing newline after the closing delimiter is consumed.
 */
export function stripFrontmatter(content: string): string {
  const block = frontmatterBlock(content);
  if (!block) return content;
  // Body starts after the closing delimiter line. Preserve the previous split
  // behavior: a trailing newline after the delimiter is consumed naturally by
  // slicing after that line.
  return block.lines.slice(block.endLineIndex + 1).join("\n");
}

/**
 * Validate a leading YAML frontmatter block.
 *
 * Files without frontmatter are valid for this check (`status: "none"`). A
 * leading `---` without a closing delimiter is treated as malformed because it
 * will fail on the Python/frontmatter side too. Reported line/column positions
 * are relative to the full markdown file, not the extracted YAML string.
 */
export function inspectFrontmatterSyntax(content: string): FrontmatterSyntax {
  if (!startsFrontmatter(content)) return { status: "none" };

  const block = frontmatterBlock(content);
  if (!block) {
    return {
      status: "malformed",
      message: "frontmatter block is missing closing ---",
      line: 1,
      column: 1,
    };
  }

  const source = block.lines
    .slice(1, block.endLineIndex)
    .map((line) => line.replace(/\r$/, ""))
    .join("\n");
  const doc = parseDocument(source);
  const err = doc.errors[0];
  if (!err) return { status: "valid" };

  const linePos = err.linePos?.[0];
  return {
    status: "malformed",
    message: err.message,
    // YAML line 1 is content line 2 because line 1 is the opening delimiter.
    line: linePos ? linePos.line + 1 : undefined,
    column: linePos?.col,
  };
}

/**
 * Extract the `summary` field from frontmatter.
 *
 * Handles three common shapes (Layer 1 use cases):
 *   summary: short string
 *   summary: long string that
 *     continues with implicit indented continuation
 *   summary: |        # or  >
 *     literal/folded scalar block
 *
 * Returns the summary text (concatenated for multi-line values) or null when
 * the file has no frontmatter or no summary field. Quoted values have the
 * surrounding quotes stripped. Doesn't try to handle every yaml edge case —
 * just the patterns Layer 1 frontmatter actually uses.
 */
export function extractSummary(content: string): string | null {
  return extractScalarField(content, "summary");
}

/**
 * Extract the `description` field, falling back to `summary`.
 *
 * Skill frontmatter (the SDK skill catalog) uses `description` as the agent's
 * trigger hint; the writing standard's Notes use `summary`. Surfacing skill
 * blurbs needs to read either — prefer `description`, fall back to `summary`.
 */
export function extractDescription(content: string): string | null {
  return extractScalarField(content, "description") ?? extractScalarField(content, "summary");
}

/** Read a single scalar frontmatter field, handling folded/literal blocks. */
function extractScalarField(content: string, field: string): string | null {
  if (!content.startsWith(`${DELIM}\n`) && !content.startsWith(`${DELIM}\r\n`)) {
    return null;
  }
  const lines = content.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === DELIM) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return null;

  const prefix = `${field}:`;
  let summaryStart = -1;
  for (let i = 1; i < endIdx; i++) {
    if (lines[i].startsWith(prefix)) {
      summaryStart = i;
      break;
    }
  }
  if (summaryStart === -1) return null;

  const parts: string[] = [];
  const firstLineRaw = lines[summaryStart].slice(prefix.length).trim();
  // Skip yaml block-scalar indicators on their own line — `>` / `|` plus the
  // chomp modifiers `>-` / `>+` / `|-` / `|+`. The next-line indented text is
  // the actual content. (Newline preservation isn't honored — for display we
  // always join continuations with spaces.)
  if (firstLineRaw && !/^[>|][+-]?$/.test(firstLineRaw)) {
    parts.push(firstLineRaw);
  }

  for (let i = summaryStart + 1; i < endIdx; i++) {
    const line = lines[i];
    if (/^\s+\S/.test(line)) {
      parts.push(line.trim());
    } else {
      break;
    }
  }

  if (!parts.length) return null;

  let result = parts.join(" ");
  // Quotes are only stripped when both boundaries of the joined value match;
  // a degenerate one-sided case (e.g. `"Part one` joined with `part two"`)
  // would still match and strip, but that pattern doesn't occur in
  // well-formed Layer-1 frontmatter so we accept the simple check.
  if ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1);
  }
  return result || null;
}

/**
 * Compose a stable yaml frontmatter block.
 *
 * Output is sorted by field order (name, summary, tags, attached_to)
 * and uses block-style for arrays. Strings are escaped only if they contain
 * yaml-special characters (colons, quotes, leading dashes); otherwise the
 * raw form is emitted for readability.
 *
 * Empty/undefined fields are omitted. Trailing newline included so callers
 * can concatenate with body directly.
 */
export function composeFrontmatter(fm: Frontmatter): string {
  const lines: string[] = [DELIM];
  if (fm.name !== undefined) lines.push(`name: ${escapeScalar(fm.name)}`);
  if (fm.summary !== undefined) lines.push(`summary: ${escapeScalar(fm.summary)}`);
  if (fm.tags?.length) lines.push(...renderArray("tags", fm.tags));
  if (fm.attached_to?.length) lines.push(...renderArray("attached_to", fm.attached_to));
  lines.push(DELIM, "");
  return lines.join("\n");
}

function escapeScalar(value: string): string {
  if (needsQuoting(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function needsQuoting(value: string): boolean {
  if (value === "") return true;
  // Leading/trailing whitespace, special characters, or yaml indicators.
  if (/^[\s>|*&!%@`]/.test(value)) return true;
  if (/^[-?]\s/.test(value)) return true;
  if (/[:#]\s/.test(value)) return true;
  if (/[{}[\],]/.test(value)) return true;
  if (/[:#]$/.test(value)) return true;
  if (/[\n\r"\\]/.test(value)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) return true;
  if (/^-?\d/.test(value)) return true;
  return false;
}

function renderArray(key: string, items: string[]): string[] {
  return [`${key}:`, ...items.map((v) => `  - ${escapeScalar(v)}`)];
}

function startsFrontmatter(content: string): boolean {
  return content.startsWith(`${DELIM}\n`) || content.startsWith(`${DELIM}\r\n`);
}

function frontmatterBlock(content: string): { lines: string[]; endLineIndex: number } | null {
  if (!startsFrontmatter(content)) return null;
  const lines = content.split("\n");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trimEnd() === DELIM) {
      return { lines, endLineIndex: i };
    }
  }
  return null;
}
