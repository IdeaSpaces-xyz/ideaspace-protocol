---
name: Next
summary: Queued — carry the optional root identity through Keeper and local lifecycle adapters, then take the independent `_assets/` convention and remaining read-shape cleanup.
---
# Next

Root identity is now protocol-owned without becoming a migration gate. Local effects are adopted by
the TypeScript consumers. The next work belongs at the boundaries that consume those shapes:

- **Keeper adoption and local lifecycle.** A local-first Space supplies its declared current ID for
  atomic adoption; a Keeper-first legacy Space retains the ID Keeper already minted. CLI create,
  publish, clone, and fork then implement the one-minter lifecycle. Existing hosted checkouts may
  propose the exact foundation patch, but absence remains valid and no read silently writes or
  commits.
- **`_assets/` convention.** Name `_assets/` as supporting material at any position, with ordinary
  Markdown paths resolved from the containing Note and no ancestor search or root fallback. Align
  spec, schema, reference implementation, and language-neutral fixtures before rendering/hosting
  consumers proceed independently.
- **Contract-delta primitive.** Given a touched path and already-seen `_agent/` positions, return newly
  crossed contracts at surface depth. Pure read over existing composition machinery, with fixtures;
  this lets harnesses enforce ambient fractal awareness instead of relying on agent discipline.
- **Retire the legacy `assembleAwareness` wrapper.** Audit for remaining consumers, then deprecate and
  remove it in a minor release.
- **Attach-type namespace.** Extend the open `attached_to` vocabulary only when real platform behavior
  earns it.
