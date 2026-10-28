import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deniedTools, verdictForHead } from "./slc-review-gate.mjs";

const head = "a".repeat(40);
const started = "2026-10-21T09:00:00Z";
const comment = (body, at = "2026-10-21T09:01:00Z", actor = "claude") => ({
  body, created_at: at, user: { login: actor }, html_url: "https://example.invalid/review",
});

test("a silent or stale run cannot pass without a fresh verdict for the exact head", () => {
  const body = `Recommendation: Approve\nSLC-Review-Head: ${head}`;
  assert.equal(verdictForHead([[]], head, started), undefined);
  assert.equal(verdictForHead([[comment(body, "2026-10-21T08:59:59Z")]], head, started), undefined);
  assert.equal(verdictForHead([[comment(body.replace(head, "b".repeat(40)))]], head, started), undefined);
  assert.equal(verdictForHead([[comment(body, undefined, "someone-else")]], head, started), undefined);
  assert.equal(verdictForHead([[comment(`SLC-Review-Head: ${head}\nLooks fine`)]], head, started), undefined);
  assert.equal(verdictForHead([[comment(`SLC-Review-Head: ${head}\nRecommendation: Approve | Request Changes | Comment`)]], head, started), undefined);
  assert.equal(verdictForHead([[comment(body)]], head, started)?.user.login, "claude");
  assert.equal(verdictForHead([[comment(`Recommendation: Request Changes\nSLC-Review-Head: ${head}`)]], head, started)?.user.login, "claude");
  assert.equal(verdictForHead([[comment(`Recommendation: Comment\nSLC-Review-Head: ${head}`)]], head, started)?.user.login, "claude");
});

test("postflight exits nonzero on silent success and reports denied tool names", () => {
  const dir = mkdtempSync(join(tmpdir(), "slc-gate-"));
  const comments = join(dir, "comments.json");
  const trace = join(dir, "trace.json");
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL("./slc-review-gate.mjs", import.meta.url)), comments, trace, head, started], { encoding: "utf8" });
  try {
    writeFileSync(trace, JSON.stringify([{ type: "result", permission_denials_count: 1, permission_denials: [{ tool_name: "Read" }] }]));
    writeFileSync(comments, "[[]]");
    const missing = run();
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /no fresh .* verdict/);
    assert.match(missing.stdout, /denied tools: Read/);
    writeFileSync(comments, JSON.stringify([[comment(`Recommendation: Comment\nSLC-Review-Head: ${head}`)]]));
    assert.equal(run().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("denied tool names, not raw secret-bearing traces, are reported", () => {
  const messages = [
    { type: "assistant", message: { content: [{ type: "tool_use", id: "call1", name: "Read" }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "call1", is_error: true, content: "Permission denied" }] } },
    { type: "result", permission_denials_count: 2, permission_denials: [{ tool_name: "Bash" }] },
  ];
  assert.deepEqual(deniedTools(messages), { count: 2, names: ["Bash", "Read"] });
  assert.deepEqual(deniedTools([{ type: "result", permission_denials_count: 1 }]), { count: 1, names: [] });
});
