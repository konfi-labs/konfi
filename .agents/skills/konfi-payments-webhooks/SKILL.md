---
name: konfi-payments-webhooks
description: Work on Konfi payment integration code. Use for tenant payment configuration, payment-provider selection, checkout sessions, Stripe and Przelewy24 webhooks, webhook route tests, payment method changes, and admin/store payment status behavior.
---

# Konfi Payments Webhooks

## First Pass

1. Start from the automatic `SessionStart` context output, or run
   `pnpm agent:context` if the hook did not print.
2. Inspect `packages/payments`, `apps/store/lib/payments`,
   `apps/admin/lib/payments`, and webhook route handlers before editing.
3. Check provider-specific behavior separately for Stripe and Przelewy24.

## Guardrails

- Keep provider contracts typed; never use `any`.
- Preserve webhook signature verification before processing events.
- Keep tenant payment configuration isolated by tenant.
- Reuse shared payment integration helpers from `packages/utils` or
  `packages/payments` before adding app-local copies.
- For checkout changes, verify both checkout-session creation and downstream
  order/payment method behavior.

## Tests

- Add or update focused tests near the changed provider or route.
- Cover invalid signatures, unsupported tenants/providers, idempotency, and
  recoverable provider failures when relevant.
- Run targeted Vitest before broader test/build commands.
