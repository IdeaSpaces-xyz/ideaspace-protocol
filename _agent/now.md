---
name: Now
summary: "v0.35.0, draft: a Map can be about anything, since a Map is about what its carrier is about; about on any Note, carried and beside forms, the invitation's opening Map, and look reporting about and the carried Map. Before it, v0.34.0, draft: the four verbs map, look, post and write under one ideaspaces namespace, one write, answers that say the person's sentence first and the Git facts as named fields, post's request kinds with three guards, and AX's words table. Before it, v0.33.0, not released: time is something a folder keeps, entries set its state by one rule, and as_of/since/newest read it in time; a Thread's tree edge is parent and its subjects are about; cache-stable ambient Tree text omits recursive file counts while explicit Tree reads retain them. Before it, v0.32.0: a repository's identity image and the current Thread Map; and access version one. No release, engine, or consumer pin change."
---
# Now

## A Map about anything, v0.35.0 (draft, spec/map-about)

A Map is about what its carrier is about: the Note or entry whose frontmatter holds the `map`
block. A Note is about its `about` links (one typed link or a list; the same field and parser as a
post's `about`; the legacy single `attached_to` reads as one link when no `about` is present) and
about itself when it declares none; a post's Map is the Thread's, and the Thread is about its
`about`. Two forms and no third: **carried** (a Note's own `map`, a folder's or the root's
`README.md`, a Thread's current Map) and **beside** (a Note with `map` and `about` naming a thing
that cannot carry one or that someone else describes). About is declared, never inferred from
membership or a filename, and grants nothing. A reader finds a beside Map by matching `about`
among Notes it already holds (`sameEntity`, `aboutMaps`); no index, scan or fetch. The Thread
opened from an idea carries the idea's Map, pinned, as its opening Map, so the invited person and
their firefly read the same Map first. A Thread's Map holds the other players (the human, 10:32:
"a map of other players, repos, knowledge, pages, people, fireflies, whatever"): a person as
`person:@<handle>`, a handle by shape and never an email, a firefly as its repository; inviting
someone adds them to it after the service confirms who, and a member seen in a Map never counts as
named by the person (Security's list rules of #111). Security's read (2026-11-20): for reach only
the newest Map from the person's own side counts (`currentThreadMap`'s `authors`, `from_others`);
an invite builds on that Map; a Map from others is checked when read (`readMapFromOthers`: handles
only, names one line and marked `by_others`); `about` is an address or nothing (`isAddressShaped`);
a knock Thread's `about` is set by the service from the item, and its opening Map carries only the
landing's title and summary. Content look reports `about` and the carried
`map` from `summary` upward and the block at `children` and `full`. The human's words: 2026-11-19
("Map can be attached to anything we have… Any message has one and we start to explore together")
and 2026-11-20 ("map should be something we can attach to (about) to any note/folder or anything").
The contract is [`schema/map-about.md`](../schema/map-about.md); vectors
`conformance/maps/about.json` and three Content look vectors; code `src/map-about.ts`. The words a
person reads are AX's, in its The words table: counts, never a member's name. The browser (0.9.24) and grants are named as not
yet. Drafted for the human, AX and Security to read; no tag or release is part of this change.

## Who a post asks: `to` (rebased from #96)

Any entry may name who it asks in an optional `to` field: one name or a list, each a name as an
`author` would write it or a typed `<type>:<id>` address, trimmed, one line, at most 200 units,
repeats dropped, at most 20; a malformed value warns `invalid_to` and the post stays valid. A claim
like `author`, never resolved; it grants, notifies and restricts nothing. The human, 2026-11-09.
Approved as #96 on 0.32.0 and rebased onto 0.33.0: the field lives in `time.ts` beside the other
entry fields, `parseAddressees` is exported under the Thread names too, `verbs.md` lists `to` on a
`post` entry, and the 18 vectors are unchanged in `conformance/threads/addressees.json`. No tag or
release.

## Lists and readers (draft, spec/remote-entities)

