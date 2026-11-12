import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  REPOSITORY_IMAGE_FIELD,
  REPOSITORY_IMAGE_MAX_BYTES,
  REPOSITORY_IMAGE_SOURCE,
  REPOSITORY_IMAGE_TYPES,
  checkRepositoryImageBytes,
  checkSvgImageText,
  resolveRepositoryImageDeclaration,
} from "./assets.js";
import { problemMessage, readRepositoryImage } from "./repository-image.js";
import { assembleContentLook, renderContentLook, type ContentLookManifest } from "./content-look.js";
import type { MapDepth } from "./maps.js";
import * as root from "./index.js";

type Entry = { text: string } | { base64: string } | { fill: { prefix_base64: string; size: number } } | { symlink: string };
type Expected =
  | { status: "none" }
  | { status: "declared"; path: string; media_type: string }
  | { status: "invalid"; code: string }
  | { status: "ok"; path: string; media_type: string }
  | { status: "problem"; code: string; declared?: string };

interface Vector {
  id: string;
  operation: "declaration" | "read" | "svg" | "look";
  covers: string[];
  cases?: Array<{ value?: unknown; absent?: boolean; text?: string; expected: Expected | string }>;
  tree?: Record<string, Entry>;
  beside?: Record<string, Entry>;
  expected?: Expected;
  looks?: Array<{
    position: string;
    depth: MapDepth;
    expected_image: Expected | null;
    expected_render_line?: string;
    expected_render_prefix?: string;
  }>;
}

