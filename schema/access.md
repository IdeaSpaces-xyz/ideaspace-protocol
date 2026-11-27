# Access, version one

This is a portable statement and evaluation contract, not an authorization service. The pure
reference functions take supplied facts; they do not resolve identities, read a database, issue
credentials, store grants, filter exports or implement transport. No engine is chosen.

## Vocabulary reference

For the words people see, the reference is **The access pattern across surfaces**, version one,
2026-11-07 (Git decision updated 2026-11-09, Collaborate and history 2026-11-27), section **The words of access**. Refer to that
section rather than creating another label map here. This contract defines machine relations, not display text or translations.

## Relations

`discover` knows an object exists; `view` reads its current snapshot; `history` browses past
versions in IdeaSpaces, separately from view; `comment` posts; `edit` changes content;
`fork` takes an independent current-state copy without history; `pull` takes whole Git history;
`reshare` passes on rights already held. `owner` is ownership, never a grant.

Implications: `pull → history`; `edit → comment, fork, history, pull`;
`history, comment, fork, reshare → view`;
`view → discover`. `expandCapabilities` returns this closure without duplicates in the order
`discover, view, history, comment, edit, fork, pull, reshare`. Neither fork nor pull implies the other.
The closure is target-agnostic: pull from edit on a folder or Note is inapplicable there and is filtered out.
Inapplicable source capabilities are discarded before closure; they do not manufacture view.
No implication widens scope: a Note Editor gains nothing on the Repo root. Applicability always
filters the closure: edit on a Space's Map does not give comment, fork or pull on what it points at.

`CAPABILITY_LADDER` is the display spine `discover, view, comment, edit`, not a privilege rank.
`CAPABILITY_OPTIONS` is `history, fork, pull, reshare`. `capabilityRank` is deprecated and never authority.
`CAPABILITY_OPTION_IMPLIED_AT` is `{history: edit, fork: edit, pull: edit}`: the options a person's
Editor grant includes. `isValidCapability` accepts the eight
names, not owner or stored aliases. History implies view, never Git access; view never implies history.

**Settled 2026-11-27, replacing 2026-11-09's "does not include history":** "Collaborate
should include history. Copy is just a snapshot. That's the whole point." Collaborate (`edit`)
includes the past (`history`) and, on a whole Repo, Git (`pull`). Git access is still full
Collaborate: both fetch and push require edit **and** pull on the whole Repo, and a person's edit
now supplies both. A folder or Note Editor browses the past below it and has no Git. Copy (`fork`)
is the snapshot: it never implies history, and a writer never puts history or pull on a grant that
holds fork without edit (a host refuses it, as `copy_is_without_history`). A Viewer may hold
history, which allows browsing the past, not Git transport. Push is not a ninth capability. A
downloaded Git history cannot be revoked.

**The agent's half names history and pull itself.** For an agent, its ceiling grants and its
consented acts close with `edit → comment, fork` only: an agent holds history or Git only when its
ceiling and its consent both name them, whatever its person holds. Handing out version history
stays the person's own step (settled 2026-11-20). So `intersectAccessCapabilities` closes its
two arguments differently and is not symmetric.

*Superseded, kept for the record (2026-11-09):* Collaborate changes the current state in
IdeaSpaces; it does not include hosted history or Git access; Editor alone includes neither pull
nor history.

## Objects and profiles

| Object | Applicable relations and profiles |
|---|---|
| Space, as owned (API kind `vault`, its name until 2026-11-14) | Its owner. Being in the Space is access to its Map, not to its items. No grants on this kind; membership grants are on its Map. |
| A Space's Map (API kind `space`; the API's Home Space is the Space's own Map) | Viewer views the Map; Editor adds items (`edit`); Allow sharing adds people (`reshare`). No Commenter. No content inheritance. |
| Repo | All relations. Viewer is view; Commenter is comment; Editor is edit. |
| Folder, Note | All except pull. Profiles as Repo; the Repo's owner owns everything below. No independent ownership row. |
| Hosted Thread | Viewer, Commenter, Owner, Allow sharing. No Editor, fork or pull. Only its owner manages its Agreement, name and closure. |
| Conversation | Its canonical human owner only: discover, view, owner. No grants, export or agent access. |

