# Canonical access

This is a portable vocabulary and statement shape, not an authorization service. It does not
resolve identities, store grants, check a database, issue credentials, or implement a server's
inheritance, audit or revocation. The reference functions operate only on supplied names and sets.
Absence of a grant statement says nothing about an unresolved policy question.

## One meaning per capability

| Name | Meaning |
|---|---|
| `discover` | Find that a target exists; not permission to read its content. |
| `view` | Read content **and its history**, including a Thread's posts. Also discover. |
| `comment` | Take part: comment on content or post in a Thread. Also view. |
| `edit` | Create and change content, including pushing Repo commits. Also comment and copy. On a Space's Map, this includes adding references. |
| `copy` | Take an independent copy: Repo clone or fork. Also view. Copy mechanics for other targets remain with their consumers. |
| `reshare` | Allow sharing: give access onward, bounded by the rights already held. Also view. On a Space, adding people gives them rights on the Map only. |

The implication edges are `edit → comment, copy`; `comment, copy, reshare → view`;
`view → discover`. `expandCapabilities` takes their closure, without duplicates, in the
order `discover, view, comment, edit, copy, reshare`. Inputs are canonical capability names.
No implication gives `reshare` from `edit`. This is a partial order: a Viewer with copying
is not a Commenter, and a Commenter with sharing is not an Editor.

`CAPABILITY_LADDER` is only the ordered spine `discover, view, comment, edit`.
`CAPABILITY_OPTIONS` is `copy, reshare`; these are also capabilities. `capabilityRank` is
retained as a deprecated display helper: spine index or -1, **never authorization**.
`CAPABILITY_OPTION_IMPLIED_AT` is `{copy: edit}`. `isValidCapability` accepts all six names.

## Levels and switches

Machine names are lowercase. Human labels belong in a shared consumer label map, not duplicated
in each surface. This contract defines their meanings, not translated labels.

| Level | Rights |
|---|---|
| `viewer` | view (content, history, discover) |
| `commenter` | comment, including Viewer |
| `editor` | edit, including Commenter and copying |
| `owner` | Ownership, with every applicable right on what is owned, copying included; not a transferable grant. |

Allow copying adds `copy`. Allow sharing adds `reshare`. Editor already includes copying;
turning a copying switch off cannot subtract a right implied by Editor. Ownership is not
conferred by a grant of every capability. A resharer cannot transfer ownership.

`accessLevelProfile(target, level)` returns `grantable` with the expanded capability set,
`owner` for the ownership relationship, `open` when the named profile is not decided, or
`not_applicable`. It deliberately returns no grantable capability set for Owner.

| Target | Agreed profiles / boundary |
|---|---|
| Vault | Viewer, Commenter, Editor, Owner express a grant's scope over the owner's world; this does not invent a Vault-specific comment, push or clone operation. |
| Repo, folder, Note | Viewer, Commenter, Editor, Owner. Grants and ownership flow down the content tree. |
| Space | Owner. **Open:** which other named levels to offer and their precise bundles. Express the agreed acts directly on the Map: `edit` for adding items, `reshare` for adding people. |
| Thread | Viewer, Commenter, Owner, plus Allow sharing. No Editor profile. Owner edits the Agreement, renames and closes; Commenter posts, not manages. A closed Thread is read-only. |
| Conversation | Owner only: the canonical human owner. No grants, public access, org access, Space inheritance or cross-person sharing. |

Closing a content branch closes it and its descendants (`blocked`); a root grant covers
its descendants otherwise. Owner inherits down to folders and Notes. These are rules for
host evaluators, not permission to inherit through a Map pointer, a Space reference, a
Thread attachment, or into a Conversation. Blocking is not another level or an empty grant.
No per-child filtering scheme, tuple encoding, or block precedence algorithm is introduced here.

## Portable grant statement

A complete statement has these fields. This is not Note frontmatter and not a persistence
or API format. Unknown fields are preserved; no target is fetched or created.

```json
{
  "target": {"kind": "repo", "id": "research"},
  "subject": {"kind": "organisation", "id": "acme"},
  "capabilities": ["view"]
}
```

- `target.kind`: `vault | space | repo | folder | note | thread`. `id` is an opaque,
  nonempty string, not a new identity system. A Space target names its Map. A Conversation
  cannot appear here.
- `subject.kind`: `person | team | organisation | agent | public`. `id` is nonempty;
  public uses `*`. `organisation` means the members of that organisation. A team is a group
  of people, not a Space's membership. There is **no Space audience** grantee. The normalizer
  accepts US `organization` as a spelling alias; canonical statements use `organisation`.
- `capabilities`: a nonempty array of canonical names. Stored aliases, labels and `owner`
  are not capability names. A Thread grant cannot contain `edit`. Public can discover, view
  and, with Allow copying, copy; it cannot comment, edit or reshare.

`parseAccessGrant` returns `valid` with the unchanged statement or `invalid` with ordered
issue codes: `invalid_grant`, or `invalid_target`, `invalid_subject`, `invalid_capabilities`,
`thread_has_no_editor`, `invalid_public_capabilities` as applicable. This is a shape check, **not approval to issue the grant**.
Other target/act restrictions and undecided policy still need the host's check. In particular,
accepting a primitive does not settle an Open level profile or create a new product operation.

