# A Map about anything

> Language-neutral contract for a Map that is **about** one entity: what `about` means, where such
> a Map lives and how a reader finds it from the thing, how an invitation carries it, how `look` and
> `map` show it, and what it does not do yet. **Provisional, v0.35.0 (draft).** The sentences a
> person reads are AX's, in the marked table at the end; the shape here is Integrator's draft for
> the human, AX and Security to read.

The human, 2026-11-19: "Map can be attached to anything we have. References can be map. To do list
can be a map. We agree on what is in our shared map. Any message has one and we start to explore
together." And 2026-11-20: "map should be something we can attach to (about) to any note/folder or
anything. And so on web it becomes the interface for agent to read and understand web."

This page adds no base repository-conformance requirement and no platform code. It names one field
on a Note, three pure operations, and how the existing pieces (a Note's `map` block, a post's Map,
a Thread's current Map, the `about` of a Thread) read together.

## What `about` means

A Map is a view: ordered pointers, each with a depth ceiling and, for a moment, a pin
([`maps.md`](maps.md)). It holds no content and grants no access. A Map is **about** an entity when
it describes that entity: **what it is**, in the name, summary and legend of the Note that carries
the Map, and **what is related**, in its members. The entity can be anything a typed link can name:
a Note, a folder, a repository, a Thread, a post, a page, a person, a hosted thing. The type
namespace is open, as it is for a Thread's `about` and a Map's address members.

Three rules hold everywhere on this page:

1. **A Map is about what its carrier is about.** The *carrier* is the Note or entry whose
   frontmatter holds the `map` block. A Note is about its `about` links when it declares them, and
   about itself when it declares none. An entry (a Thread post) is about what its Thread is about:
   the Thread's `about`, else the Thread itself ([`threads.md`](threads.md#where-a-thread-sits-and-what-it-is-about-parent-and-about)).
   So a Note's own `map` block is a Map about the Note; a Note with `about: file:…//data.txt` and a
   `map` block is a Map about that file; a post's Map is the Thread's frame.
2. **About is declared, never inferred.** A Map that lists X as a member is not about X, and a Map
   about X need not list X. A filename such as `x.map.md` declares nothing; the field does.
3. **About grants nothing.** A Map is a view, never a grant ([`SPEC.md`](../SPEC.md), [`access.md`](access.md)).
   Declaring that a Map is about X gives its readers no access to X, and X's readers no access to
   the Map or its members. Each content owner grants separately, and a reader without access knocks.

## The field

`about` is the Note field that says what a Note is about: one typed link `<type>:<id>`, or a list
of them. It is the same field, grammar and parser as a post's `about` in [`time.md`](time.md#entries),
and the same open `<type>:<id>` grammar as a Map's address members. `about: []` is about nothing.
A Note that carries `about` is read by that field alone, even when it is malformed: an invalid link
is dropped with the warning `invalid_about`, and a field with no valid link left reads as **absent,
never as "about itself"**. The legacy single `attached_to` reads as one `about` link only when the
Note carries no `about` at all; new writers write `about`. On a Thread Agreement, `attached_to`
keeps its post-only grammar ([`threads.md`](threads.md)).

| Entity | Address in `about` | Carries its own Map in |
|---|---|---|
| a Note | `note:@<root>//<position>` | its own `map` block |
| a folder | `folder:@<root>//<position>` | its `README.md` |
| a repository | `repo:n_…` | its root `README.md` |
| any other file | `file:@<root>//<position>` | nothing: a Map about it sits beside it |
| a Thread | `thread:x_…` hosted; `thread:@<root>//_threads/<name>` local | its current Map, read from its posts |
| a post | a post reference, `post:msg_…` or the forms of `threads.md` | the Map it carries is the Thread's |
| a page | its URL, `https://…` | nothing the protocol reads yet (0.9.24's browser) |
| a person | `person:@<handle>`, the handle as the service spells it; never an email | nothing: beside only |
| a firefly | its repository, `repo:n_…`; an agent that is no repository, `agent:<id>` | its root `README.md` |

A position is a [position address](maps.md#position-addresses): `@<root_node_id>//<position>` is
the canonical form and valid anywhere; `@<name>//<position>` is valid only alongside the Map that
names the root; `//<position>` is the reader's own root. The own-root form after a type reads like
a URL (`file://data.txt`); it is not one. Prefer the identity form in anything stored or sent.

**Two links name one entity** when their type and value are equal after resolving a position
address's root: `//` to the reader's own root identity, a Map root name to the identity the Map
declares. Nothing else is normalized: no case folding, no trailing slash, no default scheme, no
guess at an unknown root. A position under one type and the same position under another are two
entities. An unknown type compares as written. The reference function is `sameEntity`.

## Where it lives, and how it is found from the thing

Two forms, and no third:

**Carried.** The entity carries its own Map in its frontmatter: a Note's `map` block; a folder's or
a repository's `README.md`; a Thread's current Map, the Map of its newest post that carries one
([`time.md`](time.md#the-current-map)). No `about` is written: the carrier is the entity. A reader
finds it by reading the entity. This is the form the goal names: "a person writes an idea on the
Desktop, and it carries a Map of what it is and what it points to."

**Beside.** A Note with a `map` block whose `about` names the entity. For an entity that cannot
carry frontmatter (a file that is not Markdown, a page, a person), one the author cannot write to
(someone else's Note or repository), or one a second person describes in their own words (Anna's
Map about my Note, beside mine). A reader finds it **from the entity** by matching `about` among the
Notes it already holds: its own root, the members of the Space's Map, the Maps the Thread's posts
carry. The protocol defines the match (`aboutMaps`) and nothing else: no index, no scan of arbitrary
roots, no fetch, no filename convention a reader must know. A map-note about a local file SHOULD
sit beside it in the same folder, named `<file>.map.md`, so a reader that holds the folder finds it
without an index; the ending is a habit, and the `about` field is what makes it about the file.

Several Maps may be about one entity. A reader shows them all, the carried one first, then the
beside ones in the order it holds them; it never chooses one for the person. A carrier whose `map`
block does not parse is named as skipped (`invalid_map`), as the current-Map rule names a post; one
whose `about` is present but yields no link is about nothing and, when it is the entity itself,
named as skipped (`invalid_about`).

**What exists already, read under this page:**

- **A post's `map:`** is the Thread's current Map, about the Thread; the post's `about` says what the
  Thread is about ([`threads.md`](threads.md#the-current-thread-map)). Nothing changes.
- **A Thread's opening Map** is the current Map until a later post carries one.
- **A Space's Map** (`home.map.md`, `<name>.map.md`) declares no `about` today, so it reads as a
  curated list about itself. A writer may declare `about: repo:n_…` to say it is about the Space's
  root; nothing requires it.
- **The CLI's `map select … --about <id>`** builds a portable Map and prints which hosted item it is
  about as text beside the block. Under this page that is the carrier's `about`, so the Map travels
  with what it is about. The flag is a trace of this contract, not a second form.

## How an invitation carries it

The Thread opened from an idea carries the idea's about-Map as its opening Map, so the invited
person and their firefly read the same Map first.

1. The idea is a Note. It carries its Map (the carried form), or none yet.
2. Opening the Thread is one `post` with `request: start_thread` ([`verbs.md`](verbs.md#post)):
   `about` names the Note (`note:@<root>//<position>`), and `map` is the Note's carried Map **as a
   moment**: every root pinned, every position member with a depth (`isPinnedMomentMap`,
   [`maps.md`](maps.md)). A Note that carries no Map opens with a Map of one member, the Note
   itself, pinned, at `depth: full`. `with` names who is invited; guard 1 of [`verbs.md`](verbs.md#the-acts-that-reach-other-people-and-their-three-guards)
   applies to `with` and to the act, as it does to every act that reaches another person.
3. The opening post's Map is the Thread's current Map until a later post carries one, and the
   Thread's `about` names the idea. The invited person's `look` at the Thread and their firefly's
   `map` at it read that Map first; a later post that carries a Map replaces the frame for both.
4. The copy is a moment. The Note's own Map may move on; a later post carries the new one.

5. The invited person becomes a member of the Thread's Map (below), once the service has confirmed
   who they are.

Access does not change: a member the invited person cannot read shows as its curator name and
summary, and they knock. Sharing the Thread shares its Map, never the members' content.

## What a Thread's Map holds: the other players

The human, 2026-11-20, 10:32: "We bring in other actors in Thread. Thread is first window of
awareness - what is our point of view (firefly), what are we working on (thread), what we are
looking at and using - a map of other players, repos, knowledge, pages, people, fireflies,
whatever." A Thread's about-Map is that third part. Its members are the players, written in the
member language [`maps.md`](maps.md) already has; this page adds no member taxonomy:

| Player | Written as |
|---|---|
| a person | an address member `person:@<handle>`: `@`, then letters, digits, `_` or `-`, as the service spells it ([`verbs.md`](verbs.md#lists-and-what-they-never-do), rule 4). `depth` is `name` or `summary`, as for every address |
| a firefly | its repository: `repo:n_…` as an address member, or a pinned root with position `.` when the Map pins it, with its Agreement's name and summary as disclosure. An agent that is no repository is `agent:<id>` |
| a repository, a folder, a Note | a position member of a root, or `repo:n_…` |
| a page | its URL, `https://…` |
| a Thread inside | `thread:x_…`, or the position member `_threads/<name>/README.md` |
| an organisation | `hostname:<host>` |

**A person member is a handle and nothing else.** A writer MUST NOT put an email, an invitation
address or a display name in a `person:` member's address, `name`, `summary` or `disclosure`; the
curator may write what they call the person, never what the service knows about them. A person
without an account is not a member: a pending invitation is a count the host keeps
(`access.pending`), never a Map member. A host that writes a Thread's Map refuses a `person:` member
that is not a handle by shape (`who_not_a_handle`, the code [`verbs.md`](verbs.md) already has) and
carries the test `thread_map_person_members_are_handles`. Generic `parseMap` does not enforce this
in this draft: an open address stays open, and the rule sits on the writer, where the person's
words are.

**Inviting someone adds them to the Thread's Map.** When the person invites someone (`start_thread`
with `with`, or `share` of the Thread), the host, after the service confirms who (`facts.with`,
never the model's spelling), posts one entry carrying a Map: the current Map with the invited person
added as `person:@<handle>`. So the Thread's Map says who is looking, and the invited person's
firefly reads a Map that already has them in it. A take back posts a Map without them. The Map
**records** the invitation and is not the invitation: the act is the person's (guard 1), the
service's grant is the grant, and a `person:` member gives that person nothing and gives any agent
no reach to them.

**Security's list rules hold in a Map** ([`verbs.md`](verbs.md#lists-and-what-they-never-do)): a
member seen in a Map never counts as named by the person. Nothing read from a Map's members enters
`context.person_named`: an agent that reads `person:@bea` in the Thread's Map still cannot `share`
with `@bea` until the person writes her name in the conversation. Reach stays the host's launch-Map
rule and is not widened by this page. `said` never quotes a member's curator name as the person's
word. Handles pass by shape; emails and display names never.

## How `look` and `map` show it

**`look`** ([`content-look.md`](content-look.md)) at a Markdown target, or at a folder whose
`README.md` carries the fields, reports from `summary` upward `about` (the links as authored) and
`map` (the carried Map's `roots` and `members` counts), and at `children` and `full` the Map's
`block` itself, rendered as a `Map:` section of one line per member: where it points, its ceiling,
and the curator's or the reader's name and summary. A malformed `about` or `map` is a warning that
names the field, never a failed look. `look` reports; it resolves nothing. For a Thread folder the
current Map and `about` are the Thread state's (`inspectThreadPosts`, `currentThreadMap`); `look`
at the folder does not recompute them.

**`map`** ([`verbs.md`](verbs.md#map)) with `start` at an entity reads the entity's about-Map: its
carried Map; for a Thread, its current Map; else the beside Maps the host holds; else, when nothing
is about it, the Content tree, which is what is there now. `facts.path` names the carrier and
`facts.map` carries the view. No new `request` and no new fact field.

### The words

> **AX's, pending.** Integrator wrote the lines below so the table has a shape; AX replaces them.
> They follow the rules of [`verbs.md`](verbs.md#how-a-said-sentence-is-written): one sentence,
> the person's words, no Git word, `{name}` the item's own name.

| Verb | Case | Proposed line, for AX |
|---|---|---|
| `look` | a Note that carries a Map, at `summary` | {name} points to {n} things. |
| `look` | a Map beside something, at `summary` | A Map about {entity}: {n} things it points to. |
| `map` | an entity with a carried Map | Here is what {name} is and what it points to. |
| `map` | an entity with carried and beside Maps | {k} Maps are about {name}: its own, and {k-1} by others. |
| `map` | an entity nothing is about yet | Nothing is mapped about {name} yet, so here is what is there. |
| `post` | a Thread opened from a Note, with its Map | Opened the Thread {thread} about {name}, with its Map, with {who}. |
| `look` | the Thread an invited person opens | This Thread is about {name}; its Map points to {n} things. |

## What it does not do yet

- **The browser.** How a page names its Map, how a reader fetches and renders it, and the simple
  IdeaSpaces browser the human described are 0.9.24's spike. This page fixes only that a page's
  address is its URL and that a Map about it is the beside form.
- **Grants.** A Map is a view, never a grant. `about` widens no reach: an address outside the
  conversation's reach is refused `out_of_reach` whatever Map is about it, and sharing a Thread
  shares its Map, not the members.
- **Discovery.** No index of `about` is defined. How a service stores or queries it is the
  service's contract.
- **A Map about several entities at once** is permitted by the grammar (a Thread grown from several
  points of context lists them all) and is outside the two forms above.

## Conformance

A tool that reads Maps about things executes every required coverage tag in
[`../conformance/maps/about.json`](../conformance/maps/about.json), pointed at from the Maps
manifest as `about_vectors`. Three pure operations: `parse_about` (a Note's frontmatter to its
links, with the legacy field and the warnings), `same_entity` (two links and the reader's context to
a boolean, symmetric) and `about_maps` (an entity, the Notes a reader holds and its context, to the
carried and beside hits and the skipped carriers, or `invalid_entity`). The reference
implementation is `src/map-about.ts`, exported from the package root as `parseAbout`,
`sameEntity`, `aboutMaps` and `ABOUT_POSITION_TYPES`. The Content look vectors `about_links`,
`carried_map` and `carried_map_block` in [`../conformance/content-look/manifest.json`](../conformance/content-look/manifest.json)
prove how `look` reports the fields, with one rendered fixture. All of it is pure: no filesystem
beyond the look's own target, no Git, no network.
