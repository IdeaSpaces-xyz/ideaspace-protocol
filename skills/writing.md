---
name: writing
description: >
  Writing standard for Notes. Structure for retrieval, summaries for discovery,
  entities for connection. Use when creating or substantially revising Notes,
  or when asked "write this well", "capture this", "create a Note about".
  Derived from Strunk & White, Zinsser, Kovach & Rosenstiel.
---
<!-- Ported from sw_space/resources/skills/writing.md @ 3b62262; neutralized for surface-neutral SDK distribution. Substance tracks the source — re-sync against that baseline. -->

# Writing Standard

Notes that compound follow these principles. They're functional requirements for knowledge that works — clear writing produces clean vectors, dense summaries drive discovery, structured sections enable precise retrieval.

Derived from Strunk & White, Zinsser, Kovach & Rosenstiel.

## Summary Is Everything

The `summary` field is the most important thing you write. It's what search results show. It's what shows when browsing the tree. It's what loads in awareness context. Write it like the first thing someone reads — because it is.

Two sentences max. Dense. Immediate orientation. "What is this and why does it matter." Early tokens carry disproportionate influence on the embedding vector.

## Conciseness (Strunk & White)

"Omit needless words." Every word in a Note earns its place.

| Padded | Clean |
|--------|-------|
| "The question as to whether" | "Whether" |
| "This is a company that" | "This company" |
| "It is important to note that" | (delete — just state it) |
| "In terms of revenue growth" | "Revenue grew" |

Active voice over passive. "The startup was analyzed" → "We analyzed the startup." Passive only when the actor is unknown or irrelevant.

## Clarity (Zinsser)

"Clear thinking becomes clear writing." If you can't write it clearly, you don't understand it yet.

- Strip every sentence to its cleanest components
- Clutter words add nothing: "basically," "actually," "in order to," "at this point in time"
- The first paragraph orients the reader immediately — if someone reads only the summary, they know what this is about

## Concreteness

Specifics cluster with related specifics in vector space. Abstractions diffuse.

| Abstract | Concrete |
|----------|----------|
| "Significant growth" | "Revenue grew 40% in Q3" |
| "Strong team" | "3 ex-Google engineers, 2 successful exits" |
| "Large market" | "$4.2B TAM, growing 25% annually" |

Prefer the specific to the general, the definite to the vague. Concrete facts can be abstracted later. You can't recover specifics from abstractions.

## Objectivity (Kovach & Rosenstiel)

Distinguish fact from interpretation. Never blend them.

| Type | Example |
|------|---------|
| Fact | "Raised $10M Series A in March 2025" |
| Interpretation | "The funding suggests investor confidence" |
| Claim (attributed) | "The CEO states they are 'market leaders'" |

Every claim traces to a source. "According to the landing page..." or "The pitch deck states..." — the reader knows provenance.

**What the agent does NOT do:** verify claims, add information not in the source, editorialize ("impressive team"), fill gaps with plausible content. If the source doesn't mention revenue, note the absence — don't guess.

## Sections Are the Semantic Fingerprint

Each `## heading` creates a vector centroid. Well-scoped sections = precise retrieval.

- A Note with five distinct sections has a 5-dimensional semantic fingerprint
- A wall of text collapses to one dimension — hard to find, hard to compare
- Each section makes a complete point independently
- Headings are contracts — "Team Analysis" contains team analysis, not market commentary
- Target: 3-10 paragraphs per section. Too short = insufficient signal. Too long = diluted topic.

Progressive disclosure: Title → Summary → Sections. Each level complete at its depth.

## Primary Attachment

Use `attached_to` for the one thing this Note is primarily about — like putting a sticky note on an object. It is singular: choose zero or one primary anchor.

- Company/org entity: `hostname:acme.com`
- Person entity: `person:alice`
- Agent entity: `agent:assistant`
- External URL/document: `web_page:https://example.com/report.pdf`
- Another Note: `note:n_abc123def456`
- Another non-Note Node in this Space: `node:n_def456abc789`

If the Note mentions several things, don't put all of them in `attached_to`. Choose the primary anchor, split the Note, use tags, or link in prose. Use `references` only for hard source/provenance nodes.

## Cross-Note Links

Use standard markdown links with relative paths for reader navigation. They are portable across editors, Obsidian, print/exports, and plain LLM context.

```markdown
See [Acme profile](../companies/acme.md) for background.
See [Market map](../markets/README.md) for the branch overview.
```

Path links are user-facing handles. They may break when the target is renamed unless the editor/tool rewrites links; use editor rename refactors when available. For durable platform references outside portable prose, use `/n/{node_id}` URLs.

Existing inline `node:n_...` links remain resolvable, but don't write them as the default prose link form. Inline links are reader navigation, not provenance. They do not populate `references` or `referenced_by`.

When renaming a Note and heavily rewriting it, commit the rename separately from the rewrite. Git rename detection is similarity-based; a rename plus large content change in one commit can lose node identity.

## Sources and References

Use `references` only for hard sources: the small set of node IDs this Note was produced from or grounded in. Perspective outputs and synthesis Notes use `references` for their input Notes. If a Note merely mentions or points to another Note, use an inline markdown link instead.

## Sentence-Level Mechanics

- **Put emphatic words at the end.** "In Q3, revenue grew 40%" not "Revenue is what grew 40% in Q3"
- **Keep related words together.** Don't separate subject and verb with long interruptions
- **Parallel construction.** "Fast, reliable, and affordable" not "speed, being reliable, and costs less"
- **One idea per sentence.** Most of the time, two sentences are clearer than one compound one

## Common Failure Modes

- **Throat-clearing.** "Before we dive into the analysis..." — delete, start with the analysis
- **Hedge stacking.** "It seems like it might possibly be somewhat relevant" — state or acknowledge uncertainty once
- **Elegant variation.** If it's a "startup" in paragraph one, don't call it a "venture" in paragraph two for variety. Consistency aids retrieval.
- **Nominalization.** "Make a determination" → "determine." "Performed an analysis" → "analyzed."
- **Weasel words.** "Some experts say," "studies show" — without attribution, these are noise

## The Standard

Knowledge capture succeeds when:

1. A human can scan the output and orient in seconds
2. A machine can embed the output and retrieve it precisely
3. Every sentence traces to a source or is explicitly marked as interpretation
4. Nothing is added that wasn't in the input
5. Nothing important from the input is lost without acknowledgment
6. The reader trusts the capture because the method is transparent
