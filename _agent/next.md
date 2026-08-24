---
name: Next
summary: Queued — adopt the shipped TypeScript local effects downstream while Rust implements the same vectors independently, then continue cache-path, contract-delta, legacy-awareness, and earned attachment work.
---
# Next

The previous queue's first two items — cross-surface conformance and distribution drift guards — are **delivered** (see [now.md](now.md)); surface parity graduated from a queue item to a tested invariant (each surface's conformance CI is the parity test). What the consumer evidence earned next:

- **Cache-path derivation into the reference library.** The user-level session/Change cache-path scheme (`~/.ideaspaces/{sessions,changes}/<sha256(project-dir)[:16]>`) now exists in four consumer copies — the MCP server (write + read), the Claude plugin hook (read), and Pi (write + read) — locked together only by shared golden-value tests. It is a pure path computation; export it once here and retire every copy. The Change record shape (`{change_id, handle, opened_at, session_id}`) travels with it — it is deliberately **shared across surfaces** (a Change opened in one surface surfaces in another; session-aware arming makes cross-surface silent stamping impossible), so the single source of truth belongs at the shape layer.
- **Contract-delta primitive.** Given a touched path and the set of already-seen `_agent/` positions, return the newly crossed contracts at surface depth (depth 0, progressive disclosure). Pure read over existing composition machinery, with conformance fixtures. This is what lets surfaces make fractal awareness *ambient* — the spec's first MUST ("read `_agent/` along the path before acting") enforced by tooling instead of agent discipline.
- **Adopt the TypeScript effect boundary downstream; keep Rust independent.** The `@ideaspaces/protocol/local-effects` reference subpath now executes the fixed v0.7.0 vectors without leaking mutation through the package root. CLI can become the terminal/platform adapter next, followed independently by MCP/Claude and Pi session-ledger adoption. The installable exchange's Rust core still implements the same manifest without depending on TypeScript semantics.
- **Retire the legacy `assembleAwareness` wrapper.** The CLI — its last known consumer — migrated to `assembleContentAwareness`/`renderContentAwareness` (cli #100). Audit for remaining consumers, then deprecate and remove in a minor release.
- **Attach-type namespace.** Extend the open `attached_to` type vocabulary only when real platform behavior earns it. (Unchanged; no demonstrated need yet.)
