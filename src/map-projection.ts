import type {
  ContentAwarenessTree,
  ContentAwarenessTreeEntry,
} from "./awareness.js";
import type {
  MapAddressMember,
  MapMember,
  MapPositionMember,
} from "./maps.js";

/** Canonical floor hints shared by local awareness harnesses. */
export const BARE_WORKSPACE_HINT =
  "You're at a workspace folder (no `_agent/` contract here). Navigate into a repo below (`ideaspaces navigate <repo>`), or pull one that's behind.";
export const EMPTY_WORKSPACE_HINT =
  "You're at a workspace folder with no repos yet. Clone one to get started (`ideaspaces clone`).";

/** Presentation-only facts retained beside a projected tree member. */
export interface ContentTreeMemberPresentation {
  kind: "directory" | "markdown";
  /** One-based tree level, used only for local rendering. */
  level: number;
  /** Recursive Markdown count for a directory. */
  markdownFiles?: number;
  /** Children omitted by the local per-directory cap. */
  omittedChildren?: number;
}

/** One portable member shape plus local rendering facts that never enter the Map. */
export interface ProjectedContentTreeMember {
  member: MapPositionMember;
  presentation: ContentTreeMemberPresentation;
}

/** Flat, ordered projection of one local Content tree. */
export interface ContentTreeMapProjection {
  totalMarkdownFiles: number;
  members: ProjectedContentTreeMember[];
  /** Top-level entries omitted by the local per-directory cap. */
  omittedEntries?: number;
}

/** Harness-only presentation for a thin repository-root handle. */
export interface RootMapMemberPresentation {
  /** Optional role prefix such as `home` or `mount`. */
  label?: string;
  /** Local display text. It may contain a private path and never enters `member`. */
  display?: string;
  /** Parenthesized local facts such as sync state, POV, or directory count. */
  details?: readonly string[];
}

interface RootMapMemberInputBase {
  /** Observed root name. */
  name: string;
  /** Observed root summary. */
  summary?: string | null;
  presentation?: RootMapMemberPresentation;
}

export type RootMapMemberInput = RootMapMemberInputBase & (
  | { root: number; address?: never }
  | { address: string; root?: never }
  | { root?: never; address?: never }
);

/**
 * A thin root handle. `member` is absent only when the producer has no honest
 * repository ordinal or existing address; rendering remains useful without
 * inventing a portable reference.
 */
export interface ProjectedRootMapMember {
  member: MapPositionMember | MapAddressMember | null;
  presentation: RootMapMemberPresentation;
  /** Observed information used by local rendering even when no member can be formed. */
  disclosure: { name: string; summary?: string };
}

export interface RenderRootMapMembersOptions {
  heading: string;
  omittedMembers?: number;
}

/**
 * Project a Content tree into ordered repository-position Map members.
 *
 * The tree reader has already enforced disclosure rungs: bounded level one may
 * carry summaries, deeper bounded levels carry names only, and explicit local
 * `full` diagnostics may carry summaries throughout. Prompt placement and
 * local counts remain in `presentation`, outside the member.
 */
export function projectContentTreeMembers(
  tree: ContentAwarenessTree,
  root = 0,
): ContentTreeMapProjection {
  const members: ProjectedContentTreeMember[] = [];
  appendTreeEntries(tree.entries, root, "", 1, members);
  return {
    totalMarkdownFiles: tree.totalMarkdownFiles,
    members,
    ...(tree.omittedEntries === undefined
      ? {}
      : { omittedEntries: tree.omittedEntries }),
  };
}

