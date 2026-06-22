---
name: Now
summary: Current state — v0.1; spec, skills, schema, and reference library are in place; conformance kit and downstream consumers are next.
---
# Now

**v0.1, early and provisional.**

In place:
- `SPEC.md` + `SKILLS.md` — normative shape and ability layer.
- `schema/` — provisional frontmatter JSON Schema + the `_agent/` contract definition.
- `src/` — reference TypeScript library (frontmatter, `_agent/` contract reader, awareness, path walking, git state, drift, skill catalog). Builds; full test suite green.
- This `_agent/` contract — the repo dogfoods the protocol.

The schema is expected to evolve — especially the `attached_to` attach-type vocabulary, which is the open namespace question.
