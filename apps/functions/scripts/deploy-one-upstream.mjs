import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [, , functionName, ...extraArgs] = process.argv;

if (!functionName) {
  console.error(
    "Usage: pnpm run deploy:upstream:one -- <functionName> [extra firebase deploy args...]",
  );
  process.exit(1);
}

const firebaseBinPath = resolve(
  process.cwd(),
  "node_modules/firebase-tools/lib/bin/firebase.js",
);

const deployResult = spawnSync(
  process.execPath,
  [
    firebaseBinPath,
    "deploy",
    "--config",
    "firebase.upstream.json",
    "--only",
    `functions:${functionName}`,
    ...extraArgs,
  ],
  {
    stdio: "inherit",
  },
);

process.exit(deployResult.status ?? 1);