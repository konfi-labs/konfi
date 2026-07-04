# Dedicated Deployment Environment Groups

Dedicated deployments run one customer on one Firebase project plus separate
Vercel projects for the admin and store apps. They intentionally keep the
current single-tenant fallback behavior:

- `KONFI_DEPLOYMENT_MODE=dedicated`
- `NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE=dedicated`
- `KONFI_TENANT_ID=default`
- `KONFI_REQUIRE_TENANT_ID=false`
- `NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID=false`

If the deployment-mode variables are absent, the runtime still defaults to
`dedicated` and tenant `default`. Production dedicated env files should set
them explicitly so Vercel, Firebase functions, and local validation all agree.

## Validate an env file

Use the validator before changing Vercel or Firebase runtime variables:

```bash
pnpm env:validate:dedicated -- --env-file .env
pnpm env:validate:dedicated -- --env-file .env.production --scope admin
pnpm env:validate:dedicated -- --env-file .env.production --scope store
pnpm env:validate:dedicated -- --env-file .env.functions --scope functions
```

Use `--allow-placeholders` only for checked-in templates such as
`.env.example`:

```bash
pnpm env:validate:dedicated -- --env-file .env.example --allow-placeholders
```

When production cooperation uses same-database fulfillment, also audit the
active `tenantCooperations` records in the exact admin environment before
release:

```bash
pnpm release:audit:dedicated -- --admin-env-file .env.admin.production --store-env-file .env.store.production --functions-env-file .env.functions.production --cooperation-env-file .env.admin.production
pnpm cooperation:audit:same-database -- --env-file .env.admin.production
```

The combined release audit runs the admin/store/functions env validators,
runs the same-database cooperation audit when not in `--local-only` mode, and
checks that the Vercel/Firebase/Cloud bridge smoke gates have the required
credentials or URLs available. The cooperation audit is read-only. It fails
records that are active `SAME_DATABASE` cooperations but do not have paid
`sourcePlanId` / `targetPlanId` values or explicit `productSharing.enabled` /
`productSharing.productIds` access.

Deploy `apps/functions/firebase.json`, `apps/functions/firestore.rules`,
`apps/functions/firestore-indexes.json`, and `apps/functions/storage.rules`
only to dedicated customer Firebase projects. The shared hosted SaaS Firebase
project is managed by the separate Konfi Cloud control-plane repository (not
part of this repository); its rules and indexes are deployed from that
repository's `firebase.json` after the Cloud release audit passes.

## Shared dedicated group

Set this group everywhere: admin Vercel, store Vercel, Firebase functions, and
private local env files used for deployment.

