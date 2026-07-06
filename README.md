# Ideaspace Protocol

> The platform-neutral **shape** of a knowledge repo. An agent that knows this shape can inhabit any conformant space — orient, navigate, work — with no bespoke instructions.

An **ideaspace** is a folder of Markdown under git: knowledge accumulates as `.md` files, how-to-work lives in an `_agent/` folder, and git carries identity and history. This repo defines that shape — the spec, a machine-readable schema, a reference implementation, and a conformance kit — in one place, so any tool or agent can read and write ideaspaces predictably.

It is **not a data format for retrieval**. It is an *inhabitation contract*: shape + identity + conformance, plus the verbs to work a space. The shape is fixed so it is predictable — drop a conformant agent into a conformant space and it already knows where to look.

This repository is itself a conformant ideaspace (see [`_agent/`](_agent/)) — it dogfoods the protocol it defines.

## What's here

| Path | What |
|---|---|
| [`SPEC.md`](SPEC.md) | **Normative.** The shape, identity, two layers, conformance (MUST/SHOULD). |
| [`SKILLS.md`](SKILLS.md) | **Normative.** The ability layer — the verbs (orient, understand, capture, reflect, share) that ride on the shape. |
| [`schema/`](schema/) | Machine-readable contract — the frontmatter JSON Schema and the `_agent/` contract definition. Language-neutral, so any runtime can conform. |
| [`src/`](src/) | Reference TypeScript implementation — frontmatter, the `_agent/` contract reader, awareness assembly, path walking, git state, drift, the skill catalog. |
| [`conformance/`](conformance/) | A reference conformant space and a validator that checks a space (and an implementation) against the spec. |
| [`VERSION`](VERSION) | Current spec version. Tools declare conformance to a version. |

## Concepts in 30 seconds

- **Position.** Every directory is a position, presenting as *summary → surface → children*. Its surface — a `README.md`, a repo's root README, or a lone `.md` file — says what it is, for everyone. Depth is elaboration: a child answers "what do you mean?" about the surface above it.
- **Two kinds of content.** Plain `.md` files are *knowledge*; the `_agent/` folder is *agent context* (how to work here). Everything not underscore-prefixed is knowledge.
- **The `_agent/` contract.** `foundation.md` (root handshake), `guide.md`, `purpose.md`, `now.md`, `next.md`, and optional `schema.md` (the shape of Notes in the folder — guidance, not validation). Give it a good surface: loaded at depth 0, with depth on demand.
- **Fractal.** `_agent/` can appear at any position and composes along the path: general at the root, specific as you descend.
- **Identity in git.** The author is the person; an agent that helped adds a `Co-authored-by:` trailer. Provenance rides in git, not in a file's frontmatter.

The full, normative version is [`SPEC.md`](SPEC.md).

## Using the reference library

```bash
npm install @ideaspaces/protocol
```

```ts
import { findSpaceRoot, readContract, stripFrontmatter, composeFrontmatter } from "@ideaspaces/protocol";

const root = await findSpaceRoot(process.cwd());   // nearest space root
const contract = await readContract(root.path);    // the _agent/ files along the path
```

The TypeScript library is the *reference* implementation, not the only one. Other languages conform to the language-neutral core — [`SPEC.md`](SPEC.md) + [`schema/frontmatter.schema.json`](schema/frontmatter.schema.json) + the conformance fixtures.

## Conformance

A tool that claims to inhabit ideaspaces follows the **MUST/SHOULD** in [`SPEC.md`](SPEC.md#conformance) and declares the spec version it targets. The [`conformance/`](conformance/) kit makes that testable.

## Status

**v0.1 — early and provisional.** The spec, skills, and reference library are in place; the schema is provisional and expected to evolve (notably the `attached_to` attach-type vocabulary). Pin a version and expect changes before 1.0.

## Develop

```bash
npm ci
npm run build      # build the reference library (ESM → dist/)
npm test           # run the suite (vitest)
npx tsc --noEmit   # typecheck
```

See [`_agent/guide.md`](_agent/guide.md) for how to work in this repo.

## License

[MIT](LICENSE).
