---
name: migrate-to-agreement
description: >
  Safely migrate an existing ideaspace from the legacy five-file `_agent/foundation.md` contract
  to a new Agreement-shaped copy. Use when someone says "migrate this space", "upgrade to agreement",
  "make an agreement copy", or wants to move away from `foundation.md` safely. Reads the source
  space, forms a new clean space beside it with `_agent/agreement.md`, copies knowledge notes and
  skills, and lets the user test before archiving the old one.
---

# Migrate to Agreement

> Never mutate the live contract in place when a clean copy lets you test first.

The legacy `foundation.md` contract split orientation across five files. In Agreement mode, standing
terms, character, boundaries, and working rules live in `_agent/agreement.md`.

This skill forms a clean, independent Agreement-shaped copy of an existing space so you can test it
side-by-side before retiring the old one.

## 1. Inspect the Source Space

Read what is currently in the source repository:
- `_agent/foundation.md` — what this place is, character, boundaries.
- `_agent/guide.md` — how work goes here, vocabulary, rules.
- `_agent/purpose.md`, `_agent/now.md`, and `_agent/next.md` — direction, active focus, and queued work.
- `_agent/skills/`, `_agent/perspectives/`, or other custom agent context (if present).
- Existing knowledge notes and content directories.

Determine the **kind**:
- **Agent:** defines an agent point of view → `agreement: agent:repo:n_0935a5df1f883eeb60bcdfbb`
- **Knowledge:** holds notes, research, decisions → `agreement: knowledge:repo:n_f1511280efecd7fcff155152`
- **Convention:** defines a new kind → `agreement: convention:repo:n_3226f849f85239cb3b996ae0`

## 2. Draft the New Agreement

Synthesize `foundation.md` and `guide.md` into `_agent/agreement.md`:

```markdown
---
name: Agreement — <Name>
summary: <Dense two-line summary of what this place is or who this agent is>
agreement: <kind>:repo:<kind_repo_id>
context:
  full:
    - purpose.md    # if purpose.md has standing purpose to load in full
---

# Agreement — <Name>

<If an agent: point-of-view opener — "This folder is <Name>'s point of view, not a subject to study. An agent launched here is <Name> for the session.">

## What this place is
<Synthesized from foundation.md and README: domain, scope, purpose.>

## Character / How work goes here
<How agent and human collaborate here, character traits, verification habits from guide.md and foundation.md.>

## Boundaries / Alone, and brought back
<Clear autonomy line: what the agent does alone vs what requires explicit human confirmation.>

## Words with local meaning
<Specific terms and vocabulary with fixed local meanings.>

## Still open
<Questions or terms that are still emerging or unsettled.>

## When to revisit
<Conditions or signals that trigger revisiting this Agreement.>
```

## 3. Propose the Destination & Plan

Propose creating the new copy (defaulting to `<name>2` or `<name>-agreement` as a sibling directory).
Show the drafted `_agent/agreement.md` and the list of files to copy:
- `_agent/agreement.md` (new unified contract)
- `_agent/purpose.md` (if used in `context.full`), `_agent/now.md`, and `_agent/next.md`
- `_agent/skills/`, `_agent/perspectives/`, or other custom directories
- All knowledge folders and notes (excluding legacy `foundation.md` and `guide.md`)
- Root `README.md`, `.gitignore`, `.gitattributes`

**Wait for the user's confirmation.**

## 4. Materialize the New Copy

On confirmation:
1. Initialize the target directory (`git init -b main`).
2. Write the new `_agent/agreement.md`.
3. Copy over `_agent/now.md`, `_agent/next.md`, `_agent/purpose.md` (if needed), `_agent/skills/`, and any custom directories.
4. Copy over knowledge directories and notes.
5. Leave `root_node_id` unstamped initially so local testing does not conflict with any existing remote.
6. Commit the initial clean state:
   ```bash
   git add .
   git commit -m "Initial Agreement space formed from <source-name>"
   ```

## 5. Verify & Test

Guide the user to test the new space:
1. Open a session in the new space.
2. Confirm the agent launches with the correct character, boundaries, and awareness orientation.
3. Once satisfied, the user can publish/repoint remotes and safely remove or archive the old Foundation folder.

## Refuse to proceed when

- The source space already has `_agent/agreement.md` (use its `When to revisit` section or revisit procedure instead).
- The destination folder already exists and is non-empty.
- The user has not reviewed and confirmed the draft and destination.
