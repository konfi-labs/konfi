# Dedicated Customer Deployment Checklist

Use this checklist when provisioning or updating a dedicated customer
deployment. It assumes the existing JAPA/default dedicated behavior: tenant
paths default to `default`, and tenant id enforcement remains disabled.

## 1. Firebase project

- Create or select the customer's Firebase project.
- Create the admin and store web apps in the same Firebase project.
- Enable Firestore, Storage, Auth, App Check, and any required Google Cloud APIs.
- Create a server service account for admin/store server code.
- Store only the service account private key in
  `ADMIN_FIREBASE_SERVICE_ACCOUNT`; do not paste the full JSON object.
- Confirm Storage bucket names match `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` and
  `STORAGE_BUCKET`.
- Deploy or verify Firestore indexes, Firestore rules, and Storage rules.
  Use `apps/functions/firebase.json` only for dedicated customer Firebase
  projects. The shared hosted SaaS Firebase project is managed by the separate
  Konfi Cloud control-plane repository and deploys its rules/indexes from
  there.

## 2. Vercel projects

- Create one Vercel project for `apps/admin`.
- Create one Vercel project for `apps/store`.
- Set the Node.js and pnpm versions from the repository requirements.
- Attach production domains and preview domains.
- Set the admin cron secret on the admin project before enabling cron routes.
- Keep admin-only secrets out of the store project unless store server routes
  explicitly require them.

## 3. Environment groups

- Fill the shared dedicated group from
  `docs/deployment/dedicated-env-groups.md`.
- Fill the admin Vercel group.
- Fill the store Vercel group.
- Fill the Firebase functions runtime group.
- For production cooperation receivers, set
  `PRODUCTION_COOPERATION_APP_API_SECRET` to the same direct app API secret used
  by Konfi Cloud web, and set `PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET` to
  the callback secret Konfi Cloud expects.
- Mark every customer-specific `NEXT_PUBLIC_*` branding/contact/channel value
  as dedicated-only in the deployment notes.
- Do not copy dedicated-only values into shared SaaS runtime config.

## 4. Validation

Run validation against the exact env file exported for each target:

```bash
pnpm release:audit:dedicated -- --admin-env-file .env.admin.production --store-env-file .env.store.production --functions-env-file .env.functions.production --cooperation-env-file .env.admin.production
pnpm env:validate:dedicated -- --env-file .env.admin.production --scope admin
pnpm env:validate:dedicated -- --env-file .env.store.production --scope store
pnpm env:validate:dedicated -- --env-file .env.functions.production --scope functions
pnpm cooperation:audit:same-database -- --env-file .env.admin.production
```

The combined release audit runs the three dedicated env validators, runs the
same-database cooperation audit when not in `--local-only` mode, and checks that
the Vercel/Firebase/Cloud bridge smoke gates have the required credentials or
URLs available. Use `--local-only` only for agent or CI validation that
intentionally lacks live release credentials.

For a single combined local deployment env:

```bash
pnpm env:validate:dedicated -- --env-file .env
```

Resolve every validation error before deploying. Review warnings explicitly,
especially `STORE_CHANNEL_ID`, `STORAGE_BUCKET`, and placeholder-looking
values.

## 5. Deployment

- Deploy the admin Vercel project.
- Deploy the store Vercel project.
- Deploy Firebase functions from `apps/functions` with the customer Firebase
  project selected.
- If deploying one function, set `FUNCTION_NAME` only for that deployment and
  clear it afterwards.
- Confirm Vercel cron routes are active only on the intended production admin
  project.

## 6. Smoke checks

- Sign in to admin with a Firebase admin account.
- Open the store production URL and confirm metadata, branding, product images,
  and CDN URLs are customer-specific.
- Place a low-risk test order or run the configured test checkout path.
- Confirm order emails use the customer's sender and templates.
- Confirm admin revalidation reaches the store.
- If production cooperation is enabled, seed
  `productionCooperationParticipants/<Cloud participant id>` in the dedicated
  Firestore database with `type: DEDICATED_INSTANCE`, `status: ACTIVE`,
  `appApiEnabled: true`, explicit `productSharing.enabled` /
  `productSharing.productIds`, and an `allowedWarehouseIds` allowlist before
  sending a Cloud bridge smoke request.
- Confirm Firebase function logs show the expected project, bucket, channel,
  and URLs.
- Confirm Sentry projects receive events only for the intended app.

## 7. Shared SaaS safety check

Before reusing any env file outside the dedicated deployment, remove or
tenant-scope all dedicated-only values:

- `NEXT_PUBLIC_STORE_CHANNEL_ID` and `STORE_CHANNEL_ID`
- company, legal, contact, bank, footer, and social `NEXT_PUBLIC_*` values
- customer CDN host
- payment provider secrets and webhook secrets
- email provider API key and template ids
- customer integration secrets such as Fakturownia, Polkurier, Epaka, Allegro,
  Microsoft, Google Merchant, Meilisearch, and GitHub tokens

Shared SaaS runtime config must resolve those values from tenant/domain records
or tenant-scoped secret storage, not from process-wide env variables.
