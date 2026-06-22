import { describe, it, expect } from "vitest";
import { stripFrontmatter, composeFrontmatter, extractSummary, extractDescription, inspectFrontmatterSyntax } from "./frontmatter.js";

describe("stripFrontmatter", () => {
  it("returns body when frontmatter present", () => {
    const input = "---\nname: Foo\n---\n# Heading\nBody.";
    expect(stripFrontmatter(input)).toBe("# Heading\nBody.");
  });

  it("returns input unchanged when no frontmatter", () => {
    const input = "# Heading\nBody.";
    expect(stripFrontmatter(input)).toBe(input);
  });

  it("returns input unchanged when leading --- is not at offset 0", () => {
    const input = "Text first\n---\nname: Foo\n---\nBody.";
    expect(stripFrontmatter(input)).toBe(input);
  });

  it("treats unclosed frontmatter as no frontmatter", () => {
    const input = "---\nname: Foo\nBody without close";
    expect(stripFrontmatter(input)).toBe(input);
  });

  it("handles multiline summaries (folded yaml)", () => {
    const input =
      "---\nname: Foo\nsummary: line one\n  continuation\n  more\n---\nBody.";
    expect(stripFrontmatter(input)).toBe("Body.");
  });

  it("handles CRLF line endings on the opening delimiter", () => {
    const input = "---\r\nname: Foo\n---\nBody.";
    expect(stripFrontmatter(input)).toBe("Body.");
  });

  it("preserves body whitespace exactly", () => {
    const input = "---\nname: Foo\n---\n\n# Heading\n\nParagraph.\n";
    expect(stripFrontmatter(input)).toBe("\n# Heading\n\nParagraph.\n");
  });
});

describe("composeFrontmatter", () => {
  it("emits only the fields provided", () => {
    expect(composeFrontmatter({ name: "Foo" })).toBe("---\nname: Foo\n---\n");
  });

  it("orders fields name, summary, tags, attached_to", () => {
    const out = composeFrontmatter({
      attached_to: ["person:alice"],
      tags: ["a"],
      summary: "S",
      name: "N",
    });
    expect(out).toBe(
      "---\nname: N\nsummary: S\ntags:\n  - a\nattached_to:\n  - person:alice\n---\n",
    );
  });

  it("renders arrays in block style", () => {
    const out = composeFrontmatter({ tags: ["one", "two", "three"] });
    expect(out).toBe("---\ntags:\n  - one\n  - two\n  - three\n---\n");
  });

  it("quotes values that need escaping", () => {
    const out = composeFrontmatter({
      name: "Has: colon",
      summary: 'with "quotes"',
    });
    expect(out).toContain('name: "Has: colon"');
    expect(out).toContain('summary: "with \\"quotes\\""');
  });

  it("leaves simple strings unquoted for readability", () => {
    const out = composeFrontmatter({ name: "Foundation", summary: "Baseline." });
    expect(out).toBe("---\nname: Foundation\nsummary: Baseline.\n---\n");
  });

  it("omits empty arrays", () => {
    const out = composeFrontmatter({ name: "Foo", tags: [] });
    expect(out).toBe("---\nname: Foo\n---\n");
  });

  it("emits empty document when no fields", () => {
    expect(composeFrontmatter({})).toBe("---\n---\n");
  });

  it("quotes yaml-keyword values like true/false/null", () => {
    expect(composeFrontmatter({ name: "true" })).toContain('name: "true"');
    expect(composeFrontmatter({ name: "null" })).toContain('name: "null"');
  });

  it("quotes leading dash to avoid collision with sequence indicator", () => {
    expect(composeFrontmatter({ name: "- hyphen-led" })).toContain(
      'name: "- hyphen-led"',
    );
  });

  it("quotes flow-style, trailing-colon, and leading-backtick values", () => {
    expect(composeFrontmatter({ name: "{flow}" })).toContain('name: "{flow}"');
    expect(composeFrontmatter({ name: "label:" })).toContain('name: "label:"');
    expect(composeFrontmatter({ name: "`ideaspace create` — Adopt and Publish" })).toContain(
      'name: "`ideaspace create` — Adopt and Publish"',
    );
  });

  it("output is round-trippable through stripFrontmatter", () => {
    const fm = composeFrontmatter({ name: "Foo", summary: "Bar" });
    const doc = `${fm}# Body\n`;
    expect(stripFrontmatter(doc)).toBe("# Body\n");
  });
});

