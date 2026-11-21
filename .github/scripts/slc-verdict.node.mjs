import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictOf } from './slc-verdict.mjs';

test('reads one verdict however the Recommendation line is formatted', () => {
  for (const body of [
    'Recommendation: Approve',
    '**Recommendation:** Approve',
    '**Recommendation: Approve**',
    'Recommendation: **Approve**',
    '_Recommendation:_ Approve.',
    '`Recommendation:` Approve',
    '## Recommendation: Approve',
    '- **Recommendation:** Approve',
    '> Recommendation: Approve',
    '### Recommendation\n\n**Approve**',
    '**Recommendation:**\nApprove',
    'Recommendation: Approve. Notes follow for the author.',
    'SLC-Review-Head: abc\nRecommendation: Approve\n\nSome notes.\n\n**Recommendation:** Approve',
  ]) assert.equal(verdictOf(body), 'Approve', body);
  assert.equal(verdictOf('**Recommendation:** Request Changes'), 'Request Changes');
  assert.equal(verdictOf('Recommendation: Comment\nRecommendation: comment'), 'Comment');
});

test('refuses verdicts that disagree, are conditional, are a template, or are missing', () => {
  assert.equal(verdictOf('Recommendation: Approve\n**Recommendation:** Request Changes'), 'conflicting');
  assert.equal(verdictOf('Recommendation: Comment\nRecommendation: Approve'), 'conflicting');
  for (const verdict of ['Approve, once green', 'Approve with changes', 'Approve - fix X', 'Approve — fix X', 'Approve: fix X', 'Approve; fix X', 'Approve (once green)', '[Approve | Request Changes | Comment]', 'Approve / Request Changes', 'LGTM']) {
    assert.equal(verdictOf(`Recommendation: ${verdict}`), 'ambiguous', verdict);
  }
  assert.equal(verdictOf('Recommendation: Approve\nRecommendation: Approve, but fix X'), 'ambiguous');
  assert.equal(verdictOf('**Recommendation:**'), 'ambiguous');
  for (const body of ['', 'Looks good to me.', '## Choosing the Recommendation\nApprove', 'My recommendation: approve it', undefined]) {
    assert.equal(verdictOf(body), 'none', String(body));
  }
});
