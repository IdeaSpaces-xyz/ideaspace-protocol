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
| `edit` | Create and change content, including pushing Repo commits. Also comment. On a Space's Map, this includes adding references. Which split copying rights Editor includes is Open. |
| `fork` | Take an independent copy of the current state, **without history**. Also view. |
| `pull` | Take the whole Git history, not just a copy of the current state. Also view. |
| `reshare` | Allow sharing: give access onward, bounded by the rights already held. Also view. On a Space, adding people gives them rights on the Map only. |

The implication edges are `edit → comment`; `comment, fork, pull, reshare → view`;
`view → discover`. `expandCapabilities` takes their closure, without duplicates, in the
order `discover, view, comment, edit, fork, pull, reshare`. Inputs are canonical capability
names. This is the closure of **settled implications only**: a missing Open copying right is
not a ruling that the person lacks it. Hosts must settle policy before enforcing these sets.
Fork and pull are separate rights: neither implies the other here. Do not infer
pull from permission to read history in the web, or whole-Repo Git access from a Note grant.
No implication gives `reshare` from `edit`.

`CAPABILITY_LADDER` is only the ordered spine `discover, view, comment, edit`.
`CAPABILITY_OPTIONS` is `fork, pull, reshare`; these are also capabilities. `capabilityRank`
is retained as a deprecated display helper: spine index or -1, **never authorization**.
`CAPABILITY_OPTION_IMPLIED_AT` is empty pending the copying ruling below.
`isValidCapability` accepts all seven names. Rights are a partial order, not a total rank.

## Levels and switches

The user-facing words stay **Viewer, Commenter, Editor, Owner, Allow copying, Allow sharing**.
Fork and pull name underlying rights here, not new user-facing labels.
Machine names are lowercase. Human labels belong in a shared consumer label map, not duplicated
in each surface. This contract defines their meanings, not translated labels.

| Level | Rights |
|---|---|
| `viewer` | view (content, history, discover) |
| `commenter` | comment, including Viewer |
| `editor` | edit, including Commenter. Earlier it included Allow copying; which of fork/pull it includes after the split is **Open**. |
| `owner` | Ownership, with every applicable right on what is owned, copying included; not a transferable grant. |

Allow sharing adds `reshare`. **Open:** how the existing Allow copying switch selects fork,
pull or both, and which of them Editor implies. The earlier copying bundle combined state
copy and Git history; it cannot be carried across the new split by guesswork. An Editor's
known editing rights are expressible as `edit`, and either copying right can be stated
explicitly, without pretending its default bundle has been decided.

Ownership is not conferred by a grant of every capability. A resharer cannot transfer it.
An agent owns nothing; its person is responsible. An organisation may share an agent and
limit its access. Only people and organisations own; a Conversation has a human owner.

An organisation owns and receives grants but **never acts**. People and agents act,
including when sharing an organisation's Thread. An organisation can receive a grant on a
Space's Map. `ACTING_SUBJECT_KINDS` is `person, agent`; `OWNING_SUBJECT_KINDS` is
`person, organisation`. `isActingSubjectKind` classifies these names without authenticating
an actor or resolving who may act for an organisation.

`accessLevelProfile(target, level)` returns `grantable` with the expanded capability set,
`owner` for the ownership relationship, `open` when the named profile is not decided, or
`not_applicable`. For content Editor, `open` also carries its **known** editing capabilities,
not a complete grant bundle. It deliberately returns no grantable capability set for Owner.

| Target | Agreed profiles / boundary |
|---|---|
| Vault | Viewer, Commenter, Editor (copying bundle Open), Owner express a grant's scope over the owner's world; this does not invent a Vault-specific comment, push or clone operation. |
| Repo, folder, Note | Viewer, Commenter, Editor (copying bundle Open), Owner. Grants and ownership flow down the content tree. |
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
  nonempty string, not a new identity system. A Space target names its Map. A folder or Note target expresses the grant's depth scope;
  this is distinct from Map representation depth and from fork/pull rights. A Conversation
  cannot appear here.
- `subject.kind`: `person | team | organisation | agent | public`. `id` is nonempty;
  public uses `*`. `organisation` means the members of that organisation. A team is a group
  of people, not a Space's membership. There is **no Space audience** grantee. The normalizer
  accepts US `organization` as a spelling alias; canonical statements use `organisation`.
- `capabilities`: a nonempty array of canonical names. Stored aliases, labels and `owner`
  are not capability names. A Thread grant cannot contain `edit`. Public can discover, view
  but cannot comment, edit or reshare. A primitive fork/pull statement is representable;
  **behaviour for public Repos is Open**, including the old copying switch's new bundle.
  Shape acceptance must not turn that into an access decision.

`parseAccessGrant` returns `valid` with the unchanged statement or `invalid` with ordered
issue codes: `invalid_grant`, or `invalid_target`, `invalid_subject`, `invalid_capabilities`,
`thread_has_no_editor`, `invalid_public_capabilities` as applicable. This is a shape check, **not approval to issue the grant**.
Other target/act restrictions and undecided policy still need the host's check. In particular,
accepting a primitive does not settle an Open level profile or create a new product operation.

Sharing with everyone in an org is this **subject**, not a fifth privilege level. The grant
still names the rights being given. People brought into a company are there by default, and
Editors can share there, but **Open:** whether company Vault membership alone reads anything
without an org grant. Suggested discover-for-members and Viewer-on-new-Repos defaults are
not settled here. Do not encode either answer as a default permission. Do not silently add
Allow sharing to every Editor everywhere to resolve this question.

