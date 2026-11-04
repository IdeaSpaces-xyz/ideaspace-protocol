# Canonical access

This is a portable vocabulary and statement shape, not an authorization service. It does not
resolve identities, store grants, check a database, export Git objects, filter content, issue
credentials, or implement a server's inheritance, audit or revocation. The reference functions
operate only on supplied names, sets and facts. Hosts must enforce the requirements below.

## One meaning per capability

| Name | Meaning |
|---|---|
| `discover` | Find that a target exists; not permission to read its content. |
| `view` | Read content **and its history**, including a Thread's posts. Also discover. This is not Git transport. |
| `comment` | Take part: comment on content or post in a Thread. Also view. |
| `edit` | Create and change content, including pushing Repo commits. Also comment, fork and pull, within the grant's scope and the operation restrictions below. On a Space's Map this includes adding references, never editing referenced content. |
| `fork` | Take an independent copy of the current state, **without history**. Also view. Works on Repo, folder or Note; leaves closed parts out. |
| `pull` | Take the whole Git history. Also view. Works only on a whole Repo, and is refused when any branch is closed to that person. |
| `reshare` | Allow sharing: give access onward, bounded by the rights already held. Also view. On a Space, adding people gives them rights on the Map only. |

The implication edges are `edit → comment, fork, pull`; `comment, fork, pull, reshare → view`;
`view → discover`. `expandCapabilities` takes their closure, without duplicates, in the order
`discover, view, comment, edit, fork, pull, reshare`. Inputs are canonical capability names.
Fork and pull are separate rights: neither alone implies the other. Viewing history in the web
never implies pull. No capability implication gives `reshare` from `edit` globally; the company
Editor rule below is context-specific.

**Scope never grows through an implication.** A Note Editor does not gain access to its Repo
root or the whole Repo's history. A Vault grant can flow down to compatible content targets;
pull is still checked on each whole Repo, never on the Vault. A Space's Map does not supply
content inheritance. An inapplicable right is not permission for a different target.

`CAPABILITY_LADDER` is only the ordered spine `discover, view, comment, edit`.
`CAPABILITY_OPTIONS` is `fork, pull, reshare`; these are also capabilities. Rights are a partial
order, not a total rank. `capabilityRank` is retained as a deprecated compatibility/display
helper: spine index or -1, **never authorization**. `CAPABILITY_OPTION_IMPLIED_AT` is
`{fork: edit, pull: edit}` and is the reference implementation's source for those implications.
`isValidCapability` accepts all seven names.

## Levels and human words

| Level | Rights |
|---|---|
| `viewer` | view (content, history, discover) |
| `commenter` | comment, including Viewer |
| `editor` | edit, including Commenter, fork and pull, subject to target scope and closed-branch restrictions |
| `owner` | Ownership, with every applicable right on what is owned; not a transferable grant and never a bypass for forbidden exports |

The shared consumer label map uses **Viewer, Commenter, Editor, Owner, Allow copying,
Include full history, Allow sharing**. The protocol names remain `fork` and `pull`; people see
**Allow copying** for state copying and **Include full history** for the whole history, not Git
jargon. These are the agreed human terms, not new access levels. The protocol defines meanings;
the shared consumer label map owns display text and translations, not this module.

Allow copying adds `fork`; Include full history adds `pull`. Editor includes both. In a company
Vault, Editor **also includes sharing**, not merely when a separate sharing switch is selected.
This applies to content in that Vault without making every Editor everywhere a resharer.

`accessLevelProfile(target, level, {companyVault?})` returns `grantable` with the expanded
capability set, `owner` for ownership, `open` for an undecided Space profile, or
`not_applicable`. `companyVault: true` adds `reshare` for Editor. The caller supplies the actual
Vault context; the function does not authenticate or discover it. Without that context it
returns the general, non-company profile. It returns no transferable capability set for Owner.

| Target | Profiles / boundary |
|---|---|
| Vault | Viewer, Commenter, Editor, Owner express a grant's scope over the owner's world; not a Vault-specific comment, push or clone operation. |
| Repo, folder, Note | Viewer, Commenter, Editor, Owner. Grants and ownership flow down the content tree, never up. |
| Space | Owner. The primitive acts are view, add items (`edit` on the Map), add people (`reshare` on the Map). **Open:** other named level bundles. |
| Thread | Viewer, Commenter, Owner, plus Allow sharing. No Editor, fork or pull. Owner edits the Agreement, renames and closes. A closed Thread is read-only. |
| Conversation | Canonical human owner only. No grants or export, even for the owner; taking something out is a deliberate post, not transcript export. |

