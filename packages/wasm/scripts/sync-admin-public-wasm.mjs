#!/usr/bin/env node

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));

const sourcePath = join(packageRoot, "dist", "wasm_bg.wasm");
const targetDirectory = join(repoRoot, "apps", "admin", "public", "wasm");
const targetPath = join(targetDirectory, "wasm_bg.wasm");

mkdirSync(targetDirectory, { recursive: true });
copyFileSync(sourcePath, targetPath);

console.log(`Synced ${sourcePath} -> ${targetPath}`);