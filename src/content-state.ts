import {
  CONTENT_AWARENESS_SECTIONS,
  renderContentAwareness,
  type ContentAwarenessManifest,
  type ContentAwarenessSection,
} from "./awareness.js";
import { gitState, stagedIdeaspacePaths, type GitState } from "./git.js";

/**
 * Local repository State at tail placement: the volatile facts a harness keeps
 * closest to action. It is the richer form of the ambient manifest's compact
 * `git` line — the same Git facts plus the knowledge paths staged and awaiting
 * an explicit commit. It is not Map data and claims no runtime residency.
 */
export interface ContentState {
  placement: "tail";
  git: GitState;
  /** Staged repository paths that are Content or core context (`_agent/`). */
  captures: string[];
}

/** Read local State for one repository root. Read-only; never stages or writes. */
export async function assembleContentState(repoRoot: string): Promise<ContentState> {
  const [git, captures] = await Promise.all([
    gitState(repoRoot),
    stagedIdeaspacePaths(repoRoot),
  ]);
  return { placement: "tail", git, captures };
}

/** Render the canonical State block. Deterministic for equal inputs. */
export function renderContentState(state: ContentState): string {
  const { git, captures } = state;
  const lines = ["State:", `  branch: ${git.branch ?? "(detached)"}`];
  if (git.ahead != null || git.behind != null) {
    lines.push(`  remote: ahead ${git.ahead ?? 0}, behind ${git.behind ?? 0}`);
  } else {
    lines.push("  remote: no upstream");
  }
  lines.push(`  working tree: ${git.dirty ? "dirty" : "clean"}`);
  lines.push(`  captures awaiting commit: ${captures.length}`);
  if (git.untrackedInTrackedDirs.length) {
    lines.push(`  untracked knowledge files: ${git.untrackedInTrackedDirs.length}`);
  }
  return lines.join("\n");
}

export interface RenderContentTailOpts {
  /**
   * Local State. When present it leads the tail and supersedes the manifest's
   * compact `git` line, so the same facts never render twice.
   */
  state?: ContentState | null;
  /**
   * Caller-owned handles already rendered by the harness — a repository
   * catalog, a floor hint. Kept in producer order; empty entries are dropped.
   * The protocol assigns them no placement of its own.
   */
  handles?: ReadonlyArray<string | null | undefined>;
  /** The harness's open-Change line. Always last: it is session state, not Content. */
  change?: string | null;
  /** Canonical sections to include from the manifest tail. Intersects with placement. */
  sections?: readonly ContentAwarenessSection[];
  /** Cap on stale-doc signals rendered before truncation. Default: 10. */
  maxDrift?: number;
}

/**
 * Compose the volatile register every local harness renders after the head:
 *
 *   State → caller handles (producer order) → manifest tail → open Change line
 *
 * One composition, so a CLI `status` and an agent runtime's post-breakpoint
 * block are byte-identical for the same inputs. The manifest may be null when
 * no Content position resolves; the tail then carries only local inputs.
 */
export function renderContentTail(
  manifest: ContentAwarenessManifest | null,
  opts: RenderContentTailOpts = {},
): string {
  const parts: string[] = [];
  if (opts.state) parts.push(renderContentState(opts.state));
  for (const handle of opts.handles ?? []) {
    if (handle?.trim()) parts.push(handle);
  }
  if (manifest) {
    const requested = opts.sections ?? CONTENT_AWARENESS_SECTIONS;
    const sections = opts.state
      ? requested.filter((section) => section !== "git")
      : requested;
    const tail = renderContentAwareness(manifest, {
      placement: "tail",
      sections,
      ...(opts.maxDrift === undefined ? {} : { maxDrift: opts.maxDrift }),
    });
    if (tail.trim()) parts.push(tail);
  }
  if (opts.change?.trim()) parts.push(opts.change);
  return parts.join("\n\n");
}
