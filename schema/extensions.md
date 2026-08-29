# Documenting a named extension

> Language-neutral guidance for publishing semantics beneath one opaque extension boundary. **Provisional, v0.12.0.**

The base protocol recognizes an extension container by its first underscore-prefixed directory and
then stops. It does not discover what the extension means or whether a runtime supports it. A named
extension publishes that meaning separately, without changing
[`repository-path.md`](repository-path.md), registering a name, or adding a loader.

## The contract

A documented extension states only what its semantics require:

1. **Exact name and placement.** Give the case-sensitive underscore-prefixed directory name, such
   as `_foo/`, where it may occur, and which containing position owns it. Exact `_agent/` remains
   core and is not available to a named extension. First-owner precedence still applies.
2. **Payload.** Define the internal grammar or role. If payload is opaque bytes, say so rather than
   inventing a manifest.
3. **Authored references.** Define how ordinary Content refers to payload, if it does. Preserve
   portable authored forms and state the resolution base and normalization rules.
4. **Unaware behavior.** An unaware reader quietly leaves the entire subtree opaque. It does not
   parse payload as Content, fail because the name is unknown, or execute repository material.
5. **Portable operations and vectors.** Specify only behavior independent implementations must
   share. A standard extension publishes language-neutral vectors for those operations.
6. **Format evolution.** When structured payload needs versioning, the extension's own files carry
   the format identifier or version, and the contract states safe behavior for unsupported forms.
   Compatible additions keep the same directory name. The base protocol does not negotiate
   extension versions.

The readable contract ships where an implementer can find it, normally beside the extension's
source or distribution. Its filename and repository layout are not protocol requirements. A schema,
examples, authoring skill, or reference adapter is added only when the semantics need one. There is
no mandatory extension-kit tree.

A private convention becomes a **documented extension** when this contract is published. It becomes
a **standard extension** when independent implementations share a normative contract and vectors.
Neither maturity level makes the extension core.

## Minimal template

```markdown
# `_foo/`

## Name and placement
## Payload
## Authored references
## Unaware readers
## Portable operations and conformance
## Format evolution
```

Omit an authored-reference or versioning section when the extension has no such semantics. Do not
replace a missing semantic with registry, package, discovery, or adapter machinery.

## Worked example: `_assets/`

[`assets.md`](assets.md) is the first standard extension contract:

- **Name and placement:** exact `_assets/`, beneath any content position.
- **Payload:** referenced supporting material; descendants are not Notes, surfaces, search input, or
  ambient context.
- **Authored references:** ordinary relative Markdown destinations, resolved from the containing
  Markdown file without ancestor search or fallback.
- **Unaware behavior:** the generic extension boundary skips the subtree quietly.
- **Portable operation:** `resolve_asset_reference`, implemented by the TypeScript reference export
  `resolveAssetReference`.
- **Vectors:** [`../conformance/assets/manifest.json`](../conformance/assets/manifest.json), claimed
  separately from base repository conformance.
- **Format evolution:** none is currently needed; payload files remain ordinary opaque bytes. A
  future structured asset file would own its format version inside the `_assets` contract rather
  than adding base-protocol negotiation.

Rendering, MIME and size limits, storage, serving, access, upload, and filesystem capabilities remain
consumer policy, not extension semantics.

## What this does not create

Publishing a named contract does not create extension inventory, support discovery, a central
registry, an in-Space manifest, package installation, adapter selection, conflict resolution, a
trust taxonomy, or executable repository payload. Those are separate runtime concerns and require
observed demand of their own.
