# The four verbs: map, look, post, write

> Language-neutral contract for the four verbs an agent works an ideaspace with, the one namespace
> they are spelled in on every route, what each verb does on this machine and on a service, how old
> tool names fold under them, the shape of every answer (one sentence in the person's words first,
> then the Git facts as named fields), the refusal that names the next call, the request kinds of
> `post` and the three guards on the ones that reach other people, and where the verbs write history.
> **Provisional, v0.34.0.** The words themselves (the `said` sentences, the descriptions' first
> sentences and the forbidden words) are in [The words](#the-words) at the end, which AX owns.

This page fixes **how an act is asked for and how it is answered**. It is pure shape: no transport,
no sign-in, no API client, no service route. What a service does with a share or a publish is that
service's contract; what Git does with a write is [`local-effects.md`](local-effects.md). A host
that offers these verbs on any route conforms when its requests and answers reduce to the grammar
here and it passes [`../conformance/verbs/manifest.json`](../conformance/verbs/manifest.json).

## Why four

A person names four acts, and an agent uses the same four, so that the two understand each other
and the agent still works in Git (the human, 2026-11-17: "they understand both each other and agent
uses tools which work in git"). Each verb is one act a person would name:

| Verb | The act | On this machine | On a service |
|---|---|---|---|
| **`map`** | what is where | the Content tree of a folder, a curated Map's members, a Thread tree; adding to or taking from a Map or a Space | the account's reach (its Spaces, Repos, Threads, and what is shared with the person), a Space's members, a Repo's children |
| **`look`** | read one thing at a depth | one Note, folder, Thread, post or `_agent/` file at `name`, `summary`, `surface`, `children` or `full` ([`content-look.md`](content-look.md)), a Map address at its pin | one hosted Note, Thread or post at the same five rungs |
| **`post`** | add to something that keeps time, or ask for an act | one immutable entry in a Thread or a declared folder ([`time.md`](time.md)), written and added to history on its own; opening a Thread | an entry in a hosted Thread; share, take back, visibility, publish |
| **`write`** | change what is on this machine, and add it to history when asked | create or edit any file the conversation may write; add named paths to history | refused: `local_only`, and the answer names `post` |

The verb is chosen by the act, and the **address decides local or remote**. One `look` reads a
local Note and a hosted Thread; one `post` adds a local entry and asks a service to share. Nothing
else distinguishes the two sides, and an agent keeps one distinction: what leaves this machine.

Session levers (launching another agent, sending to it, listeners, moving a conversation) act on
sessions, not content. They keep their own names under the same namespace and are outside this page.

## The namespace

Every route spells the four verbs as the CLI's own commands, under one name, `ideaspaces`:

| Route | Spelling | Example |
|---|---|---|
| CLI | `ideaspaces <verb>` | `ideaspaces look notes/a.md` |
| An MCP server | server `ideaspaces`, tool `<verb>` | `mcp__ideaspaces__look` as Claude Code names it |
| A flat tool list (Pi, the Claude Code plugin's own tools) | `ideaspaces_<verb>` | `ideaspaces_look` |

A route MUST NOT prefix inside the namespace (`mcp__ideaspaces__ideaspaces_look` is wrong), and MUST
NOT offer a second tool named `write` beside the verb: a route that serves file tools serves them
through this `write` or under another server name. The constant for each verb lives in one place per
host, and every guard keyed on a tool's name is keyed on that constant, so an alias meets the same
guard as the verb.

### Old names

Old names are **aliases** of the verb they fold under, in the CLI and in the Claude Code plugin,
until 1.0. An alias takes the same request and gives the same answer as its verb; a **retired** name
answers one refusal, `reason_code: retired_name`, whose `next` is the verb call. The host's catalog
says which name is which (the CLI's `aliases` and `status: retired` already do). A host that cannot
list an alias without offering a second choice for one act lists the verbs alone; which hosts list
aliases is the host's release note, not this page.

| Verb | Folds under it |
|---|---|
| `map` | `map_read`, `map_create`, `map_add`, `map_remove`, `space_list`, `space_add`, `space_remove`, `hosted_thread_add`, `hosted_threads_list`, `navigate` for a folder; the CLI's `map` and `spaces` |
| `look` | `look`, `navigate` for a position, `skill`, `read`, `path_revision`, `hosted_thread_read`, `agent_status`, `agent_result`, `listener_status`; the CLI's `look`, `threads open`, `status` |
| `post` | `threads_post`, `hosted_thread_draft`, `thread_attach` (a `reframe`), `thread_gather` (opens a Thread), `is_share` and `is_threads` of the plugin, share, take back (`revoke`), visibility, publish; the CLI's `threads post`, `threads new`, `threads close`, `threads attach`, `share`, `publish` |
| `write` | the file `write` and `edit`, `note_write`, `commit`; the CLI's `write` and `commit` |

## Requests

A request is one JSON object. `verb` names the verb (or an alias or retired name the host's catalog
maps), and the other fields are the verb's. An address is one of three forms, told apart by shape:

- a **local path**, absolute or relative to the conversation's folder;
- a **Map address**, `@<root>//<position>` or `//<position>` ([`maps.md`](maps.md)), read at its
  pin when the Map carries one;
- a **service address**: `repo:n_…`, `thread:x_…`, `person:…`, a bare `x_…` id, an `https://` link,
  or the literal `ideaspaces`, the person's own account. Which addresses a conversation may name is
  the host's **reach** (its Thread, its launch Map's members, ids the person gave); an address
  outside it is refused `out_of_reach`, and this page does not widen reach.

### `map`

```json
{ "verb": "map", "start": "notes/", "depth": "summary" }
```

| Field | Shape | Meaning |
|---|---|---|
| `start` | address | where to map from; `ideaspaces` maps the account's reach |
| `request` | `read` (default), `create`, `add`, `remove` | read is what is there; the others change a curated Map or a Space's Map |
| `depth` | one of the five rungs | a ceiling for the handles returned; default `summary` |
| `kind` | string | optional filter on what `ideaspaces` lists (`repos`, `threads`, `spaces`) |
| `query` | string | optional filter on names and summaries |
| `name`, `summary` | string | `create` only: the new Map's own |
| `member` | address, or a position member as [`maps.md`](maps.md) defines it | `add` only: anything; a Space's Map takes a file as it takes a folder (the human, 2026-11-17: adding references an item where it lives) |
| `member_index` | non-negative integer | `remove` only |
| `if_match` | string | `add`/`remove`: the Map file's revision the caller last read |

### `look`

```json
{ "verb": "look", "target": "@home//_threads/2026-11-17-v23/README.md", "depth": "children" }
```

The fields are [`content-look.md`](content-look.md)'s: `target` (an address), `depth`, `agreement`,
`limit`, `order`, `since`, `post`. A service address reads the same five rungs through the host's
remote path. `look` never writes.

### `post`

```json
{ "verb": "post", "target": "_threads/2026-11-17-v23", "body": "…", "reply_to": "msg_…" }
```

`request` names the kind of act and defaults to `entry`. The fields are the kind's; a field that is
not the kind's is refused `unexpected_field`, a missing one `missing_field`, an unknown kind
`unknown_request`. "Readers keep unknown kinds" is a rule for stored entries, never for requests.

| `request` | Required | Optional | What it does |
|---|---|---|---|
| `entry` | `target`, `body` | `reply_to` (one id or a list), `kind` (`post`, `reframe`, `correction`, `mark`), `mark`, `supersedes`, `name`, `summary`, `map`, `tags`, `parent`, `about`, `closed`, `author` | one immutable entry under [`time.md`](time.md). Local: written, then added to history on its own, that one file, never pushed. Hosted (`thread:x_…`): sent, not retried |
| `start_thread` | `name` | `target` (a folder, or `ideaspaces`), `summary`, `body`, `with` (one person), `parent`, `about`, `map` | opens a Thread: locally its folder, Agreement, README and opening post; on a service, a hosted Thread |
| `share` | `target`, `with` | `grade` | asks the service to let one person (`with`, a handle or email) read `target`. `grade` is a grantable level the service names ([`access.md`](access.md)); left out, the service grants its **lowest** level; given, it is a word the person said (guard 1). History is never shared by this call |
| `revoke` | `target`, `from` | — | **take back**: ends what `from` was given on `target`. By the person only (guard 3); the person's own take back is checked against nothing else, so it always works |
| `visibility` | `target`, `public` (boolean) | — | makes `target` public or private |
| `publish` | `target` (a local folder) | — | puts a local Repo on the service, **private**, with its history; it cannot be taken back. A service address as `target` is refused `invalid_field`: there is nothing to push |

### `write`

```json
{ "verb": "write", "target": "notes/a.md", "body": "# A\n", "frontmatter": { "set": { "name": "A" } } }
```

| Field | Shape | Meaning |
|---|---|---|
| `target` | local path | the file; optional when only `history` is given |
| `body` | string | the whole new body; `.md` keeps its frontmatter by [`local-effects.md`](local-effects.md)'s preserve rule |
| `edits` | `[{ "find": "…", "replace": "…" }]` | in-place edits; each `find` matches exactly once. Exclusive with `body` |
| `frontmatter` | `{ mode?, set?, remove? }` | the `write_markdown` patch; `.md` only |
| `history` | `[path, …]` | add exactly these paths to history, as `commit_paths` does: exactly that set, nothing else staged enters |
| `message` | string | the history entry's message; with `history` only; the host supplies one when absent |
| `as_read` | a path revision | the revision the caller last read; a host with a conversation supplies it from the last `look` or `write`, so an agent passes nothing |

One `write` takes over the file write, the edit, the Note write and the commit, and these rules hold
on every route:

1. **It writes any file the conversation may write**, Markdown or not, under the same root, path,
   symlink and ignore boundary as `write_markdown`. Frontmatter rules apply to `.md` only.
2. **It refuses to change an entry.** A target that is an entry in a folder that keeps time (a file
   with an `id`, [`time.md`](time.md)) is refused `keeps_time`, and `next` is the `post` that
   corrects it: `{ "verb": "post", "target": <the folder>, "request": "entry", "kind": "correction",
   "supersedes": <the id> }`. Notes in a declared folder (no `id`) are written as any Note.
3. **It adds to history only when asked.** A write without `history` leaves the file saved and
   `history: false`; the agent, or the person, says when a set of files is one entry in history. It
   never commits each file on its own (a builder's history would fill with one-file entries), and a
   host never adds a hidden switch that does. `post` is the exception by design: an entry is one
   immutable file, complete when written, so it goes into history on its own.
4. **It checks the revision, not the agent.** When the file changed after the caller last looked,
   the write is refused `changed_since_read`, and `next` is the `look` at that target. The verb has
   no force form.
5. **It is local.** A service address is refused `local_only`, and `next` is `post`.

## Answers

Every verb answers with one object of two parts, in this order:

```json
{
  "said": "One sentence in the person's words.",
  "facts": {
    "outcome": "ok",
    "path": "notes/a.md",
    "saved": true,
    "history": true,
    "shared": false,
    "change": "b52662fa5f62e2b8a0c3f7d4e1a9b0c2d3e4f5a6"
  }
}
```

**`said`** is one sentence a person would say about what happened: saved, in history, posted,
shared, not shared yet, taken back, as of, changed since you read it, a correction. It never contains
a Git word, a Git command or a hash; the words are AX's, in the table below, and the forbidden list
is theirs too. A renderer shows `said` first, on its own line, then the facts one per line in the
order of the table below. A JSON consumer reads the fields.

**`facts`** are the Git facts, and nothing else, under these names and no others. An answer with a
field not named here fails the check (`unknown_fact`). The set is closed on purpose: it is what keeps
a sign-in, a private path and a diagnostic out of what the model reads. A new field is a change to
this page.

| Field | Shape | When | Meaning |
|---|---|---|---|
| `outcome` | `ok`, `partial`, `refused` | always | `partial` as [`local-effects.md`](local-effects.md) defines it: a durable effect happened, then something failed |
| `path` | portable position or address | when one thing was written or read | where |
| `saved` | boolean | `write` | the file is on disk as asked |
| `history` | boolean | `write`, `post` | the change is in history |
| `shared` | `true`, `false`, `not_checked` | any write | anyone else can read it now. `not_checked` when the host did not ask |
| `change` | the full object id, 40 or more hex | `history: true` | the history entry; never shortened |
| `post` | entry id | `post` with `entry`, `look` at an entry | the entry's own id, in full |
| `item` | address | the service acts, a hosted `entry` | the item acted on or created |
| `with`, `from` | handle | `share`, `start_thread`; `revoke` | who, as the service confirmed it, never as the model said it |
| `level` | string | `share` | the grade the service granted |
| `public` | boolean | `visibility` | as the service confirmed it |
| `pin`, `now` | full commit ids | `look`, `map` at a Map address | the Map's moment and the current one |
| `until` | ISO instant | `limit_reached` | when the refused act is allowed again |
| `look` | a Content-look target | `look` | the representation, as [`content-look.md`](content-look.md) defines it |
| `map` | a Map block or handles | `map` | the view, as [`maps.md`](maps.md) and [`map-projection.md`](map-projection.md) define it |
| `page` | `{ total, shown, order, nextCursor? }` | paged `look`, `map` | the page |
| `warnings` | `[{ field, warning }]` | any | field-tolerant diagnostics, as the reader names them |
| `reason_code` | `snake_case` | `refused`, `partial` | why, from this page or [`local-effects.md`](local-effects.md) |
| `next` | a call or `null` | `refused` | the call that would work; `null` only when no call of the agent's would |

### A refusal

A refusal is an answer with `outcome: refused`, a `reason_code`, and `next`: the request, with
`verb` and the fields the agent need not choose, that would work. `next.verb` is one of the four.
**`next` never contains a Git command**, and a `said` that tells the model to run `git` fails the
check; today's `invalid_identity: … git config user.name …` is the case this rule retires. When no
call of the agent's would work (the person has not signed in, a Space has no name to save under, an
act is the person's alone), `next` is `null` and `said` tells the agent to tell the person.

| `reason_code` | Verb | Meaning | `next` |
|---|---|---|---|
| `unknown_verb` | any | the name is no verb, alias or retired name the host knows | `null` |
| `retired_name` | any | an old name that is no longer an alias | the verb call |
| `missing_field`, `unexpected_field`, `invalid_field` | any | the request is not the verb's or kind's | the corrected call's verb |
| `unknown_request` | `post`, `map` | a `request` this page does not name | `null` |
| `out_of_reach` | any remote | the address is not in the conversation's reach | `null` |
| `local_only` | `write` | a service address | `post` |
| `keeps_time` | `write` | the target is an entry | the correcting `post` |
| `changed_since_read` | `write` | the file moved after the last look | `look` at the target |
| `no_identity` | `write`, `post` | the Space has no name to save under | `null` |
| `not_from_person` | `share`, `visibility`, `publish`, `start_thread` | the act (`field: "request"`), or who or what (`target`, `with`, `from`, `grade`), did not come from the person's own words | `null` |
| `person_only` | `revoke` | only the person takes back | `null` |
| `limit_reached` | the acts that widen who can read | the day's count is used; `until` says when | `null` |
| `redirected` | `publish` | the Space's own settings would send the push somewhere else (guard 2) | `null` |
| any code of [`local-effects.md`](local-effects.md) | `write`, `post` | the effect's own refusal | as above |

## The acts that reach other people, and their three guards

`share`, `revoke`, `visibility`, `publish` and `start_thread` with `with` reach beyond this machine
under the person's own authority, with nothing asking first. Three guards are **requirements** on
every host that offers them, each with a negative vector in the manifest. "These acts" means
`start_thread` only when it carries `with`: a Thread opened with nobody in it, on this computer or
on the service, reaches nobody, and guard 1 does not apply to it (reach still does to a service
`target`, with the literal `ideaspaces` allowed).

1. **Who and what come from the person's own words.** `with`, `from`, `grade`, and the `target` of
   these acts MUST be names the person wrote in this conversation, never text the agent read in a
   Note, a Thread or a page. A host checks a request against what the person said and refuses
   `not_from_person`, naming the field; a pure check with nothing the person said known refuses too.
   The pure form takes `context.person_named`, the host's record of those words.

   **The act itself also comes from the person** (Security's proposal of 2026-11-17; Agreed by the
   human, 2026-11-17 18:20, msg_be285071: "Agreed on act rule"). `context.person_asked` lists what
   the person asked for in this conversation:
   `start_thread`, `share`, `publish`, `public`, `private`. A reaching request whose act is not
   listed is refused `not_from_person`, `field: "request"`, before who and what are looked at;
   `visibility` counts as `public` or `private` by its value. If nothing is known, the request is
   refused. Why it goes past the guard the human accepted ("who and what"): with the nouns alone, a
   person who said "share garden with @b" has named garden, and a Note can then lead the agent to
   **publish** garden or make it **public**, the two acts with no way back. The reference
   implementation and the vectors carry this rule.
2. **The sign-in never reaches the model.** A credential is not an input to any verb request, is not
   a fact (the set is closed and has no slot for one), and is never in `said`, `next`, a warning or an
   echoed request. It may live in the host and in the one child process that needs it. A host runs
   `check_answer` with its live credentials as `context.secrets` on every answer before the model
   reads it: any string anywhere in the answer, a key or a value (`said`, every fact including
   `warnings`, `next`, `look`, `map`, and the names of fields inside them), that contains one is the
   problem `credential_in_answer`, which names the field and never the value. When the field name
   itself would carry one, the problem names the slot that holds it (`facts` or `answer`), and any
   other problem that would echo such a name is replaced the same way, so no report carries a
   credential.

   **The one child that holds the credential for `publish`** is a single push of the item's own line
   of history to the exact `https://` address the service returned when it created the item. The
   credential is passed in the child's environment as a header scoped to that address
   (`http.<address>.extraHeader` via `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`), never in argv, a file
   or the Space's config. Before the child starts, the host refuses a Space whose own config rewrites
   or redirects addresses (`url.*.insteadOf`, `url.*.pushInsteadOf`, `remote.*.pushurl`):
   `reason_code: redirected`, `next: null`. The child runs with hooks off (`core.hooksPath` pointing
   at an empty folder), `core.fsmonitor=false`, an empty `credential.helper`,
   `http.followRedirects=false`, `GIT_TERMINAL_PROMPT=0`, and no `GIT_TRACE*` or `GIT_CURL_VERBOSE`
   in its environment. A pure vector cannot check Git config, so this is proved by the host's own
   tests, which every host that offers `publish` carries: `publish_refuses_space_with_insteadof`
   (and `pushInsteadOf`, `pushurl`), `publish_push_runs_no_hooks` (a `pre-push` hook that writes its
   environment to a file must not run), and `publish_push_token_only_in_that_git_child_env`.
3. **Only the person takes back.** `revoke` from an agent (`context.caller` other than `person`) is
   refused `person_only` **before any field of the request is looked at**, so a malformed take back
   from an agent gets no help; a host MUST NOT make its take-back reachable from a tool or a listener
   under any name. The person's own take back (`caller: person`, which no request can set) is checked
   against nothing else, neither the person's words nor reach, because the click is the person's act
   on their own item: it always works, and it is free of any count.

Two further facts about these acts belong to the answer: `publish` creates the item **private**,
and its `said` says it went with its history, because it cannot be taken back; `share` never hands
out history. Counting, limits and what the service does are the service's contract; this page fixes
only that the 201st act in a day answers `limit_reached` with `until`, and that take back is never
counted.

## Where the verbs write history

Where `post` and `write` add to history they follow [`../SPEC.md#identity`](../SPEC.md#identity) and
[`trailers.md`](trailers.md), restated here because this is where a host meets it:

- **Author = the person**, on every commit, including one an agent drove.
- **The agent = `Co-authored-by: <its Agreement name> <agent:<id>@ideaspaces>`**, on every commit
  an agent made or assisted.
- **`Conversation: <id>`** names the session.
- **No signatures.** A trailer is attribution: a claim anyone can write, which records who took part
  and proves nothing. A service MUST NOT grant or refuse anything because of a trailer; it decides by
  the sign-in it holds.

`facts.change` is that commit's full id. A host that cannot author as the person (no identity in the
Space yet) refuses `no_identity` with `next: null`; it does not guess a name, and it never tells the
model to configure one.

## Conformance

A tool that claims **verbs conformance** passes every required coverage vector in
[`../conformance/verbs/manifest.json`](../conformance/verbs/manifest.json). The manifest has
`format: "ideaspaces-verbs/v1"`, the fixed lists (`verbs`, `routes`, `post_requests`,
`map_requests`, `fact_fields`, `reason_codes`), `required_coverage`, and `vectors` of two pure
operations:

- `validate_request(request, context)` returns `{ status: "valid", verb, request }` (`request` with
  the verb resolved from an alias) or `{ status: "refused", reason_code, field?, next }`. `context`
  carries what the host knows: `aliases` and `retired` (name → verb), `caller` (`person` or `agent`;
  absent reads as `agent`), `person_named`, `person_asked` (guard 1), `reach` (service
  addresses the conversation may name; **absent reads as none**, so a missing reach never widens it;
  the literal `ideaspaces` is allowed as `map.start` and `start_thread.target` without it), and
  `entries` (`{ path, id, folder }` for the files that are entries).
- `check_answer(answer, context)` returns `{ status: "valid" }` or `{ status: "invalid", problems:
  [{ code, field? }] }`. `context.forbidden_words` is the list a `said` sentence must not contain,
  the manifest's `said_forbidden_words` (AX's, [below](#words-said-never-contains));
  the check also refuses a hash (seven or more hex characters in a row with both a digit and a
  letter, so neither a plain number nor a word spelled in hex letters) and a `next` that is not a
  verb call. `context.secrets` is the list of strings the host holds that must never reach the model: its
  live credentials, a canary in tests; any answer containing one is `credential_in_answer`.

Both are pure: no filesystem, no Git, no network. A runner MUST reject an unknown manifest format,
operation or required coverage tag rather than skip it. The reference implementation is
`src/verbs.ts`, exported from the package root as `validateVerbRequest`, `checkVerbAnswer`,
`renderVerbAnswer`, `spellVerb`, `isServiceAddress` and the constants, `SAID_FORBIDDEN_WORDS` among them.

## The words

> **AX's, 2026-11-17.** The `said` sentence for each result and refusal, the first sentence of each
> verb's tool description, and the words `said` never contains. A person and an agent read the same
> sentence and understand each other, while Git stays inside the tools (the human, 2026-11-17, 4.2);
> the person's word for where things live is **Space** (4.7). These are versioned strings an agent
> copies into what it tells the person: changing one changes behaviour, so a change here is a
> change to this page.

### How a `said` sentence is written

- **One sentence, the act first, in the past tense:** "Saved…", "Posted…", "Shared…". A refusal
  opens with what did not happen: "Not saved…", "Not shared…".
- **It says what is not done yet** when the person would want to know: "not in history yet", "not
  shared yet". Those two are the person's whole picture of history: on this computer, in history,
  shared.
- **A refusal says the next act in the same words as `next`**, so an agent that reads only `said`
  still makes the right call. When `next` is `null`, it says **tell the person** or **ask the
  person**, and never what to run.
- **`{name}`** is the item's own name as the person sees it (a Note's name, a Space's name),
  never a path the person did not choose. **`{thread}`** is a Thread's name, **`{who}`** a handle as
  the service confirmed it, **`{level}`** the grade the service granted in its own word, **`{until}`**
  and **`{as_of}`** a time in the person's own zone ("Tue 17 Nov 15:57"), never an ISO instant.
  `facts` carries the exact values.
- **"This computer"** is the neutral word; a host that knows the machine may say "this Mac".
- **`{value}`** in a `not_from_person` sentence is injected text of any length: a renderer shows it
  quoted and cut to 60 characters (Security's review, 2026-11-17).
- The verbs are words both sides share, so `said` may name them: "look at it again", "post a
  correction".

### The sentences

| Verb | Case | `outcome` | `reason_code` | `said` |
|---|---|---|---|---|
| `write` | saved, not in history | `ok` | — | Saved {name} on this computer, not in history yet. |
| `write` | saved and in history | `ok` | — | Saved {name} and added it to history, not shared yet. *With `history` only:* Added {n} files to history, not shared yet. |
| `write` | in history, pushed or shared | `ok` | — | Saved {name} and added it to history, and everyone who can read this Space has it now. |
| `write` | partial: written, not staged or not committed | `partial` | a local-effects code | Saved {name}, but adding it to history failed; the file is safe as written, so add it to history again. |
| `write` | the target is an entry | `refused` | `keeps_time` | Not saved: {name} is a post, and posts aren't changed, so post a correction to it instead. |
| `write` | changed since read | `refused` | `changed_since_read` | Not saved: {name} changed after you last read it, so look at it again, then write. |
| `write` | no identity | `refused` | `no_identity` | Not added to history: this Space doesn't have the person's name to save it under yet, so tell the person. |
| `write` | a service address | `refused` | `local_only` | Not saved: write changes only this computer, and {name} is on IdeaSpaces, so post to it instead. |
| `post` | local entry, in history | `ok` | — | Posted to {thread} and added to history, not shared yet. |
| `post` | local entry, not in history | `ok` | `no_identity` as a warning | Posted to {thread} on this computer, not in history yet: this Space doesn't have the person's name to save it under, so tell the person. |
| `post` | hosted entry | `ok` | — | Posted to {thread} on IdeaSpaces, and everyone in the Thread can read it now. |
| `post` | Thread opened | `ok` | — | Opened the Thread {thread} on this computer, not shared yet. *On IdeaSpaces:* Opened the Thread {thread} on IdeaSpaces with {who}. |
| `post` | shared | `ok` | — | Shared {name} with {who} as {level}, and only the person can take it back. |
| `post` | taken back | `ok` | — | Took back {name} from {who}, who can't read it any more. |
| `post` | visibility changed | `ok` | — | {name} is public now, and anyone can read it. *Private:* {name} is private now, and only the people it's shared with can read it. |
| `post` | published (private, with its history) | `ok` | — | Published {name} to IdeaSpaces, private and with its history, which can't be taken back. |
| `post` | not published: the Space's own settings redirect the push | `refused` | `redirected` | Not published: this Space is set to send its history somewhere other than IdeaSpaces, so tell the person. |
| `post` | who or what not from the person | `refused` | `not_from_person` | Not done: the person hasn't named {value} in this conversation, and only the person says who and what, so ask them. |
| `post` | an agent asked to take back | `refused` | `person_only` | Not taken back: only the person can take back {name}, so tell them. |
| `post` | the day's count is used | `refused` | `limit_reached` | Not shared: today's limit is reached until {until}, and taking back still works. |
| `post` | unknown request | `refused` | `unknown_request` | Not done: post adds an entry, opens a Thread, shares, takes back, makes public or private, or publishes, and {request} is none of those. |
| `look`, `map` | at a Map's moment, with changes since | `ok` | — | As of {as_of}, this Map's moment, with {n} changes since. *None since:* As of {as_of}, this Map's moment, and nothing has changed since. |
| `look`, `map` | out of reach | `refused` | `out_of_reach` | Not open to this conversation: {name} isn't something you were given, so ask the person for it. |
| any | a retired name | `refused` | `retired_name` | {old} is retired, so use {verb}, which does the same. |
| any | the request is not the verb's | `refused` | `missing_field`, `unexpected_field`, `invalid_field` | *Missing:* Not done: {verb} needs {field}. *Unexpected:* Not done: {verb} doesn't take {field}. *Invalid:* Not done: {field} isn't a value {verb} takes. |
| any | not a verb | `refused` | `unknown_verb` | Not done: {old} isn't a tool here; the four are map, look, post and write. |

The `unknown_verb` row was added to Integrator's 24: it is a refusal with `next: null`, so its
sentence is the only guide the agent gets. The `redirected` row came with Security's review (round
2); AX's sentence says what would leave (the Space's history, which `publish` sends) and that it
would go somewhere other than IdeaSpaces.

### The four descriptions' first sentences

Each description opens with the act in the person's words. At most one "Under the hood:" line
follows, which may name Git, because the agent works in Git and needs to know what happens; it says
what the tool does so the agent need not do it, never what to tell the person. The word check runs
on the first sentence, not the "Under the hood:" line.

| Verb | First sentence | Under the hood |
|---|---|---|
| `map` | See what is where: a folder, a Map, a Thread, or everything the person can reach on IdeaSpaces, and add to or take from a Map. | Reads the files on disk, and a Map pinned to a moment from that commit; adding and taking from a Map edit its file and do not commit. |
| `look` | Read one thing at the depth you ask for: a Note, a folder, a Thread, a post or a Map address, on this computer or on IdeaSpaces. | Reads files on disk or the service; a Map address reads at its pinned commit; it never writes. |
| `post` | Add to something that keeps time, a post in a Thread or a new Thread, or ask IdeaSpaces to share, take back, make public or private, or publish. | A local post is one new file committed on its own and never pushed; the other acts are calls to the service under the person's sign-in, which you never see. |
| `write` | Change any file on this computer, and add a set of files to history when you say so. | `history: [paths]` stages exactly those paths and commits them, the person as author and you as co-author; it never pushes. |

### Words `said` never contains

`said` and each description's first sentence never contain these words. They match whole words,
case-insensitively, so each form a sentence could use is listed. The list is
`SAID_FORBIDDEN_WORDS`, exported from the package root, and every `check_answer` vector uses it.

- **Git, and its acts:** git, commit, commits, committed, committing, uncommitted, push, pushes,
  pushed, pushing, unpushed, pull, pulls, pulled, pulling, fetch, fetched, merge, merged, merging,
  rebase, rebased, branch, branches, checkout, clone, cloned, stash, diff.
- **Its places:** staged, staging, unstaged, untracked, worktree, HEAD, repository, repositories,
  repo, repos, remote, remotes, upstream.
- **Its ids:** sha, hash. A run of seven or more hex characters with both a digit and a letter is
  refused by the check on its own.
- **Not the person's word for where things live:** Vault, Vaults. The word is Space (4.7).

"HEAD" matched case-insensitively also keeps out the plain word "head"; no sentence here needs it.
"Repo" is in the list because the person's word is Space: a published Space is still a Space in
what the person reads, whatever the service calls it.
