---
name: Now
summary: Current state — v0.4.1 aligns the normative skills layer, schema, reference library, and release metadata; the v0.4 stack is adopted downstream, with cross-surface conformance and drift guards next.
---
# Now

**v0.4.1, early and provisional.**

In place:
- `SPEC.md` + `SKILLS.md` — the normative shape and ability layer, including explicit push/pull directions and the protocol-owned shared skill catalog.
- `schema/` — provisional frontmatter, `_agent/` contract, and Change-layer trailer formats. `attached_to` is one typed link with an open, platform-defined type vocabulary.
- `src/` — the reference TypeScript library for frontmatter, contract composition, awareness, path walking, git state, drift, skills, conformance, and Change trailers. The full suite is green.
- Downstream adoption — SDK, CLI, MCP, Claude plugin, and Pi consume the v0.4 shape; shared references are generated from this repo's catalog.
- This `_agent/` contract — the repo dogfoods the protocol.

Next:
- Prove conformance through the real write paths exposed by downstream surfaces.
- Add generated-reference and vendored-bundle drift guards so consumers cannot silently lag the protocol.
- Let the open `attached_to` type vocabulary evolve only from demonstrated platform needs.
