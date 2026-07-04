---
name: product-design
description: >-
  Single entry point for product design and user-facing UI work in the Konfi
  monorepo. Use when shaping, implementing, reviewing, auditing, polishing, or
  hardening anything a user sees, understands, chooses, or does in apps/admin,
  apps/store, apps/desktop, or packages/components: flows, pages, components,
  copy, accessibility, responsive behavior, loading, empty, error, permission,
  destructive states, Chakra composition, mirrored surfaces, and design-system
  decisions. Also use when backend behavior changes a user-visible outcome. Do
  not use for backend-only changes with no shipped UI effect, telemetry-only
  work, generated files, tests with no UI impact, or internal docs.
---

# Konfi Product Design

Make the interface correct for the user, the product, and Konfi. Working code is
not enough: choose the right task flow, component, state model, copy, and
verification path for the shipped surface.

## Operating Contract

- Start with the job, not the pixels. Identify who is acting, what they are
  trying to accomplish, which product object is involved, and what the system
  will change.
- Define the outcome before the output. Name the current problem, desired
  behavior, success signal, non-goals, and likely risks before choosing layout or
  copy.
- Use evidence, not taste. Trace decisions to product behavior, repository
  guidance, accepted decisions, verified adjacent patterns, or rendered
  behavior.
- Treat shipped code as evidence, not automatic precedent. It proves what
  exists, not why it is still the right standard.
- Separate facts from decisions. Mark assumptions and unresolved choices
  explicitly instead of hiding them inside implementation details.
- Choose the smallest coherent intervention. Prefer better defaults, clearer
  behavior, or reuse before adding settings, surfaces, or abstractions.
- Design every reachable state the product can actually enter. Do not stop at
  the populated happy path.
- Verify the real surface. Source inspection can prove behavior; rendered UI
  proves visual, responsive, and interaction quality.

## Request Modes

Resolve the mode from the user's verb and artifact before acting.

| Mode | Typical request | Required behavior |
| --- | --- | --- |
| Shape | "Design this flow", "How should this work?", unsettled feature brief | Frame the problem and evidence, compare material alternatives, then define the flow, states, acceptance criteria, risks, and open decisions. Do not edit unless asked. |
| Implement | "Build", "fix", "improve", "make this UI work" | Resolve product decisions needed for the change, then implement the smallest coherent end-to-end change within scope. |
| Review | "Audit", "critique", "what is wrong?", screenshot/URL/code review | Inspect source and rendered evidence when possible, then report prioritized findings. Do not edit unless asked. |
| Copy | "Fix the copy", "rewrite these errors", labels or accessible names | Edit user-facing language, accessible names, and directly required JSX only. Report structural blockers without broadening scope. |
| Harden | "Polish", "production-ready", "handle edge cases" | Preserve the settled direction while fixing state, resilience, responsive, accessibility, and finish defects. |

When intent is ambiguous, use the narrowest mode supported by the verb. A URL,
screenshot, route, or component identifies scope; it does not by itself authorize
broad edits.

A material decision changes the user's task, default, scope, consequence,
navigation, interaction surface, permission model, or reachable states.

## Decision Authority

Resolve conflicts in this order:

1. The user's explicit goal and constraints.
2. Verified user/product evidence and system truth.
3. Repository-canonical guidance: `AGENTS.md`, app-level `AGENTS.md`,
   `DESIGN.md`, Chakra theme/component APIs, and routed skills.
4. Accepted product/design decisions and exemplars with stable evidence.
5. Verified adjacent shipped patterns in the same product area.
6. General interface heuristics.

## Workflow

### 1. Set Scope And Mode

Name the target surface and request mode in the work plan, review notes, or
implementation summary. Keep backend-only and telemetry-only work out of this
skill unless the behavior changes what users see or can do.

### 2. Load Product Context

Before proposing UI, read the applicable `AGENTS.md` chain, supplied briefs,
`DESIGN.md` for design-system ownership, and the product logic that determines
mutations, permissions, validation, errors, async side effects, and returned
data.

### 3. Model Material Product Decisions

