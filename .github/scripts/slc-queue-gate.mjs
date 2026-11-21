#!/usr/bin/env node
// The merge queue's half of slc-review. SLC reviews a PR, not a merge group, so the queue never
// runs a review. It reads the verdict already posted for the head that is in the group, and lands
// only on Approve. The PR-side check stays "a verdict was posted"; this is where "Approve" is held.
// Anything unexpected refuses: a refused PR leaves the queue and can be queued again.
//
// SLC's comment names no head, so the verdict is tied to the head by time: the one comment from
// claude[bot] posted inside the window of the head's successful slc-review run. That is weaker than
// a line in the comment naming the head. Two comments in the window, or none, refuse.
// It assumes the queue's ruleset uses merge method MERGE, one PR per group and ALLGREEN. Squash or
// rebase would break the two-parent check below and refuse every PR, which is the safe way to fail.
import { readFileSync } from "node:fs";
import { verdictOf } from "./slc-verdict.mjs";

const REVIEWER = "claude[bot]";
const CHECK = "slc-review";
const SHA = "[0-9a-f]{40}";

export function queueEntry(ref) {
  const match = new RegExp(`^refs/heads/gh-readonly-queue/(.+)/pr-(\\d+)-${SHA}$`).exec(ref ?? "");
  return match ? { base: match[1], number: Number(match[2]) } : undefined;
}

const time = (value) => Date.parse(value ?? "");

// The window of the head's newest successful review run. A skipped run (a draft) is not a review.
export function reviewWindow(checkRuns) {
  const runs = checkRuns
    .filter((run) => run.name === CHECK && run.app?.slug === "github-actions")
    .filter((run) => run.status === "completed" && run.conclusion === "success")
    .filter((run) => Number.isFinite(time(run.started_at)) && Number.isFinite(time(run.completed_at)))
    .sort((a, b) => time(a.completed_at) - time(b.completed_at));
  const run = runs.at(-1);
  return run && { from: time(run.started_at), to: time(run.completed_at), url: run.html_url };
}

// Both ends of the window are inclusive, at the one-second grain GitHub reports.
export function reviewsIn(pages, window) {
  return pages.flat()
    .filter((comment) => comment.user?.login === REVIEWER && comment.user?.type === "Bot")
    .filter((comment) => time(comment.created_at) >= window.from && time(comment.created_at) <= window.to);
}

// The verdict the review states, however it is formatted (slc-verdict.mjs): bold, plain, a heading,
// or twice. Every statement must agree, and the first sentence must be exactly the verdict.
export function recommendation(body) {
  return verdictOf(body);
}

// The head's newest finished review run. A skipped one (a draft, a label) reports success on a
// required check, but it is not a review: a skipped required job is not a pass (cli #282).
export function newestRun(checkRuns) {
  return checkRuns
    .filter((run) => run.name === CHECK && run.app?.slug === "github-actions" && run.status === "completed")
    .filter((run) => Number.isFinite(time(run.completed_at)))
    .sort((a, b) => time(a.completed_at) - time(b.completed_at))
    .at(-1);
}

export function decide({ ref, groupParents, pr, checkRuns, pages }) {
  const entry = queueEntry(ref);
  if (!entry) return { land: false, reason: `${ref} is not a merge queue ref` };
  if (pr?.number !== entry.number || pr?.base?.ref !== entry.base) {
    return { land: false, reason: `PR data does not match queue entry ${ref}` };
  }
  const head = pr.head?.sha ?? "";
  if (!new RegExp(`^${SHA}$`).test(head)) return { land: false, reason: `PR #${pr.number} has no head SHA` };
  // A verdict counts only for the commit the group really merges.
  if (groupParents?.length !== 2 || groupParents[1] !== head) {
    return { land: false, reason: `group commit does not merge PR #${pr.number}'s head ${head}` };
  }
  const newest = newestRun(checkRuns ?? []);
  if (newest && newest.conclusion !== "success") {
    return { land: false, reason: `the newest ${CHECK} run for head ${head} was ${newest.conclusion ?? "not a success"}: a skipped or failed review is not a pass. Mark the PR ready or re-run the review, then queue it again.` };
  }
  const window = reviewWindow(checkRuns ?? []);
  if (!window) return { land: false, reason: `no successful ${CHECK} run for head ${head}` };
  const reviews = reviewsIn(pages ?? [], window);
  if (reviews.length !== 1) {
    return { land: false, reason: `expected one ${REVIEWER} comment inside the ${CHECK} run for ${head}, found ${reviews.length} (any comment from it counts, an @claude reply included): ${window.url}. Push a new commit or re-run the SLC review, then queue the PR again.` };
  }
  const [review] = reviews;
  // This assumes the review is posted once and never touched. If the action moves to a sticky or
  // progress comment, this refuses every PR, which is the safe way to fail.
  if (review.updated_at !== review.created_at) {
    return { land: false, reason: `the SLC verdict for ${head} was edited after posting: ${review.html_url}. Push a new commit or re-run the SLC review, then queue the PR again.` };
  }
  const said = recommendation(review.body);
  if (said !== "Approve") {
    const why = said === "conflicting" ? "its Recommendation lines disagree" : said === "none" ? "it states no Recommendation" : said === "ambiguous" ? "its Recommendation isn't a plain verdict" : `it says ${said}`;
    return { land: false, reason: `the SLC verdict for ${head} is not Approve: ${why} (Recommendation: ${said}): ${review.html_url}` };
  }
  return { land: true, reason: `SLC approved ${head}: ${review.html_url}` };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [command, ref, prPath, groupPath, runsPath, commentsPath] = process.argv.slice(2);
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  if (command === "number") {
    const entry = queueEntry(ref);
    if (!entry) {
      console.error(`SLC queue gate: ${ref} is not a merge queue ref. Refusing.`);
      process.exit(1);
    }
    console.log(entry.number);
  } else if (command === "decide") {
    const groupParents = read(groupPath).parents?.map((parent) => parent.sha);
    const checkRuns = read(runsPath).flatMap((page) => page.check_runs ?? []);
    const verdict = decide({ ref, groupParents, pr: read(prPath), checkRuns, pages: read(commentsPath) });
    (verdict.land ? console.log : console.error)(`SLC queue gate: ${verdict.reason}`);
    if (!verdict.land) process.exitCode = 1;
  } else {
    throw new Error("usage: slc-queue-gate number <ref> | decide <ref> <pr.json> <group-commit.json> <check-runs.json> <comments.json>");
  }
}
