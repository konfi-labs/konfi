---
name: konfi-pricing-preview-debugger
description: Debug Konfi dynamic pricing, external-provider import, and product preview issues. Use when debugging admin/store product pricing or preview behavior involving missing or stale prices, configuration not found, quantity/summary mismatches, delivery-time extraction, external price mapping, SWR cache keys, or local preview state. Do not use for unrelated product UI or generic catalog edits with no pricing/preview symptom.
---

# Konfi Pricing Preview Debugger

This skill focuses on a recurring Konfi failure mode: pricing and import bugs often appear to be provider or schema problems, but the real cause is local preview state, cache keys, or shared product preview logic.

## Objectives

- Reproduce the visible bug in the correct runtime surface.
- Check local preview and cache paths before blaming backend/provider code.
- Narrow the problem to the right layer quickly.

## Start with the running app

When possible, reproduce the bug in the running admin/store UI first.

Typical high-value surfaces:

- admin product create/edit form preview
- combination preview
- store product page
- quantity list vs. summary/add-to-cart mismatch

If the user can share a running browser session, use it. The visible runtime behavior is often the fastest route to the actual bug.

## Trace layers in this order

### 1. Shared preview/rendering layer

Start here before provider code:

- `packages/components/src/components/shared/product/Price.tsx`
- `packages/components/src/components/shared/product/Quantity.tsx`
- `packages/components/src/components/shared/product/Summary.tsx`
- `packages/components/src/components/shared/product/Combination.tsx`
- `packages/components/src/utils/fetch-prices.ts`

Check whether the same inputs are flowing consistently into both summary and quantity/volume rendering.

### 2. Admin local preview layer

Then inspect the admin product-form path:

- `apps/admin/lib/product-form-prices.ts`
- `apps/admin/app/[lng]/components/catalog/ProductForm.tsx`
- `apps/admin/app/[lng]/components/form/field-controllers/DynamicPricingConfig.tsx`
- `apps/admin/app/[lng]/components/form/field-controllers/CombinationInput.tsx`

This layer often decides whether the preview can initialize correctly for unsaved local form state.

### 3. Provider/import learning layer

Only after the preview path looks sound, inspect provider logic:

- `apps/admin/lib/external-products/**`
- especially `price-fetch-system.ts`

This is where learned schemas, delivery-time extraction, and mapping logic live.

### 4. Store runtime resolution

If the issue is store-specific, inspect:

- `apps/store/app/api/products/dynamic-pricing/route.ts`
- `apps/store/lib/orders/create-order.server.ts`

## Common Konfi traps to check early

### SWR and cache-key issues

Make sure cache keys include the inputs that actually change the result, such as:

- dynamic pricing config
- selected attribute options
- quantity / volume relevant inputs
- preview configuration inputs

If summary and quantity use separate fetch paths, verify both have equivalent cache invalidation.

### Preview initialization gaps

Check whether unsaved local forms initialize preview configuration for the current price type. In Konfi, DYNAMIC flows have repeatedly failed because preview helpers treated them like unsupported cases.

### Empty arrays vs. undefined

Inspect guards that decide whether data should be fetched. In this repo, an empty array can accidentally suppress fetching when the real meaning should be "no resolved prices yet".

### Misleading provider blame

Do not tell the user it is probably misconfiguration unless the local preview path is already ruled out. This repo has a history of preview-only bugs masquerading as import/provider failures.

## Fix strategy

When you patch the bug:

1. fix the narrowest correct layer
2. add or update focused tests near that layer
3. mention whether the root cause was local preview state, shared rendering/cache behavior, or provider/import logic

## Explain the result in repo terms

When you summarize, explicitly say:

- which layer was actually broken
- which runtime symptom it produced
- why it looked like a provider/backend problem at first, if relevant
