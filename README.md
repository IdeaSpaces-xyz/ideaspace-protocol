# ideaspace-protocol

> The platform-neutral shape of a knowledge repo. An agent that knows this shape can inhabit any conformant space — orient, navigate, work — with no bespoke instructions.

An **ideaspace** is a folder of markdown under git: knowledge accumulates as `.md` files, how-to-work lives in `_agent/`, git carries identity and history. This repo is the **protocol** for that shape — the contract every IdeaSpaces surface conforms to, in one governed, versioned place.

It is not a data format for retrieval (cf. catalog formats). It is an **inhabitation contract**: shape + identity + conformance + the verbs to work a space. The shape is fixed so it is *predictable* — drop a conformant agent into a conformant space and it already knows where to look.

## What's here

| Path | What |
|---|---|
| [`SPEC.md`](SPEC.md) | **Normative.** The shape, identity, two layers, conformance (MUST/SHOULD). |
| [`SKILLS.md`](SKILLS.md) | **Normative.** The ability layer — the verbs (orient, understand, capture, reflect, share) that ride on the shape. |
| `schema/` | Machine-readable contract — frontmatter JSON Schema, the `_agent/` contract definition. *(next)* |
| `src/` | Reference TypeScript implementation — frontmatter, `_agent/` contract reader, awareness assembly, path walking. *(next)* |
| `conformance/` | A known-good reference space + a validator that checks a space (and an implementation) against the spec. *(next)* |
| `VERSION` | Current spec version. Surfaces declare conformance to a version. |

## The layering (open core)

```
ideaspace-protocol   spec + schema + reference lib + conformance kit   ← pure shape, open, versioned
        ▲
  @ideaspaces/sdk    platform: sync, auth, API client                  ← the value layer
        ▲
  surfaces           cli · pi-is-space · ideaspaces-plugin · mcp ·
                     obsidian · is_desktop · is_web                     ← consume the protocol
```

The protocol holds **no platform code** — no sync, no auth, no API client. That is the open-core line: the shape and the agent are open and shared; the sync layer is where value is captured.

## How surfaces integrate

- **TypeScript surfaces embed the reference library** (`src/`) — import it, don't re-implement the shape.
- **Other languages conform to the language-neutral core** — the spec doc + `schema/frontmatter.schema.json` + the conformance fixtures. The Python backend (`sw_space`) validates against the schema; it does not import the TS lib. The TS library is the *reference* implementation, not the only one.

## Conformance

A tool that claims to inhabit ideaspaces follows the **MUST/SHOULD** in [`SPEC.md`](SPEC.md#conformance) and declares the spec version it targets. The `conformance/` kit makes that testable.

## Status

**v0.1, 2026-06.** In place: spec + skills (graduated from the `ideaspace/` concept repo), the provisional `schema/`, and the **reference library** in `src/` (graduated from `@ideaspaces/sdk` — frontmatter, `_agent/` contract, awareness, git state, path walking, drift, skill catalog; builds + 97 tests green). Next: `@ideaspaces/sdk` re-exports this package, then the conformance kit.

Philosophy — why shared understanding compounds — lives in the IdeaSpaces `core/` notes. This repo is only the shape.
