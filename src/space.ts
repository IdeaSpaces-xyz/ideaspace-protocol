import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CONTRACT_FILES = [
  "foundation",
  "guide",
  "purpose",
  "now",
  "next",
] as const;

export type ContractFile = (typeof CONTRACT_FILES)[number];

export interface ContractEntry {
  /** Absolute path to the file. */
  path: string;
  /** File contents, including frontmatter. */
  content: string;
}

/** The five-file `_agent/` contract. Any subset may be present. */
export type SpaceContract = Partial<Record<ContractFile, ContractEntry>>;

export interface SpaceRoot {
  /** Absolute path to the space root, or null if no `_agent/` was found walking up from cwd. */
  root: string | null;
  /** Files from `_agent/` that exist. Subset of the five-file contract. */
  contract: SpaceContract;
  source: "local" | "none";
}

/**
 * Walk up from `cwd` and return the **nearest** `_agent/` folder — the current
 * branch the caller sits in — plus its parsed five-file contract.
 *
 * Note: "nearest `_agent/`" is *not* the same as the space root. The space root
 * is the level carrying `foundation.md`, which may be several levels up. For the
 * full root → cwd picture (and to distinguish the two), use `walkPathContext`;
 * this is the cheap nearest-branch lookup for callers that only need that.
 *
 * Stops at the filesystem root. Files in `_agent/` outside the five-file
 * contract are ignored — the caller can read them directly via `root` if needed.
 */
export async function findNearestAgent(cwd: string): Promise<SpaceRoot> {
  let dir = resolve(cwd);

  while (true) {
    const agentDir = join(dir, "_agent");
    if (await isDirectory(agentDir)) {
      const contract = await readContract(agentDir);
      return { root: dir, contract, source: "local" };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return { root: null, contract: {}, source: "none" };
    }
    dir = parent;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * @deprecated Misleading name — this returns the *nearest* `_agent/`, not the
 * space root. Use `findNearestAgent` (or `walkPathContext` for the full walk).
 * Kept as an alias for existing callers.
 */
export const findSpaceRoot = findNearestAgent;

/** Read the five-file `_agent/` contract from an `_agent/` directory. */
export async function readContract(agentDir: string): Promise<SpaceContract> {
  const entries: SpaceContract = {};
  await Promise.all(
    CONTRACT_FILES.map(async (name) => {
      const path = join(agentDir, `${name}.md`);
      try {
        const content = await fs.readFile(path, "utf-8");
        entries[name] = { path, content };
      } catch {
        // file absent — skip
      }
    }),
  );
  return entries;
}
