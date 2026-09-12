import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleContentAwareness,
  assembleContentFocus,
  renderContentAwareness,
  renderContentFocus,
  type ContentFocusTreeEntry,
} from "./awareness.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "is-content-focus-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function writeAgent(root: string, files: Record<string, string>): Promise<void> {
  const agentDir = join(root, "_agent");
  await fs.mkdir(agentDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      fs.writeFile(join(agentDir, name), content, "utf-8"),
    ),
  );
}

describe("Content focus", () => {
  it("loads one target as history reference without changing the caller head", async () => {
    const caller = join(tmp, "caller");
    const target = join(tmp, "target");
    await writeAgent(caller, {
      "agreement.md": "# Caller Agreement\n\nCALLER TERMS",
    });
    await writeAgent(target, {
      "agreement.md": "# Target Agreement\n\nTARGET TERMS",
      "purpose.md": "---\nsummary: Target purpose.\n---\nPURPOSE BODY",
    });
    await fs.mkdir(join(target, "_agent", "skills"), { recursive: true });
    await fs.writeFile(
      join(target, "_agent", "skills", "answer.md"),
      "---\nname: answer\ndescription: Answer from the target's point of view.\n---\n# Answer",
      "utf-8",
    );
    await fs.mkdir(join(target, "docs", "deep"), { recursive: true });
    await fs.writeFile(
      join(target, "docs", "README.md"),
      "---\nsummary: Target documents.\n---\n# Docs",
      "utf-8",
    );
    await fs.writeFile(join(target, "docs", "deep", "note.md"), "# Deep", "utf-8");
    await fs.writeFile(join(target, "README.md"), "---\nsummary: Target root.\n---\n# Target", "utf-8");

    const head = await assembleContentAwareness({ position: caller, lastSha: null });
    expect(head?.status).toBe("ok");
    if (!head || head.status !== "ok") return;
    const headBefore = JSON.stringify(head);
    const renderedHead = renderContentAwareness(head);

    const focus = await assembleContentFocus({ position: target });

    expect(JSON.stringify(head)).toBe(headBefore);
    expect(renderContentAwareness(head)).toBe(renderedHead);
    expect(focus).toMatchObject({
      status: "ok",
      kind: "content-focus",
      contractRole: "reference",
      contractSource: "agreement",
      position: { placement: "history" },
      tree: {
        placement: "history",
        totalMarkdownFiles: 3,
        entries: [
          {
            name: "docs",
            placement: "history",
            kind: "directory",
            markdownFiles: 2,
            summary: "Target documents.",
          },
          {
            name: "README.md",
            placement: "history",
            kind: "markdown",
            summary: "Target root.",
          },
        ],
      },
      contract: [
        {
          name: "agreement",
          representation: "full",
          content: expect.stringContaining("TARGET TERMS"),
          placement: "history",
        },
        {
          name: "purpose",
          representation: "summary",
          summary: "Target purpose.",
          placement: "history",
        },
      ],
      skills: [
        {
          name: "answer",
          representation: "summary",
          summary: "Answer from the target's point of view.",
          placement: "history",
        },
      ],
    });
    if (!focus || focus.status !== "ok") return;
    expect(focus.tree?.entries[0]?.children).toBeUndefined();
    expect(allTreeEntriesAreHistory(focus.tree?.entries ?? [])).toBe(true);

    const renderedFocus = renderContentFocus(focus);
    expect(renderedFocus).toContain(
      "contract role: reference — read, never composed",
    );
    expect(renderedFocus).toContain("TARGET TERMS");
    expect(renderedFocus).not.toContain("PURPOSE BODY");
    expect(renderedFocus).not.toContain("CALLER TERMS");
    expect(`${renderedHead}\n\n${renderedFocus}`.match(/^Position:/gm)).toHaveLength(1);
    expect(`${renderedHead}\n\n${renderedFocus}`.match(/^Focus:/gm)).toHaveLength(1);

    const repeated = await assembleContentFocus({ position: target });
    expect(repeated?.status).toBe("ok");
    expect(renderContentFocus(repeated!)).toBe(renderedFocus);
  });

  it("preserves neutral frame selection and renders its diagnostics", async () => {
    await writeAgent(tmp, {
      "foundation.md": "FOUNDATION SENTINEL",
      "agreement.md": "AGREEMENT SENTINEL",
    });

    const unresolved = await assembleContentFocus({ position: tmp });
    expect(unresolved).toEqual({
      status: "contract_choice_required",
      kind: "content-focus",
      availableSources: ["foundation", "agreement"],
    });
    expect(renderContentFocus(unresolved!)).toBe(
      "Contract choice required: select `foundation` or `agreement`.",
    );

    const selected = await assembleContentFocus({
      position: tmp,
      contractSource: "agreement",
    });
    expect(selected).toMatchObject({
      status: "ok",
      contractRole: "reference",
      contractSource: "agreement",
      contract: [{ name: "agreement", placement: "history" }],
    });
    expect(JSON.stringify(selected)).not.toContain("FOUNDATION SENTINEL");
  });
});

function allTreeEntriesAreHistory(entries: ContentFocusTreeEntry[]): boolean {
  return entries.every(
    (entry) =>
      entry.placement === "history" &&
      allTreeEntriesAreHistory(entry.children ?? []),
  );
}
