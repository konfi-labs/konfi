# @konfi/fakturownia

TypeScript client for the Fakturownia API, generated using Microsoft Kiota.

## Provenance

The checked-in API description is based on Fakturownia's public API
documentation. The generated client is included in the public repository to
preserve workspace developer experience and interoperability with the admin
integration.

Fakturownia names, API documentation text, endpoint descriptions, examples, and
marks remain attributable to Fakturownia and are subject to Fakturownia's
current API and brand/trademark terms. Inclusion in Konfi does not imply
Fakturownia endorsement or partnership.

## Installation

This package is part of the Konfi monorepo. It's automatically available when you install the workspace dependencies.

```bash
pnpm install
```

## Environment Variables

Add these to your `.env` file:

```env
FAKTUROWNIA_API_KEY=your_api_token_here
FAKTUROWNIA_SUBDOMAIN=your_account_prefix
```

- **FAKTUROWNIA_API_KEY**: Get this from Fakturownia Settings > Account Settings > Integration > API Authorization Code
- **FAKTUROWNIA_SUBDOMAIN**: Your account subdomain (e.g., `yourcompany` for `yourcompany.fakturownia.pl`)

## Usage

### Server-Side (Next.js Server Actions)

```typescript
"use server";

import {
  createFakturowniaClient,
  ApiKeyAuthenticationProvider,
  ApiKeyLocation,
  FetchRequestAdapter,
} from "@konfi/fakturownia";

export async function createInvoice() {
  // Setup authentication
  const authProvider = new ApiKeyAuthenticationProvider(
    process.env.FAKTUROWNIA_API_KEY!,
    "api_token",
    ApiKeyLocation.QueryParameter,
  );

  // Create adapter
  const adapter = new FetchRequestAdapter(authProvider);
  adapter.baseUrl = `https://${process.env.FAKTUROWNIA_SUBDOMAIN}.fakturownia.pl`;

  // Create client
  const client = createFakturowniaClient(adapter);

  // Create invoice
  const invoice = await client.invoicesJson.post({
    invoice: {
      kind: "vat",
      issue_date: "2024-01-15",
      sell_date: "2024-01-15",
      payment_to: "2024-01-30",
      buyer_name: "Example Customer",
      positions: [
        {
          name: "Product A",
          quantity: 2,
          tax: 23,
          total_price_gross: 100.0,
        },
      ],
    },
  });

  return invoice;
}
```

## API Coverage

This client provides full access to the Fakturownia API:

- **Invoices** - Create, read, update, delete invoices
- **Clients** - Manage customers
- **Products** - Manage product catalog
- **Payments** - Track payments
- **Warehouse Documents** - Manage inventory
- **Categories** - Organize items
- **Departments** - Multi-company support
- **And more...**

## Type Safety

The client is fully typed with TypeScript, providing autocomplete and type checking for all API calls.

## Documentation

For full Fakturownia API documentation, use upstream provider documentation:

- [Official API Docs](https://app.fakturownia.pl/api)
- [API GitHub](https://github.com/fakturownia/API)

See the root `THIRD_PARTY_NOTICES.md` file for generated-client provenance and
redistribution notes.

## Examples

See `/apps/admin/app/actions/fakturownia.ts` for a complete example of creating invoices from orders.
