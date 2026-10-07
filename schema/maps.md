# Maps

> Portable contract for the optional `map` block on a knowledge Note. **Provisional, v0.15.0.**

A Map is an ordered navigation layer over addresses. It combines three proven ideas without becoming
another repository model: exact pins from manifests and lockfiles, curated link maps, and links that
may resolve only after a reader gains access. It rides ordinary Markdown frontmatter, uses the
protocol's existing position and address grammar, and may carry observed names and summaries.
It does not embed member bodies or export a platform identity registry.

The two dimensions that distinguish it from a link list are auditable. A representation rung is a
ceiling a reader can compare with what it actually disclosed; a pin is a resolved Git commit object
id a reader can inspect with bare Git. Mutable intent and exact resolution remain separate, as they
do in manifests and lockfiles. Pins are data, never a workflow that operates another checkout.

The same member language serves a curated map-note, a projected view, and a preserved selection.
A query operation acts against a Map and may return another Map; search terms, filters, requested
detail, and target resolution remain outside the block. A question may accompany a preserved Map,
but Grants, hosted versions, cursors, deltas, ingestion, persistence, and transport remain outside
this contract. A projected view need not be stored to be useful.

## Frontmatter shape

A map-note is an ordinary Note with an optional `map` block. The Markdown body is its legend: why
these members belong together, what is where, and what proved unhelpful.

```yaml
---
name: EU regulatory landscape — what I found
summary: The useful paths and external references from this inquiry.
map:
  roots:
    - repo: https://ideaspaces.xyz/repos/n_0123456789abcdef01234567
      root_node_id: n_0123456789abcdef01234567
      sha: 4f2a91c70d0a8d87c6c2a99649bdfdd5cbe9d732
  members:
    - root: 0
      position: startups/health-tech
      depth: surface
    - root: 0
      position: startups/health-tech/regulatory-landscape.md
      depth: full
    - address: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
      name: EU Artificial Intelligence Act
      summary: Primary legal text outside the pinned repositories.
      depth: summary
---

# Legend

Start with the regulatory-landscape Note. The broader folder explains the market context.
```

The block is additive. A Map-unaware reader ignores it and reads the legend. A malformed block makes
the Map projection unavailable and SHOULD be surfaced as drift; it does not make the Note invalid or
unreadable. Unknown fields are preserved and ignored by readers that do not understand them.

`roots` and `members` are ordered arrays. Either may be absent and is then empty. Member order is
curated meaning and MUST be preserved.

## Roots and optional pins

Each root carries:

- `repo` and `root_node_id`, each optional but at least one present;
- optional `sha`, when present a full resolved commit object id, never a ref, branch, or tag.

`repo` is the ordinary absolute URL for the repository:

```text
https://ideaspaces.xyz/repos/n_0123456789abcdef01234567
```

Its path is exactly `/repos/{root_node_id}`. The host is lowercase and an explicit scheme-default
port (`443` for HTTPS or `80` for HTTP) is omitted. The URL has no credentials, query, fragment,
encoded or dot segments, or trailing slash. HTTPS is required except for local development: HTTP is
valid only when the host is exactly `localhost`, `127.0.0.1`, or `[::1]`, with an optional non-default
port. A platform also
requires the URL origin to equal its configured web origin; that deployment-specific trust check is
outside this pure shape.

`root_node_id` follows [`root-identity.md`](root-identity.md). It survives moves and addresses local
or unpublished roots once a reader already knows them. A valid `repo` already carries this identity;
a parser supplies `root_node_id` from the path when it is absent. When both are present they MUST
match. A mismatch invalidates the Map projection rather than guessing a binding.

A repo URL is an address, never authority or a fetch instruction. Import is resolution, not discovery.
A reader resolves only roots already trusted in its local checkout or registry. A map-note alone never
authorizes cloning, fetching, contacting, or trusting an unknown origin.

