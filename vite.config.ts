import { defaultExclude, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/store", import.meta.url)),
      "@konfi/utils": fileURLToPath(
        new URL("./packages/utils/src", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./setup-test.ts",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      ...defaultExclude,
      "apps/admin/**",
      "apps/desktop/**",
      "apps/store/**",
      "apps/storybook/**",
    ],
  },
});
