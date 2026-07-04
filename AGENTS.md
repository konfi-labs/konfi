# Agent Instructions

## Project Overview

- Turborepo monorepo for the Konfi printing/e-commerce platform.
- Stack: React 19, Next.js 16 App Router, Chakra UI v3, Firebase 12.x,
  TypeScript 6, pnpm 11, Oxlint and Oxfmt.
- Apps: `apps/store` on port `3000`, `apps/admin` on port `3001`,
  `apps/desktop` as the Electron wrapper, and `apps/functions` for Firebase
  Functions and Genkit AI.

## Session Start

- A `SessionStart` hook runs `node scripts/agent-context.mjs` automatically for
  new, resumed, cleared, and compacted sessions. If hook output is missing, run
  `pnpm agent:context` manually. The script is read-only and prints branch,
  package-manager, changed files, common scripts, and listening local ports.
- Use `rg` or `rg --files` for discovery. On Windows, use
  `Get-Content -LiteralPath` for paths containing brackets such as `[lng]`.
- Treat `rg` exit code `1` as "no matches" unless the command was expected to
  produce required output.
- Check `package.json` before suggesting or changing dependency-specific code.

## Skills

Codex can select repo-local skills automatically. Important repeated workflows
have dedicated skills instead of being expanded in this file:

- `konfi-release-readiness`: dedicated release gates, production cooperation,
  same-database audits, and cross-repo contract readiness.
- `konfi-tenant-storefront`: hosted/dedicated storefront runtime, tenant
  channels, domains, plan gates, and mirrored admin/store surfaces.
- `konfi-payments-webhooks`: tenant payment configuration, checkout sessions,
  Stripe/Przelewy24 webhooks, and payment-provider tests.
- `konfi-pricing-preview-debugger`: dynamic pricing, provider import, preview
  quantities, stale prices, and `configuration not found` bugs.
- `product-design`: single entry point for shaping, implementing, reviewing, and
  hardening user-facing product/UI work. It routes to `konfi-ui-implementation`,
  `web-design-guidelines`, and `i18n` for admin/store UI, accessibility, Chakra
  patterns, and translated user-visible copy.
