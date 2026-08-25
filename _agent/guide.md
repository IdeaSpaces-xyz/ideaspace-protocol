---
name: Guide
summary: How agent and human work in this repo — the design rules (pure shape, spec↔schema↔impl coherence, provisional/extensible schema, language-neutral core) and the build + PR workflow.
---
# Guide

## Design rules

- **Pure shape — no platform code.** This repo holds the shape only: no sync, no auth, no API client, no transport. Platform concerns belong in a layer that depends on this package, not here. A change that adds platform code is out of scope by construction.
- **Spec ↔ schema ↔ impl stay coherent.** A change to the shape updates [`SPEC.md`](../SPEC.md), [`schema/`](../schema/), and [`src/`](../src/) together — never let them drift.
- **The schema is provisional and extensible.** `additionalProperties` stays true; nothing is strictly required (an absent field is a drift signal, not an error); the `attached_to` attach-type vocabulary grows by deliberate, versioned change.
- **Identity moves forward, never gates the past.** New tools mint the current root identity form; readers preserve legacy forms and accept absence. Evidence conflict is surfaced, never guessed into a rewrite or rebind.
- **Supporting payload is not an asset subsystem.** `_assets/` names a portable role and lexical reference rule. Filesystem reads, Markdown parsing, rendering, MIME/size limits, upload, access, and storage remain consumer concerns.
- **Language-neutral core.** The spec + JSON Schema must let non-TypeScript runtimes conform. The TS library is the *reference* implementation, not the only one.
- **Simple, Lovable, Complete.** Functional API over class wrappers; zero runtime deps beyond `yaml`; stdlib + Node primitives first.
- **Mutation-free package root; explicit local-effect boundary.** Package-root primitives do not write the filesystem or Git. It may expose pure local-effect request/result types, validators, capability types, and the read-only `pathRevision` fact; mutation lives only behind `@ideaspaces/protocol/local-effects` and obeys the language-neutral contract and vectors. Filesystem paths use `node:path`; portable repository/Markdown paths use `/` in every runtime. Async by default for I/O.

## Build

```bash
npm ci
npm run build      # embed-skills + tsc → dist/ (ESM)
npm test           # vitest
npx tsc --noEmit   # typecheck
```

The skill catalog (`src/skill-catalog.generated.ts`) is generated from `skills/` by `scripts/embed-skills.mjs` (runs as part of `build`/`pretest`). Edit the `skills/*.md` sources, not the generated file.

## Git workflow

- **Feature branches + PRs only. Never push to `main` directly.** `main` is protected.
- CI must pass: typecheck + test + build. An automated Simple/Lovable/Complete review runs on each PR.
- Clear commit subjects (~50 chars); the body explains *why*. End agent-driven commits with a `Co-authored-by:` trailer.