`map` from `ideaspaces`, an org (`hostname:<host>`) or a person (`person:<handle>`) is a list:
Personal, each org, Shared with you; an org's Spaces; what a person shared. `look` at a service
address carries `access`, who can read the item, only when the person manages it. Security's
conditions are requirements with vectors: seeing is not reaching (`context.listed` is consulted for
nothing), fields only with names cut to 120 characters and marked `by_others`, no lists for listeners
or launched children (`context.lists`, `no_lists`), handles by shape and never an email or a display
name, pending as a count, and accepted shares only. Security's round 2 added: `access` is a list too
(`access_without_lists` for a listener or a child), list starts by shape (`person:` a handle,
`hostname:` a host), names free of every control and format character, fixed shapes for `address`,
`kind` (a closed set), `level` and `time`, and two named host tests. Scout's additions 1 and 2,
placed by the human 2026-11-17 18:31. The five new `said` rows are marked for AX. No tag or release is part of this change.

## The four verbs, v0.34.0 (spec/four-verbs, merged 03c7e52)

An agent works an ideaspace with four verbs, the ones a person names: `map`, `look`, `post`,
`write`, spelled `ideaspaces <verb>`, `mcp__ideaspaces__<verb>` and `ideaspaces_<verb>` on the
three kinds of route; the address decides local or remote. Old names are aliases in the CLI and the
plugin until 1.0. One `write` per route takes over the file write, the edit, the Note write and the
commit: any file, refuses an entry (naming the correcting `post`), adds to history only when asked.
Every answer is `said` (one sentence in the person's words, never a Git word, command or hash) and
then `facts` under a closed field set; a refusal carries `reason_code` and `next`, a verb call or
`null`. `post` has `entry`, `start_thread`, `share`, `revoke`, `visibility` and `publish`; the ones
that reach other people carry three guards as requirements (from the person's words, the sign-in
never reaches the model, only the person takes back), each with a negative vector. The agreed
decisions behind this are the human's of 2026-11-17 (Agreement v2 of Idea Explorer 0.9.23, 4.3, 4.7,
4.8). The `said` words, the descriptions' first sentences and the forbidden list are AX's, in The
words at the end of [`schema/verbs.md`](../schema/verbs.md); the list is `SAID_FORBIDDEN_WORDS` and
the manifest's `said_forbidden_words`, and a test holds the table to it. Pure: `src/verbs.ts`, `conformance/verbs/manifest.json`. What the CLI, the Desktop
engine and the plugin must change is named in the PR body, not built here. Security's review (round
2, 2026-11-17) added: the act itself comes from the person (`person_asked`; Agreed by the human,
2026-11-17 18:20), `grade` optional and from the person, a missing `reach` reads as none, `secrets` in
`check_answer` refusing a credential anywhere in an answer, take back checked `person_only` first and
the person's own always working, and the `publish` push conditions with `redirected`. No tag or
release is part of this change.

## Time and state, v0.33.0 (not released)

A folder keeps time by placement (`_threads/<thread>/`) or by `keeps_time: true` in its own
Agreement; in a declared folder a file without an `id` is an ordinary Note, so turning time on for a
folder of Notes flags nothing. Entries set the folder's state by one rule: the newest readable entry
that carries a field wins, and an unreadable newer entry is named. `closed` is a boolean field
(`kind: closure` reads as `closed: true`) and the one named exception, reading `unknown` when a newer
entry can't be read, because writers act on it. A snapshot is any entry carrying a Map (`snapshot` is
legacy, kept on read); a `reframe` is the one kind whose `name` and `summary` are the Thread's own;
the README is a view of the state and the Agreement the one hand-kept file. `as_of`, `since` and
`newest` select entries by filename or by moment, naming what they cannot place. The generic text is
[`schema/time.md`](../schema/time.md) and the code `src/time.ts`, behind the Thread names, so nothing
a consumer imports is removed; Content look pages and selects by id in any folder that keeps time.
Memory is the fixture: `conformance/time/memory.json`. The human, 2026-11-14 and 2026-11-16. What a
writer must change (the CLI's `--kind snapshot|closure`, Home's skills, the README view) is named in
the PR body of the change that brought this, not built here. No tag or release is part of this change.

## The words: a Space is the place, a Map is the view (not released)

Text only. What the protocol called a Vault is a **Space**: the shared place a person or a company
works in, holding Repos, Threads, and the people and agents there. What it called a Space, a lens of
references, is a **Map**: a view with a depth and, for a moment, a pin. The human, 2026-11-14: "Space
== Vault. Maps are views... We call Vaults Spaces now." The API's compatibility names stay: `Space`
for repository context, `vault` for a Space's ownership, `space` and `homeSpace` for the grants on
its Map. No format, loading rule or vector changes; the guide skills say the new words.

## Parent and about, v0.33.0 (not released)

