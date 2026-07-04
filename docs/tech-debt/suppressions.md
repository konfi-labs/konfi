# Suppressions inventory

This document inventories every TypeScript and lint suppression in
hand-written code under `apps/` and `packages/`. It exists to:

1. Make every suppression visible and traceable.
2. Justify the ones that should stay and track the ones that should be removed.
3. Anchor the CI lint rule that fails the build when **new** bare
   `@ts-ignore` / `@ts-expect-error` / `eslint-disable` comments are added
   without an accompanying explanation. See the
   [Enforcement](#enforcement) section below.

Last refreshed: 2026-06-10.

## Scope

- **Included:** all hand-written TypeScript / TSX / JS / MJS / CJS files
  in `apps/` and `packages/`.
- **Excluded:** generated SDK clients (`packages/{allegro,fakturownia,epaka}/client/**`),
  generated WASM type bindings (`packages/wasm/dist/**`, `packages/wasm/dist-web/**`),
  build outputs (`.next/`, `dist/`, `build/`, `coverage/`, `storybook-static/`)
  and `node_modules/`.
  These are already ignored by `.oxlintrc.json` `ignorePatterns`. Generated
  Kiota clients account for the bulk of the historical suppression count
  (~5 000 directives) but are not human-maintained — they should be
  regenerated, not hand-edited.

## Categories

Every entry is tagged with one of:

| Tag         | Meaning                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------- |
| `justified` | Permanent suppression with a rationale comment. May not be removed without a code-level fix. |
| `to-fix`    | Should be removed by fixing the underlying type / lint issue. Tracked by a sub-issue.        |
| `to-remove` | Suppression is redundant or no longer needed; remove on touch.                               |

## TypeScript suppressions

5 directives across 5 files (excluding generated code).

| Location                                                         | Directive          | Category    | Rationale / next step                                                                                               |
| ---------------------------------------------------------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/theme/index.ts:128`                                  | `@ts-expect-error` | `justified` | `appRegion: "drag"` is an Electron-only CSSOM extension; not in `csstype`.                                          |
| `apps/admin/theme/recipes/skeletonRecipe.ts:12`                  | `@ts-expect-error` | `to-fix`    | Chakra typegen does not surface the custom `shine` skeleton variant. Re-run typegen and remove.                     |
| `apps/admin/app/[lng]/components/layout/Layout.tsx:134`          | `@ts-expect-error` | `justified` | `appRegion: "no-drag"` is an Electron-only CSSOM extension. Mirrors the suppression in `apps/admin/theme/index.ts`. |
| `apps/store/theme/recipes/skeletonRecipe.ts:12`                  | `@ts-expect-error` | `to-fix`    | Same as the admin skeleton recipe — fix via Chakra typegen.                                                         |
| `packages/utils/src/__tests__/order-printing-methods.test.ts:96` | `@ts-expect-error` | `justified` | Test deliberately passes an extra field to verify the runtime stripper.                                             |

### Removed during this audit

The following `//@ts-ignore` comments were unnecessary (the underlying
type was already correct) and were deleted rather than justified:

- `apps/store/app/[lng]/components/layout/ProductsMenu.tsx:270` — `blurGlow` button variant.
- `apps/store/app/[lng]/components/checkout/Success.tsx:95, 114` — `blurGlow` button variant.
- `packages/components/src/components/shared/product/Summary.tsx:580` — `blurGlow` button variant.

The previously-bare `// @ts-expect-error variant issue` in
`apps/store/theme/recipes/skeletonRecipe.ts` was rewritten to include
a description matching the admin counterpart.

## ESLint suppressions

The repository uses **oxlint**, not ESLint. `eslint-disable` directives
are therefore documentation only as far as the active linter is
concerned; they describe rules that were enforced by the previous
ESLint setup and are still meaningful for human readers. They are kept
because oxlint plans to add ESLint-comment compatibility, and because
the directives flag the same hazards (stale `useEffect` deps,
intentional infinite loops, intentional `console.*`, etc.).

