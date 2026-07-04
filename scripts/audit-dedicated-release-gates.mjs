#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const credentialGroups = [
  {
    gate: "Admin and store Vercel smoke",
    message:
      "Set VERCEL_TOKEN before pulling production env files or checking protected Vercel deployments.",
    names: ["VERCEL_TOKEN"],
  },
  {
    gate: "Firebase functions/rules/index smoke",
    message:
      "Authenticate Firebase before deploying or smoking functions/rules/indexes; set FIREBASE_TOKEN or GOOGLE_APPLICATION_CREDENTIALS.",
    names: ["FIREBASE_TOKEN", "GOOGLE_APPLICATION_CREDENTIALS"],
  },
  {
    gate: "Konfi Cloud bridge smoke",
    message:
      "Set KONFI_CLOUD_BRIDGE_SMOKE_URL or pass --cloud-bridge-url before running the Cloud-to-dedicated bridge smoke.",
    names: ["KONFI_CLOUD_BRIDGE_SMOKE_URL"],
  },
];

function printHelp() {
  console.log(`Usage: node scripts/audit-dedicated-release-gates.mjs [options]

Options:
  --admin-env-file <path>        Exported production env file for apps/admin.
  --store-env-file <path>        Exported production env file for apps/store.
  --functions-env-file <path>    Exported production env file for Firebase functions.
  --cooperation-env-file <path>  Admin env file used for live same-database cooperation audit.
  --cloud-bridge-url <url>       Cloud bridge smoke URL or deployment URL to verify manually.
  --local-only                   Skip live credential and Firestore cooperation checks.
  --help                         Show this help.

Examples:
  pnpm release:audit:dedicated -- --admin-env-file .env.admin.production --store-env-file .env.store.production --functions-env-file .env.functions.production --cooperation-env-file .env.admin.production
  pnpm release:audit:dedicated -- --local-only --admin-env-file .env.admin.production --store-env-file .env.store.production --functions-env-file .env.functions.production
`);
}

function readNextValue(argv, index, name) {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

export function parseArgs(argv) {
  const result = {
    adminEnvFile: "",
    cloudBridgeUrl: "",
    cooperationEnvFile: "",
    functionsEnvFile: "",
    help: false,
    localOnly: false,
    storeEnvFile: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--local-only") {
      result.localOnly = true;
      continue;
    }

    if (arg === "--admin-env-file") {
      result.adminEnvFile = readNextValue(argv, index, "--admin-env-file");
      index += 1;
      continue;
    }

    if (arg.startsWith("--admin-env-file=")) {
      result.adminEnvFile = arg.slice("--admin-env-file=".length);
      continue;
    }

    if (arg === "--store-env-file") {
      result.storeEnvFile = readNextValue(argv, index, "--store-env-file");
      index += 1;
      continue;
    }

    if (arg.startsWith("--store-env-file=")) {
      result.storeEnvFile = arg.slice("--store-env-file=".length);
      continue;
    }

    if (arg === "--functions-env-file") {
      result.functionsEnvFile = readNextValue(
        argv,
        index,
        "--functions-env-file",
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--functions-env-file=")) {
      result.functionsEnvFile = arg.slice("--functions-env-file=".length);
      continue;
    }

    if (arg === "--cooperation-env-file") {
      result.cooperationEnvFile = readNextValue(
        argv,
        index,
        "--cooperation-env-file",
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--cooperation-env-file=")) {
      result.cooperationEnvFile = arg.slice("--cooperation-env-file=".length);
      continue;
    }

    if (arg === "--cloud-bridge-url") {
      result.cloudBridgeUrl = readNextValue(argv, index, "--cloud-bridge-url");
      index += 1;
      continue;
    }

    if (arg.startsWith("--cloud-bridge-url=")) {
      result.cloudBridgeUrl = arg.slice("--cloud-bridge-url=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function envFileIssue(label, envFile) {
  if (!envFile) {
    return {
      gate: "Dedicated env validation",
      message: `Pass --${label}-env-file with the exported production env file.`,
      severity: "error",
    };
  }

  if (!fs.existsSync(path.resolve(process.cwd(), envFile))) {
    return {
      gate: "Dedicated env validation",
      message: `Env file not found for ${label}: ${envFile}`,
      severity: "error",
    };
  }

  return null;
}

function hasAnyEnv(processEnv, names) {
  return names.some((name) => Boolean(processEnv[name]?.trim()));
}

function runCommand(command, args, runner) {
  const result = runner(command, args, {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    return {
      gate: "Dedicated release command",
      message: `${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`,
      severity: "error",
    };
  }

  return null;
}

export function auditDedicatedReleaseGates({
  options,
  processEnv = process.env,
  runner = spawnSync,
}) {
  const issues = [];
  const envFiles = [
    ["admin", options.adminEnvFile],
    ["store", options.storeEnvFile],
    ["functions", options.functionsEnvFile],
  ];

  for (const [label, envFile] of envFiles) {
    const issue = envFileIssue(label, envFile);

    if (issue) {
      issues.push(issue);
    }
  }

  if (issues.length === 0) {
    for (const [scope, envFile] of envFiles) {
      const issue = runCommand(
        process.execPath,
        [
          "scripts/validate-dedicated-env.mjs",
          "--env-file",
          envFile,
          "--scope",
          scope,
        ],
        runner,
      );

      if (issue) {
        issues.push(issue);
      }
    }
  }

  if (options.localOnly) {
    return issues;
  }

  if (!options.cooperationEnvFile) {
    issues.push({
      gate: "Same-database cooperation audit",
      message:
        "Pass --cooperation-env-file with the admin env file used for the live same-database cooperation audit.",
      severity: "error",
    });
  } else if (
    !fs.existsSync(path.resolve(process.cwd(), options.cooperationEnvFile))
  ) {
    issues.push({
      gate: "Same-database cooperation audit",
      message: `Cooperation env file not found: ${options.cooperationEnvFile}`,
      severity: "error",
    });
  } else {
    const issue = runCommand(
      process.execPath,
      [
        "scripts/audit-tenant-cooperations.mjs",
        "--env-file",
        options.cooperationEnvFile,
      ],
      runner,
    );

    if (issue) {
      issues.push(issue);
    }
  }

  for (const group of credentialGroups) {
    const hasCredential =
      hasAnyEnv(processEnv, group.names) ||
      (group.gate === "Konfi Cloud bridge smoke" &&
        Boolean(options.cloudBridgeUrl));

    if (!hasCredential) {
      issues.push({
        gate: group.gate,
        message: group.message,
        severity: "error",
      });
    }
  }

  return issues;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const issues = auditDedicatedReleaseGates({ options });
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  console.log("Konfi dedicated receiver release gate audit");

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning.gate}: ${warning.message}`);
    }
  }

  if (errors.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const error of errors) {
      console.log(`- ${error.gate}: ${error.message}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("OK: dedicated receiver release gates passed.");
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
