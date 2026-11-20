# Time: folders that keep it, entries that set state

> Language-neutral contract for a folder that keeps time: which of its files are entries, how entries
> are ordered and never edited, the reply DAG, corrections and marks, how entries set the folder's
> state (`parent`, `about`, `closed`, `map`, and a Thread's `name` and `summary`), the current Map,
> and the `as_of`, `since` and `newest` selections. **Provisional, v0.33.0.**

A **Thread** is a folder that keeps time by placement (`_threads/<thread>/`, see
[`threads.md`](threads.md)). Any other folder keeps time when its own Agreement says so. Everything
this page defines holds for both; `threads.md` adds only what belongs to the Threads kind: placement,
the tree (`parent`), the post-reference grammar, hosted ids, Map positions and the worktree pin.

## A folder keeps time

A folder keeps time in one of two ways:

1. **By placement.** A direct child folder of `_threads/` is a Thread. Every direct Markdown file in it
   except `README.md` is an entry; a file that cannot be read as one is unreadable and named. This is
   the stricter rule, unchanged.
2. **By declaration.** A folder's own `_agent/agreement.md` carries `keeps_time: true` in its
   frontmatter. Only the boolean `true` turns time on; any other value is read as not keeping time,
   and a reader MAY report `invalid_keeps_time` (the reporting is a MAY, the reading is a MUST: no
   value but the boolean `true` keeps time; the reference implementation reports it, and the
   vectors expect the report from an implementation that claims it). The declaration applies to
   that folder's direct Markdown files only; a subfolder keeps time by its own Agreement.

In a **declared** folder, a direct Markdown file whose frontmatter declares no `id` is an **ordinary
Note**: listed by a reader, searchable as knowledge, outside the timeline, and never a diagnostic. A
file that declares an `id` is an **entry**. A file whose frontmatter cannot be parsed, or whose `id`
is declared but is not a non-empty string, is unreadable and named, because the reader cannot tell
what it was. Turning time on for a folder of Notes therefore changes nothing on disk and flags none of
the files that have no `id`; the folder's first entry is the first file that carries one.

A writer appends entries to a declared folder as it does to a Thread: one immutable file carrying an
`id`, a `date` and a `kind`, under every rule on this page, leaving the Notes as they are. Which
entry a new one answers is the writer's to say in `in_reply_to`; nothing here makes it answer the
opening, as a Thread writer may choose to by default.

`README.md` and `_agent/` are never entries in either kind of folder.

## Entries

Every entry is an immutable Markdown file with a YAML frontmatter metalayer. Once written and
committed it is never edited in place; a change is a new entry, a `correction` that `supersedes` it,
or a `mark` on it.

An entry MUST declare valid leading YAML frontmatter containing a non-empty string `id`:

| Field | Shape | Meaning |
|---|---|---|
| `id` | Non-empty string | Globally unique entry identifier minted by the writer (e.g. `msg_...` or a timestamp-prefixed id). |
| `date` | Calendar-valid ISO instant: `YYYY-MM-DDTHH:mm:ss[.sss]Z` or `YYYY-MM-DDTHH:mm:ss[.sss]±HH:mm` (fraction 1–3 digits); legacy `YYYY-MM-DD` | Optional for old entries; new writers record the instant used in the filename stamp. Readers prefer the authored date: an instant normalizes to UTC `Z`, a date-only value stays a day with no instant. A YAML-coerced timestamp is that same ISO instant; implementations read the scalar without rejecting the entry due to YAML timestamp typing. With no field, a valid filename stamp supplies the UTC instant; an unstamped name supplies no time. A malformed authored date yields `dateWarning: invalid_date`, never invalidates the entry and never falls back silently. |
| `in_reply_to` | String or string array | Optional parent entry id(s) in the same folder. Absent for the opening; a string for a single-parent reply; an array of 2+ ids for a join. |
| `references` | Array of strings | Optional ancestor chain of entry ids, oldest first. |
| `kind` | String | What a reader acts on. A writer uses `post` (default), `reframe`, `correction` or `mark`; a label goes in `tags`. `snapshot` and `closure` are **legacy kinds**: a reader keeps acting on them (below), a writer no longer writes them. Any other value is an unknown kind: valid, kept, preserved in the DAG. The raw nonempty string is kept; `"mark "` is an unknown kind, not normalized to `mark`. |
| `mark` | String | Open mark value when `kind` is `mark` (e.g. `claimed`, `done`, `+1`). The authored string is kept; whitespace-only or YAML-coerced non-string values warn and are not folded. |
| `supersedes` | String | Optional id of the entry this one supersedes, on a `correction` (or when retracting a mark). |
| `to` | String or array of strings | Optional: who the entry asks. Each is a name as an `author` would write it (`Security`, `UI/UX`) or a typed `<type>:<id>` address (`agent:…`, `person:…`); trimmed, one line, at most 200 UTF-16 code units, repeats dropped, authored order kept, at most 20. An absent field, an empty key or an empty list names no one. A claim like `author`, compared exactly and never resolved; it grants, notifies and restricts nothing. See [`threads.md`](threads.md#who-a-post-asks-to). |
| `closed` | Boolean | Optional. Sets the folder's closed state: `true` closes, `false` reopens. A non-boolean value warns `invalid_closed` and is dropped. A legacy `kind: closure` without the field reads as `closed: true`. |
| `map` | Object | Optional Map block (`roots`, `members`). An entry that carries a valid Map sets the folder's current Map; see below. |
| `parent` | String (post reference) | Optional; the Threads kind's tree edge. Grammar and resolution in [`threads.md`](threads.md). An entry that carries it sets the folder's `parent`. |
| `about` | String or array of strings (`<type>:<id>`) | Optional; what the folder is about or grew out of, any number of open typed links; `[]` clears. Never a tree edge. An entry that carries it sets the folder's `about`. |
| `attached_to` | String (`<type>:<id>`) | Legacy, before 0.33.0: a post reference reads as `parent`, any other link as `about`; see `threads.md`. |
| `name` | String | The entry's title. On a `reframe`, the folder's own name (below). |
| `summary` | String | The entry's dense summary for search. On a `reframe`, the folder's own summary (below). |
| `tags` | Array of strings | Retrieval tags, and where an entry's label goes (`delivery`, `decision`). A label changes no reader's behaviour. |
| `actor_ref` / `author` | String | Optional author identity or human-readable attribution. |

The Markdown body follows the frontmatter. A reader also exposes the derived `fileDate`: the valid
filename instant **or day**, independent of the authored `date`. It recognizes
`YYYY-MM-DDTHH-mm-ss[-SSS]Z-…`, minute-precision `YYYY-MM-DDTHHmm-…`, and day-only `YYYY-MM-DD-…` (or
a `.md` terminator for timestamp forms); an invalid stamp supplies no `fileDate`. An authored or
filename-only day displays as `YYYY-MM-DD`, never as an invented midnight instant.

### Field tolerance

A reader acts on what it recognises and keeps the rest. An invalid optional field (`map` or one
member, `references`, `supersedes`, `parent`, `about` or one of its links, `attached_to`,
`in_reply_to`, `date`, `kind`, `mark`, `closed`, or `to`) is dropped with a warning naming the entry and the
field; the entry stays valid and readable, and sets no state through the dropped field. One bad
`about` link drops that link and warns `invalid_about`; the good links stay. A numeric-looking mark
such as `+1` MUST be quoted as a string in YAML (`mark: '+1'`), or YAML may coerce it and the parser
warns `invalid_mark`.

### Unreadable entries and repair

Only two flaws make an entry completely unreadable:

1. missing or unparseable YAML frontmatter;
2. a declared `id` that is missing (in a Thread), non-string, or whitespace-only.

An unreadable entry is skipped and named with its issues; the folder still lists and opens. An empty
folder (no entries yet) has no broken opening: `parent` is absent, `closed` is `false`, and the first
entry may be written. If the **opening** entry is unreadable, `origin` reads `unknown` and **writes are
refused**, naming the entry and the repair step: without its id an untargeted reply has nowhere to
branch from. Any **other** unreadable entry warns but does not block writes; what it did to the state
is named by the state rule below.

**Anyone who may write in the folder may repair an unreadable entry** whose frontmatter never parsed
(or whose id was never valid). Commit the repair with a message stating why; once-valid entries remain
immutable. This is not a license to silently edit authored history.

## Order

**Newest** is the last entry in code-unit order of filenames. The filename stamp is the instant of
writing; an authored `date` does not reorder entries, and neither does the order a caller supplies
them in. The **opening** is the earliest filename. Ties (equal paths from different roots) break by
id, in code-unit order, never by the host's locale. Consumers that display by time order date-only
authored dates by `fileDate` when present, otherwise by that day, and normalize other authored
instants to UTC before comparing; this is a display rule, not a change to the DAG's topological order.

## The reply DAG and the timeline

`in_reply_to` builds a reply DAG inside one folder: a reply names one parent, a join names two or more.
A reader reconstructs a topologically ordered **timeline** from the entries it is given, handling
out-of-order supply, joins, corrections and closures, and keeping unknown kinds in the DAG. The opening
is the earliest filename, not whichever parsed entry happens to be a DAG root; in a conforming folder
the opening also carries no `in_reply_to`. Cycles and orphan chains are appended deterministically
after the sorted order rather than dropped.

### `correction` and `supersedes`

A `correction` that carries `supersedes: <id>` supersedes that entry. The superseded entry stays in
the folder and in the timeline; a reader lists it as **superseded** and names the correction, and a
"current" view of the folder's entries omits it. Only a readable `correction` supersedes; a
`supersedes` on any other kind is kept as metadata and supersedes nothing. A correction may itself be
superseded.

### `mark` folding

Entries with `kind: mark` attach open-ended status or reaction marks (`claimed`, `done`) to a target
entry:

- `mark` carries the string value; `in_reply_to` names exactly one target id.
- A mark is retracted by a `correction` carrying `supersedes: <mark_id>`.
- In timeline reconstruction, valid marks are folded onto the target's `marks` array and left out of
  the linear sequence. A malformed mark (missing value, other than exactly one target, a target
  missing in the selected folder or itself a mark) stays visible as an entry with a field warning. The
  missing-target warning needs the folder's entries and appears in inspection and timeline
  reconstruction, not in a standalone entry look.
- Fold rule: collect `(author, mark)` pairs on each target, drop marks superseded **only by
  `kind: correction`**, and deduplicate repeated marks by the same named author so one author's repeat
  counts once. A missing author identifies nobody: anonymous marks stay distinct by id. This is a
  projection rule, not an authorship policy; a writing surface applies its own access policy.
- Reconstruction MUST NOT mutate the caller's parsed entries or carry a previous fold into a later
  reconstruction.

## Entries set state

A folder that keeps time has a **state**: the fields its entries have set. The rule is one sentence,
and it is the same for every field:

> **The current value of a state field is the value of the newest readable entry that carries the
> field. An unreadable entry newer than that one is named, never guessed at.**

The state fields are:

| Field | Set by | Legacy form | Current value when no entry sets it |
|---|---|---|---|
| `parent` | an entry after the opening that carries a valid `parent` (any kind; `reframe` is what writers use) | a post-reference `attached_to` | the Thread Agreement's `parent` (or `attached_to`), else the opening's (`origin`); see `threads.md` |
| `about` | an entry carrying `about` (`[]` clears) | a non-post `attached_to` | empty |
| `closed` | an entry carrying a boolean `closed` | `kind: closure` reads as `closed: true` | `false` |
| `map` (the current Map) | an entry carrying a valid Map, whatever its kind | `kind: snapshot` | the opening's Map, else none |
| `name`, `summary` (Threads) | a `reframe` carrying the field | — | the opening's, for a Thread; absent for a declared folder |

A reader reports, for each field, the value and the entry it came from (`parentPost`, `aboutPost`,
`closedPost`, `namePost`, `summaryPost`, the current Map's `post`), and lists every unreadable entry. For `parent`
the report also says where the value came from (`source`: `post`, `agreement`, `origin`).

**`closed` is the one exception, named.** When an entry newer than the one that settled `closed` is
unreadable, `closed` reads `unknown`, because writers act on it: a write into a closed folder is
refused, a write into an open one is accepted, and the unreadable entry may have done either. For
every other field the newest readable entry's value stands and the unreadable one is named. A folder
whose `closed` is `unknown` stays writable: a visible misplaced write is preferable to locking out
every writer. A legacy `kind: closure` entry that also carries `closed` is read by the field.

**A closed folder accepts one entry: the one that reopens it.** An entry carrying `closed: false`
may be appended to a closed folder and sets `closed` to `false`; a writer refuses every other entry
until then, naming the entry that closed the folder. Reopening is therefore an entry like any other,
in the timeline, with its reason in its body, never an edit to the entry that closed.

**A snapshot is an entry that carries a Map.** The kind `snapshot` is legacy: a reader keeps reading
it, and a legacy `kind: snapshot` without a Map is kept with the warning `snapshot_requires_map` on
field `map`, naming the entry; it never replaces the current Map. New writers put the Map on a `post`
(or on any kind that fits what they are saying) and write no `snapshot`.

**When the legacy kinds go.** The legacy reads (`kind: snapshot` as a Map carrier with its
`snapshot_requires_map` warning, and `kind: closure` as `closed: true`) stay in every reader until
two things are true: no writer a Thread reaches still produces them (the CLI, Home's skills, the
Desktop), and one release of each reader (the CLI, the MCP server, Pi, the Claude Code plugin, the
Desktop's vendored CLI) has shipped after that. They may then be dropped, no earlier than 1.0, in a
release these notes name when it is chosen; `THREAD_KINDS` shrinks with them, and entries already on
disk keep reading as the field values they stood for. Until then they are legacy surface, not
permanent surface.

**A `reframe` is the one kind whose `name` and `summary` are the folder's own.** Every other entry's
`name` and `summary` are its own title and summary. A reframe therefore renames; a reframe that
carries `parent` moves; one that carries both does both. A writer that moves without renaming leaves
`name` and `summary` off the reframe and says why in the body. Before 0.33.0, some move-reframes
carried a descriptive title (such as "Moved under …"); under this rule a Thread so moved reads that
title as its name until a later reframe carries the right one, which is the repair: one entry,
appended like any other.

### The current Map

A folder has many Maps over time: each entry may carry one, and that Map belongs to the entry it was
written with. The **current Map** is the newest of them: the Map of the newest entry that carries one,
whatever its kind. A reader derives it from the entries and never stores it.

- **Any kind counts.** `post`, `reframe`, `correction`, `mark`, the legacy `snapshot` and `closure`,
  and unknown kinds are read the same way.
- **An entry without a Map does not replace it.** An absent `map` field or an empty `map:` (YAML
  null) means no Map. A Map with no roots and no members is a Map: an entry can clear the folder's
  Map that way.
- **A malformed Map is skipped and named.** If an entry's Map block fails to parse as a whole, the
  reader passes to the next older entry and reports `invalid_map`. A Map that kept its valid members
  after the parser dropped bad ones still counts, and the dropped members are reported with it. A
  legacy Map-less snapshot is named `snapshot_requires_map` in the skipped list. An unreadable newer
  entry may have carried a Map, so it is reported as `unreadable`, never silently ignored.
- **The lookback cap is visible.** A reader may examine only the newest entries, by a cap or because
  it read only part of the folder. If it finds no Map before it stops, it falls back to the opening's
  Map and reports `stopped` with how many entries it examined. Without the opening, a partial read
  reports that the opening is unknown and never treats the earliest entry it happened to read as the
  opening.
- **No Map is a state, not an error.** An empty folder, a folder whose entries carry no readable Map,
  and a partial read without its opening each report no Map, with the reason (`empty`, `no_map`,
  `opening_unknown`).

The current Map is the folder's frame: what a session started on it is given, and what a view shows
as "what's here". It carries no access. An entry's Map captures a moment, so it follows the moment rule
in [`maps.md`](maps.md): a consumer that writes one pins every root and gives every position member a
depth.

### A view of the state

A folder's `README.md`, where it has one, is a **view** of the folder's current state (for a Thread:
its name and summary, where it sits, whether it is closed, and its current Map), rewritten by a writer
from the entries. A reader never needs the README to know the state; the entries are the source, and a
README that disagrees with them is stale, not authoritative. The README MAY carry a `map` block of its
own, the curator's lens; that Map is not the current Map. The folder's `_agent/agreement.md` is the one
hand-kept file.

## Selecting entries in time

Three selections read a folder as of a moment, since a moment, or by count. A **cursor** is one of:

- `{ "path": "<entry filename or position>" }` — an entry, by its filename (code-unit order);
- `{ "id": "<entry id>" }` — an entry, by its authored id, resolved among the supplied entries;
- `{ "at": "<ISO instant or YYYY-MM-DD>" }` — a moment in time.

By entry, the selection follows filename order. By moment, it follows each entry's **time**: the
authored `date` (an instant, or a day), else the `fileDate`, else none. An instant compares as an
instant. A day-only entry's time is the start of its day, and a day-only cursor is the end of its
day: so `as_of` a day includes everything written that day, `since` a day starts the next, and
`since` a moment on some day excludes a day-only entry of that day. An entry with no time cannot be
placed and is listed as `undated`, excluded from the selection, never guessed into it.

- **`as_of(cursor)`** — the entries at or before the cursor: by entry, that entry and every earlier
  filename; by moment, every entry whose time is not after it. The folder's state as of the cursor is
  the state rule applied to this selection alone: an entry after the cursor sets nothing, and a
  correction after it supersedes nothing.
- **`since(cursor)`** — the entries after the cursor: by entry, every later filename, the cursor's
  own entry excluded; by moment, every entry whose time is after it.
- **`newest(n)`** — the last `n` entries in filename order, `n` a positive integer.

A cursor that names an entry not among the supplied entries is `unresolved`; a cursor naming an id that
two entries carry is `ambiguous`; neither selects anything. A malformed `at` is `invalid`. Selections
never read the filesystem: the caller supplies the folder's entries, as it does for every operation
here.

## Entry look and paging

A reader MAY look up one immutable entry by id within a caller-selected folder that keeps time, or
within the selected root's `_threads/` only. It selects the file whose authored `id` matches the full
string; an eight-hex shorthand such as `msg_75cc2f37` matches a longer id only when the next character
is `-`, and an exact id takes precedence. One match opens that file through the normal entry reader;
no match is `unresolved` and more than one is `ambiguous`. Never scan a second root, pick the first
duplicate or repin an authored Map commit to HEAD. A caller may pass the id as `postId` beside the
folder.

A folder look at `children` or `full` reports all eligible direct handles as `total` but shows only the
selected page (default 50), with `nextCursor` equal to its last filename when more remain. `order:
older` is code-unit filename order and `newer` its reverse; pass the page's `nextCursor` as exclusive
`since` in that folder and order; a missing filename is an error, not a reset. A page never loads
bodies to display other pages. In a declared folder the page lists entries and Notes alike, in
filename order; an entry's handle carries its `post: { id, kind, author? }`, a Note's handle carries
none. See [`content-look.md`](content-look.md).

## Portable operations and conformance

Independent implementations share these operations. The TypeScript reference exports them from
`@ideaspaces/protocol/time` and, under their Thread names, from `@ideaspaces/protocol/threads`; no
name a consumer imports today is removed.

1. **`parse_entry`** (`parseEntry`; Thread name `parseThreadPost`): frontmatter and body; only
   unparseable frontmatter or an invalid declared `id` is unreadable; in a declared folder a file with
   no `id` is a Note (`status: note`). Unknown kinds kept; optional fields tolerated with warnings;
   `closed` read from the field or the legacy kind.
2. **`inspect_entries`** (`inspectEntries`; Thread name `inspectThreadPosts`): over caller-supplied
   direct files of one folder, in any order. Returns the readable entries in filename order, the Notes
   (declared folder), the unreadable files with their issues, every warning with its entry, the
   superseded ids, the state (`parent` with `source` and `parentPost`, `origin`, `about` with
   `aboutPost`, `closed` with `closedPost`, `name` with `namePost`, `summary` with `summaryPost`),
   and `writable` with the refusal when the opening is unreadable. Accepts an `as_of` cursor,
   applies it before computing anything, and reports how it resolved (`ok` with the cursor, or
   `unresolved`, `ambiguous`, `invalid` with a reason, selecting nothing).
3. **`reconstruct_timeline`** (`reconstructTimeline`; `reconstructThreadTimeline`): the DAG and the
   linear order, marks folded, superseded marks dropped, nothing mutated.
4. **`current_map`** (`currentMap`; `currentThreadMap`): the current Map with `status`, the chosen
   entry, the Map, its field warnings, `skipped` newest first, and `lookback`; pure.
5. **`select_entries`** (`selectEntries`): `as_of`, `since` and `newest` over parsed entries, with
   the resolved cursor, the selection, and the `undated` entries a moment could not place.
6. **`resolve_entry_by_id`** (`resolveEntryById`; `resolveThreadPostById`): one entry by full id or
   eight-hex shorthand among supplied entries.
7. **`keeps_time`** (`readsTime`): whether an Agreement's frontmatter turns time on, and
   `invalid_keeps_time` when the field is present and not a boolean.

Vectors are in [`../conformance/time/manifest.json`](../conformance/time/manifest.json): the
state rule, `closed` and its exception, the legacy kinds, the selections, a memory-shaped folder (add,
supersede, as of, since, Notes outside the timeline, the declaration), and the rule that every Thread
vector in [`../conformance/threads/`](../conformance/threads/manifest.json) passes through these
operations unchanged, and passes again on a folder that is not `_threads/`.

## What this page does not define

Placement under `_threads/`, the tree and the post-reference grammar, hosted `x_` ids, Map positions
and the separate worktree pin are the Threads kind's and stay in [`threads.md`](threads.md). A hosted
host's clock (`seq`) is the host's. Which folders a product turns time on for, and what a writer does
with the README view, are consumer decisions.