| Variable                                             | Notes                                                                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KONFI_DEPLOYMENT_MODE`                              | Must be `dedicated`.                                                                                                                                       |
| `KONFI_TENANT_ID`                                    | Keep `default` unless data paths are migrated.                                                                                                             |
| `KONFI_REQUIRE_TENANT_ID`                            | Must be `false` in dedicated mode.                                                                                                                         |
| `NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE`                  | Must match `KONFI_DEPLOYMENT_MODE`.                                                                                                                        |
| `NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID`                | Must be `false` in dedicated mode.                                                                                                                         |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`                   | Firebase Auth domain used by the Web SDK; for custom app-domain OAuth flows, set this to the app domain and let helper rewrites proxy to Firebase Hosting. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`                    | Dedicated customer Firebase project id.                                                                                                                    |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`                | Dedicated customer Firebase Storage bucket.                                                                                                                |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`           | Firebase web app sender id.                                                                                                                                |
| `ADMIN_FIREBASE_CLIENT_EMAIL`                        | Service account email used by server code.                                                                                                                 |
| `ADMIN_FIREBASE_SERVICE_ACCOUNT`                     | Private key string, not the full JSON object.                                                                                                              |
| `STORE_URL` or `NEXT_PUBLIC_STORE_URL`               | Store canonical URL.                                                                                                                                       |
| `ADMIN_URL` or `NEXT_PUBLIC_ADMIN_URL`               | Admin canonical URL.                                                                                                                                       |
| `STORE_CHANNEL_ID` or `NEXT_PUBLIC_STORE_CHANNEL_ID` | Dedicated default channel.                                                                                                                                 |
| `NEXT_PUBLIC_CDN_URL`                                | Customer asset CDN host.                                                                                                                                   |
| `REVALIDATE_SECRET`                                  | Store revalidation route bearer token.                                                                                                                     |
| `CRON_SECRET`                                        | Vercel cron route bearer token.                                                                                                                            |

## Admin Vercel project

Set the shared dedicated group plus:

| Variable                                          | Notes                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_FIREBASE_ADMIN_API_KEY`              | Firebase web app API key for admin.                                                                                                                                |
| `NEXT_PUBLIC_FIREBASE_ADMIN_APP_ID`               | Firebase admin web app id.                                                                                                                                         |
| `SESSION_SECRET`                                  | OAuth/session signing secret.                                                                                                                                      |
| `ENCRYPTION_SECRET`                               | Recommended for integrations that store encrypted values.                                                                                                          |
| `PRODUCTION_COOPERATION_APP_API_SECRET`           | Required when receiving Konfi Cloud direct app API requests. Must match the Cloud web app secret.                                                                  |
| `PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET`    | Required when sending accept/decline callbacks to Konfi Cloud. Must match the Cloud callback secret.                                                               |
| `PRODUCTION_COOPERATION_CALLBACK_ALLOWED_ORIGINS` | Required when receiving Konfi Cloud direct app API requests with callbacks. Set to comma-separated public Cloud origins, for example `https://cloud.getkonfi.com`. |
| `RESEND_API_KEY`                                  | Required for admin-triggered email.                                                                                                                                |
| `NO_REPLY_EMAIL`                                  | Sender address.                                                                                                                                                    |
| `NOTIFICATIONS_EMAIL`                             | Recommended for internal notification recipients.                                                                                                                  |
| `REPORT_EMAIL`                                    | Recipient for admin-owned scheduled reports, including Fakturownia turnover and unpaid reports.                                                                    |
| `FAKTUROWNIA_API_KEY` and `FAKTUROWNIA_SUBDOMAIN` | Required when Fakturownia reports, webhooks, or admin invoice actions are enabled.                                                                                 |
| `SENTRY_ORG`                                      | Optional source-map upload and release tracking.                                                                                                                   |
| `SENTRY_PROJECT_ADMIN`                            | Optional Sentry project.                                                                                                                                           |
| `SENTRY_AUTH_TOKEN_ADMIN`                         | Optional source-map upload token.                                                                                                                                  |
| `NEXT_PUBLIC_SENTRY_DSN_ADMIN`                    | Optional browser/server reporting DSN.                                                                                                                             |

Customer-specific integrations belong only in the dedicated admin project:
`ALLEGRO_*`, `EPAKA_*`, `FAKTUROWNIA_*`, `POLKURIER_*`, `MICROSOFT_*`,
`GITHUB_*`, `MEILISEARCH_*`, `AI_GATEWAY_API_KEY`, and
`AI_REFERENCE_IMAGE_ALLOWED_HOSTS`.

When the dedicated admin deployment receives Fakturownia invoice-update
webhooks, set:

```txt
FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_TOKEN=<existing webhook token configured in Fakturownia>
FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_DEDICATED_MODE=true
FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_CHANNEL_IDS=<STORE_CHANNEL_ID>
```

Use a comma-separated channel list only for a dedicated admin deployment that
intentionally serves multiple Fakturownia-backed channels. Leave
`FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_DEDICATED_MODE` unset or `false` in shared
SaaS deployments; the global invoice-number webhook is disabled there.

### Production cooperation receiver seed

Before enabling a Konfi Cloud participant that targets this dedicated receiver,
create the receiver-side Firestore document that the direct app API validates:

```txt
productionCooperationParticipants/<Cloud participant id>
```

Required fields:

```json
{
  "allowedWarehouseIds": ["<warehouse id>"],
  "appApiEnabled": true,
  "id": "<Cloud participant id>",
  "productSharing": {
    "enabled": true,
    "productIds": ["<shared product id>"]
  },
  "status": "ACTIVE",
  "tenantId": "default",
  "type": "DEDICATED_INSTANCE"
}
```

