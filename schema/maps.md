# Maps

> Portable contract for the optional `map` block on a knowledge Note. **Provisional, v0.13.0.**

A Map is an ordered navigation layer over addresses. It combines three proven ideas without becoming
another repository model: exact pins from manifests and lockfiles, curated link maps, and links that
may resolve only after a reader gains access. It rides ordinary Markdown frontmatter, uses the
protocol's existing position and identity grammar, and embeds no member content.

The two dimensions that distinguish it from a link list are auditable. A representation rung is a
ceiling a reader can compare with what it actually disclosed; a pin is a resolved Git commit object
id a reader can inspect with bare Git. Mutable intent and exact resolution remain separate, as they
do in manifests and lockfiles. Pins are data, never a workflow that operates another checkout.

This page standardizes the portable **mounted register**: a curated map-note stored in a Space. The
same ordered object may also be sent as an exact frozen coordinate or projected live by a harness,
but Grants, hosted versions, cursors, deltas, forks, ingestion, and transport remain outside the
protocol.

## Frontmatter shape

A map-note is an ordinary Note with an optional `map` block. The Markdown body is its legend: why
these members belong together, what is where, and what proved unhelpful.

```yaml
---
name: EU regulatory landscape — what I found
summary: The useful paths and external references from this inquiry.
map:
  roots:
    - space: git.ideaspaces.xyz/acme/research
      root_node_id: n_0123456789abcdef01234567
      sha: 4f2a91c70d0a8d87c6c2a99649bdfdd5cbe9d732
  members:
    - space: 0
      position: startups/health-tech
      depth: surface
    - space: 0
      position: startups/health-tech/regulatory-landscape.md
      depth: full
    - address: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
      name: EU Artificial Intelligence Act
      summary: Primary legal text outside the mounted Space.
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

## Roots and pins

Each root carries:

- `space` and `root_node_id`, each optional but at least one present;
- `sha`, a full resolved commit object id, never a ref, branch, or tag.

`space` is a canonical remote locator: lowercase `host[:port]` plus repository path, without scheme,
credentials, query, fragment, trailing slash, or `.git`. Repository-path case is preserved. These
common locators therefore identify the same root:

```text
https://git.example.com/Acme/research.git
ssh://git@git.example.com/Acme/research.git
git@git.example.com:Acme/research.git
git.example.com/Acme/research
```

Their canonical form is `git.example.com/Acme/research`. Default ports 80 for HTTP, 443 for HTTPS,
22 for SSH, and 9418 for Git are omitted; other ports remain. Local paths and `file:` remotes have no
portable remote identity and are refused.

`root_node_id` follows [`root-identity.md`](root-identity.md). It survives moves and addresses local
or unpublished roots once a reader already knows them. The remote form covers hosted roots without
requiring identity adoption. When both are present they are two claims about one root; a harness that
knows they conflict MUST surface drift and MUST NOT guess a binding.

Import is resolution, not discovery. A reader MUST resolve only roots already trusted in its local
checkout or registry. A map-note alone never authorizes cloning, fetching, contacting, or trusting an
unknown remote.

Pins make one coherent moment per root. A member never carries its own SHA. Readers preserve the
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

### Space positions

A position member carries:

- `space`: zero-based index into `roots`;
- `position`: canonical repository-relative path, or `.` for the root;
- `depth`: one of `name`, `summary`, `surface`, `children`, `full`.

The depth vocabulary maps 1:1 to the stored `representation` names used by a hosted register and to
the progressive-disclosure ladder in [`content-awareness.md`](content-awareness.md). It is a ceiling,
not authority: access is evaluated independently, members may dangle, and a reader discloses no more
than both access and the declared depth permit.

A Note, folder, and repository use the same form. A map-of-maps needs no special case because a
map-note is itself a position. Protocol positions do not enter `_agent/`, extension payload, or
reserved `.git` state.

### Open addresses

A member outside a known Space carries `address` using the same open `<type>:<id>` grammar as
`attached_to`. That overlap is grammar only: `attached_to` declares what a Note is about; Map
membership declares what a curator included. URLs naturally use their scheme (`https:...`) and need
no provider registry or member type.

An address member may carry `name`, `summary`, and `depth`. Its depth, when present, is only `name` or
`summary`; an external address has no portable pin and promises no deeper representation. Resolution,
fetching, rendering, and provider behavior belong to the harness.

The portable round trip is exact over Space positions. External addresses are preserved in a
map-note, but a hosted store that cannot ingest them MUST either preserve them as address-only or
explicitly decline the import; it MUST NOT silently drop them.

## Bounded walking

`depth` is representation, not recursion. Recursive walking follows a member that is itself a
map-note. A portable bounded reader accepts a probe depth from 1 through 4, defaults to 1 for ambient
orientation, and never interprets `full` as unbounded recursion. When more nested Map levels exist,
it reports the number omitted rather than silently cutting the walk. A harness may offer a larger
explicit diagnostic walk, but that is outside the bounded portable operation.

Cycles are prevented by a walk's visited `(root pin, position)` set. Repeating an already-visited
map-note reports a reference to the earlier coordinate instead of expanding it again.

## Compatibility and graduation

The `map` block is provisional and adds no base repository-conformance requirement. An implementation
claiming provisional Map parsing compatibility executes every required coverage tag in
[`../conformance/maps/manifest.json`](../conformance/maps/manifest.json). Those vectors cover
optional absence, both root identities, remote normalization, exact pins, ordered internal members,
open external addresses, the five depth names, root-index safety, and graceful invalid-block handling.

Breaking changes remain allowed before 1.0. This page graduates toward normative only after two
independent harnesses converge and the round trip passes: hosted Map export → map-note → independent
walk → hosted import → equivalent ordered Map over Git positions.