A Space grant affects only the Map. Adding a Repo, Note, Thread, agent or another Space to it
never issues a content grant. Inviting people never grants the referenced content. A person
without access to a reference can request it; the request's API shape is outside this contract.
Local and remote Spaces and Vaults are separate; a Map is not a container inheritance edge.

### Ownership statement

`AccessOwnership` keeps ownership separate: `{target: {kind, id}, owner: {kind, id}}`.
The target can be any of the seven kinds, including Conversation. The owner's kind is
`person | organisation`, never agent, team or public. A Conversation requires `person`.
IDs are nonempty; unknown fields are preserved. `parseAccessOwnership` checks only this
shape and returns `valid` with `ownership`, or `invalid` with ordered codes
`invalid_ownership`, or `invalid_target`, `invalid_owner`,
`conversation_requires_human_owner` as applicable. It neither creates nor transfers ownership.
The host must resolve a person identity to the canonical human owner; a spelling is not proof.

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
for unsupported names/families, or `open` for unresolved governance or copying bundles below. An Open legacy Editor mapping
carries its known editing capabilities, not a complete replacement grant. Do not migrate a
legacy write/push grant to that subset and silently drop its old copying entitlement.

| Existing word | Canonical meaning |
|---|---|
| `view`, `read`, `history` | view, including content and history |
| `discover`, find-only `find` | discover only |
| `comment` | comment |
| `write` on content | known edit rights; full copying bundle Open |
| `write` on a Space | known edit rights on its Map, never referenced content; full profile Open |
| `write` on a Thread | comment |
| `git_push`, old protocol `push`, on content | known edit rights, bounded to that target; full copying bundle Open |
| `space_copy` on content | fork: state only, bounded to that target |
| `git_fetch` on content | pull: whole Git history; target applicability below Repo is Open |
| `manage` (stored grant), `reshare` | Allow sharing, not Owner and not Editor |
| `copy` / Allow copying | **Open mapping:** old combined right; do not silently choose fork, pull or both |
| Viewer, Commenter, Editor | named profiles above, not stored capability aliases |
| Owner, owner relation | ownership, not a `manage` grant |
| Thread owner labelled Editor | correct the label to Owner using owner evidence; never promote every writer |
| Public | Viewer granted to `{kind: public, id: '*'}` |
| `manage_access` (derived governance action) | **Open mapping:** it is not the stored `manage` capability; its human/root-role checks cannot be faithfully renamed to Allow sharing. |

Legacy transport aliases are ignored on Vault, Space and Thread targets by this mapping.
On folders and Notes, preserving the alias's meaning does not authorize whole-Repo transport;
the host still checks scope. Whether pull is restricted to the whole Repo is Open. `use` is not a capability
in these seven target kinds. Agent use implies view/discover of the agent, but invocation is
not defined here. Invalid-on-family grants must not be promoted into a different family.
Legacy actor, exchange and standalone Map families need their own explicit target migration;
this table does not guess that every exchange is a Thread or every Map is a Space.

**Protocol migration from 0.30.0:** `view` is no longer a Map-only right distinct from `read`
and `history`. Those names map to one `view`. `write`/`push` become `edit`; `manage` becomes
`reshare`, which **does not imply edit**. `copy` is no longer canonical: the two names are `fork` and `pull`; the old combined right
maps to Open. `fork`, `pull` and `reshare` pass `isValidCapability`.
Rank numbers have changed; persist names, never ranks. Re-check consumers that used rank
comparisons, treated `manage` as Owner, or treated a Map's disclosure depth as authorization.
Map parsers and representation depths themselves do not change. The historical Maps entrypoint
re-exports this one vocabulary; it does not retain the old meanings as a second system.

## Open — do not fill in defaults

1. Whether company Vault membership reads anything without an org grant, and the proposed
   discover-for-members / Viewer-to-org-on-new-Repos defaults. Membership defaults are not
   derived from the org grant shape.
2. Space level profiles: which levels are offered and which acts each bundles. The individual
   Map acts above are expressible without answering this.
3. How the company rule that Editors can share there interacts with the general Allow sharing
   switch; do not generalize it into Editor always implies sharing.
4. How the derived `manage_access` governance boundary migrates to these rights and ownership.
5. Which split copying rights Editor and Allow copying imply, and migration of old `copy`
   grants. Fork and pull have distinct meanings, but the default bundles are not yet decided.
6. Whether pull exists only on a whole Repo and only with no closed branch for that person;
   whether fork applies to Repo/folder/Note and leaves out closed material. These are proposals,
   not rules supplied by this contract. Neither `parseAccessGrant` nor the set helpers decide
   Git blob/history filtering or authorize bypassing a closed branch.
7. Behaviour for public Repos: which fork/pull rights are available and how they interact
   with public Viewer and the existing Allow copying control. Public does not silently get
   either right from Viewer.
8. Thread copying has no agreed user-facing switch/profile here. Conversation export/copy
   operations are not defined by owner-only access.

## Conformance

[conformance/access/manifest.json](../conformance/access/manifest.json) is language-neutral.
Its operations name the pure functions above, with complete inputs and expected outputs.
Cases cover every agreed named profile, every target, both switches and their independent
combinations, org and Space statements, alias migration and invalid families, bounded sharing,
agent intersection, and Conversation exclusions, plus separate fork/pull and Open Editor bundles. These prove **expressibility and set semantics**,
not a database evaluator, audited writer, revocation path or privacy of a deployed service.
