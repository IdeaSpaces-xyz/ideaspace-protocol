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

/**
 * The five-file `_agent/` contract. Any subset may be present.
 *
 * Optional `_agent/` files outside this narrative contract — `schema.md`
 * (folder instance-shape guidance) and the `skills/`/`perspectives/`/`<agent-id>/`
 * subfolders — are gracefully ignored here: they are shape the reader recognizes
 * but does not parse into the contract. `schema.md` is guidance, never validation.
 */
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

/** A composed contract entry, tagged with the `_agent/` level it resolved from. */
export interface ComposedContractEntry extends ContractEntry {
  /** Absolute path of the `_agent/` directory this entry came from. */
  level: string;
}

/** The effective five-file contract composed along a path. */
export type ComposedContract = Partial<Record<ContractFile, ComposedContractEntry>>;

/** One `_agent/` level along the root → position walk, with its full contract. */
export interface ContractLevel {
  /** Absolute directory carrying the `_agent/` (the position, not the `_agent/` folder itself). */
  dir: string;
  /** Every contract file present at this level. */
  contract: SpaceContract;
}

export interface ComposedSpace {
  /** The position the composition was resolved for (absolute). */
  position: string;
  /**
   * The space root — the nearest ancestor (inclusive of `position`) whose
   * `_agent/` carries `foundation.md`. `null` if none was found up to the
   * filesystem root (a space without a foundation).
   */
  spaceRoot: string | null;
  /**
   * The effective contract per the fractal rule: `foundation` from the space
   * root; `guide`/`purpose`/`now`/`next` from the deepest level (closest to
   * `position`) that carries each — the nearest instruction wins on conflict.
   * Every entry is tagged with the `level` it resolved from. This is a reading
   * of `stack`, not a replacement for it: ancestor entries stay available there.
   */
  contract: ComposedContract;
  /**
   * The full contract stack, space root first, position-most last. Nothing is
   * dropped: every `_agent/` level found within the space appears with every
   * contract file it carries. Deeper levels narrow or override for their
   * branch; they never delete ancestor context. Readers that render or reason
   * about the whole agreement should use this; `contract` is the effective
   * per-file resolution of it.
   */
  stack: ContractLevel[];
  /** Every `_agent/` directory found from `position` up to the space root, deepest (position-most) first. */
  levels: string[];
}

/**
 * Compose the `_agent/` contract along the path from `position` up to its
 * space root, per the spec's fractal rule: the agent carries the **full stack**
 * root → position (`stack`), with the effective per-file resolution in
 * `contract` — `foundation` from the space root, the other files from the
 * deepest level that carries each (nearest instruction wins). A branch with no
 * `_agent/` inherits its ancestors'; deeper levels narrow, they never delete.
 *
 * The walk stops at the first ancestor (closest to `position`) whose `_agent/`
 * carries `foundation.md` — that directory *is* the space root, so composition
 * never crosses into a parent space. If no foundation is found up to the
 * filesystem root, `spaceRoot` is `null` and the result is bounded by the
 * outermost `_agent/` found.
 */
export async function composeContractAlongPath(position: string): Promise<ComposedSpace> {
  const start = resolve(position);
  const found: Array<{ dir: string; contract: SpaceContract }> = [];
  let spaceRoot: string | null = null;

  let dir = start;
  while (true) {
    const agentDir = join(dir, "_agent");
    if (await isDirectory(agentDir)) {
      const contract = await readContract(agentDir);
      found.push({ dir, contract });
      if (contract.foundation) {
        // foundation marks the space root — stop, never cross into a parent space
        spaceRoot = dir;
        break;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const contract: ComposedContract = {};

  // foundation: from the space root only.
  if (spaceRoot) {
    const rootEntry = found.find((f) => f.dir === spaceRoot)?.contract.foundation;
    if (rootEntry) contract.foundation = { ...rootEntry, level: spaceRoot };
  }

  // guide / purpose / now / next: deepest-present (`found` is deepest-first).
  for (const name of ["guide", "purpose", "now", "next"] as const) {
    for (const level of found) {
      const entry = level.contract[name];
      if (entry) {
        contract[name] = { ...entry, level: level.dir };
        break;
      }
    }
  }

  // `found` is deepest-first; the stack reads root-first.
  const stack: ContractLevel[] = [...found]
    .reverse()
    .map(({ dir: levelDir, contract: levelContract }) => ({
      dir: levelDir,
      contract: levelContract,
    }));

  return {
    position: start,
    spaceRoot,
    contract,
    stack,
    levels: found.map((f) => f.dir),
  };
}
