import { promises as fs } from "node:fs";
import { extractSummary, stripFrontmatter } from "./frontmatter.js";

export type MarkdownInspectionMode = "summary" | "outline" | "section";

export interface MarkdownHeading {
  /** ATX heading depth, 1 through 6. */
  level: number;
  /** Heading text with optional closing `#` markers removed. */
  text: string;
  /** One-based source line in the full Markdown document. */
  line: number;
  /** One-based occurrence among headings with the same exact text. */
  occurrence: number;
}

export type MarkdownInspectionRequest =
  | { mode: "summary" }
  | { mode: "outline" }
  | { mode: "section"; heading: string; occurrence?: number };

export interface MarkdownSummaryInspection {
  mode: "summary";
  summary: string | null;
}

export interface MarkdownOutlineInspection {
  mode: "outline";
  headings: MarkdownHeading[];
}

export interface MarkdownSectionQuery {
  heading: string;
  occurrence?: number;
}

export type MarkdownSectionInspection =
  | {
      mode: "section";
      status: "found";
      query: MarkdownSectionQuery;
      heading: MarkdownHeading;
      /** Exact source slice from the selected heading through its section. */
      markdown: string;
    }
  | {
      mode: "section";
      status: "ambiguous" | "not-found";
      query: MarkdownSectionQuery;
      matches: MarkdownHeading[];
    };

export type MarkdownInspection =
  | MarkdownSummaryInspection
  | MarkdownOutlineInspection
  | MarkdownSectionInspection;

interface SourceLine {
  text: string;
  startOffset: number;
}

interface ParsedHeading extends MarkdownHeading {
  startOffset: number;
}

interface Fence {
  marker: "`" | "~";
  length: number;
}

/**
 * Inspect one Markdown document at a bounded progressive-disclosure rung.
 *
 * Summary prefers Layer-1 frontmatter and otherwise returns the first
 * meaningful non-heading body line. Outline returns ATX headings only. Section
 * selects one exact heading and includes nested subsections until the next
 * equal-or-higher heading. Duplicate headings require a one-based occurrence.
 */
export function inspectMarkdown(
  content: string,
  request: MarkdownInspectionRequest,
): MarkdownInspection {
  if (request.mode === "summary") {
    return { mode: "summary", summary: summarizeMarkdown(content) };
  }

  const parsed = parseHeadings(content);
  const headings = parsed.map(publicHeading);
  if (request.mode === "outline") {
    return { mode: "outline", headings };
  }

  const heading = request.heading.trim();
  if (!heading) throw new TypeError("section heading must not be empty");
  if (
    request.occurrence !== undefined &&
    (!Number.isInteger(request.occurrence) || request.occurrence < 1)
  ) {
    throw new RangeError("section occurrence must be a positive integer");
  }

  const query: MarkdownSectionQuery = request.occurrence === undefined
    ? { heading }
    : { heading, occurrence: request.occurrence };
  const matches = parsed.filter((entry) => entry.text === heading);

  if (request.occurrence === undefined && matches.length > 1) {
    return {
      mode: "section",
      status: "ambiguous",
      query,
      matches: matches.map(publicHeading),
    };
  }

  const selected = request.occurrence === undefined
    ? matches[0]
    : matches.find((entry) => entry.occurrence === request.occurrence);
  if (!selected) {
    return {
      mode: "section",
      status: "not-found",
      query,
      matches: matches.map(publicHeading),
    };
  }

  const selectedIndex = parsed.indexOf(selected);
  const next = parsed
    .slice(selectedIndex + 1)
    .find((entry) => entry.level <= selected.level);
  const endOffset = next?.startOffset ?? content.length;
  return {
    mode: "section",
    status: "found",
    query,
    heading: publicHeading(selected),
    markdown: content.slice(selected.startOffset, endOffset),
  };
}

/** Read and inspect a local Markdown file without network or writes. */
export async function inspectMarkdownFile(
  path: string,
  request: MarkdownInspectionRequest,
): Promise<MarkdownInspection> {
  return inspectMarkdown(await fs.readFile(path, "utf-8"), request);
}

/** Canonical summary-rung description used by awareness and inspection. */
export function summarizeMarkdown(content: string): string | null {
  const summary = extractSummary(content);
  if (summary) return summary;
  const body = stripFrontmatter(content);
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    return line;
  }
  return null;
}

function parseHeadings(content: string): ParsedHeading[] {
  const lines = sourceLines(content);
  const frontmatterEnd = frontmatterEndLine(lines);
  const occurrences = new Map<string, number>();
  const headings: ParsedHeading[] = [];
  let fence: Fence | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lineIndex <= frontmatterEnd) continue;
    const line = lines[lineIndex]!;

    const marker = fenceMarker(line.text);
    if (fence) {
      if (
        marker &&
        marker.marker === fence.marker &&
        marker.length >= fence.length &&
        marker.closing
      ) {
        fence = null;
      }
      continue;
    }
    if (marker) {
      fence = { marker: marker.marker, length: marker.length };
      continue;
    }

    const match = line.text.match(/^ {0,3}(#{1,6})(?:[\t ]+|$)(.*)$/);
    if (!match) continue;
    const level = match[1]!.length;
    const text = (match[2] ?? "")
      .replace(/[\t ]+#+[\t ]*$/, "")
      .trim();
    const occurrence = (occurrences.get(text) ?? 0) + 1;
    occurrences.set(text, occurrence);
    headings.push({
      level,
      text,
      line: lineIndex + 1,
      occurrence,
      startOffset: line.startOffset,
    });
  }

  return headings;
}

function publicHeading(heading: ParsedHeading): MarkdownHeading {
  return {
    level: heading.level,
    text: heading.text,
    line: heading.line,
    occurrence: heading.occurrence,
  };
}

function sourceLines(content: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let startOffset = 0;
  while (startOffset < content.length) {
    const newline = content.indexOf("\n", startOffset);
    const endOffset = newline === -1 ? content.length : newline;
    lines.push({
      text: content.slice(startOffset, endOffset).replace(/\r$/, ""),
      startOffset,
    });
    if (newline === -1) break;
    startOffset = newline + 1;
  }
  return lines;
}

function frontmatterEndLine(lines: SourceLine[]): number {
  if (lines[0]?.text !== "---") return -1;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index]!.text.trimEnd() === "---") return index;
  }
  return -1;
}

function fenceMarker(
  line: string,
): { marker: "`" | "~"; length: number; closing: boolean } | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  const run = match[1]!;
  const marker = run[0] as "`" | "~";
  const tail = match[2] ?? "";
  // Backtick info strings cannot contain a backtick. If they do, this line is
  // ordinary Markdown rather than a fence opener.
  if (marker === "`" && tail.includes("`")) return null;
  return {
    marker,
    length: run.length,
    closing: tail.trim() === "",
  };
}
