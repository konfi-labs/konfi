#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const VALID_SCOPES = new Set(["all", "admin", "store", "functions"]);
const FALSE_VALUES = new Set(["", "0", "false", "no", "off"]);
// Guard values for the upstream hosted SaaS Firebase project. Forks can
// override these (or set them to empty strings to disable the guard) so the
// validator rejects their own shared project instead.
const SHARED_SAAS_FIREBASE_PROJECT_ID =
  process.env.KONFI_SHARED_SAAS_FIREBASE_PROJECT_ID ?? "konfi-cloud";
const SHARED_SAAS_STORAGE_BUCKET =
  process.env.KONFI_SHARED_SAAS_STORAGE_BUCKET ??
  "konfi-cloud.firebasestorage.app";

const DEDICATED_ONLY_RUNTIME_KEYS = [
  "NEXT_PUBLIC_STORE_CHANNEL_ID",
  "STORE_CHANNEL_ID",
  "NEXT_PUBLIC_LINKED_CHANNEL_IDS",
  "NEXT_PUBLIC_STORE_NAME",
  "NEXT_PUBLIC_STORE_DESCRIPTION",
  "NEXT_PUBLIC_CDN_URL",
  "NEXT_PUBLIC_FILES_MAIL",
  "NEXT_PUBLIC_SUPPORT_MAIL",
  "NEXT_PUBLIC_CONTACT_MAIL",
  "LONG_COMPANY_NAME",
  "SHORT_COMPANY_NAME",
  "COMPANY_DESCRIPTION",
  "COMPANY_MAIN_COLOR",
  "NEXT_PUBLIC_LEGAL_COMPANY_NAME",
  "NEXT_PUBLIC_SHORT_COMPANY_NAME",
  "NEXT_PUBLIC_LONG_COMPANY_NAME",
  "NEXT_PUBLIC_COMPANY_DESCRIPTION",
  "NEXT_PUBLIC_COMPANY_MAIN_COLOR",
  "NEXT_PUBLIC_COMPANY_SECONDARY_COLOR",
  "NEXT_PUBLIC_COMPANY_STREET_ADDRESS",
  "NEXT_PUBLIC_COMPANY_CITY",
  "NEXT_PUBLIC_COMPANY_POSTAL_CODE",
  "NEXT_PUBLIC_COMPANY_ADDRESS_LOCALITY",
  "NEXT_PUBLIC_COMPANY_PHONE_NUMBER",
  "NEXT_PUBLIC_COMPANY_MAIL",
  "NEXT_PUBLIC_COMPANY_COUNTRY_CODE",
  "NEXT_PUBLIC_VAT_ID",
  "NEXT_PUBLIC_BANK_NAME",
  "NEXT_PUBLIC_BANK_ACCOUNT_NUMBER",
  "NEXT_PUBLIC_FACEBOOK_NAME",
  "NEXT_PUBLIC_INSTAGRAM_NAME",
  "NEXT_PUBLIC_FOOTER_ADDIITIONAL_LINK",
  "NEXT_PUBLIC_FOOTER_ADDIITIONAL_LINK_TEXT",
  "NEXT_PUBLIC_FOOTER_ADDIITIONAL_LINK_IMAGE",
];

const SHARED_REQUIRED_GROUPS = [
  {
    name: "dedicated tenancy",
    required: [
      "KONFI_DEPLOYMENT_MODE",
      "KONFI_TENANT_ID",
      "KONFI_REQUIRE_TENANT_ID",
      "NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE",
      "NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID",
    ],
  },
  {
    name: "Firebase client project",
    required: [
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    ],
  },
  {
    name: "Firebase Admin SDK",
    required: ["ADMIN_FIREBASE_CLIENT_EMAIL", "ADMIN_FIREBASE_SERVICE_ACCOUNT"],
  },
  {
    name: "dedicated app URLs",
    oneOf: [
      ["STORE_URL", "NEXT_PUBLIC_STORE_URL"],
      ["ADMIN_URL", "NEXT_PUBLIC_ADMIN_URL"],
    ],
  },
  {
    name: "dedicated channel and assets",
    oneOf: [["STORE_CHANNEL_ID", "NEXT_PUBLIC_STORE_CHANNEL_ID"]],
    required: ["NEXT_PUBLIC_CDN_URL"],
  },
  {
    name: "revalidation and scheduled jobs",
    required: ["REVALIDATE_SECRET", "CRON_SECRET"],
  },
];

