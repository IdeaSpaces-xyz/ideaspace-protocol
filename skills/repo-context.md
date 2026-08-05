---
name: repo-context
description: >
  Help describe what this place is and who works here. Use when onboarding to
  a new repo, when the space's identity is unclear, or when drafting the
  what/who parts of the _agent/ contract.
---

# Repo Context

Help the user describe what this Space is and who works here.

## What Repo Context Is

Repo context is the "What" and "Who" — it tells the agent what kind of place this is. A personal research repo, a team knowledge base, a client portfolio tracker. It shapes how the agent speaks, what it assumes, and how it names things.

## What to Include

- **What this place is** — domain, scope, what kind of knowledge lives here
- **Who works here** — individual, team, organization. How they think about their work.
- **Vocabulary** — terms that mean specific things here. "Deal" might mean venture investment or sales opportunity depending on context.
- **Conventions** — naming patterns, preferred structure, anything the agent should follow

## Elicitation

If the user hasn't written repo context yet:

1. Look at existing content — tree structure, Note names, README files
2. Reflect what you see: "This looks like a personal research space focused on X"
3. Ask what's missing from that picture
4. Draft and refine together

## Writing It

Concise. A few paragraphs. Written for the agent — surfaces load the `_agent/` contract by position, so this orients every conversation held here. Focus on what would change the agent's behavior: vocabulary, assumptions, conventions.

Persist into the contract: what this place is and who works here is the `_agent/foundation.md` handshake's job; conventions and vocabulary the agent should follow belong in `_agent/guide.md`. (Some platforms additionally read `_agent/repo-context.md`; the contract is the portable home.)
