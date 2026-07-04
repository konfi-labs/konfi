import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };

const deployDirectory = resolve(process.cwd(), ".deploy-meilisearch");
const envFilePaths = [
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), ".env"),
];

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [name, ...valueParts] = line.split("=");
        const value = valueParts.join("=").trim();
        return [name.trim(), value.replace(/^['"]|['"]$/gu, "")];
      }),
  );
}

const fileEnv = Object.assign({}, ...envFilePaths.map(parseEnvFile));

function getConfigValue(name, alternatives = []) {
  const names = [name, ...alternatives];

  for (const candidate of names) {
    const value = process.env[candidate]?.trim() || fileEnv[candidate]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(
    `Missing ${name} for Meilisearch sync deployment. Set it in the environment or .env before running pnpm --dir apps/functions meilisearch:deploy-sync.`,
  );
}

const syncConfig = {
  firestoreDatabaseId: getConfigValue("FIRESTORE_DATABASE_ID", [
    "NEXT_PUBLIC_FIRESTORE_DATABASE_ID",
  ]),
  meilisearchHost: getConfigValue("MEILISEARCH_HOST"),
  region: getConfigValue("MEILISEARCH_SYNC_REGION"),
};

rmSync(deployDirectory, { force: true, recursive: true });

const pnpmArgs = [
  "exec",
  "tsup",
  "src/search/meilisearchSync.ts",
  "--format",
  "cjs",
  "--target",
  "node24",
  "--out-dir",
  ".deploy-meilisearch/dist",
  "--sourcemap",
  "--clean",
];
const buildCommand =
  process.platform === "win32"
    ? {
        command: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", "pnpm", ...pnpmArgs],
      }
    : { command: "pnpm", args: pnpmArgs };

const buildResult = spawnSync(buildCommand.command, buildCommand.args, {
  stdio: "inherit",
});

if (buildResult.error) {
  console.error("Failed to start Meilisearch sync build:", buildResult.error);
  process.exit(1);
}

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

writeFileSync(
  resolve(deployDirectory, "package.json"),
  `${JSON.stringify(
    {
      name: "@konfi/meilisearch-sync-functions",
      private: true,
      main: "./dist/meilisearchSync.js",
      engines: packageJson.engines,
      dependencies: {
        "firebase-admin": packageJson.dependencies["firebase-admin"],
        "firebase-functions": packageJson.dependencies["firebase-functions"],
      },
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  resolve(deployDirectory, ".env"),
  [
    `FIRESTORE_DATABASE_ID=${syncConfig.firestoreDatabaseId}`,
    `MEILISEARCH_HOST=${syncConfig.meilisearchHost}`,
    `MEILISEARCH_SYNC_REGION=${syncConfig.region}`,
    "",
  ].join("\n"),
);

console.log("Meilisearch sync deploy staging prepared in .deploy-meilisearch");
