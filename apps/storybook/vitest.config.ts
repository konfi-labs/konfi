import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dirname,
  plugins: [
    // Turns every story into a component test; reuses the Vite setup from
    // .storybook/main.ts (including the konfi app alias plugin).
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      storybookScript: "pnpm --filter @konfi/storybook dev",
    }),
  ],
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      provider: playwright({}),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