Use the same `<Cloud participant id>` that Konfi Cloud stores as the target
participant. Keep `productSharing.productIds` limited to products the partner
may receive, and keep `allowedWarehouseIds` limited to warehouses that may
accept direct app API transfer requests.

## Store Vercel project

Set the shared dedicated group plus:

| Variable                                    | Notes                                                   |
| ------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_STORE_API_KEY`        | Firebase web app API key for store.                     |
| `NEXT_PUBLIC_FIREBASE_STORE_APP_ID`         | Firebase store web app id.                              |
| `NEXT_PUBLIC_FIREBASE_STORE_MEASUREMENT_ID` | Optional analytics measurement id.                      |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`            | Recommended for public anti-abuse checks.               |
| `NEXT_PUBLIC_FIREBASE_VAP_ID`               | Recommended for push messaging.                         |
| `NO_REPLY_EMAIL`                            | Sender address for order emails.                        |
| `NOTIFICATIONS_EMAIL`                       | Recommended for internal order notification recipients. |
| `STRIPE_*`                                  | Required only when Stripe checkout is enabled.          |
| `PRZELEWY24_*`                              | Required only when Przelewy24 checkout is enabled.      |
| `GOOGLE_PLACES_API_KEY`                     | Required only for Google Places routes.                 |
| `GOOGLE_ANALYTICS_PROPERTY_ID`              | Required only for Google Analytics server reporting.    |
| `NEXT_PUBLIC_SENTRY_DSN_STORE`              | Optional browser/server reporting DSN.                  |
| `SENTRY_PROJECT_STORE`                      | Optional Sentry project.                                |
| `SENTRY_AUTH_TOKEN_STORE`                   | Optional source-map upload token.                       |

Dedicated storefront branding and legal values are public single-customer
runtime config. They are safe for this dedicated store project, but unsafe for
shared SaaS runtime config:
`NEXT_PUBLIC_STORE_CHANNEL_ID`, `NEXT_PUBLIC_STORE_NAME`,
`NEXT_PUBLIC_STORE_DESCRIPTION`, `NEXT_PUBLIC_CDN_URL`, company/contact/bank
`NEXT_PUBLIC_*` values, and footer/social link values.

## Firebase functions runtime

Firebase functions use the dedicated Firebase project selected by the Firebase
CLI or deploy environment. Set the shared dedicated group plus:

| Variable                                 | Notes                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `STORAGE_BUCKET`                         | Set explicitly for function initialization.                               |
| `STORE_CHANNEL_ID`                       | Dedicated channel read by function triggers.                              |
| `STORE_URL`                              | Store URL used in emails and feeds.                                       |
| `ADMIN_URL`                              | Admin URL used in emails.                                                 |
| `RESEND_API_KEY`                         | Required for email-sending functions.                                     |
| `NO_REPLY_EMAIL`                         | Sender address.                                                           |
| `NOTIFICATIONS_EMAIL`                    | Recommended for internal notification recipients.                         |
| `RESEND_*_TEMPLATE_ID`                   | Required for each enabled email template.                                 |
| `MERCHANT_ID` and `MERCHANT_DATA_SOURCE` | Required only for Google Merchant feeds.                                  |
| `FAKTUROWNIA_*`                          | Required only for Firebase functions that still use Fakturownia directly. |
| `NEXT_PUBLIC_CDN_URL`                    | Used when functions emit product image URLs.                              |
| `FUNCTION_NAME`                          | Optional deploy-one selector. Leave unset for full deploys.               |

The validator accepts `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` and
`NEXT_PUBLIC_STORE_CHANNEL_ID` as combined-env fallbacks to preserve existing
local dedicated files, but production Firebase functions should set
`STORAGE_BUCKET` and `STORE_CHANNEL_ID` explicitly.

Do not copy dedicated customer branding, payment credentials, customer channel
ids, or integration secrets into a shared SaaS runtime. In SaaS, those values
must come from tenant/domain records, tenant-scoped secret storage, or a
customer-specific isolated deployment.
