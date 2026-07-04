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
        find: "@/actions",
        replacement: path.resolve(__dirname, "./app/actions"),
      },
      {
        find: "@/i18n",
        replacement: path.resolve(__dirname, "./app/i18n"),
      },
      {
        find: "context",
        replacement: path.resolve(__dirname, "./context"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./"),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [path.resolve(__dirname, "../../setup-test.ts")],
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "lib/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    hookTimeout: 30_000,
  },
});