const manifest = JSON.parse(
  readFileSync(new URL("../conformance/assets/repository-image.json", import.meta.url), "utf-8"),
) as {
  format: string;
  field: string;
  source: string;
  max_bytes: number;
  media_types: Record<string, string>;
  required_coverage: string[];
  vectors: Vector[];
};

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function materialize(base: string, entries: Record<string, Entry>): Promise<void> {
  for (const [path, entry] of Object.entries(entries)) {
    const destination = join(base, ...path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    if ("text" in entry) await writeFile(destination, entry.text, "utf-8");
    else if ("base64" in entry) await writeFile(destination, Buffer.from(entry.base64, "base64"));
    else if ("fill" in entry) {
      const bytes = Buffer.alloc(entry.fill.size);
      Buffer.from(entry.fill.prefix_base64, "base64").copy(bytes);
      await writeFile(destination, bytes);
    } else await symlink(entry.symlink, destination);
  }
}

/** A sandbox holding `space/` (the tree) and the `beside` entries next to it. */
async function sandbox(vector: Vector, git = false): Promise<string> {
  const outer = await mkdtemp(join(tmpdir(), "is-repository-image-"));
  temporary.push(outer);
  const space = join(outer, "space");
  await mkdir(space);
  await materialize(space, vector.tree ?? {});
  await materialize(outer, vector.beside ?? {});
  if (git) execFileSync("git", ["init", "-q", space]);
  return space;
}

function asWire(result: Awaited<ReturnType<typeof readRepositoryImage>>): Expected {
  if (result.status === "none") return { status: "none" };
  if (result.status === "ok") return { status: "ok", path: result.image.path, media_type: result.image.mediaType };
  return { status: "problem", code: result.code };
}

describe("repository image conformance manifest", () => {
  it("matches the reference constants and declares complete coverage", () => {
    expect(manifest.format).toBe("ideaspaces-repository-image/v1");
    expect(manifest.field).toBe(REPOSITORY_IMAGE_FIELD);
    expect(manifest.source).toBe(REPOSITORY_IMAGE_SOURCE);
    expect(manifest.max_bytes).toBe(REPOSITORY_IMAGE_MAX_BYTES);
    expect(manifest.media_types).toEqual({ ...REPOSITORY_IMAGE_TYPES });
    const covered = new Set(manifest.vectors.flatMap((vector) => vector.covers));
    for (const requirement of manifest.required_coverage) expect(covered.has(requirement), requirement).toBe(true);
  });

  it.each(manifest.vectors)("executes $id", async (vector) => {
    switch (vector.operation) {
      case "declaration":
        for (const testCase of vector.cases!) {
          const result = resolveRepositoryImageDeclaration(testCase.absent ? undefined : testCase.value);
          const wire = result.status === "declared"
            ? { status: "declared", path: result.path, media_type: result.mediaType }
            : result;
          expect(wire, JSON.stringify(testCase.value)).toEqual(testCase.expected);
        }
        break;
      case "svg":
        for (const testCase of vector.cases!) {
          expect(checkSvgImageText(testCase.text!), JSON.stringify(testCase.text)).toBe(testCase.expected);
        }
        break;
      case "read": {
        const space = await sandbox(vector);
        const result = await readRepositoryImage(space);
        expect(asWire(result)).toEqual(vector.expected);
        if (result.status === "problem") expect(result.message.length).toBeGreaterThan(0);
        break;
      }
      case "look": {
        const space = await sandbox(vector, true);
        for (const look of vector.looks!) {
          const result = await assembleContentLook({ position: join(space, look.position), depth: look.depth });
          expect(result?.status, `${look.position} at ${look.depth}`).toBe("ok");
          const manifest = result as ContentLookManifest;
          const image = manifest.target.image;
          const wire = image === undefined
            ? null
            : image.status === "ok"
              ? { status: "ok", path: image.path, media_type: image.mediaType }
              : { status: "problem", code: image.code, ...(image.declared !== undefined ? { declared: image.declared } : {}) };
          expect(wire, `${look.position} at ${look.depth}`).toEqual(look.expected_image);
          const rendered = renderContentLook(manifest).split("\n");
          if (look.expected_render_line) expect(rendered).toContain(look.expected_render_line);
          if (look.expected_render_prefix) expect(rendered.some((line) => line.startsWith(look.expected_render_prefix!))).toBe(true);
          if (look.expected_image === null) expect(rendered.some((line) => line.startsWith("  image:"))).toBe(false);
        }
        break;
      }
    }
  });
});

describe("repository image reference behaviour", () => {
  it("is exported from the package root", () => {
    expect(root.readRepositoryImage).toBe(readRepositoryImage);
    expect(root.resolveRepositoryImageDeclaration).toBe(resolveRepositoryImageDeclaration);
    expect(root.checkSvgImageText).toBe(checkSvgImageText);
  });

  it("checks size before the signature", () => {
    const png = new Uint8Array(REPOSITORY_IMAGE_MAX_BYTES + 1);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkRepositoryImageBytes("image/png", png)).toEqual({ ok: false, code: "too_large" });
    expect(checkRepositoryImageBytes("image/png", png.subarray(0, 8))).toEqual({ ok: true });
  });

  it("gives every problem a sentence that names the declared value", () => {
    for (const code of ["not_a_string", "invalid_reference", "outside_root", "not_in_assets", "unsupported_type",
      "missing", "too_large", "type_mismatch", "unsafe_svg"] as const) {
      const message = problemMessage(code, "_assets/x.png");
      expect(message).toMatch(/\.$/);
      if (code !== "not_a_string") expect(message).toContain("_assets/x.png");
    }
  });

  it("changes a root look's revision when the image changes, and not otherwise", async () => {
    const outer = await mkdtemp(join(tmpdir(), "is-repository-image-rev-"));
    temporary.push(outer);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    await mkdir(join(outer, "_assets"));
    await writeFile(join(outer, "_assets", "a.png"), png);
    await writeFile(join(outer, "_assets", "b.png"), png);
    execFileSync("git", ["init", "-q", outer]);
    const revision = async (readme: string) => {
      await writeFile(join(outer, "README.md"), readme, "utf-8");
      const look = (await assembleContentLook({ position: outer, depth: "summary" })) as ContentLookManifest;
      return look.target.revision;
    };
    const without = await revision("---\nname: X\nsummary: Y\n---\n");
    const a = await revision("---\nname: X\nsummary: Y\nimage: _assets/a.png\n---\n");
    const b = await revision("---\nname: X\nsummary: Y\nimage: _assets/b.png\n---\n");
    expect(new Set([without, a, b]).size).toBe(3);
    expect(await revision("---\nname: X\nsummary: Y\n---\n")).toBe(without);
  });
});