The 54 actionable `eslint-disable` comments fall into a small number of
buckets:

### `react-hooks/exhaustive-deps` (42)

All in `useEffect` / `useMemo` / `useCallback` calls where the author
intentionally wants the effect to run only on a subset of deps —
typically once on mount, or guarded by an external `revision`
counter. Category: `justified`.

Files:

- `apps/admin/app/[lng]/channels/channels-page.tsx:135`
- `apps/admin/app/[lng]/components/catalog/Categories.tsx:143`
- `apps/admin/app/[lng]/components/catalog/Products.tsx:285`
- `apps/admin/app/[lng]/components/fakturownia/FakturowniaInvoiceFormController.tsx:347` (carries an inline `-- reason`; moved here when the invoice form was split into a controller)
- `apps/admin/app/[lng]/components/fakturownia/FakturowniaProductPickerDrawer.tsx:310`
- `apps/admin/app/[lng]/components/form/field-controllers/AttributeDependencies.tsx:52`
- `apps/admin/app/[lng]/components/form/field-controllers/CombinationInput.tsx:1806`
- `apps/admin/app/[lng]/components/form/field-controllers/ProductType.tsx:64`
- `apps/admin/app/[lng]/components/impose/workspace/ImposeWorkspaceUploadPanel.tsx:85, 94`
- `apps/admin/app/[lng]/components/layout/SideNavigation.tsx:105`
- `apps/admin/app/[lng]/components/orders/OrderForm.tsx:654`
- `apps/admin/app/[lng]/components/quotes/QuoteForm.tsx:217`
- `apps/admin/app/[lng]/configuration/attributes/attributes-page.tsx:353`
- `apps/admin/app/[lng]/configuration/members/members-page.tsx:133`
- `apps/admin/app/[lng]/configuration/product-types/product-types-page.tsx:278`
- `apps/admin/app/[lng]/configuration/warehouses/warehouses-page.tsx:164`
- `apps/admin/app/[lng]/customers/[id]/customer-page.tsx:152`
- `apps/admin/app/[lng]/customers/customers-page.tsx:169`
- `apps/admin/app/[lng]/promotions/promotions-page.tsx:160, 237`
- `apps/admin/app/[lng]/quotes/create/create-quote-page.tsx:117`
- `apps/admin/app/[lng]/quotes/quotes-page.tsx:186`
- `apps/store/app/[lng]/account/ratings/ratings-page.tsx:69`
- `apps/store/app/[lng]/components/cart/CartItems.tsx:106, 277, 287`
- `apps/store/app/[lng]/components/products/Featured.tsx:32`
- `apps/store/app/[lng]/components/products/Recommendations.tsx:51`
- `packages/components/src/components/shared/common/Breadcrumbs.tsx:50`
- `packages/components/src/components/shared/form/field-controllers/InputSwitcher.tsx:443`
- `packages/components/src/components/shared/form/field-controllers/RadioInput.tsx:54`
- `packages/components/src/components/shared/product/Combination.tsx:399, 419, 436, 486, 497, 519`
- `packages/components/src/components/shared/product/Price.tsx:352, 452, 491`

### `unicorn/require-post-message-target-origin` (2)

`Web Worker` `postMessage` calls — workers don't accept a `targetOrigin`
argument, so the rule is wrong here. Category: `justified`.

- `apps/admin/lib/matrix-price-worker-client.ts:2`
- `apps/admin/lib/workers/matrix-price.worker.ts:2`

### `no-await-in-loop` (2)

Sequential paging through Fakturownia API where parallel calls would
exceed the rate limit. Category: `justified`.

- `apps/admin/lib/fakturownia/reports/fakturowniaTurnoverReport.ts:244`
- `apps/admin/lib/fakturownia/reports/fakturowniaUnpaidReport.ts:197`

### `no-constant-condition` (2)

Intentional `while (true)` agent / classifier loops with internal
`break` conditions. Category: `justified`.