Organisations own and receive grants but **never act**. People and agents act, including when
sharing an organisation's Thread. An organisation can receive a grant on a Space's Map. Agents
own nothing; their person is responsible. An organisation can limit agents it shares.
`ACTING_SUBJECT_KINDS` is `person, agent`; `OWNING_SUBJECT_KINDS` is `person, organisation`.
`isActingSubjectKind` classifies names without authenticating or authorizing an actor.

Company membership grants **discover**, not an implicit read of all content.
`COMPANY_MEMBER_CAPABILITIES` is `[discover]`. Any company default beyond discovery is Open;
in particular, do not assume Viewer-to-org on new Repos.

## Copy operation requirements

Closing a content branch closes it and its descendants (`blocked`); a root grant covers its
descendants otherwise. Owner inherits down to folders and Notes. These rules do not inherit
through a Map pointer, a Space reference, a Thread attachment, or into a Conversation.

`copyOperationRequirements(target, operation, hasClosedBranch?)` states requirements over
supplied facts. It is **not** a grant check or an exporter:

- Non-content targets (Vault, Space, Thread, Conversation) refuse fork and pull with
  `{status: refused, reason: copy_not_supported}`. Vault-scoped rights must first apply to
  the actual content target; this function never widens or resolves a scope.
- Fork on Repo, folder or Note returns
  `{status: applicable, history: none, closedBranches: omit}`. The host must omit closed
  material, check the person's current access and create a history-free state projection.
  This is an obligation, not evidence that a supplied tree is safe to export.
- Pull on folder or Note refuses with `pull_requires_whole_repo`.
- Pull on Repo with no branch fact returns `{status: requires_branch_check}`, never permission.
  With `hasClosedBranch: true` it refuses with `closed_branch`; with false it returns
  `{status: applicable, history: whole}`. The host must determine this fact across the whole
  Repo for that person, not merely the current folder or a cached starting set.

`applicable` is not `authorized`. Both sufficient rights **and** the operation requirements
must hold. The filtering algorithm, safe Git object serving, block storage and checks belong
to the host. An Editor's pull right cannot bypass a closed branch. Ownership never makes
Thread copying or Conversation export applicable.

## Portable grant statement

A complete statement has these fields. This is not Note frontmatter, a hosted API or a storage
schema. Unknown fields are preserved; no target is fetched or created.

```json
{
  "target": {"kind": "repo", "id": "research"},
  "subject": {"kind": "organisation", "id": "acme"},
  "capabilities": ["view"]
}
```

- `target.kind`: `vault | space | repo | folder | note | thread`. `id` is an opaque,
  nonempty string. A Space target names its Map. A folder or Note target expresses the
  grant's depth scope, distinct from Map representation depth. Conversation is excluded.
- `subject.kind`: `person | team | organisation | agent | public`. `id` is nonempty;
  public uses `*`. Organisation means its members. A team is a group of people, never a
  Space's membership. There is **no Space audience** grantee. The subject-kind normalizer
  accepts US `organization` as an alias; canonical statements use `organisation`.
- `capabilities`: a nonempty array of canonical names. Stored aliases, labels and `owner`
  are not capability names. A Thread grant cannot contain `edit`, `fork` or `pull`.
  Public cannot comment, edit or reshare.

The sharer chooses public access explicitly. Public statements can express read only (`view`),
state copying (`view, fork`), or also full history (`view, fork, pull`). Public Viewer alone
implies neither copying nor pull; neither is an automatic consequence of publishing. Pull's
whole-Repo/closed-branch rule and fork's closed-material omission apply to public access too.

`parseAccessGrant` returns `valid` with the unchanged statement or `invalid` with ordered
issue codes: `invalid_grant`, or `invalid_target`, `invalid_subject`, `invalid_capabilities`,
`thread_has_no_editor`, `thread_has_no_copy`, `invalid_public_capabilities` as applicable.
These names and order are normative for non-TypeScript implementations too. This is a shape
check, **not approval to issue or use a grant**: all target/act restrictions still apply.

An org-wide grant names the organisation as subject, not a fifth privilege level or a content
container. Space grants govern only the Map. Adding a reference or inviting people never
issues content grants. A person without access can request it; the request API is out of scope.
Local and remote Spaces and Vaults are separate; a Map is not a container inheritance edge.

