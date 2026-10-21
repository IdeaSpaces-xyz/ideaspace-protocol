#!/usr/bin/env node
// A successful Claude invocation is not a PR review. Require a fresh posted verdict
// for this exact head and report denied tools without exposing raw execution traces.
import { readFileSync } from "node:fs";

export function verdictForHead(pages, head, started) {
  return pages.flat().find((comment) =>
    ["claude", "claude[bot]", "github-actions[bot]"].includes(comment.user?.login) &&
    comment.created_at >= started &&
    typeof comment.body === "string" &&
    comment.body.split("\n").some((line) => line.trim() === `SLC-Review-Head: ${head}`) &&
    comment.body.split("\n").some((line) => /^Recommendation: (Approve|Request Changes|Comment)$/.test(line.trim()))
  );
}

export function deniedTools(messages) {
  const names = new Set();
  const calls = new Map();
  let count = 0;
  for (const message of messages) {
    for (const block of message.message?.content ?? []) {
      if (block.type === "tool_use") calls.set(block.id, block.name);
      if (block.type === "tool_result" && block.is_error && /permission|denied|not allowed/i.test(JSON.stringify(block.content))) {
        names.add(calls.get(block.tool_use_id) ?? "unknown tool");
      }
    }
    if (message.type !== "result") continue;
    count = Math.max(count, Number(message.permission_denials_count) || 0);
    for (const denial of Array.isArray(message.permission_denials) ? message.permission_denials : []) {
      names.add(denial.tool_name ?? denial.toolName ?? calls.get(denial.tool_use_id) ?? "unknown tool");
    }
  }
  return { count, names: [...names].sort() };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [commentsPath, tracePath, head, started] = process.argv.slice(2);
  if (!commentsPath || !head || !started) throw new Error("usage: slc-review-gate <comments.json> <execution.json-or-empty> <head-sha> <started-utc>");
  let messages = [];
  try { if (tracePath) messages = JSON.parse(readFileSync(tracePath, "utf8")); }
  catch (error) { console.error(`SLC: could not inspect execution trace: ${error.message}`); }
  const denied = deniedTools(messages);
  console.log(`SLC permission denials: ${denied.count}; denied tools: ${denied.names.join(", ") || "none named in trace"}`);
  const comments = JSON.parse(readFileSync(commentsPath, "utf8"));
  const verdict = verdictForHead(comments, head, started);
  if (!verdict) {
    console.error(`SLC: no fresh Approve / Request Changes / Comment verdict from Claude for head ${head}. Failing closed.`);
    process.exitCode = 1;
  } else {
    console.log(`SLC verdict comment for ${head}: ${verdict.html_url}`);
  }
}
