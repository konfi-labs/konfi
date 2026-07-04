import type { CurrencySettingsInput } from "@konfi/utils";
import {
  CURRENCIES_SETTINGS_DOC_ID,
  createInitialCurrencySettings,
  normalizeCurrencyCode,
  validateCurrencySettings,
} from "@konfi/utils";
import { getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-konfi-local";

interface InitializeCurrencySettingsOptions {
  channelId?: string;
  dryRun: boolean;
}

interface ChannelTarget {
  id: string;
  currency: string | null;
}

interface InitializationResult {
  channelId: string;
  status: "created" | "exists" | "would-create";
  defaultCurrencyCode: string;
}

function parseArgs(argv: string[]): InitializeCurrencySettingsOptions {
  const options: InitializeCurrencySettingsOptions = {
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--channel") {
      const channelId = argv[index + 1];

      if (!channelId) {
        throw new Error("--channel requires a channel id.");
      }

      options.channelId = channelId;
      index += 1;
      continue;
    }

    if (arg.startsWith("--channel=")) {
      options.channelId = arg.slice("--channel=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function ensureLocalEmulatorTarget(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "Refusing to initialize currency settings without FIRESTORE_EMULATOR_HOST. This script is for emulator seed/init only, not production backfills.",
    );
  }
}

function initializeFirebase(): void {
  if (getApps().length > 0) {
    return;
  }

  initializeApp({
    projectId: PROJECT_ID,
  });
}

function toChannelTarget(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ChannelTarget {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    currency: normalizeCurrencyCode(data.currency),
  };
}

async function getChannelTargets(
  options: InitializeCurrencySettingsOptions,
): Promise<ChannelTarget[]> {
  const db = getFirestore();

  if (options.channelId) {
    const snapshot = await db.doc(`channels/${options.channelId}`).get();

    if (!snapshot.exists) {
      throw new Error(`Channel ${options.channelId} does not exist.`);
    }

    return [
      {
        id: snapshot.id,
        currency: normalizeCurrencyCode(snapshot.data()?.currency),
      },
    ];
  }

  const channelsSnapshot = await db.collection("channels").get();
  return channelsSnapshot.docs.map(toChannelTarget);
}

function assertValidCurrencySettings(
  settings: CurrencySettingsInput,
  channelId: string,
): void {
  const issues = validateCurrencySettings(settings);

  if (issues.length === 0) {
    return;
  }

  const messages = issues.map((issue) => issue.message).join("; ");
  throw new Error(
    `Currency settings validation failed for channel ${channelId}: ${messages}`,
  );
}

async function initializeCurrencySettingsForChannel(
  target: ChannelTarget,
  options: InitializeCurrencySettingsOptions,
): Promise<InitializationResult> {
  const db = getFirestore();
  const settingsRef = db.doc(
    `channels/${target.id}/settings/${CURRENCIES_SETTINGS_DOC_ID}`,
  );
  const existingSnapshot = await settingsRef.get();

  if (existingSnapshot.exists) {
    const settings = existingSnapshot.data() as CurrencySettingsInput;
    assertValidCurrencySettings(settings, target.id);

    return {
      channelId: target.id,
      status: "exists",
      defaultCurrencyCode:
        settings.defaultCurrencyCode ?? target.currency ?? "",
    };
  }

  const settings = createInitialCurrencySettings(
    target.currency,
    Timestamp.now(),
  );
  assertValidCurrencySettings(settings, target.id);

  if (!options.dryRun) {
    await settingsRef.set(settings);
  }

  return {
    channelId: target.id,
    status: options.dryRun ? "would-create" : "created",
    defaultCurrencyCode: settings.defaultCurrencyCode,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  ensureLocalEmulatorTarget();
  initializeFirebase();

  const targets = await getChannelTargets(options);
  const results: InitializationResult[] = [];

  for (const target of targets) {
    results.push(await initializeCurrencySettingsForChannel(target, options));
  }

  const summary = results
    .map(
      (result) =>
        `${result.channelId}: ${result.status} (${result.defaultCurrencyCode})`,
    )
    .join(", ");

  console.log(
    `Currency settings initialization finished for ${results.length} channel(s): ${summary}`,
  );
}

main().catch((error: unknown) => {
  console.error("Currency settings initialization failed:", error);
  process.exitCode = 1;
});
