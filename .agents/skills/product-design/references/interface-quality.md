# Interface Quality

Load this reference for implementation, visual review, responsive work,
accessibility work, state hardening, or any material UI change.

## Rules

### rule/admin-density-store-brand

Scope: Admin and store app UI.

Rule: Admin surfaces should feel dense, operational, and optimized for repeated
work. Store surfaces should feel brand-led and commerce-oriented while still
making product configuration, cart, checkout, and account tasks direct.

Why: Both apps share Chakra foundations, but they serve different jobs.

Source: `DESIGN.md`.

### rule/chakra-semantic-system

Scope: Chakra UI in `apps/admin`, `apps/store`, and `packages/components`.

Rule: Use Chakra props, semantic tokens, shared wrappers, recipes, and slot
recipes before custom styling. Prefer `colorPalette`, `primary.*`, `fg.*`,
`bg.*`, and `border.*` tokens over raw shades in app code.

Why: Konfi's design system is shared at token/component level and specialized at
the app theme layer.

Source: `DESIGN.md` and root `AGENTS.md`.

### rule/reachable-states

Scope: Any component or flow with data, async work, permissions, validation, or
mutation.

Rule: Design only states the product can actually enter, but cover the relevant
set: loading, empty, sparse, populated, validation, error, permission, disabled,
optimistic, stale, destructive, and responsive variants.

Why: A polished populated state is incomplete when real operators hit edge
states.

### rule/localization-resilience

Scope: Copy, labels, buttons, tables, cards, filters, tooltips, and forms.

Rule: Check long labels, translated strings, large values, narrow widths, tooltip
width, row-height consistency, and overflow before finishing.

Why: Polish defects often appear only with real content and localized copy.

### rule/real-surface-verification

Scope: Placement, hierarchy, sticky behavior, preview toggles, state persistence,
animation, focus, responsive behavior, and visual polish.

Rule: Inspect the running UI when runtime behavior matters. Do not claim visual
verification from source inspection alone.

Why: Code can be correct while the rendered surface is clipped, misaligned,
inaccessible, or misleading.

### rule/navigation-vs-action

Scope: Links, buttons, menu items, command bars, dialogs, and table row actions.

Rule: Use navigation components for navigation and action components for actions.
Do not make a navigation event look like a mutation or a mutation look like a
link.

Why: The component choice communicates consequence and expected behavior.

### rule/no-unowned-pattern-drift

Scope: Shared UI, app wrappers, and mirrored variants.

Rule: If a visual or interaction pattern repeats, update the owning shared
component, recipe, slot recipe, or wrapper instead of scattering local
overrides.

Why: Local one-offs create drift across admin/store and compact/full variants.

## Verification Checklist

- Primary job and primary action are unmistakable.
- Object, scope, and consequence are clear for important actions.
- State coverage matches reachable product behavior.
- Copy is translated and has stable accessible names.
- Layout survives mobile, desktop, long content, and constrained width.
- Keyboard order, focus movement, disabled state, loading state, and touch
  targets are acceptable.
- The summary distinguishes rendered verification from source-only inspection.