Sharing with everyone in an org is this **subject**, not a fifth privilege level. The grant
still names the rights being given. People brought into a company are there by default, and
Editors can share there, but **Open:** whether company Vault membership alone reads anything
without an org grant. Do not encode either answer as a default permission. Do not silently add
Allow sharing to every Editor everywhere to resolve this question.

A Space grant affects only the Map. Adding a Repo, Note, Thread, agent or another Space to it
never issues a content grant. Inviting people never grants the referenced content. A person
without access to a reference can request it; the request's API shape is outside this contract.
Local and remote Spaces and Vaults are separate; a Map is not a container inheritance edge.

## Sharing and agents

`canPassAccess(held, requested)` requires `reshare` in the closure of held rights, and every
requested right (including its implications) already held. It tests the rights bound only.
The host must still check the target, caller, recipient, blocks, closure state and current
rights when issuing a grant. It never turns Allow sharing into ownership or an unrestricted
management capability. Adding people to a Space passes Map rights only.

An agent acts with **person access ∩ agent ceiling**, not their union. The ceiling consists of
grants to the agent, set by its owner; its default scope is the person's or organisation's
Vault. `intersectAccessCapabilities` closes each supplied set, then intersects in canonical
order. It resolves no identity and creates no default grants. The host determines the session's
starting set from the Space's Map, fixes that set at session start, and checks the person's
access again on each open. Map members open directly if allowed; following a link out is checked
then. A Space is a starting lens, not a grant or an absolute prohibition on following references.
Agent ceilings cannot unlock another person's Conversation. Credential exchange, expiry,
allowed acts, session attribution and revocation remain host responsibilities.

## Mapping today's words

This table replaces the older split vocabulary; it is not permission to preserve contradictory
legacy behavior. `mapLegacyCapability` returns `mapped` with a closed capability set, `ignored`
for unsupported names/families, or `open` for the unresolved governance action below.

| Existing word | Canonical meaning |
|---|---|
| `view`, `read`, `history` | view, including content and history |
| `discover`, find-only `find` | discover only |
| `comment` | comment |
| `write` on content | edit |
| `write` on a Space | edit its Map, never the referenced content |
| `write` on a Thread | comment |
| `git_push`, old protocol `push`, on Repo/folder/Note content | edit, bounded to that target |
| `git_fetch`, `space_copy`, on Repo/folder/Note content | copy (which includes view), bounded to that target |
| `manage` (stored grant), `reshare` | Allow sharing, not Owner and not Editor |
| `copy` | Allow copying |
| Viewer, Commenter, Editor | named profiles above, not stored capability aliases |
| Owner, owner relation | ownership, not a `manage` grant |
| Thread owner labelled Editor | correct the label to Owner using owner evidence; never promote every writer |
| Public | Viewer granted to `{kind: public, id: '*'}` |
| `manage_access` (derived governance action) | **Open mapping:** it is not the stored `manage` capability; its human/root-role checks cannot be faithfully renamed to Allow sharing. |

Legacy transport aliases are ignored on Vault, Space and Thread targets by this mapping.
On folders and Notes they map to content rights, not permission to fetch or push the whole Repo;
the host still checks transport at the Repo root. `use` is not a capability
in these seven target kinds. Agent use implies view/discover of the agent, but invocation is
not defined here. Invalid-on-family grants must not be promoted into a different family.
Legacy actor, exchange and standalone Map families need their own explicit target migration;
this table does not guess that every exchange is a Thread or every Map is a Space.

**Protocol migration from 0.30.0:** `view` is no longer a Map-only right distinct from `read`
and `history`. Those names map to one `view`. `write`/`push` become `edit`; `manage` becomes
`reshare`, which **does not imply edit**. `copy` and `reshare` now pass `isValidCapability`.
Rank numbers have changed; persist names, never ranks. Re-check consumers that used rank
comparisons, treated `manage` as Owner, or treated a Map's disclosure depth as authorization.
Map parsers and representation depths themselves do not change. The historical Maps entrypoint
re-exports this one vocabulary; it does not retain the old meanings as a second system.

## Open — do not fill in defaults

1. Whether company Vault membership reads anything without an org grant; if so, which rights.
2. Space level profiles: which levels are offered and which acts each bundles. The individual
   Map acts above are expressible without answering this.
3. How the company rule that Editors can share there interacts with the general Allow sharing
   switch; do not generalize it into Editor always implies sharing.
4. How the derived `manage_access` governance boundary migrates to these rights and ownership.
5. Thread copying has no agreed user-facing switch/profile here; expressing `copy` as a primitive
   does not add one. Conversation export/copy operations are not defined by owner-only access.

## Conformance

[conformance/access/manifest.json](../conformance/access/manifest.json) is language-neutral.
Its operations name the pure functions above, with complete inputs and expected outputs.
Cases cover every agreed named profile, every target, both switches and their independent
combinations, org and Space statements, alias migration and invalid families, bounded sharing,
agent intersection, and Conversation exclusions. These prove **expressibility and set semantics**,
not a database evaluator, audited writer, revocation path or privacy of a deployed service.
