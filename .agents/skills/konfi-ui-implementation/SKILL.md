---
name: konfi-ui-implementation
description: Implement or refine admin/store UI in the Konfi monorepo after product-design has set scope, or when the task is clearly tactical UI implementation in apps/admin, apps/store, or packages/components. Use when work is likely to touch shared renderers, mirrored admin/store surfaces, compact/full variants, translations, overflow/layout behavior, or Chakra composition. Do not use for product shaping, broad design audits, copy-only edits, backend-only work, or tiny local UI edits unless code search shows the same surface exists in multiple places.
---

# Konfi UI Implementation

This is the implementation helper for Konfi UI work. Use `product-design` first
for shaping, reviews, copy passes, hardening, or material product decisions; use
this skill once the target surface and mode are known.

Konfi UI tasks often look local but are actually spread across shared renderers,
app wrappers, compact/full variants, and admin/store surfaces.

## Objectives

- Land UI changes in the correct layer the first time.
- Avoid follow-up fixes for missing mirrored surfaces.
- Reuse the repo's actual Chakra patterns instead of approximate substitutes.
- Catch translation, overflow, and theme regressions before finishing.

## Workflow

### 1. Map the real surface before editing

For any existing feature, search for all related surfaces first:

- admin vs. store
- detail page vs. grid/preview/list
- compact vs. full variants
- shared component vs. app-specific wrapper

In Konfi, many order/product changes belong in shared packages rather than in a single page:

- `packages/components/src/components/shared/**`
- `packages/utils/src/forms.ts`
- `packages/types/src/**`
- app wrappers in `apps/admin/app/[lng]/**` and `apps/store/app/[lng]/**`

Do not stop after fixing only the first surface you find if the same feature appears elsewhere.

### 2. Reuse the exact UI pattern already used nearby

Inspect neighboring components before choosing the implementation.

- Match the existing Chakra primitive and composition pattern.
- Prefer semantic tokens such as `*.solid`, `*.subtle`, and `*.muted`.
- Do not switch to a different control just because it compiles. If the surrounding surface uses Chakra `Select`, keep using that pattern rather than replacing it with `NativeSelect`.
- Prefer shared wrappers from this repo when that surface already standardizes on them.

If a generic design/accessibility review would help, also use `web-design-guidelines`.

### 3. Treat translations as part of the first pass

When UI copy changes, update locale files in the same change. Cover every existing locale directory for the touched app and namespace, for example:

- `apps/admin/app/i18n/locales/*/translation.json`
- `apps/admin/app/i18n/locales/*/order.json`
- `apps/store/app/i18n/locales/*/translation.json`

Reuse existing keys when semantics match. If the touched UI exists in both apps, check whether both sides need locale updates.

If the task is primarily about localization, also use the `i18n` skill.

### 4. Validate with realistic UI states

Before finishing, check the states that have caused repeat follow-up fixes in Konfi:

- long descriptions and labels
- tooltip width
- row-height consistency
- overflow in grids, lists, and detail panels
- selected, hover, and compact variants
- light-theme contrast as well as dark theme

Avoid declaring a UI task done based only on a short happy-path example.

### 5. For behavior that only shows up at runtime, inspect the running UI

If the bug is about placement, sticky tooltips, preview toggles, state persistence, or visual behavior, inspect the running app rather than relying only on static code reading.

## Report back clearly

When you summarize the work, mention:

1. which shared surface or wrapper was the real source of truth
2. which mirrored surfaces were updated
3. whether locale files were updated

That makes it obvious the fix is complete instead of partial.
