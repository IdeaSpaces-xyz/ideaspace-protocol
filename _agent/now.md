---
name: Now
summary: Current state — v0.4.5 adds the portable structured Content awareness manifest and selective canonical renderer on top of the delivered cross-surface conformance net. Local filesystem/git facts now separate from harness placement, so MCP, Claude, and Pi can consume one shape without sharing prompt mechanics.
---
# Now

**v0.4.5, early and provisional — with structured Content awareness.**

In place:
- `SPEC.md` + `SKILLS.md` — the normative shape and ability layer, including explicit push/pull directions and the protocol-owned shared skill catalog.
- `schema/` — provisional frontmatter, `_agent/` contract, and Change-layer trailer formats. `attached_to` is one typed link with an open, platform-defined type vocabulary.
- `src/` — the reference TypeScript library for frontmatter, contract composition, awareness, path walking, git state, drift, skills, conformance, and Change trailers. The full suite is green.
- **Structured Content awareness — delivered in v0.4.5.** `assembleContentAwareness` returns portable position/Now/tree/contract/skills/activity/git/drift facts; `renderContentAwareness` renders canonical selected sections. The manifest is the local filesystem/git Content adapter, not a graph/platform manifest. Harnesses retain placement, session state, mounts, seen-ref writes, and remote tiers; `assembleAwareness` remains as the compatibility block.
- Downstream adoption — SDK, CLI, MCP, Claude plugin, and Pi consume the v0.4 shape; shared references are generated from this repo's catalog.
- **Cross-surface conformance — delivered (2026-07-16→18).** Every surface proves the same write-path contract in its own CI, judged by this repo's kit (`validateSpace` + trailer vectors): the CLI in its own tests, the MCP server + Claude plugin through the shipped MCP artifacts (claude-code-plugin#46), and Pi through its genuine extension runtime (pi-is-space#52). Surface parity is now *tested semantically*, not asserted. The program earned its keep immediately: seven real defects found in three days, five fixed — including a rename-commit failure in the CLI's path-scoped commit (cli#85), a floating-install breakage, and a cross-surface record race — each now locked by a conformance vector.
- **Distribution drift guards — shipped, consumer-side.** The Claude plugin pins vendored bundles with a hash-verified lock and a CI rebuild check; Pi installs from a committed lockfile via `npm ci`. Consumers can no longer silently lag the protocol or float their dependencies.
- This `_agent/` contract — the repo dogfoods the protocol.

Next (detail in [next.md](next.md)):
- Lift the shared cache-path derivation into the reference library — four consumers duplicate it today, held together by golden-value tests.
- A contract-delta primitive for ambient fractal awareness on the surfaces.
- The local-write module decision — whether this library grows a clearly-scoped write layer; a deliberate revision of the read-only design rule, to be decided here with the consumer evidence in hand.
- Let the open `attached_to` type vocabulary evolve only from demonstrated platform needs.
