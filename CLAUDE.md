# CLAUDE.md — ideaspace-protocol

> This repo is a conformant **ideaspace** — it dogfoods the protocol it defines. The agent contract is in [`_agent/`](_agent/); read it first.

## Orient

1. [`_agent/foundation.md`](_agent/foundation.md) — what this place is, the handshake (root only).
2. [`_agent/purpose.md`](_agent/purpose.md) — why it exists.
3. [`_agent/now.md`](_agent/now.md) — what's active.
4. [`_agent/guide.md`](_agent/guide.md) — how to work here (design rules, build, git workflow).

The normative shape itself is [`SPEC.md`](SPEC.md).

## Build

```bash
npm ci
npm run build      # embed-skills + tsc → dist/ (ESM)
npm test           # vitest
npx tsc --noEmit   # typecheck
```

## The one rule to remember

**Pure shape, no platform code** — no sync, auth, API client, or transport. And keep `SPEC.md`, `schema/`, and `src/` coherent: a change to the shape touches all three. Full guidance in [`_agent/guide.md`](_agent/guide.md).