const SCOPE_GROUPS = {
  admin: [
    {
      name: "admin Firebase client",
      required: [
        "NEXT_PUBLIC_FIREBASE_ADMIN_API_KEY",
        "NEXT_PUBLIC_FIREBASE_ADMIN_APP_ID",
      ],
    },
    {
      name: "admin app URLs",
      oneOf: [
        ["ADMIN_URL", "NEXT_PUBLIC_ADMIN_URL"],
        ["STORE_URL", "NEXT_PUBLIC_STORE_URL"],
      ],
    },
    {
      name: "admin session and integrations",
      required: [
        "SESSION_SECRET",
        "PRODUCTION_COOPERATION_APP_API_SECRET",
        "PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET",
        "PRODUCTION_COOPERATION_CALLBACK_ALLOWED_ORIGINS",
      ],
      recommended: ["ENCRYPTION_SECRET"],
    },
    {
      name: "admin email delivery",
      required: ["RESEND_API_KEY", "NO_REPLY_EMAIL"],
      recommended: ["NOTIFICATIONS_EMAIL"],
    },
    {
      name: "admin Fakturownia invoice webhook",
      recommended: [
        "FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_TOKEN",
        "FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_DEDICATED_MODE",
        "FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_CHANNEL_IDS",
      ],
    },
    {
      name: "admin Fakturownia scheduled reports",
      required: [
        "REPORT_EMAIL",
        "FAKTUROWNIA_API_KEY",
        "FAKTUROWNIA_SUBDOMAIN",
      ],
    },
    {
      name: "admin integration secret keyring",
      recommended: [
        "KONFI_INTEGRATION_SECRETS_KEYRING",
        "KONFI_INTEGRATION_SECRETS_ACTIVE_KEY_VERSION",
      ],
    },
    {
      name: "admin social scheduler (Meta)",
      recommended: [
        "NEXT_PUBLIC_SOCIAL_SCHEDULER_ENABLED",
        "META_APP_ID",
        "META_APP_SECRET",
      ],
    },
  ],
  store: [
    {
      name: "store Firebase client",
      required: [
        "NEXT_PUBLIC_FIREBASE_STORE_API_KEY",
        "NEXT_PUBLIC_FIREBASE_STORE_APP_ID",
      ],
    },
    {
      name: "store public metadata",
      required: [
        "NEXT_PUBLIC_LEGAL_COMPANY_NAME",
        "NEXT_PUBLIC_SHORT_COMPANY_NAME",
        "NEXT_PUBLIC_COMPANY_MAIL",
      ],
    },
    {
      name: "store checkout and notifications",
      required: ["NO_REPLY_EMAIL"],
      recommended: [
        "NOTIFICATIONS_EMAIL",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "PRZELEWY24_API_KEY",
        "PRZELEWY24_CRC",
        "PRZELEWY24_POS_ID",
      ],
    },
    {
      name: "store public app protection",
      recommended: [
        "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
        "NEXT_PUBLIC_FIREBASE_VAP_ID",
      ],
    },
  ],
  functions: [
    {
      name: "functions Firebase runtime",
      oneOf: [
        ["STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"],
        ["STORE_CHANNEL_ID", "NEXT_PUBLIC_STORE_CHANNEL_ID"],
      ],
    },
    {
      name: "functions app URLs",
      required: ["STORE_URL", "ADMIN_URL"],
    },
    {
      name: "functions email delivery",
      required: ["RESEND_API_KEY", "NO_REPLY_EMAIL"],
      recommended: ["NOTIFICATIONS_EMAIL"],
    },
    {
      name: "functions catalog feeds",
      recommended: ["MERCHANT_ID", "MERCHANT_DATA_SOURCE"],
    },
    {
      name: "functions invoicing",
      recommended: [
        "FAKTUROWNIA_API_KEY",
        "FAKTUROWNIA_SUBDOMAIN",
        "FAKTUROWNIA_INVOICE_UPDATE_WEBHOOK_TOKEN",
      ],
    },
  ],
};

