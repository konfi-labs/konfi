---
name: konfi-tenant-storefront
description: Work on Konfi tenant storefront runtime and hosted/dedicated storefront behavior. Use for tenant domains, runtime config, tenant channels, plan-gated storefront access, store/admin mirroring, checkout tenant resolution, MCP OAuth store routes, and Vercel storefront integration.
---

# Konfi Tenant Storefront

## First Pass

1. Start from the automatic `SessionStart` context output, or run
   `pnpm agent:context` if the hook did not print.
2. Search for existing runtime helpers before adding new ones:
   `apps/store/lib/runtime-config.ts`, `apps/store/lib/tenant-runtime.ts`,
   `apps/admin/lib/integration-runtime-config.ts`, shared channel utilities,
   and `packages/utils`.
3. Check mirrored surfaces in one pass: admin channel setup, store runtime,
   checkout, order creation, cart/order contexts, and public metadata.

## Implementation Rules

- Keep tenant resolution server-side where possible.
- Preserve dedicated vs hosted SaaS boundaries. Do not let a hosted tenant read
  dedicated-only secrets or vice versa.
- For plan gates, verify both UI availability and server-side enforcement.
- For domains, check runtime config, Vercel project/domain assumptions, and
  tenant channel mirroring.
- For MCP/OAuth store routes, verify issuer/resource metadata, token routes,
  tenant lookup, and dedicated-only restrictions.
- Reuse shared utils before adding local helpers.

## Validation

- Add or update focused tests for tenant resolution, checkout, order creation,
  runtime config, or OAuth route behavior.
- Run the smallest relevant Vitest command first, then broader checks only if
  shared contracts or app routing changed.
