# Access, version one

This is a portable statement and evaluation contract, not an authorization service. The pure
reference functions take supplied facts; they do not resolve identities, read a database, issue
credentials, store grants, filter exports or implement transport. No engine is chosen.

## Vocabulary reference

For the words people see, the reference is **The access pattern across surfaces**, version one,
2026-11-07, section **The words of access**. Refer to that section rather than creating another
label map here. This contract defines machine relations, not display text or translations.

## Relations

`discover` knows an object exists; `view` reads its current snapshot; `history` browses past
versions in IdeaSpaces, separately from view; `comment` posts; `edit` changes content;
`fork` takes an independent current-state copy without history; `pull` takes whole Git history;
`reshare` passes on rights already held. `owner` is ownership, never a grant.

Implications: `edit → comment, fork, pull`; `history, comment, fork, pull, reshare → view`;
`view → discover`. `expandCapabilities` returns this closure without duplicates in the order
`discover, view, history, comment, edit, fork, pull, reshare`. Neither fork nor pull implies the other.
No implication widens scope: a Note Editor gains nothing on the Repo root. Applicability always
filters the closure: Space edit does not give comment, fork or pull on the Map or its references.

`CAPABILITY_LADDER` is the display spine `discover, view, comment, edit`, not a privilege rank.
`CAPABILITY_OPTIONS` is `history, fork, pull, reshare`. `capabilityRank` is deprecated and never authority.
`CAPABILITY_OPTION_IMPLIED_AT` is `{fork: edit, pull: edit}`. `isValidCapability` accepts the eight
names, not owner or stored aliases. History implies view, never Git pull; view never implies
history. Pending the two named implication questions below, this v1 evaluator retains #92
edit → pull and does not add the proposed pull → history edge. A downloaded
Git history cannot be revoked. The human settled this separation on 2026-11-07.

## Objects and profiles

| Object | Applicable relations and profiles |
|---|---|
| Vault | Its owner. Access to the Vault means access to its Home Space, not its items. No Vault grants. |
| Space, including Home Space | Viewer views its Map; Editor adds items (`edit`); Allow sharing adds people (`reshare`). No Commenter. No content inheritance. |
| Repo | All relations. Viewer is view; Commenter is comment; Editor is edit. |
| Folder, Note | All except pull. Profiles as Repo; the Repo's owner owns everything below. No independent ownership row. |
| Hosted Thread | Viewer, Commenter, Owner, Allow sharing. No Editor, fork or pull. Only its owner manages its Agreement, name and closure. |
| Conversation | Its canonical human owner only: discover, view, owner. No grants, export or agent access. |

`accessLevelProfile` returns `grantable` with the applicable expanded rights, `owner` (not a
transferable set), or `not_applicable`. On content, `{companyVault: true}` adds reshare to Editor.
It does not add sharing to a Space Editor. Company context is supplied, never authenticated here.
`owner` on a folder/Note profile describes the inherited Repo relationship, not a new owner row.

Company membership gives **discover only**, never read. When a company Repo is created, the
writer writes an org Viewer grant. `companyRepoViewerGrant(repo, organisation)` expresses that
statement; it writes nothing. The grant is removable. Deleting it leaves discovery, not view.

## Subjects, ownership and inheritance

People act. Organisations own and receive grants but never act. Agents own nothing and receive
ceiling grants. Teams and organisations name groups of people, never a Space membership audience.
`ACTING_SUBJECT_KINDS` classifies person/agent names for compatibility, not accepted check actors.
`OWNING_SUBJECT_KINDS` is person/organisation.

A complete grant is `{target: {kind, id}, subject: {kind, id}, capabilities: [...]}`. Target kinds
are `space | repo | folder | note | thread`; IDs are opaque nonempty strings. Subject kinds are
`person | team | organisation | agent | public`; public uses `*`. Unknown fields are preserved.
`normalizeSubjectKind` accepts US `organization`; stored statements use `organisation`.

`parseAccessGrant` returns `valid` with the unchanged grant or `invalid` with ordered issues:
`invalid_grant`, or `invalid_target`, `invalid_subject`, `invalid_capabilities`,
`thread_has_no_editor`, `thread_has_no_copy`, `invalid_public_capabilities`, as applicable.
Thread grants cannot contain edit/fork/pull. Public cannot comment/edit/reshare. Accepting a
capability structurally is not permission to perform an inapplicable operation (e.g. Space fork).
Every relation is positive. `closed`/`blocked` is reserved for 1.1, not a version-one grant.