- `vercel-react-best-practices`, `next-best-practices`, and
  `next-cache-components`: React/Next.js component, App Router, data-fetching,
  and cache work.

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm vitest run <test-file-name> --config vitest.workspace.ts
pnpm build
pnpm build:ci
pnpm build:agent
pnpm lint
pnpm env:validate:dedicated -- --env-file .env.admin.production --scope admin
pnpm cooperation:audit:same-database -- --env-file .env.admin.production
pnpm release:audit:dedicated -- --admin-env-file .env.admin.production --store-env-file .env.store.production --functions-env-file .env.functions.production --cooperation-env-file .env.admin.production
```

- When a Next.js dev server is already running, do not run `pnpm build` or
  `pnpm build:ci`. In agent worktrees, prefer `pnpm build:agent`.
- For desktop work: start admin first with `cd apps/admin && pnpm dev`, then
  `cd apps/desktop && pnpm dev`.

## Code Rules

- Keep edits scoped. Do not rewrite unrelated files or revert user changes.
- Never use `any`; use precise types or `unknown`.
- Do not add `@ts-ignore`. `@ts-expect-error` needs a meaningful description.
- Use double quotes and semicolons. Let Oxfmt own formatting after semantic
  edits.
- Use workspace imports such as `@konfi/components`, `@konfi/types`,
  `@konfi/utils`, and `@konfi/firebase`; use `@/` for app-local imports.
- Prefer `es-toolkit` over lodash.
- Use Server Components by default. Add `"use client"` only for browser APIs,
  hooks, effects, or event handlers. Use `"use server"` for Server Actions.
- Before Next.js work, read the relevant docs in `node_modules/next/dist/docs/`.
- Before AI SDK work, read the relevant docs in `node_modules/ai/docs/`.

## Workflow SDK

- Before changing `"use workflow"` or `"use step"` code, read the installed
  Workflow docs in `node_modules/workflow/docs/` and the relevant Next.js docs
  in `node_modules/next/dist/docs/`. In pnpm workspaces, resolve the real
  package path under `node_modules/.pnpm/` if the top-level symlink is absent.
- Treat `"use workflow"` files as sandboxed VM code: keep value imports limited
  to Workflow primitives and workflow-safe helpers. Do not import
  `server-only`, Firebase Admin, Google auth/Vertex clients, AI SDK server
  clients, Node.js modules, or modules that import them.
- Import and call compiler-visible `"use step"` wrapper functions directly
  from workflow files so generated manifests, inspection tooling, and step
  tracking show real step nodes. Do not hand-write
  `globalThis[Symbol.for("WORKFLOW_USE_STEP")]` in source as a workaround for
  bundling issues; it can produce workflows that run with `0` inspectable
  steps.
- Keep step wrapper modules imported by workflows VM-safe too: no
  `server-only`, Firebase/Admin/Storage access, AI provider clients, Node.js
  modules, or CommonJS-dependent package value imports at module scope. Put
  those side effects in `*.server.ts` implementation modules and dynamic-import
  them from inside the `"use step"` function body.
- Do not type-import from server-heavy modules in workflow-visible files. The
  Workflow/Next compilation path can still walk those modules; put shared input
  and output shapes in VM-safe `*.types.ts` / `*.shared.ts` files instead.
- Next.js `serverExternalPackages` and `server-only` protect Next server/client
  boundaries; they do not make a dependency safe inside the Workflow VM and can
  still rely on native `require`. If a workflow fails with
  `require is not defined`, inspect the workflow file's value imports for a
  Node/CommonJS leak.
- Give AI and external HTTP calls inside workflow steps explicit timeouts. Steps
  retry automatically by default, so permanent failures such as malformed AI
  JSON, schema mismatches, missing required provider output, or unsupported
  input should throw `FatalError` rather than retrying and leaving the run
  looking stuck on the last AI step.
- Do not pass `timeout` or `abortSignal` to `@ai-sdk/workflow`
  `WorkflowAgent.stream` from inside `"use workflow"` functions. The AI SDK
  implements those options with global `AbortSignal`, which is not available in
  the Workflow VM; put provider/model timeouts in `"use step"` server code
  instead.
- Validate with `pnpm exec workflow validate` when available and focused
  `tsc`. After workflow-boundary changes, restart the affected dev server or
  start a fresh workflow run so stale compiled chunks are not reused. For local
  admin workflow inspection, run from `apps/admin` and set
  `WORKFLOW_LOCAL_BASE_URL=http://localhost:3001` or `PORT=3001`; the store app
  uses port `3000`.

## UI And i18n

- When shaping, editing, or reviewing user-facing UI, load
  `.agents/skills/product-design/SKILL.md` first. Use narrower UI skills only
  after product-design has set the request mode, surface, and references.
- Use Chakra props and theming, not custom CSS or inline styles.
- Prefer direct imports from `@chakra-ui/react`; do not introduce
  `NativeSelect` for new/refactored UI unless the surrounding surface already
  intentionally uses it.
- Import icons through the `MaterialSymbol` wrapper from `@konfi/components`.
- All user-visible UI copy must be translated with `useT()` and locale files in
  every existing locale directory for the touched app and namespace, for example
  `apps/admin/app/i18n/locales/*/order.json` or
  `apps/store/app/i18n/locales/*/translation.json`.
- When changing mirrored behavior, update all relevant admin/store,
  detail/list/preview, compact/full, and shared-wrapper surfaces in the same
  pass.

## Testing And Closeout

- Add or update focused tests for changed business logic, route handlers,
  pricing, payment, Firestore, provider import, or shared UI behavior.
- For reusable React components, add or update Storybook stories with realistic
  states. Validate Storybook with `pnpm --dir apps/storybook exec tsc --noEmit
-p tsconfig.json` and `pnpm --dir apps/storybook build` when relevant.
- When the work is tied to Linear, update the issue with result, verification,
  changed areas, and blockers before handing off.
