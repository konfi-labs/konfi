import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "./vite.config.ts",
      "./apps/admin/vitest.config.ts",
      "./apps/desktop/vitest.config.ts",
      "./apps/store/vitest.config.ts",
    ],
  },
});
