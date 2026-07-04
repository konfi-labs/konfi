#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const STOREFRONT_PLAN_IDS = new Set(["pro", "enterprise"]);

function printHelp() {
  console.log(`Usage: node scripts/reconcile-tenant-channels.mjs [options]

Options:
  --env-file <path>   Env file to load before connecting. Defaults to .env.
  --tenant-id <id>    Reconcile only one tenant.
  --write             Persist tenantChannels writes. Defaults to dry-run.
  --help              Show this help.

Examples:
  pnpm storefront:reconcile:tenant-channels -- --env-file .env.admin.production
  pnpm storefront:reconcile:tenant-channels -- --env-file .env.admin.production --write
`);
}

function parseArgs(argv) {
  const result = {
    envFile: ".env",
    tenantId: "",
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--write") {
      result.write = true;
      continue;
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

    if (arg === "--tenant-id") {
      result.tenantId = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--tenant-id=")) {
      result.tenantId = arg.slice("--tenant-id=".length);
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

function toSlug(input) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function planHasStorefront(planId) {
  return STOREFRONT_PLAN_IDS.has(
    String(planId ?? "")
      .trim()
      .toLowerCase(),
  );
}

function tenantStorefrontEnabled(tenant) {
  if (tenant.moduleFlags?.storefront === false) {
    return false;
  }

  return (
    tenant.moduleFlags?.storefront === true || planHasStorefront(tenant.planId)
  );
}

function channelMirrorData(tenant, channel, fieldValue) {
  const channelName = String(channel.name ?? "").trim() || "Storefront";
  const active = channel.active !== false;

  return {
    createdAt: channel.createdAt ?? fieldValue.serverTimestamp(),
    currency: channel.currency,
    name: channelName,
    slug: toSlug(channelName) || toSlug(channel.id) || "channel",
    status: active ? "active" : "disabled",
    storefrontEnabled: tenantStorefrontEnabled(tenant),
    tenantId: tenant.id,
    updatedAt: fieldValue.serverTimestamp(),
  };
}

async function listTargetTenants(db, tenantId) {
  if (tenantId) {
    const snapshot = await db.collection("tenants").doc(tenantId).get();

    if (!snapshot.exists) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    return [{ id: snapshot.id, ...snapshot.data() }];
  }

  const snapshot = await db
    .collection("tenants")
    .where("status", "==", "ACTIVE")
    .get();

  return snapshot.docs
    .map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data(),
    }))
    .filter((tenant) => tenantStorefrontEnabled(tenant));
}

async function reconcileTenant(db, tenant, options, fieldValue) {
  const channelsSnapshot = await db
    .collection("channels")
    .where("tenantId", "==", tenant.id)
    .get();
  const writes = channelsSnapshot.docs.map((channelSnapshot) => {
    const channel = {
      id: channelSnapshot.id,
      ...channelSnapshot.data(),
    };

    return {
      id: channelSnapshot.id,
      mirror: channelMirrorData(tenant, channel, fieldValue),
    };
  });

  if (options.write && writes.length > 0) {
    const batch = db.batch();

    for (const write of writes) {
      batch.set(db.collection("tenantChannels").doc(write.id), write.mirror, {
        merge: true,
      });
    }

    await batch.commit();
  }

  return {
    channelCount: writes.length,
    tenantId: tenant.id,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(process.cwd(), options.envFile);

  if (!fs.existsSync(envPath)) {
    throw new Error(`Env file not found: ${envPath}`);
  }

  loadEnvFile(envPath);

  const {
    firestore: { FieldValue },
  } = loadFirebaseAdmin();
  const db = initializeFirestore();
  const tenants = await listTargetTenants(db, options.tenantId);
  const results = [];

  for (const tenant of tenants) {
    results.push(await reconcileTenant(db, tenant, options, FieldValue));
  }

  const totalChannels = results.reduce(
    (sum, result) => sum + result.channelCount,
    0,
  );

  console.log(
    `Tenant channel reconciliation ${options.write ? "write" : "dry-run"}: ${envPath}`,
  );
  console.log(`Checked tenants: ${results.length}`);
  console.log(`Runtime channels matched: ${totalChannels}`);

  for (const result of results) {
    console.log(`- ${result.tenantId}: ${result.channelCount} channel(s)`);
  }

  if (!options.write) {
    console.log("");
    console.log("Dry-run only. Re-run with --write to persist tenantChannels.");
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
