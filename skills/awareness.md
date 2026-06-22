---
name: awareness
description: >
  Check alignment between declared understanding and actual state at any position.
  Use after substantive work — multiple writes, restructuring, perspective application —
  or when asked "is this still accurate?", "has this drifted?", "does the README match?".
  The protocol: read declarations, read reality, compare, propose updates or stay silent.
---
<!-- Ported from sw_space/resources/skills/awareness.md @ 3b62262; neutralized for surface-neutral SDK distribution. Substance tracks the source — re-sync against that baseline. -->

# Awareness — Delta Protocol

After substantive changes at a position, check whether the shared understanding still holds — does the declared understanding match reality? Drift is the default. Recalibration is the work.

## When to Run

- After writing multiple Notes in a branch
- After restructuring (moving files, creating new branches)
- After applying perspectives that produce new content
- At session start, if the branch has been active recently
- When something feels off — the content doesn't match the branch description

## The Protocol

### 1. Read Declarations

At the current position, read what's declared:

- `_agent/purpose.md` — why this place exists
- `_agent/now.md` — what we're focused on
- `_agent/guide.md` — how to work here
- `README.md` — what this branch is about

Read each one. Some may not exist — that's information too (a branch without purpose is directionless).

### 2. Read Reality

What actually exists here:

- recent changes — what changed recently in this subtree
- the tree at this position — what children exist, how many files, what they're about
- the actual content of this directory — what the material here is really about

**Before asserting that something "shipped" / "is implemented" / "is pending" from a doc, check the code — and the code may live in a *different repo*.** A space often spans several repos in the active context: a doc describing access control may sit in a docs repo while the implementation lives in a code repo. Locate the code wherever it is (grep/search across the repos in context), read its git history, and compare timestamps to the doc. Don't trust a doc's status line on its own — verify against the actual code, even when that means looking outside this repo. (The session-start drift block flags *same-repo* staleness automatically; cross-repo staleness is yours to check by reasoning, since you have git and know the repos in play.)

### 3. Compare

For each declaration, ask: does this still match?

| Declaration | Delta question |
|---|---|
| README.md says "this branch is about X" | Are the children actually about X? |
| purpose.md says "we're here because Y" | Does recent work serve Y? |
| now.md says "focused on Z" | Is Z done? Changed? Superseded? |
| guide.md says "work this way" | Is the guidance still relevant? |

### 4. Output

**If aligned:** Say nothing. Don't generate a report for the sake of reporting.

**If drifted:** Propose a specific change. Not an essay — a concrete edit:

- "now.md says 'evaluate 20 companies' but 18 are done. Propose update: 'Finalize remaining 2 evaluations, then synthesize patterns across the batch.'"
- "README says 'early stage startups' but 4 of 8 Notes are Series B. Either update README or consider splitting the branch."
- "No purpose.md at this branch. Based on content, this is about regulatory risk in health-tech. Want me to create one?"

Keep it terse. The user decides whether to accept the proposal.

## What This Is Not

- **Not memory.** The skill doesn't save facts or accumulate knowledge. It proposes changes to the Space's scaffolding.
- **Not a report.** Don't generate awareness reports. Either there's drift to surface or there isn't.
- **Not mandatory.** The agent uses judgment about when to run this. After a single quick edit, skip it. After a deep restructuring session, run it.