describe("inspectFrontmatterSyntax", () => {
  it("accepts files without frontmatter", () => {
    expect(inspectFrontmatterSyntax("# Body\n")).toEqual({ status: "none" });
  });

  it("accepts plain valid frontmatter", () => {
    expect(inspectFrontmatterSyntax("---\nname: Foo\nsummary: Bar\n---\n# Body")).toEqual({ status: "valid" });
  });

  it("accepts quoted leading-backtick values", () => {
    expect(
      inspectFrontmatterSyntax('---\nname: "`ideaspace create` — Adopt and Publish"\n---\n# Body'),
    ).toEqual({ status: "valid" });
  });

  it("accepts CRLF frontmatter", () => {
    expect(inspectFrontmatterSyntax("---\r\nname: Foo\r\nsummary: Bar\r\n---\r\n# Body")).toEqual({ status: "valid" });
  });

  it("does not treat embedded dashes as a closing delimiter", () => {
    expect(inspectFrontmatterSyntax("---\nname: foo---\n---\n# Body")).toEqual({ status: "valid" });
  });

  it("rejects unquoted leading-backtick values with a content line and column", () => {
    const result = inspectFrontmatterSyntax(
      "---\nname: `ideaspace create` — Adopt and Publish\n---\n# Body",
    );
    expect(result.status).toBe("malformed");
    if (result.status === "malformed") {
      expect(result.message).toContain("reserved character `");
      expect(result.line).toBe(2);
      expect(result.column).toBe(7);
    }
  });

  it("rejects broken yaml mappings", () => {
    const result = inspectFrontmatterSyntax("---\n: : invalid: yaml\n---\n# Body");
    expect(result.status).toBe("malformed");
  });

  it("accepts an empty frontmatter block", () => {
    expect(inspectFrontmatterSyntax("---\n---\n# Body")).toEqual({ status: "valid" });
  });

  it("rejects an unclosed frontmatter block", () => {
    expect(inspectFrontmatterSyntax("---\nname: Unclosed\n# Body")).toEqual({
      status: "malformed",
      message: "frontmatter block is missing closing ---",
      line: 1,
      column: 1,
    });
  });

  it("rejects a bare opening frontmatter delimiter", () => {
    expect(inspectFrontmatterSyntax("---\n")).toEqual({
      status: "malformed",
      message: "frontmatter block is missing closing ---",
      line: 1,
      column: 1,
    });
  });
});

describe("extractSummary", () => {
  it("returns single-line summary", () => {
    const input = "---\nname: Foo\nsummary: Short summary.\n---\n# Body";
    expect(extractSummary(input)).toBe("Short summary.");
  });

  it("concatenates implicit-continuation multi-line summary", () => {
    const input =
      "---\nname: Foundation\nsummary: Baseline contract for an ideaspace —\n  what kind of place this is, how the agent inhabits it,\n  the rhythm of capture and commit.\n---\n# Body";
    const out = extractSummary(input);
    expect(out).toBe(
      "Baseline contract for an ideaspace — what kind of place this is, how the agent inhabits it, the rhythm of capture and commit.",
    );
  });

  it("handles folded-scalar (>) form", () => {
    const input =
      "---\nname: Foo\nsummary: >\n  Folded line one\n  folded line two\n---\n# Body";
    expect(extractSummary(input)).toBe("Folded line one folded line two");
  });

  it("handles literal-scalar (|) form — joins lines with spaces for display", () => {
    const input =
      "---\nname: Foo\nsummary: |\n  Literal line one\n  literal line two\n---\n# Body";
    expect(extractSummary(input)).toBe("Literal line one literal line two");
  });

  it("handles chomp-modifier scalar forms (>-, >+, |-, |+)", () => {
    for (const indicator of [">-", ">+", "|-", "|+"]) {
      const input =
        `---\nname: Foo\nsummary: ${indicator}\n  chomped line one\n  chomped line two\n---\n# Body`;
      expect(extractSummary(input)).toBe("chomped line one chomped line two");
    }
  });

  it("returns null for an empty summary value", () => {
    const input = "---\nname: Foo\nsummary:\ntags: [a]\n---\n# Body";
    expect(extractSummary(input)).toBeNull();
  });

  it("finds summary even when it's not the first frontmatter field", () => {
    const input =
      "---\nname: Foo\ntags: [a, b]\nattached_to: [person:alice]\nsummary: Found me later.\n---\n# Body";
    expect(extractSummary(input)).toBe("Found me later.");
  });

  it("strips surrounding double quotes", () => {
    const input = '---\nname: Foo\nsummary: "Quoted summary."\n---\n# Body';
    expect(extractSummary(input)).toBe("Quoted summary.");
  });

  it("strips surrounding single quotes", () => {
    const input = "---\nname: Foo\nsummary: 'Quoted summary.'\n---\n# Body";
    expect(extractSummary(input)).toBe("Quoted summary.");
  });

  it("returns null when there's no frontmatter", () => {
    expect(extractSummary("# Just body")).toBeNull();
  });

  it("returns null when frontmatter has no summary field", () => {
    const input = "---\nname: Foo\ntags: [a, b]\n---\n# Body";
    expect(extractSummary(input)).toBeNull();
  });

  it("returns null when frontmatter is unclosed", () => {
    expect(extractSummary("---\nsummary: Hanging\n# never closes")).toBeNull();
  });

  it("stops at the next field, not at the end of frontmatter", () => {
    const input =
      "---\nname: Foo\nsummary: First field summary\ntags:\n  - a\n  - b\n---\n# Body";
    expect(extractSummary(input)).toBe("First field summary");
  });

  it("handles CRLF line endings", () => {
    const input = "---\r\nname: Foo\r\nsummary: CRLF summary.\r\n---\r\nBody";
    expect(extractSummary(input)).toBe("CRLF summary.");
  });
});

describe("extractDescription", () => {
  it("reads the description field", () => {
    const input = "---\nname: skill\ndescription: When to use this skill.\n---\nBody";
    expect(extractDescription(input)).toBe("When to use this skill.");
  });

  it("reads a folded description block", () => {
    const input = "---\nname: skill\ndescription: >\n  line one\n  line two\n---\nBody";
    expect(extractDescription(input)).toBe("line one line two");
  });

  it("falls back to summary when description is absent", () => {
    const input = "---\nname: note\nsummary: A note summary.\n---\nBody";
    expect(extractDescription(input)).toBe("A note summary.");
  });

  it("prefers description over summary when both are present", () => {
    const input = "---\ndescription: the trigger\nsummary: the blurb\n---\nBody";
    expect(extractDescription(input)).toBe("the trigger");
  });

  it("returns null when neither field exists", () => {
    expect(extractDescription("---\nname: x\n---\nBody")).toBeNull();
  });
});
