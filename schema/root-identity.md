# Root identity

> Language-neutral contract for a Space's optional portable identity. **Provisional, v0.9.0.**

## Declaration

A contract-bearing Space MAY declare `root_node_id` in the YAML frontmatter of its root
`_agent/foundation.md`:

```yaml
---
name: Example Space
summary: Example knowledge.
root_node_id: n_0123456789abcdef01234567
---
```

The field belongs only to the root foundation handshake. It is not knowledge-Note frontmatter, a
per-Note identity, a storage primary key, or proof of access. A nested `foundation.md` starts another
Space and therefore may declare that nested Space's own identity.

The field is optional. Its absence is valid for legacy repositories, imported plain Markdown, and
contract-free folders. A reader MUST NOT fail conformance, create `_agent/foundation.md`, or require a
migration merely because identity is absent.

## Forms

Readers accept exactly:

| Form | Grammar | Meaning |
|---|---|---|
| current | `^n_[0-9a-f]{24}$` | 96 random bits, the only form new writers mint |
| legacy | `^n_[0-9a-f]{12}$` | existing 48-bit hosted identity, preserved on read |

Writers MUST mint only the current form. They MUST NOT normalize, expand, or silently replace a valid
legacy value. IDs are opaque and case-sensitive.

Current generation takes exactly 12 cryptographically random bytes, renders each byte as two
lowercase hexadecimal digits, and prefixes the result with `n_`. A deterministic implementation MAY
accept the 12 bytes as an injected input; a convenience minting function MUST obtain those bytes from
a cryptographically secure random source.

## One minter per lifecycle

- **Local first:** a protocol-aware local creator mints before publication; the Keeper atomically
  adopts that exact ID.
- **Hosted first:** the Keeper mints when it creates the hosted Space; a local checkout later preserves
  and may declare that same ID.
- **Clone:** retains the identity.
- **Fork:** mints a new current ID and rewrites only the fork's root foundation declaration.
- **Registered drift:** editing the declaration never rebinds hosted authority. Collision, drift, or
  incompatible binding fails explicitly or requires a separate rekey operation.

No lifecycle permits both sides to mint independently and then choose a winner.

## Pure evidence evaluation

The protocol does not discover remotes, contact a Keeper, read credentials, or decide which host is
trusted. A caller MAY supply IDs it has already extracted from these sources:

1. `declaration` — root foundation frontmatter;
2. `canonical_origin` — a canonical Keeper origin whose locator carries the root ID;
3. `local_registry` — the caller's local binding for that checkout.

An evaluator validates each supplied value and returns one state:

| State | Condition | Safe selected identity |
|---|---|---|
| `absent` | no evidence | none |
| `local_only` | declaration only | declaration |
| `legacy_unstamped` | one established origin/registry ID, no declaration | established ID |
| `aligned` | declaration and all established evidence agree | agreed ID |
| `drift` | declaration disagrees with one established ID | none |
| `ambiguous` | canonical origin and local registry disagree | none |
| `invalid` | any supplied value is malformed | none |

Evidence order in a result is declaration, canonical origin, local registry. `drift`, `ambiguous`, and
`invalid` MUST NOT return a selected identity: callers must not turn conflict into implicit rebinding.
A valid legacy ID participates exactly like a current ID and retains its original form.

## Lazy legacy convergence

Missing identity does not interrupt ordinary reads or Git operations. When a legacy checkout has one
trusted established ID and no declaration, a tool MAY report `legacy_unstamped` and propose adding
that exact ID to an existing root foundation. The proposal is one reviewable file change. A tool MUST
NOT silently write, stage, commit, create an agent contract solely for identity, mint a replacement,
or request that Keeper rebind the hosted Space.

The exact proposal surface is a harness decision. A status read may report the state but remains
read-only. Absence remains supported until a person accepts and captures the declaration.

## Conformance

An implementation claiming root-identity conformance MUST execute every required coverage tag in
[`../conformance/root-identity/manifest.json`](../conformance/root-identity/manifest.json). The vectors
cover optional absence, current and legacy reads, deterministic current generation, all evidence
states, and malformed evidence. They contain no platform URL, registry format, network operation, or
language-specific API shape.
