---
name: Foundation
summary: What this place is and how to work in it — the root handshake for the Ideaspace Protocol repo, which is itself a conformant ideaspace.
---
# Foundation

> The root handshake. This repo defines the **Ideaspace Protocol** — the platform-neutral shape of a knowledge repo — and is itself a conformant ideaspace, so it dogfoods the shape it specifies.

## What this place is

A folder of Markdown under git where the protocol lives: the normative spec, a machine-readable schema, a reference implementation, and a conformance kit. An agent that knows the shape can inhabit any conformant space; this repo is the definition of that shape.

## The areas

- **[`SPEC.md`](../SPEC.md)** — normative shape: position, two kinds of content, the `_agent/` contract, fractal composition, identity, conformance.
- **[`SKILLS.md`](../SKILLS.md)** — the ability layer: the verbs that ride on the shape.
- **[`schema/`](../schema/)** — language-neutral contract (frontmatter JSON Schema + the `_agent/` contract definition).
- **[`src/`](../src/)** — reference TypeScript implementation.
- **[`conformance/`](../conformance/)** — reference space + validator.

## Reading order

Start with `purpose.md` (why), then `now.md` (what's active), then `guide.md` (how to work here). For the normative shape itself, read `SPEC.md`.

This is the only `_agent/foundation.md` in the repo — it lives at the root. Deeper positions refine via their own `_agent/` if they need to; they do not re-declare foundation.
