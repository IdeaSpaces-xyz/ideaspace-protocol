---
name: writing
description: >
  Writing standard for Notes. Structure for retrieval, summaries for discovery,
  entities for connection. Use when creating or substantially revising Notes,
  or when asked "write this well", "capture this", "create a Note about".
  Derived from Strunk & White, Zinsser, Kovach & Rosenstiel.
---

# Writing Standard

Notes that compound follow these principles. They're functional requirements for knowledge that works — clear writing is easy to find and reuse, dense summaries drive discovery, well-scoped sections make a Note precise to navigate and search.

Derived from Strunk & White, Zinsser, Kovach & Rosenstiel.

## Summary Is Everything

The `summary` field is the most important thing you write. It's what search results show. It's what shows when browsing the tree. It's what loads in awareness context. Write it like the first thing someone reads — because it is.

Two sentences max. Dense. Immediate orientation. "What is this and why does it matter." Early words carry disproportionate weight — they anchor how the Note reads and how it is found.

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

Specifics connect a Note to related specifics; abstractions blur those connections.

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

## Well-Scoped Sections

Each `## heading` scopes one distinct point. Well-scoped sections = precise navigation and search.

- A Note with five distinct sections makes five findable, comparable points
- A wall of text blurs into one undifferentiated block — hard to find, hard to compare
- Each section makes a complete point independently
- Headings are contracts — "Team Analysis" contains team analysis, not market commentary
- Target: 3-10 paragraphs per section. Too short = insufficient signal. Too long = diluted topic.

Progressive disclosure: Title → Summary → Sections. Each level complete at its depth.

## Primary Attachment

Use `attached_to` for the one thing this Note is primarily about — like putting a sticky note on an object. It is singular: choose zero or one primary anchor, written `<type>:<id>`.

The type vocabulary is your platform's — the protocol fixes only the `<type>:<id>` shape. Common types a platform resolves might include a person (`person:alice`), an agent (`agent:assistant`), or a web page (`web_page:https://example.com/report.pdf`).

If the Note mentions several things, don't put all of them in `attached_to`. Choose the primary anchor, split the Note, use tags, or link in prose. Use `references` only for hard sources.

## Cross-Note Links

Use standard markdown links with relative paths for reader navigation. They are portable across editors, Obsidian, print/exports, and plain LLM context.

```markdown
See [Acme profile](../companies/acme.md) for background.
See [Market map](../markets/README.md) for the branch overview.
```

Path links are user-facing handles. They may break when the target is renamed unless the editor/tool rewrites them; use editor rename refactors when available. Inline prose links are reader navigation, not provenance — they don't populate `references`.

When renaming a Note and heavily rewriting it, commit the rename separately from the rewrite. Git rename detection is similarity-based; a rename plus large content change in one commit can defeat it, losing the file's history link.

## Sources and References

Use `references` only for hard sources: the small set of Notes this Note was produced from or grounded in. Perspective outputs and synthesis Notes use `references` for their input Notes. If a Note merely mentions or points to another Note, use an inline markdown link instead.

## Sentence-Level Mechanics

- **Put emphatic words at the end.** "In Q3, revenue grew 40%" not "Revenue is what grew 40% in Q3"
- **Keep related words together.** Don't separate subject and verb with long interruptions
- **Parallel construction.** "Fast, reliable, and affordable" not "speed, being reliable, and costs less"
- **One idea per sentence.** Most of the time, two sentences are clearer than one compound one

## Common Failure Modes

- **Throat-clearing.** "Before we dive into the analysis..." — delete, start with the analysis
- **Hedge stacking.** "It seems like it might possibly be somewhat relevant" — state or acknowledge uncertainty once
- **Elegant variation.** If it's a "startup" in paragraph one, don't call it a "venture" in paragraph two for variety. Consistency aids findability.
- **Nominalization.** "Make a determination" → "determine." "Performed an analysis" → "analyzed."
- **Weasel words.** "Some experts say," "studies show" — without attribution, these are noise

## The Standard

Knowledge capture succeeds when:

1. A human can scan the output and orient in seconds
2. A machine can index the output and retrieve it precisely
3. Every sentence traces to a source or is explicitly marked as interpretation
4. Nothing is added that wasn't in the input
5. Nothing important from the input is lost without acknowledgment
6. The reader trusts the capture because the method is transparent
