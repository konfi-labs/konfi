# Contributing

Thanks for taking the time to improve Konfi.

## Development setup

1. Install Node.js 24 and pnpm 11.
2. Install dependencies from the repository root:

   ```bash
   pnpm install
   ```

3. Copy the shared monorepo environment example:

   ```bash
   cp .env.example .env
   ```

4. Start the web apps:

   ```bash
   pnpm dev
   ```

The store runs on <http://localhost:3000>. The admin app runs on
<http://localhost:3001>.

## Before opening a pull request

- Keep changes focused and avoid unrelated formatting churn.
- Run `pnpm format:check` and `pnpm lint` before opening a PR.
- Run focused Vitest coverage with
  `pnpm vitest run <test-file-name> --config vitest.workspace.ts`.
- Run `pnpm build:ci` when your change affects package boundaries, Next.js
  configuration, Firebase functions, or shared build behavior.
- Do not commit real `.env` files, credentials, customer data, production
  screenshots, or private supplier/order data.

## Code style

- Use TypeScript strict mode and avoid `any`.
- Use workspace imports such as `@konfi/components`, `@konfi/types`,
  `@konfi/utils`, and `@konfi/firebase`.
- Use Chakra UI props and existing theme tokens for UI changes.
- Keep user-visible strings in the existing translation files.
- Format touched files with Oxfmt instead of manually rewrapping code.

## Generated clients and external services

Several packages wrap generated or third-party service clients. Regenerate
clients from their source API specifications instead of editing generated
output by hand. Confirm each upstream API specification allows redistribution
before publishing derived clients or specs outside the repository.

Keep provider provenance in `THIRD_PARTY_NOTICES.md` up to date when adding or
regenerating API clients.