`accessLevelProfile` returns `grantable` with the applicable expanded rights (a Repo Editor's
include history and pull; a folder or Note Editor's include history, not pull), `owner` (not a
transferable set), or `not_applicable`. On content, `{companyVault: true}` adds reshare to Editor.
It does not add sharing to the Editor of a Space's Map. Company context is supplied, never authenticated here.
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
capability structurally is not permission to perform an inapplicable operation (e.g. forking a Space's Map).
Every relation is positive. `closed`/`blocked` is reserved for 1.1, not a version-one grant.

Ownership is `{target: {kind, id}, owner: {kind: person | organisation, id}}`. Targets can be
a Space (`vault`), its Map (`space`), Repo, hosted Thread or Conversation; a Conversation requires a person.
`parseAccessOwnership` returns `valid` with unchanged `ownership`, or `invalid` with ordered
`invalid_ownership`, or `invalid_target`, `invalid_owner`, `conversation_requires_human_owner`.
Agents, teams and public never own. Granting every capability never transfers ownership.

The Repo's owner owns all folders and Notes below it, ignoring old Note owner rows. A Repo
defaults to its Space's owner unless transferred. Org membership is not org ownership: fresh
explicit organisation-owner facts identify its controllers. Token roles are not authority.

Only Repo → folder → Note inherits grants downward. Paths and the identity index derive this
tree; the host supplies complete root-first ancestors with each check, not stored parent edges.
The only stored parent is Repo → Space (`vault`) for ownership. Map references, nested Maps, Thread
home/attachment and Conversations never create inheritance. Local Threads are content folders,
not hosted Thread objects. Legacy exchanges have no version-one relations or porting rule.

## Supplied facts and the one check

`check(facts, actor, target, relation, now)` is pure. Its language-neutral input shape is:

- `facts.objects`: `{kind, id, ancestors}`; ancestors is empty on roots/non-content and is the
  complete Repo-first chain of folder ancestors on folders/Notes. Every ancestor must have one
  matching object with the matching prefix. Missing/conflicting identity fails closed, never guessed.
  Repo metadata may carry `vault` (its Space); Space metadata may carry `homeSpace` (its Map) and company org id `company`.
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
the evaluator. It closes each set first (the agent grants and the allowed acts as the agent's half,
without Collaborate's history and pull), then filters by target applicability. The agent never
inherits the person's org audience, public audience or ownership as its ceiling. Its default Space
scope must be materialized by the host as scoped grants over actual targets, not a Space-wide grant
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

## The Space's Map, discovery and hosted Threads

A Space's Map (the API's Home Space) shows every item in the Space the person can discover (agreed 2026-11-07).
The host supplies that Space's complete candidate set to list for each kind, using `discover`;
reading the Map does not open the items. List returning partial is never a complete catalog of the Space.
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
root target: both fetch and push require `check(..., edit)` **and** `check(..., pull)` on
one fresh supplied snapshot. No caller rebuilds person/agent intersection: each check does that
inside the evaluator. This is full Collaborate, not a read-only clone offering; a pull relation
alone describes history entitlement, not approval of a Git operation. No descendant grant widens
to root. The portable `git_access` vectors express this conjunction. A person's Repo edit supplies
both halves; history alone supplies neither edit nor pull, and fork supplies neither; Git access
supplies history through pull.
Public read, state copying and full-history grants are explicit, separate choices. The served
public Git gate's human-only restriction is a host transport constraint, not a new relation.

`canPassAccess(held, requested)` checks reshare and every requested right within the held closure.
The host must still check actor, scope, target applicability and fresh authority. An invitation into
a Space passes Map rights only. `intersectAccessCapabilities` is a set helper, not a second surface evaluator.

## Compatibility, not authority

`mapLegacyCapability` translates read→view, find→discover, content write→edit, git_push/push→edit+pull,
Thread write→comment, Space write→Map edit, space_copy→fork, git_fetch→pull (including history),
copy/allow_copying→fork+pull, manage/manage_access→reshare. Canonical names map to themselves.
It ignores unsupported names/families and Conversation/Vault grant aliases. Stored `history`
maps to the separate history relation, never to view alone.
The Git push aliases name both halves of full Collaborate; since 2026-11-27 content write does too,
through edit. This mapping never grants owner, widens scope or makes copying applicable on a Space's Map or a Thread.
**Not fixed here, and no new vector holds it:** a legacy combined copy (`copy`, `allow_copying`)
still reads as fork+pull, which under 2026-11-27's words is a Copy with history. Narrowing it to
fork changes how old rows read, so it waits for a count of those rows.
Review old combined-copy counts before any migration. No migration runs here. Repo catalog roles,
token creator and cached org roles are not content authority.

## Reserved for 1.1

Closing a content branch is deferred. It needs changed resolver/cache behaviour, not a new v1
row. Proposed future fork filtering and pull's closed-set lookup are not v1 conformance promises.
Closed *hosted Thread* lifecycle (read-only posting) is a separate host state gate, not branch closing.
Local agent limits through a Map narrow sight/tools, never widen content access; their
mechanism is still in development. A same-user process can read local files; remote push checks remain.

## Open — named, not filled with defaults

The history/Editor implication questions were settled above, on 2026-11-09 and again, reversed
for Editor, on 2026-11-27. Remaining:

1. Whose person half does an agent's act take on a hosted Thread: responsible person, the owner
   who added it, or the person whose post woke it? The host must supply an authenticated person;
   this check does not select one. Removed-person agent membership is not inferred either.
2. Public full history has no shipped choice; public Git transport is not offered today.
3. Local agent mechanism: how a Map limits an agent's sight/tools; not designed here.

Copy at any content depth is settled; the Share sheet's Repo-only offering catches up later.

## Conformance

[The manifest](../conformance/access/manifest.json) carries set/shape vectors and points to
complete supplied-fact evaluator vectors. The latter name each settled decision and all nine kept
quirks, including timing obligations and transport/export host boundaries. Any future evaluator
(Python, SQL, OpenFGA, SpiceDB, local) can run the same JSON. Passing proves supplied-fact semantics,
not deployed auth, constant-time storage, export filtering, audit or a safe cache.
