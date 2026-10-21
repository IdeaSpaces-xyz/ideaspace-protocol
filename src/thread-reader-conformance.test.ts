import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleContentLook, renderContentLook } from "./content-look.js";
import { assembleContentFocus, renderContentFocus } from "./awareness.js";
import type { MapDepth } from "./maps.js";

interface Target {
  id: string;
  position: string;
  kind: "directory" | "markdown";
  name: string;
  summary: string | null;
  surface: string | null;
  children?: string[];
  child_names: string[];
}
interface Manifest {
  format: string;
  fixture: string;
  depths: MapDepth[];
  targets: Target[];
  cap: { target: string; max_children: number; child_names: string[]; omitted_children: number };
  focus: Array<{ target: string; contract_markers: string[]; tree_post?: string }>;
  warnings: {
    folder: string;
    posts: Array<{ file: string; content: string }>;
    expected: Array<{ post: string; field: string; warning: string }>;
  };
  opaque: string[];
}
const here = dirname(fileURLToPath(import.meta.url));
const vectors = join(here, "..", "conformance", "thread-reader");
const manifest = JSON.parse(await fs.readFile(join(vectors, "manifest.json"), "utf-8")) as Manifest;
let temp: string;
let root: string;

beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "thread-reader-vector-"));
  root = join(temp, "space");
  await fs.cp(join(vectors, manifest.fixture), root, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
});
afterAll(async () => { await rm(temp, { recursive: true, force: true }); });

describe("Thread and agent-context reader conformance", () => {
  it("publishes a complete five-rung matrix for folder, README, post and _agent", () => {
    expect(manifest.format).toBe("ideaspaces-thread-reader/v1");
    expect(manifest.depths).toEqual(["name", "summary", "surface", "children", "full"]);
    expect(manifest.targets.map((target) => target.id)).toEqual([
      "folder", "readme", "post", "agent-file", "agent-directory",
    ]);
  });

  for (const target of manifest.targets) {
    for (const depth of manifest.depths) {
      it(`${target.id} / ${depth}`, async () => {
        const result = await assembleContentLook({ position: join(root, target.position), depth });
        expect(result?.status).toBe("ok");
        if (!result || result.status !== "ok") return;
        expect(result.contractRole).toBe("reference");
        expect(result.reference.tree).toBeNull();
        expect(result.reference.contract.every((entry) => entry.placement === "history")).toBe(true);
        expect(result.target).toMatchObject({
          kind: target.kind,
          position: target.position,
          placement: "history",
          name: target.name,
          depth,
          member: { position: target.position, depth },
        });
        expect("root" in result.target.member).toBe(false);
        if (depth === "name") {
          expect(result.target).not.toHaveProperty("summary");
        } else {
          expect(result.target.summary).toBe(target.summary);
        }
        if (depth === "surface" || depth === "full") {
          expect(result.target.surface).toBe(target.surface);
        } else {
          expect(result.target).not.toHaveProperty("surface");
        }
        if (depth === "children" || (depth === "full" && target.kind === "directory")) {
          expect(result.target.children?.map((child) => child.name)).toEqual(target.child_names);
          if (target.children) {
            expect(result.target.children?.map((child) => "position" in child ? child.position : null))
              .toEqual(target.children);
          }
        } else {
          expect(result.target).not.toHaveProperty("children");
        }
      });
    }
  }

  it("full returns one README body and a capped direct post list, never post bodies", async () => {
    const { cap } = manifest;
    const result = await assembleContentLook({
      position: join(root, cap.target), depth: "full", maxChildren: cap.max_children,
    });
    expect(result?.status).toBe("ok");
    if (!result || result.status !== "ok") return;
    expect(result.target.children?.map((child) => child.name)).toEqual(cap.child_names);
    expect(result.target.omittedChildren).toBe(cap.omitted_children);
    expect(result.target.surface).toBe(manifest.targets[0]?.surface);
    expect(JSON.stringify(result.target)).not.toContain("First body.");
    expect(JSON.stringify(result.target)).not.toContain("Next body.");
  });

  it("exposes post-and-field warnings in Thread look without hiding siblings", async () => {
    const { warnings } = manifest;
    const folder = join(root, warnings.folder);
    await fs.mkdir(folder, { recursive: true });
    for (const post of warnings.posts) await fs.writeFile(join(folder, post.file), post.content);
    const looked = await assembleContentLook({ position: folder, depth: "children" });
    expect(looked?.status).toBe("ok");
    if (!looked || looked.status !== "ok") return;
    expect(looked.target.children).toHaveLength(2);
    expect(looked.target.warnings).toEqual(warnings.expected);
    const rendered = renderContentLook(looked);
    expect(rendered).toContain("Warnings:");
    for (const warning of warnings.expected) {
      expect(rendered).toContain(`${warning.post}: ${warning.field}: ${warning.warning}`);
    }
    const postLook = await assembleContentLook({ position: join(folder, warnings.posts[1].file), depth: "summary" });
    expect(postLook?.status).toBe("ok");
    if (!postLook || postLook.status !== "ok") return;
    expect(postLook.target.warnings).toEqual([warnings.expected[1]]);
  });

  for (const vector of manifest.focus) {
    it(`focus / ${vector.target}`, async () => {
      const result = await assembleContentFocus({ position: join(root, vector.target) });
      expect(result?.status).toBe("ok");
      if (!result || result.status !== "ok") return;
      expect(result.contractRole).toBe("reference");
      expect(result.contractSource).toBe("agreement");
      expect(result.position.placement).toBe("history");
      expect(result.contract.every((entry) => entry.placement === "history")).toBe(true);
      const rendered = renderContentFocus(result);
      for (const marker of vector.contract_markers) expect(rendered).toContain(marker);
      expect(rendered).toContain("contract role: reference — read, never composed");
      if (vector.tree_post) {
        expect(result.tree?.entries.some((entry) => entry.name === vector.tree_post)).toBe(true);
        expect(result.tree?.entries.every((entry) => !entry.children?.length)).toBe(true);
      }
    });
  }

  for (const target of manifest.opaque) {
    it(`does not interpret opaque extension ${target}`, async () => {
      expect(await assembleContentLook({ position: join(root, target) })).toBeNull();
      expect(await assembleContentFocus({ position: join(root, target) })).toBeNull();
    });
  }
});
