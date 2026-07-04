# Surfaces

Use this routing reference to avoid treating a mirrored or shared Konfi UI task
as a local page edit.

## Routing Table

| Surface | First files and guidance | Design emphasis |
| --- | --- | --- |
| Admin app | `apps/admin/AGENTS.md`, `apps/admin/app/[lng]/**`, `DESIGN.md`, `konfi-ui-implementation` | Dense operational workspace, fast scanning, clear status, safe mutations, resilient tables and forms. |
| Store app | `apps/store/AGENTS.md`, `apps/store/app/[lng]/**`, `DESIGN.md`, `konfi-ui-implementation` | Commerce clarity, product configuration, cart/checkout confidence, brand rhythm without blocking the task. |
| Shared components | `packages/components/src/components/shared/**`, `packages/components/src/components/ui/**`, `DESIGN.md` | Cross-app consistency, reusable composition, semantic tokens, Storybook states when relevant. |
| App themes | `apps/admin/theme/**`, `apps/store/theme/**`, `packages/components/src/theme/**`, `DESIGN.md` | Keep shared foundations shared; specialize app shell, typography, rhythm, and recipes intentionally. |
| Desktop wrapper | `apps/desktop/**`, `apps/admin/**` | Preserve admin behavior inside the Electron shell, including titlebar and window affordances. |

## Repeated Konfi Surfaces

- Orders and production: check table/list rows, detail views, preview panels,
  compact/full variants, status badges, bulk actions, loading/count states, and
  permissions.
- Product configuration and pricing: check dynamic pricing states, quantities,
  stale values, provider import assumptions, validation, and user-visible error
  recovery.
- Checkout and payments: check provider selection, payment status, retries,
  webhooks reflected in UI, receipts/invoices, and irreversible or externally
  visible consequences.
- Tenant and channel configuration: check admin/store mirrors, permission
  language, access scope, empty states, and whether Firestore/server rules match
  the UI promise.
- AI generation surfaces: check provider errors, loading and retry states,
  generated content review, model-specific behavior, and safe fallback copy.

## Mirroring Checklist

Before editing, search for:

- admin and store versions
- detail, list, grid, preview, and compact variants
- shared renderer or app-specific wrapper
- locale keys in every existing locale directory
- Storybook stories for reusable components
- route handlers or server actions that shape visible states

Do not stop at the first visible component if a shared source of truth exists.
