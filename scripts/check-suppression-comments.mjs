#!/usr/bin/env node
// Fail the build when a hand-written file gains a new bare lint /
// type-check suppression.
//
// "Bare" means: an `eslint-disable*` comment without an inline
// ` -- explanation` description, or any `@ts-ignore`. A baseline file
// at scripts/suppression-baseline.json records the count of bare
// suppressions per file as of the last audit. Any file whose count
// exceeds the baseline fails the check; new files are only allowed
// if every suppression they add carries an explanation.
//
// See docs/tech-debt/suppressions.md for the inventory and policy.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const baselinePath = join(__dirname, "suppression-baseline.json");

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const eslintBaseline = baseline.eslintDisable ?? {};
const tsBaseline = baseline.tsSuppress ?? {};

// Minimum description length for an `eslint-disable* -- explanation` comment
// to count as documented. Kept short because the eslint convention already
// repeats the rule name; the description only needs to add real context.
const MIN_ESLINT_DESC_LENGTH = 5;
// Matches the `minimumDescriptionLength` set on `typescript/ban-ts-comment`
// in `.oxlintrc.json` so the script and oxlint agree on what "documented"
// means for `@ts-expect-error`.
const MIN_TS_DESC_LENGTH = 10;

const SCAN_DIRS = ["apps", "packages"];
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "dist-web",
  "build",
  "coverage",
  "out",
  "storybook-static",
  "client",
]);
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else if (stat.isFile()) {
      const dot = name.lastIndexOf(".");
      if (dot === -1) continue;
      if (!SOURCE_EXTS.has(name.slice(dot))) continue;
      yield full;
    }
  }
}

const ESLINT_DISABLE_RE = /eslint-disable(?:-next-line|-line)?\b([^\r\n*]*)/g;
const TS_IGNORE_RE = /@ts-ignore\b([^\r\n]*)/g;
const TS_EXPECT_RE = /@ts-expect-error\b([^\r\n]*)/g;

const issues = [];
const eslintCounts = {};
const tsCounts = {};

function describedAfterDoubleDash(rest) {
  const idx = rest.indexOf("--");
  if (idx === -1) return "";
  return rest
    .slice(idx + 2)
    .replace(/\*\/.*$/, "")
    .trim();
}

for (const root of SCAN_DIRS) {
  const abs = join(repoRoot, root);
  for (const file of walk(abs)) {
    const rel = relative(repoRoot, file).split(sep).join("/");
    const source = readFileSync(file, "utf8");

    let match;
    ESLINT_DISABLE_RE.lastIndex = 0;
    while ((match = ESLINT_DISABLE_RE.exec(source)) !== null) {
      const description = describedAfterDoubleDash(match[1] ?? "");
      if (description.length < MIN_ESLINT_DESC_LENGTH) {
        eslintCounts[rel] = (eslintCounts[rel] ?? 0) + 1;
      }
    }

    TS_IGNORE_RE.lastIndex = 0;
    while ((match = TS_IGNORE_RE.exec(source)) !== null) {
      tsCounts[rel] = (tsCounts[rel] ?? 0) + 1;
    }

    TS_EXPECT_RE.lastIndex = 0;
    while ((match = TS_EXPECT_RE.exec(source)) !== null) {
      const description = (match[1] ?? "")
        .replace(/\*\/.*$/, "")
        .replace(/^[\s:-]+/, "")
        .trim();
      if (description.length < MIN_TS_DESC_LENGTH) {
        tsCounts[rel] = (tsCounts[rel] ?? 0) + 1;
      }
    }
  }
}

for (const [file, count] of Object.entries(eslintCounts)) {
  const allowed = eslintBaseline[file] ?? 0;
  if (count > allowed) {
    issues.push(
      `eslint-disable: ${file} has ${count} bare suppression(s) (baseline allows ${allowed}). ` +
        `Add a "-- reason" description, fix the warning, or update scripts/suppression-baseline.json (and docs/tech-debt/suppressions.md).`,
    );
  }
}

for (const [file, count] of Object.entries(tsCounts)) {
  const allowed = tsBaseline[file] ?? 0;
  if (count > allowed) {
    issues.push(
      `ts suppression: ${file} has ${count} bare @ts-ignore / undocumented @ts-expect-error (baseline allows ${allowed}). ` +
        `Use @ts-expect-error with a description of at least 10 characters, fix the underlying type error, ` +
        `or update scripts/suppression-baseline.json (and docs/tech-debt/suppressions.md).`,
    );
  }
}

const stale = [];
for (const file of Object.keys(eslintBaseline)) {
  if (!(file in eslintCounts)) {
    stale.push(
      `eslint-disable baseline entry for ${file} is no longer needed (count is 0).`,
    );
  }
}
for (const file of Object.keys(tsBaseline)) {
  if (!(file in tsCounts)) {
    stale.push(
      `ts suppression baseline entry for ${file} is no longer needed (count is 0).`,
    );
  }
}

if (issues.length > 0) {
  console.error("Suppression check failed:\n");
  for (const issue of issues) console.error(`  - ${issue}`);
  if (stale.length > 0) {
    console.error("\nAdditionally, these baseline entries can be removed:");
    for (const note of stale) console.error(`  - ${note}`);
  }
  console.error("\nSee docs/tech-debt/suppressions.md for policy.");
  process.exit(1);
}

if (stale.length > 0) {
  console.error("Suppression baseline contains stale entries:\n");
  for (const note of stale) console.error(`  - ${note}`);
  console.error(
    "\nLower the count or remove the entry from scripts/suppression-baseline.json.",
  );
  process.exit(1);
}

console.log("Suppression baseline OK.");
