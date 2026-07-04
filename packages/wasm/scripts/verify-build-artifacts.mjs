#!/usr/bin/env node

import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));
const requiredArtifacts = [
  join(packageRoot, "dist", "wasm.js"),
  join(packageRoot, "dist", "wasm_bg.wasm"),
  join(packageRoot, "dist-web", "wasm.js"),
  join(packageRoot, "dist-web", "wasm.d.ts"),
  join(packageRoot, "dist-web", "wasm_bg.wasm"),
  join(repoRoot, "apps", "admin", "public", "wasm", "wasm_bg.wasm"),
];

const missingArtifacts = requiredArtifacts.filter((artifactPath) => {
  try {
    return !statSync(artifactPath).isFile();
  } catch {
    return true;
  }
});

if (missingArtifacts.length > 0) {
  console.error(
    [
      "Missing committed @konfi/wasm build artifacts:",
      ...missingArtifacts.map((artifactPath) => `- ${artifactPath}`),
      "",
      "Run `pnpm --filter @konfi/wasm generate` locally and commit the updated dist/public wasm files before deploying.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("Verified committed @konfi/wasm build artifacts.");
