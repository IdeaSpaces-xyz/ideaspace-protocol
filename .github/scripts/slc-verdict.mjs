// The verdict an SLC review states, however it is formatted (v23 4.16). The reviewer writes its
// Recommendation line bold, plain, as a heading, with the verdict on the next line, or more than
// once; every gate read only one of those shapes and broke on the others. One reading, used by the
// PR-side gate and the merge queue's:
// - a label line is "Recommendation:" (or "Recommendation" alone, as a heading or a bold label),
//   after Markdown emphasis, code ticks, heading hashes, quote marks and list bullets are removed;
// - the verdict is the rest of that line, or the next non-empty line when the label stands alone;
// - only its first sentence counts, and it must be exactly Approve, Request Changes or Comment:
//   "Approve, once green" or a template "[Approve | Request Changes | Comment]" is not a verdict;
// - every label must give the same verdict. Two that agree are one verdict; two that differ refuse.

const PLAIN = /[*_`~]/g;
const VERDICTS = { "approve": "Approve", "request changes": "Request Changes", "comment": "Comment" };

const plain = (line) => line.replace(PLAIN, "").replace(/^\s*(?:#{1,6}\s+|>\s*|[-+]\s+)*/, "").trim();

/** One stated verdict: Approve, Request Changes, Comment, or ambiguous for anything else. */
function verdictIn(text) {
  const first = text.split(/\.(?:\s|$)/)[0].trim().toLowerCase();
  return VERDICTS[first] ?? "ambiguous";
}

/**
 * What the review says: "Approve", "Request Changes" or "Comment" when every Recommendation it states
 * agrees; "none" when it states none; "ambiguous" when one isn't a plain verdict; "conflicting" when
 * they disagree.
 */
export function verdictOf(body) {
  const lines = String(body ?? "").split("\n").map(plain);
  const said = [];
  for (let at = 0; at < lines.length; at++) {
    const label = /^recommendation\s*(?::\s*(.*))?$/i.exec(lines[at]);
    if (!label) continue;
    let text = (label[1] ?? "").trim();
    if (!text) {
      const next = lines.slice(at + 1).find((line) => line.length > 0);
      if (next === undefined) { said.push("ambiguous"); continue; }
      text = next;
    }
    said.push(verdictIn(text));
  }
  if (!said.length) return "none";
  if (said.includes("ambiguous")) return "ambiguous";
  return new Set(said).size === 1 ? said[0] : "conflicting";
}
