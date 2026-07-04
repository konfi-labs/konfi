#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const PAID_PLAN_IDS = new Set(["starter", "pro", "enterprise"]);

function printHelp() {
  console.log(`Usage: node scripts/audit-tenant-cooperations.mjs [options]

Options:
  --env-file <path>  Env file to load before connecting. Defaults to .env.
  --help             Show this help.

Examples:
  pnpm cooperation:audit:same-database -- --env-file .env.admin.production
`);
}

function parseArgs(argv) {
  const result = {
    envFile: ".env",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--env-file") {
      result.envFile = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--env-file=")) {
      result.envFile = arg.slice("--env-file=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!result.envFile) {
    throw new Error("Missing value for --env-file.");
  }

  return result;
}

function stripInlineComment(value) {
  let quote = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];

    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? "" : quote || char;
      continue;
    }

    if (char === "#" && index > 0 && !quote && /\s/.test(previous ?? " ")) {
      return value.slice(0, index).trimEnd();
    }
  }

  return value;
}

function unquoteValue(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if (
    trimmed.length >= 2 &&
    ((first === '"' && last === '"') || (first === "'" && last === "'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  content.split(/\r?\n/).forEach((line, lineIndex) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trimStart()
      : trimmed;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const rawValue = normalized.slice(separatorIndex + 1);

    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(
        `Invalid env key "${key}" on line ${lineIndex + 1} in ${filePath}.`,
      );
    }

    if (process.env[key] === undefined) {
      process.env[key] = unquoteValue(stripInlineComment(rawValue));
    }
  });
}

function readEnv(key) {
  return process.env[key]?.trim() ?? "";
}

function requireEnv(key) {
  const value = readEnv(key);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function isPaidPlan(value) {
  return PAID_PLAN_IDS.has(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function isNonEmptyStringArray(value) {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === "string" && item.trim() !== "")
  );
}

function validateCooperation(id, data) {
  const errors = [];
  const warnings = [];
  const productSharing = data.productSharing;

  if (data.active !== true) {
    errors.push("active must be true");
  }

  if (!data.sourceTenantId || !data.targetTenantId) {
    errors.push("sourceTenantId and targetTenantId are required");
  } else if (data.sourceTenantId === data.targetTenantId) {
    warnings.push("sourceTenantId and targetTenantId are identical");
  }

  if (!isPaidPlan(data.sourcePlanId)) {
    errors.push("sourcePlanId must be starter, pro, or enterprise");
  }

  if (!isPaidPlan(data.targetPlanId)) {
    errors.push("targetPlanId must be starter, pro, or enterprise");
  }

  if (!productSharing || typeof productSharing !== "object") {
    errors.push("productSharing is required");
  } else {
    if (productSharing.enabled !== true) {
      errors.push("productSharing.enabled must be true");
    }

    if (!isNonEmptyStringArray(productSharing.productIds)) {
      errors.push("productSharing.productIds must contain at least one id");
    }
  }

  if (!isNonEmptyStringArray(data.targetWarehouseIds)) {
    warnings.push(
      "targetWarehouseIds is empty; fulfillment can match any target warehouse",
    );
  }

  if (!data.sourceParticipantId || !data.targetParticipantId) {
    warnings.push(
      "sourceParticipantId/targetParticipantId are missing; Cloud participant mapping may need manual verification",
    );
  }

  return { errors, id, warnings };
}

function loadFirebaseAdmin() {
  const requireFromAdmin = createRequire(
    new URL("../apps/admin/package.json", import.meta.url),
  );

  return {
    app: requireFromAdmin("firebase-admin/app"),
    firestore: requireFromAdmin("firebase-admin/firestore"),
  };
}

function initializeFirestore() {
  const {
    app: { cert, getApps, initializeApp },
    firestore: { getFirestore },
  } = loadFirebaseAdmin();
  const projectId = requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const clientEmail = requireEnv("ADMIN_FIREBASE_CLIENT_EMAIL");
  const privateKey = requireEnv("ADMIN_FIREBASE_SERVICE_ACCOUNT").replace(
    /\\n/g,
    "\n",
  );

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        clientEmail,
        privateKey,
        projectId,
      }),
      projectId,
    });
  }

  return getFirestore();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(process.cwd(), options.envFile);

  if (!fs.existsSync(envPath)) {
    throw new Error(`Env file not found: ${envPath}`);
  }

  loadEnvFile(envPath);

  const db = initializeFirestore();
  const snapshot = await db
    .collection("tenantCooperations")
    .where("status", "==", "ACTIVE")
    .where("transport", "==", "SAME_DATABASE")
    .get();

  const findings = snapshot.docs.map((documentSnapshot) =>
    validateCooperation(documentSnapshot.id, documentSnapshot.data()),
  );
  const invalid = findings.filter((finding) => finding.errors.length > 0);
  const warnings = findings.filter((finding) => finding.warnings.length > 0);

  console.log(`Same-database tenant cooperation audit: ${envPath}`);
  console.log(`Checked active SAME_DATABASE records: ${findings.length}`);

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const finding of warnings) {
      for (const warning of finding.warnings) {
        console.log(`- tenantCooperations/${finding.id}: ${warning}`);
      }
    }
  }

  if (invalid.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const finding of invalid) {
      for (const error of finding.errors) {
        console.log(`- tenantCooperations/${finding.id}: ${error}`);
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("OK: same-database tenant cooperation audit passed.");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