Ownership is `{target: {kind, id}, owner: {kind: person | organisation, id}}`. Targets can be
Vault, Space, Repo, hosted Thread or Conversation; a Conversation requires a person.
`parseAccessOwnership` returns `valid` with unchanged `ownership`, or `invalid` with ordered
`invalid_ownership`, or `invalid_target`, `invalid_owner`, `conversation_requires_human_owner`.
Agents, teams and public never own. Granting every capability never transfers ownership.

The Repo's owner owns all folders and Notes below it, ignoring old Note owner rows. A Repo
defaults to its Vault's owner unless transferred. Org membership is not org ownership: fresh
explicit organisation-owner facts identify its controllers. Token roles are not authority.

Only Repo → folder → Note inherits grants downward. Paths and the identity index derive this
tree; the host supplies complete root-first ancestors with each check, not stored parent edges.
The only stored parent is Repo → Vault for ownership. Space references, nested Spaces, Thread
home/attachment and Conversations never create inheritance. Local Threads are content folders,
not hosted Thread objects. Legacy exchanges have no version-one relations or porting rule.

## Supplied facts and the one check

`check(facts, actor, target, relation, now)` is pure. Its language-neutral input shape is:

- `facts.objects`: `{kind, id, ancestors}`; ancestors is empty on roots/non-content and is the
  complete Repo-first chain of folder ancestors on folders/Notes. Every ancestor must have one
  matching object with the matching prefix. Missing/conflicting identity fails closed, never guessed.
  Repo metadata may carry `vault`; Vault metadata may carry `homeSpace` and company org id `company`.
  Hosted Threads carry positive `admittedAgents` IDs; a pending knock supplies no admission.
- `facts.grants`, `facts.ownership`: the statements above, read fresh on each request.
- `facts.memberships`: `{person, group: {kind: organisation | team, id}}`.
- `facts.organisationOwners`: fresh `{person, organisation}` facts, not token roles.
- `facts.signedInRead`: exact target identities for the compatibility signed-in audience. Read
  only, canonical humans only; this never supplies an agent ceiling or an owner relation.
- `facts.complete`: whether a candidate listing is complete, used by list, not an allow.
- `actor`: `{person: id | null, session?: {person, agent, allowedActs, expiresAt}}`. Null is
  anonymous. A session must match its canonical person and be unexpired at numeric `now`.
  The host authenticates/canonicalizes these identities before calling. A bare agent, org actor,
  missing person or conflicting session fails closed. Token creator is attribution, never authority.
- `target`: `{kind, id}`; `relation`: one of the eight capabilities or owner; `now`: supplied
  numeric time in the same units as expiresAt. There is no ambient clock.

For a session the check intersects **person rights ∩ agent grants ∩ session allowed acts** inside
the evaluator. It closes each set first, then filters by target applicability. The agent never
inherits the person's org audience, public audience or ownership as its ceiling. Its default Vault
scope must be materialized by the host as scoped grants over actual targets, not a Vault grant
that opens everything. An agent cannot read an unadmitted hosted Thread, even if its person can. Its discover grant
can still permit a knock; admission never supplies a missing grant.
Visible tools come from consented allowed acts; every call still checks the object. A narrower
ceiling or a revocation affects the next request: no allow cache or session snapshot lives here.

The exact answer is `{allowed, missing, knock}`. An allow has `missing: null, knock: false`.
A deny with discover has `missing: requestedRelation, knock: true`. Without discover it has
`missing: null, knock: false`, exactly as for a missing object. No object identity or paths appear
in a check answer. Hosts must also equalize lookup timing/cost and their not-found response;
a pure function cannot promise database timing equivalence.

`list(facts, actor, kind, relation, now, requireComplete = false)` returns
`{status: complete | partial | incomplete, items: [{kind, id}]}` in supplied order. Each item is
allowed by check, without exception. A malformed/conflicting listed identity makes completeness false.
With requireComplete and an incomplete listing it refuses
with `status: incomplete, items: []`. Whole-tree exporters must require completeness; an allowed
root is not proof of a complete listing.

