# Konfi

Konfi is a Turborepo monorepo for configurable printing and e-commerce
workflows. It includes a customer storefront, an admin dashboard, Firebase
functions, an Electron desktop wrapper, shared UI and domain packages, generated
external-service clients, and Rust/WASM utilities for workbook parsing,
preflight, and imposition tasks.

## Repository status

This repository is being prepared for an open-source release. The root package
stays `"private": true` because this is an application monorepo, not because
open source requires publishing packages. Making the repository public under
Apache-2.0 does not imply publishing any workspace package to npm, and it does
not grant rights to use Konfi trademarks beyond the license terms.

Before making a fork or upstream repository public, complete the remaining
release-readiness checks:

- run a current-tree and full-history secret scan
- rotate any credential that appears in history
- confirm redistribution rights for generated API clients and checked-in API
  specifications
- decide whether private production integrations should be public, mocked, or
  split out
- review tests, fixtures, screenshots, Storybook stories, docs, and changelogs
  for customer, supplier, staff, order, pricing, or production data

## Apps

| App              | Description                                        | Default port |
| ---------------- | -------------------------------------------------- | ------------ |
| `apps/store`     | Customer storefront built with Next.js App Router  | 3000         |
| `apps/admin`     | Management dashboard built with Next.js App Router | 3001         |
| `apps/functions` | Firebase Cloud Functions and backend jobs          | N/A          |
| `apps/desktop`   | Electron wrapper around the admin app              | N/A          |

## Packages

- `packages/components` - shared Chakra UI components
- `packages/firebase` - Firebase client and helper utilities
- `packages/types` - shared TypeScript interfaces
- `packages/utils` - shared domain utilities
- `packages/meilisearch` - search helpers and server actions
- `packages/wasm` - Rust/WASM parsing, preflight, and imposition utilities
- `packages/emails` - React email templates and senders
- `packages/cloud-contracts` - shared SaaS/control-plane contracts published as
  `@sblyvwx/cloud-contracts`
- `packages/payments` - payment integration helpers
- `packages/allegro`, `packages/fakturownia`, `packages/epaka`,
  `packages/polkurier`, `packages/google`, and `packages/microsoft` -
  third-party service wrappers or generated clients

## Requirements

- Node.js 24
- pnpm 11
- Rust toolchain (stable, with the `wasm32-unknown-unknown` target) for
  `packages/wasm`
- Firebase CLI for `apps/functions` work and the emulator workflow
- JDK 21 or newer for the Firebase Emulator Suite
- Firebase, Stripe, Resend, Meilisearch, and other service credentials only
  when working on the related integrations

## Local development

Install dependencies:

```bash
pnpm install
```

Copy the shared monorepo environment example:

```bash
cp .env.example .env
```

Run all development servers:

```bash
pnpm dev
```

Open the store at <http://localhost:3000> and the admin app at
<http://localhost:3001>.

## Desktop development

### Firebase emulator workflow

Local Firebase development uses the Firebase Emulator Suite with a safe demo
project (`demo-konfi-local`) and public-safe seed data.

The current Firebase CLI requires JDK 21 or newer for emulator startup.
The emulator command uses `firebase.emulators.json` with
`*.emulators.rules` files so the intentionally permissive local rules are not
the default Firebase deploy config.

Deployable Firebase rules and indexes in `apps/functions/firebase.json` are for
dedicated customer Firebase projects. The shared hosted SaaS Firebase project is
managed by the separate Konfi Cloud control plane (not part of this
repository); its rules and indexes are deployed from there so the Cloud control
plane and hosted admin/store runtime use one reviewed ruleset.

1. Start Firebase emulators:

   ```bash
   pnpm firebase:emulators
   ```

   Emulator UI runs at [http://localhost:4000](http://localhost:4000).
   Firestore, Auth, Storage, and Functions use the ports in
   `.env.emulators.example`.

2. In another terminal, reset and seed deterministic mock data:

   ```bash
   pnpm firebase:reset
   ```

   Seeded login accounts:
   - Admin: `admin@local.konfi.dev` / `KonfiLocal123!`
   - Store customer: `customer@local.konfi.dev` / `KonfiLocal123!`

3. Run admin and store against emulators:

   ```bash
   pnpm dev:emulators
   ```

   The seed creates `local-store`, product/catalog fixtures, settings,
   customer/cart/order data, and placeholder storage content. Re-running
   `pnpm firebase:reset` deletes the seeded local collections and recreates the
   same stable IDs.

Use `.env.emulators.example` as the checked-in reference for required local
variables. Copy its values into a private local env file only if you need to
customize ports or app URLs.

### Deploying the project locally

The desktop app expects the admin app to be running first.

```bash
cd apps/admin
pnpm dev
```

In another terminal:

```bash
cd apps/desktop
pnpm build
pnpm dev:desktop
```

Package the desktop app:

```bash
cd apps/desktop
pnpm package
```

## Build and validation

Run tests:

```bash
pnpm test
```

Run a focused test:

```bash
pnpm vitest run price.test --config vitest.workspace.ts
```

Run lint:

```bash
pnpm lint
```

Run a CI-style build without real service credentials:

```bash
pnpm build:ci
```

Agent worktrees should prefer:

```bash
pnpm build:agent
```

When a local Next.js development server is already running, avoid `pnpm build`
and `pnpm build:ci`. Agent worktrees can still run `pnpm build:agent`.

## Environment configuration

Environment variables are shared from the repository root for the monorepo
scripts. Use the checked-in `.env.example` as a safe placeholder template and
copy it to `.env` for local development.

The checked-in `.env.ci` file contains placeholder build values only. It is not
intended for production deployment.

Production cooperation dedicated receivers accept direct app API transfers from
Konfi Cloud, the separately operated hosted control plane (not part of this
repository). Set `PRODUCTION_COOPERATION_APP_API_SECRET` in the admin
deployment to the same value configured on the sending control plane, and set
`PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET` to the callback secret that the
control plane verifies. Also set
`PRODUCTION_COOPERATION_CALLBACK_ALLOWED_ORIGINS` to the public control-plane
web origin that may receive callbacks. The
receiver exposes
`/api/production-cooperation/requests` for direct transfer and
`/[lng]/cooperation/review?requestId=...` for review.
Same-database `tenantCooperations` records must include paid `sourcePlanId` and
`targetPlanId` values (`starter`, `pro`, or `enterprise`); Free tenants are not
eligible cooperation participants. They must also grant explicit product access
with `productSharing.enabled` and `productSharing.productIds`; a partner
warehouse can only receive requests for products on that allowlist. Cooperation
item snapshots include selected attributes, required product attributes,
combination IDs, page/custom-size data, and advanced finishing selections so the
receiver can review production details without reading the source tenant order.

Dedicated customer deployments use the env groups in
[docs/deployment/dedicated-env-groups.md](docs/deployment/dedicated-env-groups.md)
and the rollout steps in
[docs/deployment/dedicated-customer-checklist.md](docs/deployment/dedicated-customer-checklist.md).
Validate a dedicated env export with:

```bash
pnpm env:validate:dedicated -- --env-file .env
```

## Deployment notes

Admin and store are designed for Vercel deployments. Firebase functions deploy
with Firebase tooling. Desktop releases are packaged and published manually
through electron-builder/GitHub Releases.

Public forks should not run deploy automation by default. The GitHub preview
deploy workflow requires repository variables that explicitly name the upstream
repository before deployment jobs run.

## License

Konfi is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE)
and [NOTICE](NOTICE).

Generated third-party API clients and API descriptions have separate provenance
notes in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
