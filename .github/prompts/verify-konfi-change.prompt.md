---
agent: agent
description: "Choose and run verification for a Konfi change"
---

Verify the current Konfi changes with the smallest useful checks.

Use this checklist:

1. Inspect changed files and identify affected app/package boundaries.
2. Select targeted verification:
   - Unit/logic: `pnpm vitest run <test-file-name> --config vitest.workspace.ts`
   - React component or app TypeScript: app/package typecheck where available.
   - Storybook component changes: `pnpm --dir apps/storybook exec tsc --noEmit -p tsconfig.json` and Storybook build when practical.
   - Broad confidence: `pnpm test`.
3. For Next.js changes, do not run `pnpm build` or `pnpm build:ci` if a local Next.js dev server is already running.
4. Report pass/fail with exact commands run, affected files, and any skipped verification.
5. If tests fail, diagnose the first root-cause failure instead of shotgun editing.