A Thread's place in the tree is `parent`, one post reference on a post; what it is about or grew out
of is `about`, any number of open typed links that never make a tree edge. The opening post's
`parent` is the origin; a `reframe` that carries `parent` moves the Thread; the current parent is
the newest post's, then the Agreement's, then the origin, and `inspectThreadPosts` says which
(`source`) and from which post. A post reference may name a post in another root,
`post:@<root>//…`, resolved only in a supplied root with that label. A legacy `attached_to` reads
as `parent` when it names a post and as `about` otherwise; writers write both during the
compatibility window. See
[`schema/threads.md`](../schema/threads.md#where-a-thread-sits-and-what-it-is-about-parent-and-about)
and `conformance/threads/parent.json`. No tag or release is part of this change.

## Cache-stable ambient Tree text, v0.33.0 (not released)

The typed awareness Tree still carries total and per-directory Markdown counts. The ambient `head`
and canonical full render omit those recursive counts, so adding a file beneath an already-listed
directory does not change the cache-stable section. Explicit Tree sections, focus reads and standalone
Tree diagnostics retain the counts. The placement conformance fixture and a count-only mutation test
prove the split. No consumer source change, tag or release is part of this fix.

## A repository's identity image, v0.32.0 (not released)

A repository MAY name one picture of itself (a repo's icon, an agent's avatar, a person's portrait) with
`image: _assets/<file>` in its root `README.md` front matter, and nowhere else. It resolves by the
`_assets/` rules from `README.md`; PNG, JPEG or WebP; at most 256 KiB; inside the root after
symlinks; bytes match the extension. SVG is `unsupported_type` in this version; a rule for it is a
later change, with Security's items as its vectors.
Every failed check, an I/O error included (`unreadable`), is a coded, reported result, never fatal;
readers show their default. Remote
pictures are never fetched. `resolveRepositoryImageDeclaration` and `checkRepositoryImageBytes` are
pure and browser-safe (`./assets`); `readRepositoryImage` reads the disk; a content look at the repository
root carries `image` from `summary` up. See [`schema/assets.md`](../schema/assets.md#identity-image)
and `conformance/assets/repository-image.json`. No tag or release is part of this change.

## The current Thread Map, v0.32.0 (not released)

A Thread's current Map is the Map of its newest post that carries one, whatever its kind: a Map
belongs to the post it was posted with, and a Thread has many over time. `currentThreadMap` reads
it from caller-supplied posts: a post without a Map never replaces it, a malformed Map is skipped
and named, and a capped or partial read reports `stopped`. See
[`schema/threads.md`](../schema/threads.md#the-current-thread-map) and
`conformance/threads/current-map.json`. No tag or release is part of this change.

## Access version one (not released)

See [`schema/access.md`](../schema/access.md) and `conformance/access/manifest.json`. The pure
check intersects person, agent grants and session acts; ancestors are derived by the host.
Grants on a Space's Map never reach content; being in a Space is access to its Map; a company Repo starts
with a removable org Viewer grant. The Repo owner owns everything below; agents own nothing.
Closing is reserved for 1.1. List and guarded who-with-path share the check. No engine, server
migration, consumer pin change, tag or release is part of this change. Three product questions
remain explicitly Open. View is current state only; history is separate.
The 2026-11-09 decision separates hosted edit from Git:
edit has no Git/history; Git fetch/push require edit plus pull on the Repo root; pull implies history.
A Space's Map lists the Space's discoverable items; hosted Threads have no export.

## Earlier state

**v0.21.0 candidate, early and provisional — one public standard for repository shape, selectable Agreement awareness, placement-driven ambient rendering and one Content-tail composition, bounded reference focus and Content look, optional Maps and local projection, named extensions and repository identity, the agent operating loop, and safe local repository effects.**

In place:
- **One Content-tail composition — v0.21.0 candidate.** `assembleContentState` reads local State at tail placement (Git facts plus staged Content/`_agent/` paths awaiting commit); `renderContentState` renders it deterministically; `renderContentTail` composes the volatile register in fixed order — State, caller-owned handles in producer order, the manifest's tail sections with State superseding the compact Git line, then the open Change line last. Handles and the Change line remain harness-owned text the protocol orders but does not define. A language-neutral vector with staged-but-uncommitted files proves the composition, so a CLI status command and an agent runtime's post-breakpoint block are byte-identical for equal inputs without either owning a second section list.
- **Rung-selective local Content look — delivered in v0.20.0.** `assembleContentLook` reads exactly one local Markdown Note or Content directory at `name | summary | surface | children | full` beneath the applicable reference-only Foundation/Agreement frame. Note headings and directory handles share the children rung; a directory README is its surface, not a child; Note full equals surface. The deterministic renderer and language-neutral vectors prove all five rungs, frame isolation, honest omissions, rootless member projection, and no caller-authority mutation. A consumer may wrap the projected member in a portable Map only after independently proving a clean, pinned, identified root.
- **Placement-selective ambient awareness — delivered in v0.19.0.** `renderContentAwareness` accepts typed `head | tail` selection derived from manifest item placement, keeps both sides disjoint and canonically ordered, confines activity to tail, and retains the byte-identical full and explicit-section compatibility paths. `history` remains exclusive to reference focus; placement selection changes rendering, not portable Map data or private runtime residency. Language-neutral filesystem/Git vectors prove deterministic head/tail output and full-render composition.
- **Tree/root-handle Map projection — delivered in v0.18.0.** `projectContentTreeMembers` turns the canonical Content tree into ordered repository-position members whose observed names and summaries live in disclosure; placement, kind, counts, omissions, paths, roles, and sync state remain local presentation facts. `projectRootMapMembers` gives working sets and repository catalogs the same member language, preserving unresolved handles without inventing addresses. Shared renderers retain existing tree and root-handle text. Language-neutral vectors prove disclosure ceilings, producer order, omissions, strict portable wrapping, and private-presentation isolation.
- **Bounded Content focus — delivered in v0.17.0.** `assembleContentFocus` reads one target position without accepting or changing a caller contract stack. The target's selected agent context, depth-one Content tree, and skill handles all carry `placement: history`; `contractRole: reference` makes the invariant explicit: focus agreements are read, never composed. `renderContentFocus` produces one deterministic block, and language-neutral vectors prove reference role, Agreement full loading, sibling summaries, depth, placement, and repeatability.
- **Selectable Agreement awareness — delivered in v0.16.0.** `assembleContentAwareness` returns typed Foundation, Agreement, and floor outcomes. Foundation rendering remains frozen; Agreement loads every selected entrypoint in full, direct sibling Markdown at summary, and `context.full` declarations in full. Exact-byte revisions and `placement: head | history | tail` keep representation, prompt placement, Map depth, and private runtime residency distinct. Language-neutral vectors and a public Agreement fixture prove selection, no cross-entrypoint context, declared-load safety, identity ceilings, and three portable skills. `assembleAwareness` remains the deprecated compatibility wrapper.
- **The guidance ladder — delivered in v0.13.2.** Four catalog entries answer a person, not an agent: `guide-story` (the workshop and the whiteboard), `guide-jobs` (six jobs in plain words), `guide-working` (the rhythm, and when the assistant acts vs. shows a plan first), `guide-bigger-picture` (knowledge as a process people and agents map and navigate together). Progressive disclosure for humans: each rung hands off one step deeper, ending at SPEC.md; a test pins the handoff chain. Distributed to every surface through the same embed → reference pipeline as the operating protocols; surfaces add their own guidance-door entrypoints.
- **File-first Maps — delivered provisionally in v0.13.0; vocabulary corrected in v0.15.0.** An ordinary knowledge Note may carry ordered repository positions or open external addresses in an optional `map` block. Roots carry a full Git pin and canonical `/repos/{root_node_id}` URL, portable `root_node_id`, or both; positioned members name their root ordinal `root`. Production URLs require HTTPS while loopback development may use HTTP. The pure parser derives and checks matching root identity, preserves ordering and unknown fields, and refuses old `space` fields or invalid projections without rejecting the Note. Language-neutral vectors cover the shape. Recursive walking is bounded and honest about omissions; a repo URL never grants authority or triggers a fetch. Hosted versions, cursors, Grants, transport, ingestion, and live projection remain outside the protocol. The page stays provisional until two independent harnesses pass export→walk→import.
- **Derived local Content Maps — delivered in v0.13.1.** `assembleContentTree` exposes the awareness tree walker without requiring an `_agent/` contract. Numeric probes retain the [1, 4] ambient cap and default 50-entry directory bound; explicit `depth: "full"` walks the local Content tree to leaves with no default entry cap and summary-rung handles at every visited level. Extensions and reserved state stay excluded. The result carries handles, never embedded bodies; the diagnostic does not recurse through map-notes, weaken ambient awareness, or reinterpret Map member `depth: full`.
- **Inspectable named-extension contracts — delivered in v0.12.0.** A documented extension publishes only its exact name and placement, payload, authored references, safe unaware behavior, portable operations and vectors, and extension-owned compatible format evolution. `_assets/` is the worked example. Readable contracts are expected for documented extensions and shared vectors for standard ones; schema, examples, skills, and adapters remain optional. No inventory, registry, manifest, package system, loader, support API, conflict machinery, or trust taxonomy was added.
- **Generic repository ownership — delivered in v0.11.0.** `classifyRepositoryPath` is one pure lexical operation over a portable path plus explicit file/directory kind. Exact `_agent` remains core context; the first other underscore-prefixed directory owns one quiet opaque extension subtree. Awareness, validation, stale-doc discovery, staged-path reporting, and the asset resolver share this boundary. Unknown extension Markdown never becomes Content, an explicit focus inside payload returns no Content manifest, and classification never stages or interprets payload. Language-neutral vectors require no named extension semantics.
- **Portable supporting material — delivered in v0.10.0, retained as the first optional standard extension.** Exact `_assets/` is referenced payload beneath any content position, not a position, Note, surface, searchable knowledge, or ambient context. `resolveAssetReference` lexically resolves an already-extracted relative Markdown path from its containing document with no filesystem lookup, search, fallback, rendering, or mutation. Its separate language-neutral schema and vectors prove root, colocated, both-present authored selection, dot normalization, exact-case/extension precedence, root escape, invalid input, and asset-tree skipping.
- **Portable root identity — delivered in v0.9.0, extended to Agreement in v0.16.0.** A selected root entrypoint may declare optional `root_node_id`; current writers mint 96 random bits while readers preserve current and legacy forms. Pure package-root primitives parse, mint from injected entropy, and evaluate caller-supplied declaration/origin/registry evidence as absent, local-only, legacy-unstamped, aligned, drift, ambiguous, or invalid. Missing identity remains valid; no read creates a contract, writes, migrates, or rebinds. The language-neutral schema and vectors make lazy convergence independently implementable.
- **TypeScript reference local effects — delivered in v0.8.0.** `@ideaspaces/protocol/local-effects` implements async atomic Markdown writes and exact reviewed-path commits over explicit filesystem/Git capabilities. It executes every v0.7.0 language-neutral vector and case against isolated real Git, including fault-injected stage/commit boundaries. The package root remains mutation-free: it exports only pure request/result/capability types, validators, and injected read-only `pathRevision`; Rust remains an independent implementation of the same contract.
- **Public capture-standard framing — delivered in v0.4.8.** GitHub and npm now lead with the outcome the protocol makes portable: agents preserving useful work as durable Markdown and git history. The package APIs and schema semantics are unchanged from v0.4.7.
- `SPEC.md` + `SKILLS.md` — the normative shape and ability layer, including explicit push/pull directions and the protocol-owned shared skill catalog.
- `schema/` — provisional frontmatter and Maps, generic repository-path ownership, `_agent/` contract, and Change-layer trailer formats. `attached_to` and external Map addresses share one open `<type>:<id>` grammar but not one relation.
- `src/` — the reference TypeScript library for repository-path ownership, frontmatter and Map parsing, contract composition, awareness, path walking, git state, drift, skills, conformance, and Change trailers. The full suite is green.
- **Structured Content awareness — delivered in v0.4.5, selectable in v0.16.0.** `assembleContentAwareness` returns portable position/tree/contract/skills/activity/git/drift facts plus selected-source outcomes, exact representations/revisions, and prompt placement. The manifest is the local filesystem/Git Content adapter, not a graph/platform manifest. Harnesses retain frame persistence, session state, mounts, seen-ref writes, remote tiers, and actual residency; `assembleAwareness` remains as the compatibility block.
- **Tree-shakeable direct imports — delivered in v0.4.6.** The package declares `sideEffects: false`, matching its function/constant-only modules, so bundlers may remove unused protocol re-exports. This keeps a hook that imports only path/git primitives from carrying the YAML-backed awareness/conformance graph.
- **Portable workspace handles — delivered in v0.4.7; projected in v0.18.0.** `readRootHandle` returns a root's Now/README summary and immediate directory count; `readWorkspaceRepositories` returns sorted immediate-child repository handles with raw git state. The protocol assigns no home/mount/POV role, contacts no remote, and performs no writes; v0.18.0's pure projection renderer accepts caller-owned presentation labels without moving them into Map data. Repository qualification compares the resolved git toplevel with the child itself, supporting linked worktrees and repository-root symlinks without misclassifying directories inherited from a parent repo.
- Downstream adoption — CLI, MCP, the Claude plugin, and Pi consume the protocol shape directly; CLI, MCP/Claude, and Pi run local writes and exact-path commits over the v0.8.0 effect boundary. Shared references are generated from this repo's catalog. SDK 0.2 is a separate Keeper transport package with no protocol dependency or re-export.
- **Cross-surface conformance — delivered (2026-07-16→18).** Every surface proves the same write-path contract in its own CI, judged by this repo's kit (`validateSpace` + trailer vectors): the CLI in its own tests, the MCP server + Claude plugin through the shipped MCP artifacts (claude-code-plugin#46), and Pi through its genuine extension runtime (pi-is-space#52). Surface parity is now *tested semantically*, not asserted. The program earned its keep immediately: seven real defects found in three days, five fixed — including a rename-commit failure in the CLI's path-scoped commit (cli#85), a floating-install breakage, and a cross-surface record race — each now locked by a conformance vector.
- **Distribution drift guards — shipped, consumer-side.** The Claude plugin pins vendored bundles with a hash-verified lock and a CI rebuild check; Pi installs from a committed lockfile via `npm ci`. Consumers can no longer silently lag the protocol or float their dependencies.
- **Portable skill identity — delivered in v0.6.0 (#41).** `_agent/skills/` entry ids and frontmatter `name` are one Agent Skills-compatible value: lowercase ASCII letters, digits, and single hyphens, with display titles in Markdown headings. The conformance kit checks both flat and directory forms, respects nested-space boundaries for skills and knowledge, and carries a valid skill in the language-neutral reference space.
- **Full-stack fractal composition — delivered in v0.5.0 (#29).** `ComposedSpace.stack` carries every `_agent/` level root-first; a branch guide narrows the root guide instead of deleting it, and `_agent/skills` compose along the path with deeper same-named shadowing. SPEC invariant 4 and the schema now state the layer-vs-scope distinction explicitly: the four fractal files *layer*; `foundation.md` *scopes*.
- **The canonical foundation core — delivered in v0.5.0 (#31).** `templates/foundation-core.md` is the conduct seed scaffolds compose into a new space's `_agent/foundation.md` (values, Protect/Never, capture-is-conscious, the generalized untrusted-content stance), exported as `FOUNDATION_CORE`/`FOUNDATION_CORE_VERSION` via the embed pipeline and shipped as a raw asset for non-TS runtimes. Default content, not a conformance requirement — part of the foundation-alignment layered split: conduct lives in the space, capability and mechanics in the harness.
- **Depth on the awareness tree — delivered post-v0.5.0 (#35).** Tree entries carry summary-rung handles at level 1 (a directory's README summary, a file's own), and a caller-supplied probe depth (soft-capped 1..4, ambient default 1) returns a thin name-rung outline below — more map, never content. Per-directory soft cap with honest omitted counts. The local map can now be judged, not merely addressed; the CLI and Pi expose the knob as consumer follow-ups.
- **Progressive-disclosure Markdown inspection — delivered post-v0.5.0.** `inspectMarkdown` / `inspectMarkdownFile` expose `summary | outline | section` reads without making a full body the default. ATX outlines ignore fenced-code headings; section selection includes nested subsections, stops at the next equal-or-higher heading, and requires a one-based occurrence when exact heading text repeats. The reader contract is language-neutral in `schema/markdown-inspection.md`; host surfaces retain permissions, truncation, and full-read behavior.
- This `_agent/` contract — the repo dogfoods the protocol.

Next (detail in [next.md](next.md)):
- CLI and Pi consume the shared tree/root-handle projector and renderer; desktop's Local Map walk remains the independent harness for the provisional Map shape.
- Keeper adoption and CLI create/publish/clone/fork use the v0.9.0 root-identity contract without changing its lazy compatibility rules.
- Local and hosted consumers adopt the v0.10.0 `_assets/` shape without moving rendering, access, MIME, or storage policy into the protocol.
- A contract-delta primitive for ambient fractal awareness on the surfaces.
- Retire the legacy awareness wrapper after a final consumer audit; evolve `attached_to` only from demonstrated needs.
