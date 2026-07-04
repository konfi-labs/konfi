---
description: "Storybook coverage for React components"
applyTo: "{apps/admin,apps/store,packages/components}/**/*.tsx"
---

# Storybook Coverage

- When creating a new reusable React component, add a Storybook story in the same change.
- When significantly changing an existing component's UI, update or add stories for the affected states.
- Prefer colocated `*.stories.tsx` files next to package/app components. Use `apps/storybook/src/stories` for cross-app examples or shared fixtures.
- Stories should use realistic Konfi content and include important states such as loading, empty, selected, disabled, long text, and light/dark contrast where relevant.
- Validate Storybook with `pnpm --dir apps/storybook exec tsc --noEmit -p tsconfig.json` and `pnpm --dir apps/storybook build`.