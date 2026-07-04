import "server-only";

import {
  getVertexClient,
  getVertexThinkingProviderOptions,
} from "./server-vertex";
import { runMeteredAdminAiText } from "@/lib/ai/metered-text";
import { detectChanges } from "@/lib/change-diff";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type { Change } from "@konfi/types";
import { DEFAULT_LOCALE, EntityType, Locale } from "@konfi/types";
import { MODELS } from "@konfi/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { ChangeSnapshot } from "@/lib/change-snapshot";

const UNIVERSAL_IGNORE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "timestamp",
  "keywords",
  "id",
]);

const ENTITY_IGNORE_FIELDS: Partial<Record<EntityType, readonly string[]>> = {
  [EntityType.Product]: [
    "averageRating",
    "linkedChannels",
    "linkedWarehouses",
    "channelId",
    "threeDModel",
    "difficulty",
    "prefferedUnit",
  ],
  [EntityType.Customer]: ["legacyMigratedAt", "linkedAuthId"],
  [EntityType.Attribute]: ["trackStock", "calculateStockFromSheet"],
  [EntityType.ProductPrice]: ["productId", "channelId", "isDefault"],
  [EntityType.ProductType]: ["toChannel"],
};

export interface DetectAndDescribeOptions {
  entityType: EntityType | string;
  context?: string;
  entityId?: string;
  channelId?: string;
}

export interface ChangeDescriptionResult {
  hasChanges: boolean;
  changeCount: number;
  descriptions: Record<Locale, string>;
  timestamp: Timestamp;
  entityType: string;
  entityId?: string;
  channelId?: string;
}

interface ChangeSignificanceResult {
  shouldGenerate: boolean;
  reason?: string;
  significantChangeCount?: number;
  filteredChanges: Change[];
}

function getDb() {
  return getAdminDb();
}

function getTranslationLocales(): Locale[] {
  return Object.values(Locale).filter((locale) => locale !== DEFAULT_LOCALE);
}

function getIgnoredFields(entityType: EntityType | string): Set<string> {
  return new Set([
    ...UNIVERSAL_IGNORE_FIELDS,
    ...(ENTITY_IGNORE_FIELDS[entityType as EntityType] ?? []),
  ]);
}

function isIgnoredChange(change: Change, fieldsToIgnore: Set<string>): boolean {
  const rootField = change.path[0];

  return typeof rootField === "string" && fieldsToIgnore.has(rootField);
}

async function shouldGenerateChangeLog(
  changes: Change[],
  entityType: EntityType | string,
  channelId?: string,
): Promise<ChangeSignificanceResult> {
  const fieldsToIgnore = getIgnoredFields(entityType);
  const filteredChanges = changes.filter(
    (change) => !isIgnoredChange(change, fieldsToIgnore),
  );

  if (filteredChanges.length === 0) {
    return {
      shouldGenerate: false,
      reason: "Only ignored technical fields changed",
      significantChangeCount: 0,
      filteredChanges,
    };
  }

  const schema = z.object({
    shouldGenerate: z.boolean(),
    reason: z.string().optional(),
    significantChangeCount: z.number().optional(),
  });
  const fieldsJson = JSON.stringify(Array.from(fieldsToIgnore));
  const changesJson = JSON.stringify(filteredChanges, null, 2);
  const system = `You are a change significance analyzer for a business system. Determine if detected changes warrant a human-readable change log entry.

Always skip timestamp-only updates, auto-calculated fields, internal metadata, and fields in the ignore list.
Always include status, visibility, core data, financial data, quantity, inventory, user-facing content, business relationships, and behavior-affecting settings.

Return only JSON matching the requested schema.`;
  const prompt = `Entity type: ${entityType}

Fields to ignore: ${fieldsJson}

Changes to analyze:
${changesJson}

Analyze these changes and determine if a change log entry should be generated.`;

  try {
    const vertex = await getVertexClient();
    const { output } = await runMeteredAdminAiText({
      channelId,
      input: { prompt, system },
      model: MODELS.GEMINI_3_FLASH_LITE,
      provider: "google-vertex",
      run: () =>
        generateText({
          model: vertex(MODELS.GEMINI_3_FLASH_LITE),
          output: Output.object({ schema }),
          providerOptions: getVertexThinkingProviderOptions({
            thinkingLevel: "minimal",
          }),
          system,
          prompt,
          temperature: 0.1,
        }),
      source: "admin-action",
    });

    return {
      shouldGenerate: output.shouldGenerate,
      reason: output.reason,
      significantChangeCount:
        output.significantChangeCount ?? filteredChanges.length,
      filteredChanges,
    };
  } catch (error) {
    console.error("[changeDescriptions] Failed to check significance:", error);
    return {
      shouldGenerate: filteredChanges.length > 0,
      reason: "Fallback: AI significance check failed",
      significantChangeCount: filteredChanges.length,
      filteredChanges,
    };
  }
}

