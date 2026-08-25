---
name: Next
summary: Queued — carry root identity and the `_assets/` convention into their independent consumers, then continue the contract-delta and read-shape cleanup lanes.
---
# Next

Root identity is now protocol-owned without becoming a migration gate. Local effects are adopted by
the TypeScript consumers. The next work belongs at the boundaries that consume those shapes:

- **Keeper adoption and local lifecycle.** A local-first Space supplies its declared current ID for
  atomic adoption; a Keeper-first legacy Space retains the ID Keeper already minted. CLI create,
  publish, clone, and fork then implement the one-minter lifecycle. Existing hosted checkouts may
  propose the exact foundation patch, but absence remains valid and no read silently writes or
  commits.
- **`_assets/` consumers.** Desktop resolves the v0.10.0 lexical path inside a workspace-bounded
  asset protocol. Hosted surfaces separately remove payload trees from content indexing and add
  authorized inert-raster serving/projection. MIME, limits, access, and storage stay consumer policy,
  not protocol shape.
- **Contract-delta primitive.** Given a touched path and already-seen `_agent/` positions, return newly
  crossed contracts at surface depth. Pure read over existing composition machinery, with fixtures;
  this lets harnesses enforce ambient fractal awareness instead of relying on agent discipline.
- **Retire the legacy `assembleAwareness` wrapper.** Audit for remaining consumers, then deprecate and
  remove it in a minor release.
- **Attach-type namespace.** Extend the open `attached_to` vocabulary only when real platform behavior
  earns it.