A root MAY carry `name`: a short token (`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`) that is not itself a
root identity form, unique among the Map's roots. Names compare exactly: `Research` and `research`
are different names. Uniqueness is enforced by the parser (`duplicate_root_name`) and the vectors;
JSON Schema cannot express it. It is what the root answers to in this Map's
[position addresses](#position-addresses). A name means something only alongside the Map that
declares it; there is no global name for a repository.

This is an intentional in-place relaxation of the provisional `ideaspaces-maps/v3` shape, released with a new protocol package version: old validators requiring `sha`/`depth` cannot read shallow Maps until updated. A shallow Space Map MAY omit pins and member depths: an unpinned root is a pointer to its latest committed HEAD, with the requested reading depth selected progressively by the reader. A mixed Map (pinned and unpinned roots) remains a live Space Map rather than a pinned moment. Thread-post and conversation consumers attaching a Map as an authored moment MUST require every root to have a pin and every position member to have a depth. This requirement is contextual: generic Map parsing accepts both, while the attaching consumer checks `isPinnedMomentMap` (or the equivalent `moment` conformance cases) and refuses an unpinned moment. An empty Map or one containing only open addresses satisfies the moment check vacuously: no root or positioned content claims a Git revision. Pins make one coherent moment per root when present. A member never carries its own SHA. Readers preserve the
full object id and do not operate the checkout to match it. Bare Git is sufficient to inspect a
position when the pinned object exists locally:

```text
git show <sha>:<position>
git diff <sha>..HEAD -- <position>
```

Shallow clones and rewritten history may make a valid pin unavailable; report that state rather than
substituting another commit.

## Members

There are two address forms and no member taxonomy.

### Repository positions

A position member carries:

- `root`: zero-based index into `roots`;
- `position`: canonical repository-relative path, or `.` for the root;
- optional `depth`: when present one of `name`, `summary`, `surface`, `children`, `full`.

The depth vocabulary maps 1:1 to the stored `representation` names used by a hosted register and to
the progressive-disclosure ladder in [`content-awareness.md`](content-awareness.md). It is a ceiling,
not authority: access is evaluated independently, members may dangle, and a reader discloses no more
than both access and the declared depth permit. Without a declared depth, the reader chooses a rung independently; absence is not a `full` ceiling encoded by the Map.

A Note, folder, and repository use the same form. A map-of-maps needs no special case because a
map-note is itself a position. Protocol positions do not enter `_agent/`, `_assets/`, or arbitrary
extension payload, with the standard exception of `_threads/` (`_threads/<thread>/README.md` or
`_threads/<thread>/<post>.md`) per [`threads.md`](threads.md).

When a Map points to a `_threads/` folder that lives on an independent `threads` worktree branch in a
code repository, the Map carries a second pinned root entry for that branch's commit SHA. A conformant
resolver resolves the root-relative position against that commit tree by checking the path as authored
first, and then stripping the leading `_threads/` segment if the branch tree was rooted at `_threads/`.

### Open addresses

A member outside a known repository carries `address` using the same open `<type>:<id>` grammar as
`attached_to`. That overlap is grammar only: `attached_to` declares what a Note is about; Map
membership declares what a curator included. URLs naturally use their scheme (`https:...`) and need
no provider registry or member type.

Standard open address types include:
- `thread:x_<24hex>`: A collaboration Thread or exchange container (e.g. `thread:x_0123456789abcdef01234567`).
- `hostname:<domain>`: An organization or network domain (e.g. `hostname:example.org`).
- `repo:n_<24hex>`: A repository reference outside the Map's pinned `roots`.
- `https://...`: An external web resource.

An address member may carry `name`, `summary`, and `depth`. Its depth, when present, is only `name` or
`summary`; an external address has no portable Git pin and promises no deeper representation in the Map.
Resolution, fetching, rendering, and provider behavior belong to the harness.

An address member MAY carry an optional opaque `revision` string (e.g. `n_<24hex>` matching the latest
posted Note in a Thread).

#### Revision semantics

The `revision` field is strictly an **opaque equality revision**, never a Git commit pin or SHA:

- **Equality only:** A reader can compare `stored_revision !== live_revision` to answer *"Has this changed?"* without downloading transcripts or making unauthenticated requests.
- **No cryptographic proof:** The revision proves only that a post event was recorded under that identifier (derived from actor identity and send nonce, not markdown content bytes); it provides no Merkle proof or hash over message body bytes.
- **No inherent ordering:** Revision identifiers cannot be sorted locally to determine precedence or turn order. Sequence and causality remain dependent on host event timestamps or ordinals.
- **No implied authority:** Exposing or observing a `revision` signals activity without granting access to read thread transcripts or attachments. Access is evaluated independently.
- **Activity without transcript leakage:** When a reader lacks access to open or read the underlying thread content, observing its `name`, `summary`, and `revision` at the summary depth ceiling lets consumers check in on activity without leaking private message bodies, author identity, or reply counts.

#### Consumer rungs

Consumers navigate address members across four progressive rungs without requiring a full MapVersion per reply:

1. **Has it changed?** Compare the opaque `revision` against a previously observed revision.
2. **Summary:** Read curator `name` / `summary` or observed `disclosure` at the summary ceiling.
3. **Open:** Retrieve full transcript, posts, or external state out-of-band using separate, independent authorization.
4. **Expand a member:** Follow nested Map coordinates or member references when supplied.

The portable round trip is exact over repository positions. External addresses are preserved in a
map-note, but a hosted store that cannot ingest them MUST either preserve them as address-only or
explicitly decline the import; it MUST NOT silently drop them.

## Position addresses

A position address names one root and one position in it as a single string. It is how a reader
holding a Map points at a member without a filesystem path:

| Form | Names the root by | Valid |
|---|---|---|
| `@n_0123456789abcdef01234567//findings/x.md` | identity (`root_node_id`) | anywhere — the canonical form |
| `@research//findings/x.md` | its name in one Map | only alongside that Map |
| `//_agent/agreement.md` | the reader's own root | only where the reader knows its identity |

Everything after `//` is a canonical repository-relative path, validated like
[`repository-path.md`](repository-path.md): no leading or trailing slash, no `.` or `..` segment, no
backslash or NUL, nothing inside `.git`. An empty position is the root itself, so `@research//`
addresses position `.`. Unlike a position member, an address may point inside `_agent/` or an
extension: it names bytes, and whether the reader may disclose them is decided separately. A
reference that parses as a root identity is always an identity, which is why a name may never take
that form.

Resolution against a Map is pure and reads nothing:

- An identity matches the root whose `root_node_id` (or `repo` identity) equals it exactly. A legacy
  12-hex identity and a current 24-hex one are different identities, as everywhere else.
- A name matches the root that declares it. A root that declares no `name` answers to a default the
  reader supplies — its hosted slug or its Agreement's name, as the reader knows them — and a
  declared name wins over a default one.
- `//` matches the root carrying the reader's own identity.

A root absent from the Map, an unknown name, a reference matching more than one root (the same
identity pinned twice, or two roots answering to one default name), and `//` without a known reader
identity are typed results, never a path guess. Anything stored for later carries the identity
form or the Map it was read with.

The unresolved codes are `root_not_in_map`, `unknown_name`, `ambiguous_root`, `ambiguous_name`, and
`self_unknown`; invalid addresses are `invalid_address_form`, `invalid_root_reference`, and
`invalid_position`. Operation results in the vectors use camelCase fields (`rootNodeId`,
`rootIndex`), as the existing repo-URL and root-identity results do; stored Map data keeps its
snake_case fields (`root_node_id`). In a resolution vector's `context.defaultNames`, `null` marks a
root the reader knows no name for.
`parseMapPositionAddress`, `formatMapPositionAddress`, and `resolveMapPositionAddress` are the
reference functions; valid addresses round-trip through parse and format. Reading the bytes — at the
pin or at a checkout's HEAD, locally or remotely — is the harness's.

## Observed disclosure and curator annotations

Either member form MAY carry `disclosure`, an object with optional string `name` and `summary`.
These fields record target information observed by the producing reader. They do not identify a
resolver, prove freshness, grant access, or certify that the observation is accurate. Unknown
fields are preserved but have no base meaning or implied operations.

Top-level member `name` and `summary` remain curator-authored annotations. Readers MUST NOT replace
these with retrieved fields, or treat them as verified target information. A legacy member without
`disclosure` has no declared observation; readers MUST NOT synthesize one from its annotations.

```yaml
roots:
  - repo: https://ideaspaces.example/repos/n_0123456789abcdef01234567
    root_node_id: n_0123456789abcdef01234567
    sha: 1111111111111111111111111111111111111111
members:
  - root: 0
    position: decision.md
    depth: surface
    summary: Why I selected this Note.
    disclosure:
      name: Decision
      summary: The Note's observed summary.
  - address: hostname:example.org
    depth: summary
    name: Relevant organization
    disclosure:
      name: Example
      summary: The observed entity profile.
```

`depth` remains a **ceiling**, not a request and not an assertion that all permitted detail is
present. The first member above permits a surface read but supplies only name/summary. When
`depth` is `name`, observed `disclosure.summary` MUST be absent, even if empty. External addresses
with no declared depth may carry name/summary but promise nothing beyond summary. Curator
annotations are explicit authored disclosure, not permission to fetch more target content.

An entity address needs no Git root; an entity-only Map may have `roots: []`. The protocol does not
require a known type registry to display supplied information. An unknown address type remains
opaque, and neither its type nor its appearance in the Map implies membership or permission
to message, invoke, or read the target.

Preserving a Map preserves the ordered references, annotations, and supplied observations. It does
not freeze live entities. A later authorized read can return a new observation without rewriting
the preserved view. Git-backed observations that claim an exact pin must describe that pin, not
uncommitted working-tree content; verifying this is the producing harness's responsibility.

## Access vocabulary and capability ladder

The protocol defines the shared, platform-neutral vocabulary of subject kinds and capability relations
used when expressing, projecting, and discussing access across Maps, repositories, and coordinated Spaces.

### Subject kinds

Subjects participating in access relations are classified into five standard kinds:

- `person`: An individual human user.
- `team`: A group of persons associated under a shared organization or team domain.
- `organisation` (US spelling `organization` accepted as an alias): An organization or account domain entity.
- `agent`: An autonomous or assisted AI agent actor.
- `public`: Unauthenticated, anonymous public access.

### Capability ladder

The capability ladder defines the canonical ordered relations from lowest privilege to highest:

1. **`view`**: Observe Map members and progressive disclosure at declared depth ceilings (`name`, `summary`, `surface`, `children`, `full`).
2. **`read`**: Retrieve and read complete Note and document content bodies.
3. **`history`**: Inspect Git commit graphs, version logs, timelines, and post transcripts.
4. **`copy`**: Clone repositories and take independent forks of spaces.
5. **`write`**: Create, edit, and stage content and metadata.
6. **`push`**: Transport and push commits to remote repositories.
7. **`manage`**: Grant, revoke, and administer access relationships and participants.

### Map disclosure and the view rung

**A Map's disclosure ceiling is the view rung.**

Observing, sharing, or navigating a Map and its members at any depth ceiling (`name`, `summary`, `surface`,
`children`, `full`) operates at the `view` capability rung. Disclosing a member's observed name, summary,
outline, or surface representation requires only `view` standing on that member coordinate; it does not
grant or imply `read` (opening the underlying Note body directly), `history` (reading past commits or full
Thread histories), `copy` (cloning the repo or taking a portable fork), `write` (mutating content), `push`
(pushing commits), or `manage` (administering access).

The protocol defines these shared words and their semantic mapping to Map representation rungs without
prescribing server-side ReBAC enforcement rules, tuple storage models, or evaluation algorithms.
Enforcement remains the host environment's concern.

## Building a view

`buildMap(input)` is the reference constructor over already-selected roots and members. Its input
has the same shape as the block, with either array optionally absent. It normalizes roots, preserves
order and unknown fields, and returns `{status: "valid", map}` or `{status: "invalid", issues}`.
Unlike optional `parseMap(undefined)`, building absent/non-object input is an error. Construction is
pure, never mutates its input, and never returns a partial Map. It does not persist or freeze the
result; callers own its lifecycle. For valid output, `parseMap(result.map)` MUST equal `result`.

The builder neither invents a universal local root nor discovers targets from a tree. Private
checkout bindings and working-tree diagnostics belong in harness state, outside the portable
selection. Existing optional `root_node_id` remains supported for local or unpublished repositories.
A hosted repository uses its canonical `repo` URL, which carries the same identity in its path.

**Parsing/building is not safe export.** Unknown fields are preserved, including unrecognized
machine-local data. A sender MUST review the actual selected payload, exclude private bindings and
credentials, verify the intended repository and exact selected content, and apply disclosure/access
rules independently. It MUST NOT infer availability or authority from parser success, a matching
object id, or a configured origin. Missing repository content, dirty selected bytes, or unavailable
pins must not cause silent upload, repinning, or publication. These are consumer checks; the
protocol library does no filesystem or network I/O for Maps.

## Projecting local handles

A tree, working set, or repository catalog may use the same member language before it becomes a
portable Map. The pure [Map projection](map-projection.md) operation converts already-read Content
tree entries and root handles into ordered members with observed disclosure. Local presentation
facts stay beside the member: prompt placement, file kind, counts, omitted entries, checkout path,
sync state, and harness roles do not enter the Map.

A local root ordinal may resolve through a private checkout binding. It is portable only when the
producer supplies a stable root identity and exact pin and the complete block passes `buildMap`.
Dirty, unborn, unidentified, unavailable, or unresolved handles may still render locally, but a
producer MUST omit the portable `map` block rather than emit invalid roots or private paths. An
online-only handle may use an existing address; projection never invents or fetches one.

## Bounded walking

`depth` is representation, not recursion. Recursive walking follows a member that is itself a
map-note. A portable bounded reader accepts a probe depth from 1 through 4, defaults to 1 for ambient
orientation, and never interprets `full` as unbounded recursion. When more nested Map levels exist,
it reports the number omitted rather than silently cutting the walk. A harness may offer a larger
explicit diagnostic walk, but that is outside the bounded portable operation. The reference
library's `assembleContentTree({ depth: "full" })` is such a diagnostic for one local repository
content tree; it does not recurse through map-notes and never changes the meaning of member
`depth: full`.

Cycles are prevented by a walk's visited `(root pin, position)` set. Repeating an already-visited
map-note reports a reference to the earlier coordinate instead of expanding it again.

## Compatibility and graduation

The `map` block is provisional and adds no base repository-conformance requirement. An implementation
claiming provisional Map parsing compatibility executes every required coverage tag in
[`../conformance/maps/manifest.json`](../conformance/maps/manifest.json), parsing the input of both
`parse` and `build` vectors. A Map construction implementation additionally executes `build` vectors
through its constructor and parses successful output back equal. Those vectors cover optional
absence, canonical HTTPS and loopback-development repo URLs, matching root identities, exact pins,
ordered positions and external addresses, the five ceilings, observed disclosure versus annotations,
unknown types/fields, retired `space`-field refusal, and graceful invalid-block handling. Since
`ideaspaces-maps/v3` they also cover root names and position addresses: parsing, the parse/format
round-trip, and resolution against a Map. They validate representation, not live availability or
permission.

Breaking changes remain allowed before 1.0. This page graduates toward normative only after two
independent harnesses converge and the round trip passes: hosted Map export → map-note → independent
walk → hosted import → equivalent ordered Map over Git positions.
