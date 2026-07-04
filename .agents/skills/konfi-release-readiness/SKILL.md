---
name: konfi-release-readiness
description: Audit or implement Konfi release-readiness work. Use for dedicated release gates, production cooperation, same-database tenant cooperation, paid-plan access, product sharing, cloud-contracts publishing, env validation, and end-of-month release audits across V:\konfi and V:\konfi-cloud.
---

# Konfi Release Readiness

## Audit Order

1. Start from the automatic `SessionStart` context output, or run
   `pnpm agent:context` if the hook did not print.
2. Identify whether the target is same-database cooperation, dedicated receiver
   readiness, cloud-contracts packaging, tenant storefront runtime, or payment
   release gates.
3. Search the real source of truth before app pages:
   `packages/cloud-contracts`, `packages/types`, `packages/utils`,
   `packages/components/src/components/shared`, and the relevant app server
   actions/routes.
4. Check sibling `V:\konfi-cloud` when contracts, SaaS tenant runtime, hosted
   storefront, or production cooperation spans both repos.

## Required Release Gates

- Same-database `tenantCooperations` records must have paid `sourcePlanId` and
  `targetPlanId` values: `starter`, `pro`, or `enterprise`.
- Same-database cooperation also requires explicit `productSharing.enabled` and
  `productSharing.productIds` before creating cross-tenant fulfillment requests.
- Free tenants must not be listed as cooperation targets or allowed to create
  cross-tenant fulfillment requests.
- Cooperation request item snapshots must carry selected attributes, required
  product attributes, page/custom-size data, advanced finishing selections, and
  combination IDs.
- Dedicated receiver direct app requests use
  `PRODUCTION_COOPERATION_APP_API_SECRET`; status callbacks use
  `PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET`.
- Shared contracts in `packages/cloud-contracts` must be packaged/published
  before `konfi-cloud` consumes a new version.

## Commands

```bash
pnpm env:validate:dedicated -- --env-file .env.admin.production --scope admin
pnpm cooperation:audit:same-database -- --env-file .env.admin.production
pnpm release:audit:dedicated -- --admin-env-file .env.admin.production --store-env-file .env.store.production --functions-env-file .env.functions.production --cooperation-env-file .env.admin.production
```

## Closeout

- Report exact files and checks.
- Separate confirmed blockers from suspected gaps.
- Update the Linear issue when one is known; otherwise state that no issue ID
  was available.
