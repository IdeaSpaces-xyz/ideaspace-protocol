import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, queueEntry, recommendation, reviewWindow } from './slc-queue-gate.mjs';

const head = 'a'.repeat(40), base = 'b'.repeat(40), group = 'c'.repeat(40);
const ref = `refs/heads/gh-readonly-queue/main/pr-7-${group}`;
const pr = { number: 7, base: { ref: 'main' }, head: { sha: head } };
const run = { name: 'slc-review', app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success', started_at: '2026-11-07T09:00:00Z', completed_at: '2026-11-07T09:01:00Z' };
const comment = (body = '**Recommendation:** Approve', extra = {}) => ({ user: { login: 'claude[bot]', type: 'Bot' }, created_at: '2026-11-07T09:00:30Z', updated_at: '2026-11-07T09:00:30Z', body, ...extra });
const input = (extra = {}) => ({ ref, groupParents: [base, head], pr, checkRuns: [run], pages: [[comment()]], ...extra });

test('accepts only a plain Approve inside the successful head review', () => {
  assert.equal(decide(input()).land, true);
  for (const body of ['Recommendation: Request Changes', 'Recommendation: Comment', 'Looks good', 'Recommendation: Approve / Request Changes', 'Recommendation: Approve\nRecommendation: Request Changes']) {
    assert.equal(decide(input({ pages: [[comment(body)]] })).land, false, body);
  }
  for (const verdict of ['Approve, once green', 'Approve with changes', 'Approve - fix X', 'Approve — fix X', 'Approve: fix X', 'Approve; fix X', 'Approve (once green)']) {
    assert.equal(recommendation(`Recommendation: ${verdict}`), 'ambiguous', verdict);
  }
  assert.equal(recommendation('**Recommendation:** Approve. Notes follow.'), 'Approve');
});

test('rejects missing, forged, edited, stale or ambiguous comments', () => {
  assert.equal(decide(input({ pages: [[]] })).land, false);
  for (const user of [{ login: 'human', type: 'User' }, { login: 'claude[bot]', type: 'User' }]) {
    assert.equal(decide(input({ pages: [[comment(undefined, { user })]] })).land, false);
  }
  assert.equal(decide(input({ pages: [[comment(undefined, { updated_at: '2026-11-07T09:02:00Z' })]] })).land, false);
  for (const created_at of ['2026-11-07T08:59:59Z', '2026-11-07T09:01:01Z']) {
    assert.equal(decide(input({ pages: [[comment(undefined, { created_at, updated_at: created_at })]] })).land, false);
  }
  assert.equal(decide(input({ pages: [[comment()], [comment('Recommendation: Request Changes')]] })).land, false);
});

test('rejects unsuccessful, skipped, foreign or missing checks; uses newest successful run', () => {
  assert.equal(decide(input({ checkRuns: [] })).land, false);
  for (const extra of [{ conclusion: 'skipped' }, { conclusion: 'failure' }, { status: 'in_progress' }, { app: { slug: 'other' } }, { name: 'other' }]) {
    assert.equal(decide(input({ checkRuns: [{ ...run, ...extra }] })).land, false);
  }
  const later = { ...run, started_at: '2026-11-07T10:00:00Z', completed_at: '2026-11-07T10:01:00Z' };
  assert.equal(reviewWindow([run, later]).from, Date.parse(later.started_at));
  assert.equal(decide(input({ checkRuns: [run, later] })).land, false);
});

test('binds queue ref, PR number, base and group second parent to current head', () => {
  assert.deepEqual(queueEntry(ref), { base: 'main', number: 7 });
  for (const groupParents of [[base, group], [head], [base, head, base]]) {
    assert.equal(decide(input({ groupParents })).land, false);
  }
  for (const other of [{ ...pr, number: 8 }, { ...pr, base: { ref: 'dev' } }, { ...pr, head: { sha: 'short' } }]) {
    assert.equal(decide(input({ pr: other })).land, false);
  }
  assert.equal(decide(input({ ref: 'refs/heads/main' })).land, false);
});