function appendTreeEntries(
  entries: readonly ContentAwarenessTreeEntry[],
  root: number,
  parent: string,
  level: number,
  output: ProjectedContentTreeMember[],
): void {
  for (const entry of entries) {
    const position = parent ? `${parent}/${entry.name}` : entry.name;
    const summary = entry.summary ?? undefined;
    output.push({
      member: {
        root,
        position,
        depth: summary === undefined ? "name" : "summary",
        disclosure: {
          name: entry.name,
          ...(summary === undefined ? {} : { summary }),
        },
      },
      presentation: {
        kind: entry.kind,
        level,
        ...(entry.markdownFiles === undefined
          ? {}
          : { markdownFiles: entry.markdownFiles }),
        ...(entry.omittedChildren === undefined
          ? {}
          : { omittedChildren: entry.omittedChildren }),
      },
    });
    if (entry.children) {
      appendTreeEntries(entry.children, root, position, level + 1, output);
    }
  }
}

/** Project ordered root handles without assigning authority, sync, or residency semantics. */
export function projectRootMapMembers(
  inputs: readonly RootMapMemberInput[],
): ProjectedRootMapMember[] {
  return inputs.map((input) => {
    const summary = input.summary ?? undefined;
    const disclosure = {
      name: input.name,
      ...(summary === undefined ? {} : { summary }),
    };
    let member: MapMember | null = null;
    if (input.root !== undefined) {
      member = {
        root: input.root,
        position: ".",
        depth: summary === undefined ? "name" : "summary",
        disclosure,
      };
    } else if (input.address !== undefined) {
      member = {
        address: input.address,
        depth: summary === undefined ? "name" : "summary",
        disclosure,
      };
    }
    return {
      member,
      presentation: input.presentation ?? {},
      disclosure,
    };
  });
}

/** Canonical local rendering shared by working-set and repository-catalog sections. */
export function renderRootMapMembers(
  entries: readonly ProjectedRootMapMember[],
  opts: RenderRootMapMembersOptions,
): string | null {
  if (entries.length === 0 && !opts.omittedMembers) return null;
  const lines = [opts.heading];
  for (const entry of entries) {
    const prefix = entry.presentation.label
      ? `${entry.presentation.label}: `
      : "";
    const display = entry.presentation.display ?? entry.disclosure.name;
    const summary = entry.disclosure.summary
      ? ` — ${entry.disclosure.summary}`
      : "";
    const details = entry.presentation.details?.length
      ? ` (${entry.presentation.details.join(" · ")})`
      : "";
    lines.push(`  ${prefix}${display}${summary}${details}`);
  }
  if (opts.omittedMembers) lines.push(`  …and ${opts.omittedMembers} more`);
  return lines.join("\n");
}

/** Render the existing tree text from the canonical flat member projection. */
export function renderContentTreeProjection(
  projection: ContentTreeMapProjection,
): string {
  const lines = [`Tree (${projection.totalMarkdownFiles} files):`];
  const openDirectories: ContentTreeMemberPresentation[] = [];
  const closeThrough = (level: number): void => {
    while (
      openDirectories.length &&
      openDirectories[openDirectories.length - 1]!.level >= level
    ) {
      const closed = openDirectories.pop()!;
      if (closed.omittedChildren) {
        lines.push(
          `${"  ".repeat(closed.level + 1)}… and ${closed.omittedChildren} more`,
        );
      }
    }
  };

  for (const entry of projection.members) {
    closeThrough(entry.presentation.level);
    const indent = "  ".repeat(entry.presentation.level);
    const disclosure = entry.member.disclosure;
    const name = disclosure?.name ?? entry.member.position;
    const base = entry.presentation.kind === "directory"
      ? entry.presentation.markdownFiles
        ? `${indent}${name}/ (${entry.presentation.markdownFiles})`
        : `${indent}${name}/`
      : `${indent}${name}`;
    lines.push(disclosure?.summary ? `${base} — ${disclosure.summary}` : base);
    if (entry.presentation.kind === "directory") {
      openDirectories.push(entry.presentation);
    }
  }
  closeThrough(0);
  if (projection.omittedEntries) {
    lines.push(`  … and ${projection.omittedEntries} more`);
  }
  return lines.join("\n");
}
