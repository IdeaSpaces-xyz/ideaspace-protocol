import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { assembleContentLook } from "./content-look.js";

const vectors = JSON.parse(readFileSync(new URL("../conformance/content-look/paging.json", import.meta.url), "utf8"));
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "is-look-paging-vector-"));
  await fs.mkdir(join(root, "_agent"), { recursive: true });
  await fs.writeFile(join(root, "_agent/agreement.md"), "---\nname: Paging fixture\n---\n# Fixture\n");
  const thread = join(root, vectors.fixture.thread);
  await fs.mkdir(thread, { recursive: true });
  for (let i = 0; i < vectors.fixture.post_count; i++) {
    const id = i === vectors.fixture.fix_index ? vectors.fixture.fix_id : `msg_${String(i).padStart(8, "0")}-fixture`;
    await fs.writeFile(join(thread, `${String(i).padStart(2, "0")}-post.md`),
      `---\nid: ${id}\nname: Post ${i}\n---\n${i === vectors.fixture.fix_index ? "Fixed dev run" : `Post ${i}`}\n`);
  }
  const docs = join(root, vectors.fixture.ordinary_directory);
  await fs.mkdir(join(docs, "sub"), { recursive: true });
  await fs.writeFile(join(docs, "README.md"), "# Folder surface\n");
  await fs.writeFile(join(docs, "sub", "one.md"), "# Nested\n");
  for (let i = 0; i < vectors.fixture.ordinary_note_count; i++) {
    await fs.writeFile(join(docs, `${String(i).padStart(2, "0")}.md`), `# Note ${i}\n`);
  }
});
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("language-neutral Content look page vectors", () => {
  it("publishes a second-implementation page and id fixture", () => {
    expect(vectors.format).toBe("ideaspaces-content-look-paging/v1");
    expect(vectors.vectors.length).toBeGreaterThanOrEqual(7);
  });
  it.each(vectors.vectors)("executes $id", async (vector: any) => {
    const result = await assembleContentLook({
      position: join(root, vector.target), depth: vector.depth,
      ...(vector.limit !== undefined ? { limit: vector.limit } : {}),
      ...(vector.since !== undefined ? { since: vector.since } : {}),
      ...(vector.order !== undefined ? { order: vector.order } : {}),
      ...(vector.postId !== undefined ? { postId: vector.postId } : {}),
    });
    expect(result?.status).toBe(vector.expected.status);
    if (!result || result.status !== "ok") return;
    if (vector.expected.page) expect(result.target.page).toEqual(vector.expected.page);
    if (vector.expected.omitted !== undefined) expect(result.target.omittedChildren).toBe(vector.expected.omitted);
    if (vector.expected.position) expect(result.target.position).toBe(vector.expected.position);
    if (vector.expected.surface_contains) expect(result.target.surface).toContain(vector.expected.surface_contains);
    const names = result.target.children?.map((child) => child.kind === "section" ? child.name : child.position.split("/").at(-1));
    if (vector.expected.first) expect(names?.[0]).toBe(vector.expected.first);
    if (vector.expected.last) expect(names?.at(-1)).toBe(vector.expected.last);
    if (vector.expected.contains) expect(names).toContain(vector.expected.contains);
  });
});
