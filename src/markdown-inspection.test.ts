import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectMarkdown, inspectMarkdownFile } from "./markdown-inspection.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })));
});

const ACME_NOTE = [
  "---",
  "name: Acme launch plan",
  'summary: "Synthetic plan for an invented launch."',
  "---",
  "# Acme Launch",
  "",
  "ACME_OVERVIEW_BODY_SENTINEL",
  "",
  "## Readiness",
  "",
  "Ready for a synthetic review.",
  "",
  "### Risks",
  "",
  "ACME_RISK_BODY_SENTINEL",
  "",
  "## Decision",
  "",
  "ACME_DECISION_BODY_SENTINEL",
  "",
].join("\n");

describe("inspectMarkdown summary", () => {
  it("returns the Layer-1 summary without loading body content", () => {
    const result = inspectMarkdown(ACME_NOTE, { mode: "summary" });
    expect(result).toEqual({
      mode: "summary",
      summary: "Synthetic plan for an invented launch.",
    });
    expect(JSON.stringify(result)).not.toContain("BODY_SENTINEL");
  });

  it("falls back to the first meaningful non-heading body line", () => {
    expect(
      inspectMarkdown("# Acme\n\nA bounded fallback summary.\n\nMore detail.", {
        mode: "summary",
      }),
    ).toEqual({ mode: "summary", summary: "A bounded fallback summary." });
    expect(inspectMarkdown("# Heading only\n", { mode: "summary" })).toEqual({
      mode: "summary",
      summary: null,
    });
  });
});

describe("inspectMarkdown outline", () => {
  it("returns ATX headings, source lines, levels, and duplicate occurrences only", () => {
    const result = inspectMarkdown(
      [
        "---",
        "# YAML comment, not a heading",
        "summary: Fixture",
        "---",
        "# Acme Plan #",
        "Body sentinel.",
        "## Review",
        "First review body.",
        "### Detail ###",
        "## Review",
        "Second review body.",
        "Setext is prose",
        "---",
      ].join("\n"),
      { mode: "outline" },
    );

    expect(result).toEqual({
      mode: "outline",
      headings: [
        { level: 1, text: "Acme Plan", line: 5, occurrence: 1 },
        { level: 2, text: "Review", line: 7, occurrence: 1 },
        { level: 3, text: "Detail", line: 9, occurrence: 1 },
        { level: 2, text: "Review", line: 10, occurrence: 2 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("body");
    expect(JSON.stringify(result)).not.toContain("Setext");
  });

  it("ignores headings inside backtick and tilde fenced code", () => {
    const result = inspectMarkdown(
      [
        "# Visible",
        "```markdown",
        "## Hidden backtick heading",
        "```",
        "~~~",
        "### Hidden tilde heading",
        "~~~",
        "    ## Indented code heading",
        "## Also visible",
      ].join("\n"),
      { mode: "outline" },
    );
    expect(result).toEqual({
      mode: "outline",
      headings: [
        { level: 1, text: "Visible", line: 1, occurrence: 1 },
        { level: 2, text: "Also visible", line: 9, occurrence: 1 },
      ],
    });
  });
});

describe("inspectMarkdown section", () => {
  it("includes nested subsections and stops at the next equal-or-higher heading", () => {
    const result = inspectMarkdown(ACME_NOTE, {
      mode: "section",
      heading: "Readiness",
    });
    expect(result).toMatchObject({
      mode: "section",
      status: "found",
      query: { heading: "Readiness" },
      heading: { level: 2, text: "Readiness", occurrence: 1 },
    });
    if (result.mode !== "section" || result.status !== "found") throw new Error("section missing");
    expect(result.markdown).toContain("## Readiness");
    expect(result.markdown).toContain("### Risks");
    expect(result.markdown).toContain("ACME_RISK_BODY_SENTINEL");
    expect(result.markdown).not.toContain("## Decision");
    expect(result.markdown).not.toContain("ACME_DECISION_BODY_SENTINEL");
  });

  it("requires an occurrence when an exact heading is duplicated", () => {
    const content = [
      "# Log",
      "## Update",
      "First update.",
      "## Update",
      "Second update.",
    ].join("\n");

    expect(inspectMarkdown(content, { mode: "section", heading: "Update" })).toEqual({
      mode: "section",
      status: "ambiguous",
      query: { heading: "Update" },
      matches: [
        { level: 2, text: "Update", line: 2, occurrence: 1 },
        { level: 2, text: "Update", line: 4, occurrence: 2 },
      ],
    });

    const selected = inspectMarkdown(content, {
      mode: "section",
      heading: "Update",
      occurrence: 2,
    });
    expect(selected).toMatchObject({
      mode: "section",
      status: "found",
      query: { heading: "Update", occurrence: 2 },
      heading: { occurrence: 2, line: 4 },
    });
    if (selected.mode !== "section" || selected.status !== "found") throw new Error("section missing");
    expect(selected.markdown).toBe("## Update\nSecond update.");
  });

  it("returns structured not-found results and validates occurrence", () => {
    expect(inspectMarkdown("# Acme\n", { mode: "section", heading: "Missing" })).toEqual({
      mode: "section",
      status: "not-found",
      query: { heading: "Missing" },
      matches: [],
    });
    expect(
      inspectMarkdown("# Acme\n", {
        mode: "section",
        heading: "Acme",
        occurrence: 2,
      }),
    ).toEqual({
      mode: "section",
      status: "not-found",
      query: { heading: "Acme", occurrence: 2 },
      matches: [{ level: 1, text: "Acme", line: 1, occurrence: 1 }],
    });
    expect(() =>
      inspectMarkdown("# Acme\n", {
        mode: "section",
        heading: "Acme",
        occurrence: 0,
      }),
    ).toThrow("positive integer");
  });

  it("preserves CRLF bytes in the selected source slice", () => {
    const result = inspectMarkdown("# Acme\r\n## Current\r\n\r\nBody.\r\n## Next\r\nLater.\r\n", {
      mode: "section",
      heading: "Current",
    });
    if (result.mode !== "section" || result.status !== "found") throw new Error("section missing");
    expect(result.markdown).toBe("## Current\r\n\r\nBody.\r\n");
  });
});

describe("inspectMarkdownFile", () => {
  it("reads a synthetic local file through the same inspection contract", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "acme-markdown-inspection-"));
    created.push(root);
    const path = join(root, "plan.md");
    await fs.writeFile(path, ACME_NOTE);
    await expect(inspectMarkdownFile(path, { mode: "outline" })).resolves.toMatchObject({
      mode: "outline",
      headings: [
        { text: "Acme Launch" },
        { text: "Readiness" },
        { text: "Risks" },
        { text: "Decision" },
      ],
    });
  });
});