async function generateChangeDescription(
  changes: Change[],
  entityType: EntityType | string,
  channelId?: string,
): Promise<string> {
  const localeNames: Record<Locale, string> = {
    [Locale.cs]: "Czech",
    [Locale.de]: "German",
    [Locale.en]: "English",
    [Locale.fr]: "French",
    [Locale.pl]: "Polish",
    [Locale.sk]: "Slovak",
    [Locale.uk]: "Ukrainian",
  };
  const targetLanguage = localeNames[DEFAULT_LOCALE];
  const changesJson = JSON.stringify(changes, null, 2);
  const system = `You create concise, readable descriptions of system changes.
Transform technical JSON changes into natural ${targetLanguage}.
Use past tense, group related changes, omit technical fields, and keep the description to at most 2-3 sentences.
Return only the description text.`;
  const prompt = `Entity type: ${entityType}

Changes:
${changesJson}

  Generate a concise readable description in ${targetLanguage}.`;
  const vertex = await getVertexClient();
  const { text } = await runMeteredAdminAiText({
    channelId,
    input: { prompt, system },
    model: MODELS.GEMINI_3_FLASH_LITE,
    provider: "google-vertex",
    run: () =>
      generateText({
        model: vertex(MODELS.GEMINI_3_FLASH_LITE),
        system,
        prompt,
        temperature: 0.3,
      }),
    source: "admin-action",
  });
  const description = text.trim();

  if (!description) {
    throw new Error("AI returned an empty change description.");
  }

  return description;
}

async function translateChangeDescription(
  description: string,
  targetLocale: Locale,
  channelId?: string,
): Promise<string> {
  if (targetLocale === DEFAULT_LOCALE) {
    return description;
  }

  const localeNames: Record<Locale, string> = {
    [Locale.cs]: "Czech",
    [Locale.de]: "German",
    [Locale.en]: "English",
    [Locale.fr]: "French",
    [Locale.pl]: "Polish",
    [Locale.sk]: "Slovak",
    [Locale.uk]: "Ukrainian",
  };
  const targetLanguage = localeNames[targetLocale] ?? targetLocale;
    const vertex = await getVertexClient();
  const system = `Translate the given text to ${targetLanguage}. Return only the translated text and preserve the original tone.`;
  const { text } = await runMeteredAdminAiText({
    channelId,
    input: { prompt: description, system },
    model: MODELS.GEMINI_3_FLASH_LITE,
    provider: "google-vertex",
    run: () =>
      generateText({
        model: vertex(MODELS.GEMINI_3_FLASH_LITE),
        providerOptions: getVertexThinkingProviderOptions({
          thinkingLevel: "minimal",
        }),
        system,
        prompt: description,
        temperature: 0.1,
      }),
    source: "admin-action",
  });
  const translation = text.trim();

  if (!translation) {
    throw new Error(`AI returned an empty translation for ${targetLocale}.`);
  }

  return translation;
}

async function generateChangeDescriptions(
  changes: Change[],
  entityType: EntityType | string,
  channelId?: string,
): Promise<Record<Locale, string>> {
  const defaultDescription = await generateChangeDescription(
    changes,
    entityType,
    channelId,
  );
  const descriptions = {
    [DEFAULT_LOCALE]: defaultDescription,
  } as Record<Locale, string>;
  const translations = await Promise.all(
    getTranslationLocales().map(async (locale) => {
      const description = await translateChangeDescription(
        defaultDescription,
        locale,
        channelId,
      );
      return [locale, description] as const;
    }),
  );

  for (const [locale, description] of translations) {
    descriptions[locale] = description;
  }

  return descriptions;
}

export async function detectAndDescribeChanges(
  before: ChangeSnapshot | undefined | null,
  after: ChangeSnapshot | undefined | null,
  options: DetectAndDescribeOptions,
): Promise<ChangeDescriptionResult | null> {
  const changes = detectChanges(before, after);

  if (changes.length === 0) {
    return null;
  }

  const significance = await shouldGenerateChangeLog(
    changes,
    options.entityType,
    options.channelId,
  );

  if (!significance.shouldGenerate) {
    console.info(
      `[changeDescriptions] Skipping change log for ${options.entityType} (${options.entityId}): ${significance.reason}`,
    );
    return null;
  }

  const descriptions = await generateChangeDescriptions(
    significance.filteredChanges,
    options.entityType,
    options.channelId,
  );
  const timestamp = Timestamp.now();
  const changeRecord: Record<string, unknown> = {
    before: before ?? null,
    after: after ?? null,
    changes: significance.filteredChanges,
    descriptions,
    timestamp,
    entityType: options.entityType,
  };

  if (options.entityId !== undefined) {
    changeRecord.entityId = options.entityId;
  }

  if (options.channelId !== undefined) {
    changeRecord.channelId = options.channelId;
  }

  await getDb().collection("changes").add(changeRecord);

  return {
    hasChanges: true,
    changeCount: significance.filteredChanges.length,
    descriptions,
    timestamp,
    entityType: options.entityType,
    entityId: options.entityId,
    channelId: options.channelId,
  };
}
