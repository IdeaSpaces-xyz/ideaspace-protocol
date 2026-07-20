# Commit trailers — the Change layer

> The checkable form of the Change layer. Normative prose is [`../SPEC.md#identity`](../SPEC.md). This is the enumeration tooling stamps and validates against, so the trailers are **identical across every surface** that writes them. **Provisional, v0.4.1.**

## It is just git

This layer invents no format and no storage. It is native git trailers — the key/value lines git already parses at the foot of a commit message:

- **write** — `git commit --trailer "Key: value"`, or `git interpret-trailers`;
- **read** — `git log --format='%(trailers:key=Change-Id,valueonly)'`;
- **query** — `git log --grep="Change-Id: …"`.

The `Change-Id` convention is **Gerrit's**, applied to a different axis. Gerrit links the patchsets of one change across *rebases* in *one* repo. We link the commits of one decision across *repos*. Same trailer, same query, different axis.

**Opt-in and additive.** Every trailer here is optional. A repo that ignores them is still a valid git repo, and bare `git` still works. Tooling adds them; nothing requires them.

**One spec, many languages.** The reference implementation is TypeScript ([`../src/`](../src)); other surfaces (e.g. a Python platform) implement the same shape and prove it against the conformance vectors. The spec is the source of truth, not any one implementation.

**Scope: format only.** This document defines the *shape* of the trailers — the keys, the values, the `Change-Id` format, and what a conformant tool must stamp and read. It does **not** define *when* to commit or how to run the squash/stamp flow (that is the [capture skill](../skills/capture.md)), nor what a Change *means* (that is the IdeaSpaces concept material, `core/change.md`).

## The trailer set

Stamped at the foot of the commit message, after the body, one per line.

| Trailer | Value | Cardinality | When |
|---|---|---|---|
| `Op` | `create` · `update` · `move` · `delete` · `restructure` · `capture` | 0–1 | what kind of change; the meaning lives in the body, not here |
| `Conversation` | session id, or a free-text description for external sessions | 0–1 | why — the session that produced the commit |
| `Turn` | integer | 0–1 | optional; the turn within the conversation |
| `Co-authored-by` | `<Name> <agent:<id>@ideaspaces>` | 0–n | every agent that drove or assisted the commit |
| `Change-Id` | `chg_<slug>[-<suffix>]` (see below) | 0–1 | which decision; **the same value on every commit in every repo** the Change touched |

Author is always the **person** (`person:<username>`), per [`../SPEC.md#identity`](../SPEC.md) — agents ride in `Co-authored-by`, never as author.

### Example

```
Update rate limiting to token bucket algorithm

Switched from fixed window to token bucket. Redis backend.
Docs and private context updated in the same session.

Op: update
Conversation: 96b44f50-984d-4ce9-8652-9474e198f19d
Co-authored-by: Keeper <agent:keeper@ideaspaces>
Change-Id: chg_token-bucket-a3f9
```

## Change-Id format

```
chg_<slug>[-<suffix>]
```

- **`chg_`** — fixed prefix; what makes the trailer greppable and unambiguous.
- **`<slug>`** — a short, human-readable kebab handle drawn from the decision (`token-bucket`, `fractal-awareness`). Legible on purpose: this trailer is read by people, not only tooling. This is the deliberate divergence from Gerrit, whose id is an opaque `I`-hash.
- **`<suffix>`** — a short random token (≈4 base36 chars) appended for **uniqueness across disconnected repos**. Two people opening a Change offline must not collide on a bare slug.

Match: `^chg_[a-z0-9]+(-[a-z0-9]+)*$`. Lowercase, ASCII, no spaces.

## Minting

- **Who mints:** whoever opens the Change — the local agent or CLI. **Never a platform call.** Minting MUST work fully offline; the id is generated locally and is final.
- **One id per decision, reused:** the same `chg_…` is stamped on every commit, in every repo, that belongs to the Change. It is not regenerated per commit or per repo.
- **A Change may span sessions.** `Conversation` can differ across the commits of one Change; `Change-Id` is the value that holds constant — `Conversation` is *how it was produced*, `Change-Id` is *what it belongs to*.

*When* and *how* a surface stamps these — the squash-into-handshake flow — is behavior, not format; it lives in [the capture skill](../skills/capture.md). The format's only say in it is conformance check 8 below.

The **open** Change (the one currently stamping commits) is persisted between sessions and shared across surfaces as a user-level record — its shape, cache derivation, and the same-session arming rule are in [`surface-state.md`](surface-state.md).

## Association, not containment — explicitly not submodules

A Change spans repos, which invites comparison to git submodules. The Change layer is the **opposite topology**, by design:

| | git submodules | Change-Id |
|---|---|---|
| relationship | containment — a superproject points *down* | association — peer commits share a label |
| reference | a pinned SHA stored in a parent tree | a trailer value, no stored pointer |
| discovery | read the parent | `git log --grep` — reconstructed by query |
| owner | the superproject owns the pins | **ownerless** |

**There is no superproject.** No repo owns the others; no parent stores pointers; no commit bumps a pin. The link between repos is a shared trailer value, smeared laterally across equal peers and recovered by search. This is a non-goal stated up front so tooling does not drift toward a container model: a Change is reconstructed, never owned. (This matches the runtime stance — a home repo is authority for its own content; other repos are peers in a working set, not children.)

The trade this makes versus submodules: we give up **enforced** lockstep pinning (reproducible "all repos at exactly this state") and keep **recorded** association (loose, ownerless, recoverable — query the id, then read each commit's SHA). Enforced pinning is a reproducible-build need; the Change layer is for provenance across independently-evolving repos.

## The diff as a Note

A Change's interpretation MAY be captured as a Note carrying the same `Change-Id` in its trailers, linking the decision's meaning back to its commits. Only that **link** — the trailer on the Note — is in scope here. Whether and how the Note is captured is concept and behavior, not format (the IdeaSpaces concept material, `core/change.md`).

## Conformance checks

A tool that writes or reads the Change layer:

**MUST**
1. author commits as the person (`person:<username>`); never author as an agent;
2. write trailers as native git trailers (foot of message, `Key: value`), so bare `git` and `git interpret-trailers` read them unchanged;
3. leave a commit with no trailers valid — the layer is additive, never required;
4. when it stamps `Change-Id`, use the **same** value on every commit of that Change across every repo, and match `^chg_[a-z0-9]+(-[a-z0-9]+)*$`;
5. mint `Change-Id` locally, with no network dependency.

**SHOULD**
6. append `Co-authored-by: <agent>` when an agent drove the commit;
7. stamp `Op` and `Conversation` when it has them;
8. attach `Change-Id` on the squashed handshake commit, not on intermediate saves;
9. parse trailers idempotently — re-reading a commit yields the same set, order-independent;
10. expose the cross-repo query (`git log --grep="Change-Id: …"`) over every repo it coordinates.

See [`../SPEC.md#conformance`](../SPEC.md) for the identity MUST/SHOULD this builds on.
