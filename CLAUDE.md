# CLAUDE.md — ideaspace-protocol

> The platform-neutral **shape** of a knowledge repo. An inhabitation contract — shape + identity + conformance + the verbs to work a space — not a data format for retrieval.

See [README.md](README.md) for the layering and [SPEC.md](SPEC.md) for the normative shape.

## What this repo is (and isn't)

- **Is:** `SPEC.md` + `SKILLS.md` (normative), `schema/` (machine-readable contract), `src/` (reference TypeScript implementation), `conformance/` (reference space + validator).
- **Is not:** a platform. **No sync, no auth, no API client, no transport code.** That is the open-core line — platform logic lives in `@ideaspaces/sdk`, which depends on this. A change that adds platform code here is wrong by construction.

## Principles

- **Simple, Lovable, Complete.** Functional API over class wrappers; zero runtime deps beyond `yaml`; stdlib + Node primitives first.
- **Spec ↔ schema ↔ impl stay coherent.** A change to the shape updates `SPEC.md`, `schema/`, and `src/` together — never let them drift.
- **The schema is provisional + extensible.** `additionalProperties` stays true; nothing strictly required (an absent field is a drift signal, not an error); the `attached_to` attach-type namespace grows by deliberate, versioned change.
- **Language-neutral core.** The spec + JSON Schema must let non-TS surfaces (the Python `sw_space` backend) conform. The TS lib is the *reference* implementation, not the only one.
- **Read-only shape primitives** (`findSpaceRoot`, `assembleAwareness`, `stripFrontmatter` don't write). Cross-platform paths via `node:path`. Async by default for I/O.

## Develop

```bash
npm ci
npm run build      # embed-skills + tsc → dist/ (ESM)
npm test           # vitest
npx tsc --noEmit   # typecheck
```

The skill catalog (`src/skill-catalog.generated.ts`) is generated from `skills/` by `scripts/embed-skills.mjs` (runs as part of `build`/`pretest`). Edit the `skills/*.md` sources, not the generated file.

## Git workflow

- **Feature branches + PRs only. Never push to `main` directly.** `main` is protected by CI.
- CI (`.github/workflows/ci.yml`): typecheck + test + build must pass.
- SLC review (`.github/workflows/claude-code-review.yml`): automated Simple/Lovable/Complete review on each PR.
- Clear commit subjects (~50 chars); body explains *why*. End agent-driven commits with `Co-authored-by:`.
