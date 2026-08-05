---
name: Now
summary: Current state — v0.4.8 aligns the public package around the protocol's repository shape and agent operating loop without changing portable APIs; v0.4.7 added neutral workspace handles.
---
# Now

**v0.4.8, early and provisional — one public standard for repository shape and the agent operating loop.**

In place:
- **Public capture-standard framing — delivered in v0.4.8.** GitHub and npm now lead with the outcome the protocol makes portable: agents preserving useful work as durable Markdown and git history. The package APIs and schema semantics are unchanged from v0.4.7.
- `SPEC.md` + `SKILLS.md` — the normative shape and ability layer, including explicit push/pull directions and the protocol-owned shared skill catalog.
- `schema/` — provisional frontmatter, `_agent/` contract, and Change-layer trailer formats. `attached_to` is one typed link with an open, platform-defined type vocabulary.
- `src/` — the reference TypeScript library for frontmatter, contract composition, awareness, path walking, git state, drift, skills, conformance, and Change trailers. The full suite is green.
- **Structured Content awareness — delivered in v0.4.5.** `assembleContentAwareness` returns portable position/Now/tree/contract/skills/activity/git/drift facts; `renderContentAwareness` renders canonical selected sections. The manifest is the local filesystem/git Content adapter, not a graph/platform manifest. Harnesses retain placement, session state, mounts, seen-ref writes, and remote tiers; `assembleAwareness` remains as the compatibility block.
- **Tree-shakeable direct imports — delivered in v0.4.6.** The package declares `sideEffects: false`, matching its function/constant-only modules, so bundlers may remove unused protocol re-exports. This keeps a hook that imports only path/git primitives from carrying the YAML-backed awareness/conformance graph.
- **Portable workspace handles — delivered in v0.4.7.** `readRootHandle` returns a root's Now/README summary and immediate directory count; `readWorkspaceRepositories` returns sorted immediate-child repository handles with raw git state. The protocol assigns no home/mount/POV role, renders no catalog, contacts no remote, and performs no writes. Repository qualification compares the resolved git toplevel with the child itself, supporting linked worktrees and repository-root symlinks without misclassifying directories inherited from a parent repo.
- Downstream adoption — CLI, MCP, the Claude plugin, and Pi consume the v0.4 shape directly; shared references are generated from this repo's catalog. SDK 0.2 is a separate Keeper transport package with no protocol dependency or re-export.
- **Cross-surface conformance — delivered (2026-07-16→18).** Every surface proves the same write-path contract in its own CI, judged by this repo's kit (`validateSpace` + trailer vectors): the CLI in its own tests, the MCP server + Claude plugin through the shipped MCP artifacts (claude-code-plugin#46), and Pi through its genuine extension runtime (pi-is-space#52). Surface parity is now *tested semantically*, not asserted. The program earned its keep immediately: seven real defects found in three days, five fixed — including a rename-commit failure in the CLI's path-scoped commit (cli#85), a floating-install breakage, and a cross-surface record race — each now locked by a conformance vector.
- **Distribution drift guards — shipped, consumer-side.** The Claude plugin pins vendored bundles with a hash-verified lock and a CI rebuild check; Pi installs from a committed lockfile via `npm ci`. Consumers can no longer silently lag the protocol or float their dependencies.
- **Full-stack fractal composition — delivered post-v0.4.8 (#29).** `ComposedSpace.stack` carries every `_agent/` level root-first; a branch guide narrows the root guide instead of deleting it, and `_agent/skills` compose along the path with deeper same-named shadowing. SPEC invariant 4 and the schema now state the layer-vs-scope distinction explicitly: the four fractal files *layer*; `foundation.md` *scopes*.
- **The canonical foundation core — delivered post-v0.4.8 (#31).** `templates/foundation-core.md` is the conduct seed scaffolds compose into a new space's `_agent/foundation.md` (values, Protect/Never, capture-is-conscious, the generalized untrusted-content stance), exported as `FOUNDATION_CORE`/`FOUNDATION_CORE_VERSION` via the embed pipeline and shipped as a raw asset for non-TS runtimes. Default content, not a conformance requirement — part of the foundation-alignment layered split: conduct lives in the space, capability and mechanics in the harness.
- This `_agent/` contract — the repo dogfoods the protocol.

Next (detail in [next.md](next.md)):
- Lift the shared cache-path derivation into the reference library — four consumers duplicate it today, held together by golden-value tests.
- A contract-delta primitive for ambient fractal awareness on the surfaces.
- The local-write module decision — whether this library grows a clearly-scoped write layer; a deliberate revision of the read-only design rule, to be decided here with the consumer evidence in hand.
- Let the open `attached_to` type vocabulary evolve only from demonstrated platform needs.