function printHelp() {
  console.log(`Usage: node scripts/validate-dedicated-env.mjs [options]

Options:
  --env-file <path>        Env file to validate. Defaults to .env.
  --scope <name>           all, admin, store, or functions. Defaults to all.
  --allow-placeholders     Allow demo/placeholder values in required keys.
  --help                   Show this help.

Examples:
  pnpm env:validate:dedicated -- --env-file .env
  pnpm env:validate:dedicated -- --env-file .env.production --scope store
  pnpm env:validate:dedicated -- --env-file .env.example --allow-placeholders
`);
}

function parseArgs(argv) {
  const result = {
    allowPlaceholders: false,
    envFile: ".env",
    scope: "all",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--allow-placeholders") {
      result.allowPlaceholders = true;
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

    if (arg === "--scope") {
      result.scope = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--scope=")) {
      result.scope = arg.slice("--scope=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!VALID_SCOPES.has(result.scope)) {
    throw new Error(
      `Invalid --scope "${result.scope}". Expected all, admin, store, or functions.`,
    );
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

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const env = new Map();

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

    env.set(key, unquoteValue(stripInlineComment(rawValue)));
  });

  return env;
}

function readValue(env, key) {
  return env.get(key)?.trim() ?? "";
}

function hasValue(env, key) {
  return readValue(env, key).length > 0;
}

function hasRequiredValue(env, key, options) {
  return hasValue(env, key) || (options.allowPlaceholders && env.has(key));
}

function isFalseLike(value) {
  return FALSE_VALUES.has(value.trim().toLowerCase());
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    normalized.includes("replace-me") ||
    normalized.includes("replace-with") ||
    normalized.includes("example.com") ||
    normalized.includes("demo-") ||
    normalized === "demo" ||
    normalized === "placeholder" ||
    /^0{8,}$/.test(normalized.replace(/[^0-9]/g, "")) ||
    /^g-x+$/.test(normalized)
  );
}

function validateRequiredKey(env, key, groupName, errors, warnings, options) {
  if (!env.has(key)) {
    errors.push(`${groupName}: missing ${key}`);
    return;
  }

  if (!hasValue(env, key)) {
    if (!options.allowPlaceholders) {
      errors.push(`${groupName}: missing ${key}`);
    }

    return;
  }

  if (!options.allowPlaceholders && isPlaceholder(readValue(env, key))) {
    warnings.push(`${groupName}: ${key} still looks like a placeholder`);
  }
}

function validateGroup(env, group, errors, warnings, options) {
  for (const key of group.required ?? []) {
    validateRequiredKey(env, key, group.name, errors, warnings, options);
  }

  for (const alternatives of group.oneOf ?? []) {
    if (alternatives.some((key) => hasRequiredValue(env, key, options))) {
      continue;
    }

    errors.push(
      `${group.name}: provide one of ${alternatives.map((key) => key).join(", ")}`,
    );
  }

  for (const key of group.recommended ?? []) {
    if (!hasValue(env, key)) {
      warnings.push(`${group.name}: ${key} is not set`);
    }
  }
}

function selectedGroups(scope) {
  if (scope === "all") {
    return [
      ...SHARED_REQUIRED_GROUPS,
      ...SCOPE_GROUPS.admin,
      ...SCOPE_GROUPS.store,
      ...SCOPE_GROUPS.functions,
    ];
  }

  return [...SHARED_REQUIRED_GROUPS, ...SCOPE_GROUPS[scope]];
}