- `apps/admin/app/actions/admin-ai-action-utils.ts:122`
- `apps/store/lib/orders/classify-printing-methods.ts:57`

### `no-console` (2)

Diagnostic logging in the barcode-detector troubleshooting paths.
Category: `justified`.

- `apps/admin/app/[lng]/components/delivery/BarcodeDetector.tsx:312, 514`

### `@typescript-eslint/no-explicit-any` (2)

Bridging un-typed third-party shapes (Genkit tool args, blog content
JSON). Category: `to-fix` — replace with proper schema types.

- `apps/admin/app/api/agents/approve/route.ts:136`
- `packages/firebase/src/blog.ts:166`

### Other (2)

| Location                                                                                     | Rule                           | Category    | Notes                                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------ | ----------- | -------------------------------------------------------------------------------- |
| `apps/admin/app/[lng]/components/form/field-controllers/ProductGroupedIndexedSearch.tsx:200` | `prefer-const`                 | `to-fix`    | Variable is reassigned later but pattern can be cleaned up.                      |
| `apps/desktop/src/utils/ghostscript.ts:4`                                                    | `turbo/no-undeclared-env-vars` | `justified` | Electron main process intentionally reads `GS_PATH` outside of Turbo's pipeline. |
| `packages/utils/src/price.ts:701`                                                            | `consistent-return`            | `to-fix`    | Function should explicitly return `undefined` in the early-out branch.           |

### File-level disables

These mark non-source artifacts and stay as-is:

- `apps/admin/next.config.mjs:1` — `/* eslint-disable */`
- `apps/store/next.config.mjs:1` — `/* eslint-disable */`
- `apps/store/instrumentation.ts:1` — `/* eslint-disable */`
- `packages/wasm/dist-web/wasm.d.ts:2` — `/* eslint-disable */` (generated)
- `packages/wasm/dist-web/wasm_bg.wasm.d.ts:2` — `/* eslint-disable */` (generated)

Category: `justified`.

## Disabled tests

No `.skip`, `.only`, `xdescribe` or `xit` markers exist anywhere in
`apps/` or `packages/`. (Audit run on 2026-05-14: zero matches for
`(it|test|describe)\.(skip|only|todo)` and `\bx(it|describe)\(`.)

If a future change adds a disabled test, capture the rationale and link
to a tracking issue, e.g.:

```ts
// TODO(#1234): re-enable once the upstream fixture is restored.
it.skip("…", …);
```

## Enforcement

Two CI gates protect this baseline:

1. **TypeScript directives.** The root `.oxlintrc.json` enables
   `typescript/ban-ts-comment` as `error` with
   `minimumDescriptionLength: 10`:
   - `@ts-ignore` is forbidden; use `@ts-expect-error` instead.
   - `@ts-expect-error` requires an inline description (≥ 10 chars).
   - `@ts-nocheck` is forbidden.

   This runs in `pnpm lint` (which executes `oxlint .` in
   `apps/admin` and `apps/store`) and therefore in CI.

2. **`eslint-disable` directives.** A baseline check at
   `scripts/check-suppression-comments.mjs` (run via `pnpm lint:suppressions`,
   which is also invoked by the root `pnpm lint`) fails the build when:
   - a new `eslint-disable*` comment is added in a file without a
     `-- explanation` description **and** the file's allowed bare
     count is exceeded, or
   - any new `@ts-ignore` is added (oxlint already covers this for
     `apps/admin` and `apps/store`; the script extends coverage to
     `packages/`, `apps/functions` and `apps/desktop`).

   The baseline (current allowed bare counts per file) lives at
   `scripts/suppression-baseline.json`. Lowering an entry is fine at
   any time; raising one requires updating this inventory.

## Updating this document

When you add or remove a suppression:

1. Update `scripts/suppression-baseline.json`.
2. Update the relevant table above (or the bullet list) and either
   tag the new entry `justified` with a rationale, or open a sub-issue
   and tag it `to-fix` / `to-remove`.
3. Re-run `pnpm lint:suppressions` to confirm the baseline matches.
