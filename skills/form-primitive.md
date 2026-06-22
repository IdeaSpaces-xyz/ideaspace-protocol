---
name: form-primitive
description: >
  Help users create reusable agent instructions — procedures, checklists,
  review patterns, memory routines, or any repeatable pattern. Use when the
  user wants to define how the agent should work in specific situations.
  Produces a file in _agent/ with name + description frontmatter.
---
<!-- Ported from sw_space/resources/skills/form-primitive.md @ 3b62262; neutralized for surface-neutral SDK distribution. Substance tracks the source — re-sync against that baseline. -->

# Form Primitive

Help the user create a reusable instruction that shapes how you work together. Not a Perspective (those have a specific three-component structure and are applied as a structured transformation). A primitive is any part of `_agent/` — a procedure, a checklist, a review pattern, a memory routine, whatever helps at that position.

## The L1 Contract

Every primitive needs frontmatter with `name` and `description`. The description tells the agent when to use it — like a trigger condition.

```yaml
---
name: Weekly Review
description: >
  Review the week's captures, surface patterns, update Now.
  Use at the end of each week or when the user asks to reflect.
---
```

The name says what it is. The description says when to use it. Both are required. Both show up when browsing the tree. The description is how the agent decides "this is relevant right now."

## Elicitation

The user knows what they want to make repeatable. They may not know how to structure it.

1. **Start with the trigger.** "When does this happen? What situation makes you think 'I should do X'?" This becomes the description.

2. **Walk through a real instance.** "Last time you did this, what did you do step by step?" Real examples beat abstract procedures.

3. **Find the invariant.** What stays the same every time vs what changes with context? The invariant is the instruction. The variable parts are what the agent adapts.

4. **Draft and validate.** Show the primitive before saving. "If I followed this next time, would it produce the right behavior?"

## Structure

No prescribed format. The content should be whatever makes the instruction clear and followable. Common patterns:

**Procedural** — step by step:
```markdown
## When to use
[trigger condition]

## Steps
1. ...
2. ...
3. ...

## Output
[what gets produced]
```

**Checklist** — verify against criteria:
```markdown
## Check
- [ ] Does it have X?
- [ ] Is Y consistent with Z?
- [ ] Flag if A but not B.

## If issues found
[what to do]
```

**Routine** — recurring pattern:
```markdown
## Trigger
[when this runs — weekly, on entering a position, on capture, etc.]

## What to do
[the routine]

## What to capture
[what Note or update to produce]
```

**Review** — evaluate something:
```markdown
## What to review
[scope — a Note, a branch, a set of captures]

## Criteria
[what good looks like]

## Output
[Note with findings, or update to the reviewed content]
```

The user can invent any structure. These are starting points, not requirements.

## Where It Lives

Primitives go in `_agent/` at the level where they apply. Everything in `_agent/` composes along the path, root → current position:

- `_agent/reviewer.md` at repo root → applies everywhere
- `startups/_agent/due-diligence-checklist.md` → applies in startups/ and below
- `clients/acme/_agent/communication-style.md` → applies when working on Acme

## Creating Agents

A special case of primitive: a full agent definition. When the user wants a specialized agent (not just an instruction), create `_agent/{agent-name}/agent.md`:

```yaml
---
name: "Regulatory Analyst"
tools: ["read", "write", "search", "git"]
---

An agent specialized in regulatory risk analysis. Evaluates compliance
requirements, flags regulatory gaps, tracks regulatory changes.
```

The optional `tools` field restricts which tools the agent can use. Omit it for full access. The body describes what the agent does.

Also create `_agent/{agent-name}/soul.md` to define how the agent shows up — its character and approach. And optionally `purpose.md` and `now.md` for the agent's own direction. The agent becomes available for conversations once these files exist.

## What It Is NOT

- **Not a Perspective.** Perspectives have Object Definition, Thinking Structure, Expected Outcome. They're applied as a structured transformation. If the user wants to evaluate/analyze things consistently, use the **form-perspective** skill instead.
- **Not a Note.** Notes are knowledge — content that accumulates in the Space. Primitives are instructions — they shape how the agent works, not what the agent knows.
- **Not guide.md.** The guide is general behavioral guidance for a branch. A primitive is a specific, named, reusable pattern with a trigger condition. Both live in `_agent/` — both are part of the shared understanding about how we work here.

## Validation

Before saving, check:
- Does it have `name` and `description` in frontmatter?
- Does the description clearly say when to use it?
- Is the instruction clear enough that you could follow it without asking questions?
- Would it produce consistent results across different situations?

If any of these fail, iterate with the user before persisting.