For Shape, Implement, Harden, full Review, or any material flow/component
change, read `references/product-judgment.md` and keep a compact internal brief:
user, job, object, scope, current behavior, desired outcome, consequence,
reversibility, permissions, non-goals, evidence, assumptions, and open decisions.

### 4. Map Surfaces And States

Read `references/surfaces.md`. Inventory entry points, visible regions,
overlays, exits, return paths, app variants, shared wrappers, compact/full
variants, and mirrored admin/store surfaces. Map only reachable states:
loading, empty, sparse, populated, validation, error, permission, disabled,
optimistic, stale, destructive, and responsive variants.

### 5. Load Routed References

| Need | Load |
| --- | --- |
| Product, flow, or component decision | `references/product-judgment.md`, `references/surfaces.md`, `DESIGN.md` |
| Konfi UI implementation across admin/store/shared surfaces | `konfi-ui-implementation` after scope is known |
| Visual, layout, responsive, state, or accessibility review | `references/interface-quality.md`, then `web-design-guidelines` for broad compliance checks |
| Copy, labels, errors, accessible names, or translations | `references/copy.md`, then `i18n` |
| Chakra composition, theme, recipes, slot recipes, or typegen | `DESIGN.md`, then `chakra-ui-builder` or `building-components` when deeper component guidance is needed |
| Marketing-style or visually led public pages | `frontend-skill`, while still honoring `references/surfaces.md` and app design-system ownership |
| Missing or disputed guidance | `references/coverage-gaps.md` and current-source verification |

### 6. Decide, Then Implement

For each non-mechanical change, be able to answer:

- What user problem does this solve?
- Why is this component or surface appropriate?
- What object, scope, consequence, or state must the UI communicate?
- Which evidence supports the decision?
- What is the smallest coherent change?

### 7. Verify

1. Confirm the primary job and acceptance criteria.
2. Run focused static checks or tests appropriate to the touched files.
3. Inspect relevant compact and wide viewports when layout, hierarchy, or
   interaction changed.
4. Exercise every materially changed reachable state.
5. Verify keyboard order, focus movement, loading behavior, and pointer/touch
   targets for interactive changes.
6. Test long content, large values, constrained width, and localization risk.
7. Report what was rendered versus what was only inspected in source.

## Product Design Standards

- Make the primary task and primary action unmistakable.
- Preserve the user's mental model and current context unless changing it solves
  a verified problem.
- Name the exact object, scope, and consequence of important actions.
- Use navigation components for navigation and action components for actions.
- Prefer inline disclosure before adding a modal.
- Prefer strong defaults and direct behavior over configuration the user must
  learn and maintain.
- Use Chakra props, semantic tokens, recipes, and shared wrappers before custom
  styling.
- Use hierarchy, spacing, and alignment before adding containers.
- Preserve user input through validation and recoverable errors.
- Keep loading control labels stable; use loading or busy affordances instead.
- Make destructive actions proportional to impact and provide undo only when the
  system can honestly support it.
- Do not add decorative novelty, motion, or copy unless it clarifies structure,
  state, affordance, or brand intent.

## Review Output

Lead with findings, ordered by user impact:

- P0: blocks the primary task, creates a severe accessibility failure, or can
  cause unrecoverable user harm.
- P1: likely task failure, misleading consequence, missing critical state, or
  major responsive/accessibility defect.
- P2: meaningful friction, inconsistency, weak hierarchy, or recoverability
  issue.
- P3: minor craft or consistency improvement.

For each finding include: file/line or rendered location, verification status,
canonical source, user consequence, and the smallest concrete fix.

## Skill Integrity

- Add or change a product-design rule only after current-source verification and
  human acceptance.
- Record scope, rationale, evidence, exceptions, and bad/good examples for new
  rules.
- Prefer the narrowest destination: canonical source, routed reference, exemplar,
  lint/eval check, or coverage gap.
- Keep deterministic checks mechanical. Keep judgment in prose with its evidence
  and degree of freedom.
- Never promote one screenshot, one shipped file, or one reviewer comment into a
  universal rule by itself.
