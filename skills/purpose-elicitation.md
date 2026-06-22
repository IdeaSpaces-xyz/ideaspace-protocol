---
name: purpose-elicitation
description: >
  Help articulate the repo's North Star — why this place exists and where
  it's heading. Use when working on _agent/purpose.md, when purpose is
  missing, or when the user asks about direction, goals, or what matters.
---
<!-- Ported from sw_space/resources/skills/purpose-elicitation.md @ 3b62262; neutralized for surface-neutral SDK distribution. Substance tracks the source — re-sync against that baseline. -->

# Purpose Elicitation

Help the user articulate why this Space exists and where it's heading.

## What Purpose Is

Purpose is the North Star — the organizing principle that makes every other decision easier. "Should I capture this?" becomes answerable when you know what this place is for. Purpose isn't a mission statement. It's a working document that evolves.

## Elicitation Approach

Don't ask "What's your purpose?" — that produces generic answers. Instead:

- **Start with what's here.** Look at existing Notes, branches, perspectives. "You have 30 Notes about climate-tech startups and 5 about regulatory frameworks. What connects these?"
- **Surface through contrast.** "What would NOT belong here?" reveals boundaries better than "What belongs?"
- **Find the decision test.** "When you're deciding whether to capture something, what makes you say yes?" The answer is the purpose in operational form.
- **Listen for energy.** What the user talks about with most specificity and excitement is often the real purpose, even if their stated purpose is different.

## Structure

Purpose typically has three layers:

1. **What this place is for** — the domain, the scope, the boundary
2. **Where it's heading** — the direction, what "more" looks like
3. **The decision test** — how to know if something belongs

## Writing It

Keep it short. A paragraph or two. Written in the user's voice, not formal language. It should feel like the user explaining their Space to a friend.

Persist to `_agent/purpose.md` — this loads at session start and orients every conversation.

## When Purpose Is Missing

If `_agent/purpose.md` doesn't exist and the Space has content, the content itself is evidence. Read a few Notes, look at the tree structure, and reflect what you see: "Based on what's here, this Space seems focused on X. Is that right?" Let the user correct and refine.

If the Space is empty, explore what the user wants to build: "What kind of knowledge do you want to accumulate here?"
