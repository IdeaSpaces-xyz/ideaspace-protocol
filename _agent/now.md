---
name: Now
summary: Current state — v0.1; the shape (spec, schema, reference lib) is in place and now carries the surface rule and _agent/schema.md; the Change-layer trailer lib is built but unadopted; conformance kit and downstream consumers are next.
---
# Now

**v0.1, early and provisional.**

In place:
- `SPEC.md` + `SKILLS.md` — normative shape and ability layer. The shape now states the **surface rule** (every position presents *summary → surface → children*; depth is elaboration) and **`_agent/schema.md`** — a collection folder's Note-shape as guidance, never validation.
- `schema/` — provisional frontmatter JSON Schema, the `_agent/` contract definition, and the Change-layer trailer format.
- `src/` — reference TypeScript library (frontmatter, `_agent/` contract reader, awareness, path walking, git state, drift, skill catalog, and the **Change-layer trailers** — `mintChangeId`, parse/format, `changeIdGrep`). Builds; full test suite green.
- This `_agent/` contract — the repo dogfoods the protocol.

Next:
- **Change-layer adoption.** The trailer lib is built and tested but has zero call sites — wiring it into the surfaces (the plugin's `is_commit`, the CLI) is the open work. This commit is its first real use.
- **Conformance kit against a real space** — point it at a sw_space-managed repo; every failure is a platform bug or a spec gap, both wins.
- The frontmatter schema is expected to evolve — especially the `attached_to` attach-type vocabulary, the open namespace question.
