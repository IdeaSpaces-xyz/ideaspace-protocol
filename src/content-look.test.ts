import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleContentLook,
  renderContentLook,
  type ContentLookManifest,
} from "./content-look.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "is-content-look-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function write(path: string, content: string): Promise<void> {
  await fs.mkdir(join(path, ".."), { recursive: true });
  await fs.writeFile(path, content, "utf-8");
}

async function agreementRoot(): Promise<string> {
  const root = join(tmp, "space");
  await write(join(root, "_agent", "agreement.md"), "# Agreement\n\nREFERENCE TERMS");
  return root;
}

function ok(result: Awaited<ReturnType<typeof assembleContentLook>>): ContentLookManifest {
  expect(result?.status).toBe("ok");
  if (!result || result.status !== "ok") throw new Error("expected successful Content look");
  return result;
}

describe("Content look", () => {
  it("reads every canonical Note rung under one reference-only frame", async () => {
    const root = await agreementRoot();
    const note = join(root, "notes", "decision.md");
    await write(
      note,
      [
        "---",
        "name: Decision",
        "summary: Why the boundary is explicit.",
        "---",
        "# Decision",
        "",
        "The selected frame never becomes caller authority.",
        "",
        "## Evidence",
        "",
        "One exact fixture.",
      ].join("\n"),
    );

    const name = ok(await assembleContentLook({ position: note, depth: "name" }));
    expect(name.contractRole).toBe("reference");
    expect(name.reference.tree).toBeNull();
    expect(name.reference.contract[0]).toMatchObject({
      name: "agreement",
      representation: "full",
      placement: "history",
    });
    expect(name.target).toMatchObject({
      placement: "history",
      position: "notes/decision.md",
      kind: "markdown",
      depth: "name",
      name: "Decision",
      member: {
        position: "notes/decision.md",
        depth: "name",
        disclosure: { name: "Decision" },
      },
    });
    expect(name.target).not.toHaveProperty("summary");
    expect(name.target).not.toHaveProperty("surface");
    expect(name.target).not.toHaveProperty("children");

    const summary = ok(await assembleContentLook({ position: note, depth: "summary" }));
    expect(summary.target.summary).toBe("Why the boundary is explicit.");
    expect(summary.target.member.disclosure).toEqual({
      name: "Decision",
      summary: "Why the boundary is explicit.",
    });

    const surface = ok(await assembleContentLook({ position: note, depth: "surface" }));
    expect(surface.target.surface).toBe(
      "# Decision\n\nThe selected frame never becomes caller authority.\n\n## Evidence\n\nOne exact fixture.",
    );
    expect(surface.target).not.toHaveProperty("children");

    const children = ok(await assembleContentLook({ position: note, depth: "children" }));
    expect(children.target).not.toHaveProperty("surface");
    expect(children.target.children).toEqual([
      { kind: "section", name: "Decision", level: 1, text: "Decision", line: 5, occurrence: 1 },
      { kind: "section", name: "Evidence", level: 2, text: "Evidence", line: 9, occurrence: 1 },
    ]);

    const full = ok(await assembleContentLook({ position: note, depth: "full" }));
    expect(full.target.surface).toBe(surface.target.surface);
    expect(full.target).not.toHaveProperty("children");
    expect(full.target.revision).toBe(surface.target.revision);

    const rendered = renderContentLook(full);
    expect(rendered).toContain("contract role: reference — read, never composed");
    expect(rendered).toContain("REFERENCE TERMS");
    expect(rendered).toContain("Look:\n  position: notes/decision.md");
    expect(rendered).toContain("Surface:\n  # Decision");
    expect(renderContentLook(ok(await assembleContentLook({ position: note, depth: "full" })))).toBe(rendered);
  });

  it("reads directory surface and children without treating README as a child", async () => {
    const root = await agreementRoot();
    const docs = join(root, "docs");
    await write(
      join(docs, "README.md"),
      "---\nname: Documents\nsummary: The working documents.\n---\n# Documents\n\nStart here.",
    );
    await write(join(docs, "alpha.md"), "---\nsummary: Alpha note.\n---\n# Alpha");
    await write(join(docs, "sub", "beta.md"), "# Beta");

    const children = ok(await assembleContentLook({
      position: docs,
      depth: "children",
      maxChildren: 1,
    }));
    expect(children.target).toMatchObject({
      name: "Documents",
      summary: "The working documents.",
      position: "docs",
      depth: "children",
      omittedChildren: 1,
      children: [
        {
          kind: "directory",
          name: "sub",
          position: "docs/sub",
          markdownFiles: 1,
        },
      ],
    });
    expect(children.target).not.toHaveProperty("surface");

    const full = ok(await assembleContentLook({ position: docs, depth: "full" }));
    expect(full.target.surface).toBe("# Documents\n\nStart here.");
    expect(full.target.children).toEqual([
      {
        kind: "directory",
        name: "sub",
        position: "docs/sub",
        markdownFiles: 1,
      },
      {
        kind: "markdown",
        name: "alpha.md",
        position: "docs/alpha.md",
        summary: "Alpha note.",
      },
    ]);
    expect(full.target.children?.some((child) => child.name === "README.md")).toBe(false);
  });

  it("recognizes ordinary Markdown knowledge inside a Git worktree", async () => {
    const root = await agreementRoot();
    const note = join(root, "notes", "git.md");
    await write(note, "---\nsummary: Git-backed note.\n---\n# Git\n");
    const initialized = spawnSync("git", ["init", "-q", "-b", "main"], {
      cwd: root,
      encoding: "utf-8",
    });
    expect(initialized.status, initialized.stderr).toBe(0);

    const looked = ok(await assembleContentLook({ position: note, depth: "summary" }));
    expect(looked.reference.position.repoRoot).toBe(await fs.realpath(root));
    expect(looked.target).toMatchObject({
      kind: "markdown",
      position: "notes/git.md",
      summary: "Git-backed note.",
    });
  });

  it("keeps frame selection neutral and excludes the unselected entrypoint", async () => {
    const root = join(tmp, "dual");
    await write(join(root, "_agent", "agreement.md"), "# Agreement\n\nAGREEMENT SENTINEL");
    await write(join(root, "_agent", "foundation.md"), "# Foundation\n\nFOUNDATION SENTINEL");
    await write(join(root, "note.md"), "---\nsummary: Selected note.\n---\n# Note");

    const unresolved = await assembleContentLook({ position: join(root, "note.md") });
    expect(unresolved).toEqual({
      status: "contract_choice_required",
      kind: "content-look",
      availableSources: ["foundation", "agreement"],
    });
    expect(renderContentLook(unresolved!)).toBe(
      "Contract choice required: select `foundation` or `agreement`.",
    );

    const selected = ok(await assembleContentLook({
      position: join(root, "note.md"),
      contractSource: "agreement",
    }));
    const rendered = renderContentLook(selected);
    expect(rendered).toContain("AGREEMENT SENTINEL");
    expect(rendered).not.toContain("FOUNDATION SENTINEL");
  });

  it("rejects reserved context, non-Markdown files, and invalid limits", async () => {
    const root = await agreementRoot();
    await write(join(root, "data.txt"), "not Content");

    await expect(assembleContentLook({ position: join(root, "_agent", "agreement.md") }))
      .resolves.toBeNull();
    await expect(assembleContentLook({ position: join(root, "data.txt") }))
      .resolves.toBeNull();
    await expect(assembleContentLook({ position: root, depth: "children", maxChildren: -1 }))
      .rejects.toThrow("maxChildren must be a non-negative integer");
  });
});
