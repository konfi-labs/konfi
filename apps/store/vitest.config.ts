import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@/components",
        replacement: path.resolve(__dirname, "./app/[lng]/components"),
      },
      {
        find: "@/lib",
        replacement: path.resolve(__dirname, "./lib"),
      },
      {
        find: "@/theme",
        replacement: path.resolve(__dirname, "./theme"),
      },
      {
        find: "@/hooks",
        replacement: path.resolve(__dirname, "./hooks"),
      },
      {
        find: "@/context",
        replacement: path.resolve(__dirname, "./context"),
      },
      {
        find: "@/actions",
        replacement: path.resolve(__dirname, "./app/actions/index"),
      },
      {
        find: "@/i18n",
        replacement: path.resolve(__dirname, "./app/i18n"),
      },
      {
        find: "@konfi/utils",
        replacement: path.resolve(__dirname, "../../packages/utils/src"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./"),
      },
    ],
  },
  test: {
    name: "@konfi/store",
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "../../setup-test.ts")],
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "context/**/*.test.ts",
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
    ],
    exclude: ["node_modules/**", ".next/**"],
    hookTimeout: 30_000,
  },
});
