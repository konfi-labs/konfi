#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../..");
const issues = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function* walkPackageJsons(dir) {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === ".next" ||
      name === ".turbo" ||
      name === "dist" ||
      name === "build" ||
      name === "coverage" ||
      name === "out" ||
      name === "storybook-static" ||
      name === ".deploy" ||
      name === ".deploy-meilisearch" ||
      name === "isolate"
    ) {
      continue;
    }

    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkPackageJsons(full);
    } else if (stat.isFile() && name === "package.json") {
      yield full;
    }
  }
}

function readWorkspacePackages() {
  const workspace = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const match = workspace.match(/^packages:\r?\n((?:\s+- .+\r?\n)+)/m);
  if (!match) return [];

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, ""))
    .filter(Boolean);
}

const rootPackage = readJson(join(repoRoot, "package.json"));
const workspacePackages = readWorkspacePackages();

if (rootPackage.packageManager?.startsWith("pnpm@11.") !== true) {
  issues.push(
    'Root package.json must declare packageManager starting with "pnpm@11.".',
  );
}

if (rootPackage.engines?.node !== ">=24") {
  issues.push('Root package.json must declare engines.node as ">=24".');
}

if (
  JSON.stringify(rootPackage.workspaces ?? []) !==
  JSON.stringify(workspacePackages)
) {
  issues.push(
    "Root package.json workspaces must match pnpm-workspace.yaml packages exactly.",
  );
}

const nvmrc = readFileSync(join(repoRoot, ".nvmrc"), "utf8").trim();
if (nvmrc !== "24") {
  issues.push('.nvmrc must pin the workspace Node.js major version to "24".');
}

const workspaceYaml = readFileSync(
  join(repoRoot, "pnpm-workspace.yaml"),
  "utf8",
);
if (!/^minimumReleaseAge:\s*[1-9]\d*\s*$/m.test(workspaceYaml)) {
  issues.push(
    "pnpm-workspace.yaml must explicitly configure minimumReleaseAge.",
  );
}

for (const packageJsonPath of walkPackageJsons(repoRoot)) {
  const rel = toPosix(relative(repoRoot, packageJsonPath));
  if (rel === "package.json") continue;

  const pkg = readJson(packageJsonPath);
  if ("packageManager" in pkg) {
    issues.push(`${rel} must not declare packageManager; keep it at the root.`);
  }
}

if (issues.length > 0) {
  console.error("Workspace invariant check failed:\n");
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log("Workspace invariants OK.");
