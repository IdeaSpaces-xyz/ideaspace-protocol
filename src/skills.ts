import { extractDescription } from "./frontmatter.js";
import { SKILL_CATALOG } from "./skill-catalog.generated.js";

/**
 * The SDK skill catalog — the distribution-canonical reference content.
 *
 * Content is **compiled in** (see `scripts/embed-skills.mjs`, which bakes
 * `skills/*.md` into `skill-catalog.generated.ts`), so `listSkills`/`readSkill`
 * work identically whether the SDK is read from `node_modules` or bundled into
 * a consumer (the MCP server, any esbuild'd tool). No filesystem, no
 * `import.meta.url` path resolution — bundling can't break it.
 *
 * A skill's identity is its file stem (`awareness.md` → `awareness`). The blurb
 * comes from `description` frontmatter, falling back to `summary`.
 */

export interface SkillInfo {
  /** Skill id — the file stem. */
  name: string;
  /** Trigger-hint blurb from `description` frontmatter (or `summary`). */
  description: string | null;
}

export interface Skill extends SkillInfo {
  /** Full markdown, including frontmatter. */
  content: string;
}

/** List the catalog: every skill's id + blurb, sorted by id. */
export async function listSkills(): Promise<SkillInfo[]> {
  return Object.keys(SKILL_CATALOG)
    .sort()
    .map((name) => ({ name, description: extractDescription(SKILL_CATALOG[name]) }));
}

/** Read one skill by id. Throws if the skill doesn't exist. */
export async function readSkill(name: string): Promise<Skill> {
  // Guard kept for callers that pass arbitrary ids (e.g. MCP resource reads).
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`Invalid skill name: ${name}`);
  }
  const content = SKILL_CATALOG[name];
  if (content === undefined) throw new Error(`Unknown skill: ${name}`);
  return { name, description: extractDescription(content), content };
}