`who(facts, requester, candidates, target, relation, now)` returns allowed candidate actors and
`paths` only when requester holds reshare or owner. Otherwise it returns `[]`, for missing and
hidden objects alike. Paths carry `source` (grant/owner/company_discover/signed_in), source
`target`, `subject`, and `via` (source then descendants). All direct, group and parent-folder
paths are retained, including both person and ceiling evidence for sessions. Candidates and
membership expansion are host-supplied; this is not an identity directory.

## Home Space discovery and hosted Threads

A Home Space shows every item in its Vault the person can discover (agreed 2026-11-07).
The host supplies that Vault's complete candidate set to list for each kind, using `discover`;
reading the Map does not open the items. List returning partial is never a complete Home catalog.
Hosted Threads have no export tooling, including for an owner. An agent may deliberately copy
what it can read by hand; this creates neither a Thread fork nor a transcript-export permission.

## Copy, Git and sharing boundaries

Version one has no closed branches. `copyOperationRequirements` permits fork on content with
`history: none` and pull only on the whole Repo with `history: whole`. Non-content refuses with
`copy_not_supported`; folder/Note pull refuses with `pull_requires_whole_repo`. Its optional
legacy closed-branch fact is a reserved refusal (`closed_branch`) when true, not support for
filtering or a version-one negative relation. Unknown/absent branch facts need no walk in v1.

Fork remains gated on view (fork implies it); there is no engine or exporter here. Thread copying
and Conversation export never become applicable through ownership. Git transport uses the same
root check: pull to fetch, edit to push (edit implies pull). No descendant grant widens to root.
Public read, state copying and full-history grants are explicit, separate choices. The served
public Git gate's human-only restriction is a host transport constraint, not a new relation.

`canPassAccess(held, requested)` checks reshare and every requested right within the held closure.
The host must still check actor, scope, target applicability and fresh authority. Space invitations
pass Map rights only. `intersectAccessCapabilities` is a set helper, not a second surface evaluator.

## Compatibility, not authority

`mapLegacyCapability` translates read→view, find→discover, content write/git_push/push→edit,
Thread write→comment, Space write→Map edit, space_copy→fork, git_fetch→pull,
copy/allow_copying→fork+pull, manage/manage_access→reshare. Canonical names map to themselves.
It ignores unsupported names/families and Conversation/Vault grant aliases. Stored `history`
maps to the separate history relation, never to view alone.
It never grants owner, widens scope or makes copying applicable on a Space or Thread. Review
old combined-copy counts before any migration. No migration runs here. Repo catalog roles,
token creator and cached org roles are not content authority.

## Reserved for 1.1

Closing a content branch is deferred. It needs changed resolver/cache behaviour, not a new v1
row. Proposed future fork filtering and pull's closed-set lookup are not v1 conformance promises.
Closed *hosted Thread* lifecycle (read-only posting) is a separate host state gate, not branch closing.
Local agent limits through a Space lens narrow sight/tools, never widen content access; their
mechanism is still in development. A same-user process can read local files; remote push checks remain.

## Open — named, not filled with defaults

These are the reference Note's questions after its 2026-11-07 history update:

1. Does Editor include history? Snapshot-only hosted editing versus Git collaboration.
2. Does pull imply history? Proposed in the Note, not an agreed implication here. The current
   compatibility model keeps hosted browsing separate from Git possession, as served today.
3. Whose person half does an agent's act take on a hosted Thread: responsible person, the owner
   who added it, or the person whose post woke it? The host must supply an authenticated person;
   this check does not select one. Removed-person agent membership is not inferred either.
4. Public full history has no shipped choice; public Git transport is not offered today.
5. Local agent mechanism: how a Space limits sight/tools; not designed here.

Copy at any content depth is settled; the Share sheet's Repo-only offering catches up later.

## Conformance

[The manifest](../conformance/access/manifest.json) carries set/shape vectors and points to
complete supplied-fact evaluator vectors. The latter name each settled decision and all nine kept
quirks, including timing obligations and transport/export host boundaries. Any future evaluator
(Python, SQL, OpenFGA, SpiceDB, local) can run the same JSON. Passing proves supplied-fact semantics,
not deployed auth, constant-time storage, export filtering, audit or a safe cache.