function validateDeploymentMode(env, errors, warnings) {
  const serverMode = readValue(env, "KONFI_DEPLOYMENT_MODE") || "dedicated";
  const publicMode =
    readValue(env, "NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE") || serverMode;
  const normalizedServerMode = serverMode.toLowerCase();
  const normalizedPublicMode = publicMode.toLowerCase();
  const requireTenantId = readValue(env, "KONFI_REQUIRE_TENANT_ID");
  const publicRequireTenantId = readValue(
    env,
    "NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID",
  );

  if (normalizedServerMode !== "dedicated") {
    errors.push(
      `KONFI_DEPLOYMENT_MODE must be dedicated for this validator; got ${serverMode}.`,
    );
  }

  if (normalizedPublicMode !== "dedicated") {
    errors.push(
      `NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE must be dedicated for dedicated deployments; got ${publicMode}.`,
    );
  }

  if (normalizedServerMode !== normalizedPublicMode) {
    errors.push(
      "KONFI_DEPLOYMENT_MODE and NEXT_PUBLIC_KONFI_DEPLOYMENT_MODE must match.",
    );
  }

  if (requireTenantId && !isFalseLike(requireTenantId)) {
    errors.push(
      "KONFI_REQUIRE_TENANT_ID must be false or unset in dedicated mode.",
    );
  }

  if (publicRequireTenantId && !isFalseLike(publicRequireTenantId)) {
    errors.push(
      "NEXT_PUBLIC_KONFI_REQUIRE_TENANT_ID must be false or unset in dedicated mode.",
    );
  }

  const tenantId = readValue(env, "KONFI_TENANT_ID") || "default";
  if (tenantId !== "default") {
    warnings.push(
      `KONFI_TENANT_ID is "${tenantId}". Dedicated deployments currently default to "default"; only change this with a data migration plan.`,
    );
  }

  const saasMode =
    normalizedServerMode === "saas" || normalizedPublicMode === "saas";
  const unsafeKeys = DEDICATED_ONLY_RUNTIME_KEYS.filter((key) =>
    hasValue(env, key),
  );

  if (saasMode && unsafeKeys.length > 0) {
    errors.push(
      `Dedicated-only runtime keys are set in SaaS mode: ${unsafeKeys.join(", ")}.`,
    );
  }

  if (
    !hasValue(env, "STORE_CHANNEL_ID") &&
    hasValue(env, "NEXT_PUBLIC_STORE_CHANNEL_ID")
  ) {
    warnings.push(
      "STORE_CHANNEL_ID is not set. Firebase functions can fall back during validation, but production function triggers read STORE_CHANNEL_ID directly.",
    );
  }

  if (
    !hasValue(env, "STORAGE_BUCKET") &&
    hasValue(env, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET")
  ) {
    warnings.push(
      "STORAGE_BUCKET is not set. Firebase functions can fall back during validation, but production function initialization reads STORAGE_BUCKET directly.",
    );
  }
}

function validateFirebaseAdminServiceAccount(env, warnings) {
  const rawValue = readValue(env, "ADMIN_FIREBASE_SERVICE_ACCOUNT");

  if (!rawValue || rawValue.includes("BEGIN PRIVATE KEY")) {
    return;
  }

  if (rawValue.trim().startsWith("{")) {
    warnings.push(
      "ADMIN_FIREBASE_SERVICE_ACCOUNT looks like a full JSON service account. The admin and store apps currently expect the private key string.",
    );
  }
}

function validateDedicatedFirebaseTarget(env, errors) {
  const projectId = readValue(env, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const storageBuckets = [
    readValue(env, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    readValue(env, "STORAGE_BUCKET"),
  ].filter(Boolean);

  if (
    SHARED_SAAS_FIREBASE_PROJECT_ID &&
    projectId === SHARED_SAAS_FIREBASE_PROJECT_ID
  ) {
    errors.push(
      `NEXT_PUBLIC_FIREBASE_PROJECT_ID must not be ${SHARED_SAAS_FIREBASE_PROJECT_ID} in a dedicated deployment. Shared hosted SaaS rules/indexes are deployed from the control-plane repository, not from here.`,
    );
  }

  if (
    SHARED_SAAS_STORAGE_BUCKET &&
    storageBuckets.includes(SHARED_SAAS_STORAGE_BUCKET)
  ) {
    errors.push(
      `Dedicated deployments must not target ${SHARED_SAAS_STORAGE_BUCKET}. Shared hosted SaaS Storage rules are deployed from the control-plane repository, not from here.`,
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(process.cwd(), options.envFile);

  if (!fs.existsSync(envPath)) {
    throw new Error(`Env file not found: ${envPath}`);
  }

  const env = parseEnvFile(envPath);
  const errors = [];
  const warnings = [];

  validateDeploymentMode(env, errors, warnings);
  validateFirebaseAdminServiceAccount(env, warnings);
  validateDedicatedFirebaseTarget(env, errors);

  for (const group of selectedGroups(options.scope)) {
    validateGroup(env, group, errors, warnings, options);
  }

  console.log(`Dedicated env validation: ${envPath}`);
  console.log(`Scope: ${options.scope}`);

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const error of errors) {
      console.log(`- ${error}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("OK: dedicated env validation passed.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
