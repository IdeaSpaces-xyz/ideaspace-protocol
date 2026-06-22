---
name: Next
summary: Queued — the conformance kit (reference space + validator) and wiring downstream consumers onto the reference library.
---
# Next

- **Conformance kit.** Populate `conformance/reference-space/` with a known-good conformant space, and `conformance/validate.ts` to check a space (and an implementation) against `SPEC.md`'s MUST/SHOULD.
- **Downstream consumers.** Reference implementations and tools consume `@ideaspaces/protocol` rather than re-implementing the shape; existing duplicate frontmatter/`_agent/` readers fold into it.
- **Attach-type namespace.** Firm up the `attached_to` vocabulary as usage settles.