### Ownership statement

`AccessOwnership` is `{target: {kind, id}, owner: {kind, id}}`. The target can be any of the
seven kinds. The owner's kind is `person | organisation`, never agent, team or public;
Conversation requires `person`. IDs are nonempty and unknown fields are preserved.
`parseAccessOwnership` returns `valid` with `ownership`, or `invalid` with ordered codes
`invalid_ownership`, or `invalid_target`, `invalid_owner`,
`conversation_requires_human_owner` as applicable. The host resolves the canonical human
identity. The parser neither creates nor transfers ownership. Ownership is not conferred by
a grant of every capability, and a resharer cannot transfer it.

## Sharing and agents

`canPassAccess(held, requested)` requires `reshare` in held rights' closure and every requested
right (including implications) already held. It tests the rights bound only. The host must
still check scope, target, actor, recipient, blocks and current rights when granting. Adding
people to a Space passes Map rights only. Company Editor's sharing profile uses the same bound.

An agent acts with **person access ∩ agent ceiling**, not their union. The ceiling consists of
grants to the agent, set by its responsible person or organisation; its default scope is that
person's or organisation's Vault. `intersectAccessCapabilities` closes each supplied set and
intersects in canonical order. It resolves no identity or default grants. The host determines
the session's starting set from the Space Map and fixes it at session start, but checks the
person's access again on each open. Following a link out is checked then. Agent ceilings cannot
unlock another person's Conversation. Session credentials and revocation remain host concerns.

## Mapping today's words

`mapLegacyCapability` returns `mapped` with a closed capability set, or `ignored` for unsupported
names/families. It translates names without widening scope or overriding operation requirements.

| Existing word | Canonical meaning |
|---|---|
| `view`, `read`, `history` | view, including content and history |
| `discover`, find-only `find` | discover only |
| `comment` | comment |
| `write` on content | edit, including fork and pull at compatible targets |
| `write` on Space | edit its Map, never referenced content; named Space bundles stay Open |
| `write` on Thread | comment |
| `git_push`, old protocol `push` on content | edit, within that target scope |
| `space_copy` on content | fork: state only |
| `git_fetch` on content | pull: whole Repo only; a non-root grant never widens to its Repo |
| `copy`, `allow_copying` | fork **and** pull, preserving the old combined entitlement |
| `manage`, `manage_access`, `reshare` | Allow sharing, not Owner or Editor |
| Viewer, Commenter, Editor | profiles above, not stored capability aliases |
| Owner / owner relation | ownership, not a manage grant |
| Thread owner labelled Editor | use owner evidence to correct the label; never promote every writer |
| Public | the explicit public grant selected by the sharer, not automatic export rights |

Review old `allow_copying` grant migration against production counts **before running it**.
No migration runs here. Changing the meaning of the `manage_access` governance action requires
host route/writer changes; a vocabulary mapping is not proof the old human/root-role checks
already implement Allow sharing.

Legacy Git aliases are ignored on Vault, Space and Thread by this mapping; Thread copying
aliases are ignored too. `use` is not a capability in these seven target kinds. Agent use gives
view/discover of that agent, but invocation is outside this contract. Legacy actor, exchange
and standalone Map targets need explicit migration, not guessed family conversion.

**Protocol migration from 0.30.0:** the old Map-only `view` / body `read` / `history` split is
replaced by one view. `write`/`push` become edit, `copy` becomes fork+pull, and `manage` becomes
reshare **without edit**. Rank numbers have changed; persist names, never ranks. Re-check any
consumer authorizing by rank, treating manage as Owner, or using Map depth as authorization.
Map parsers and representation depths do not change. Maps imports re-export this one vocabulary.

## Open — do not fill in defaults

1. Space level bundles beyond the agreed acts: view, add items, add people.
2. Company default access beyond discover, including any Viewer-to-org default for new Repos.

## Conformance

[conformance/access/manifest.json](../conformance/access/manifest.json) is language-neutral.
Operations name the pure functions above, with complete inputs and outputs. Cases cover every
profile/target, company context, public choices, org/Space grants, alias migration, ownership,
sharing bounds, agent intersections, fork/pull requirements, no Thread copying and no Conversation
export. These prove **expressibility and supplied-fact/set semantics**, not a deployed evaluator,
filtered exporter, audited writer, revocation path or production privacy claim.
