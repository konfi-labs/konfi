"use server";

import "server-only";

import {
  getAuthenticatedAdminMember,
  requireAdminAuth,
  requireTenantAdminChannelAccess,
} from "@/actions/auth-utils";
import { runMeteredAdminAiText } from "@/lib/ai/metered-text";
import {
  getVertexClient,
  getVertexThinkingProviderOptions,
} from "@/lib/ai/server-vertex";
import {
  getAdminDb,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  buildGeneratedManagedTranslationDocument,
  createManagedTranslationDescriptor,
  MANAGED_TRANSLATION_SOURCE_LOCALE,
  MANAGED_TRANSLATION_TARGET_LOCALES,
  type GeneratedTranslationItem,
  type ManagedTranslationDocument,
  type ManagedTranslationMeta,
  type ManagedTranslationRef,
  type TranslationSourceItem,
} from "@/lib/translations";
import { MODELS } from "@konfi/firebase";
import { Locale } from "@konfi/types";
import {
  ORDER_RULE_PRESETS_SETTINGS_DOC_ID,
  ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID,
  PAYMENT_METHODS_SETTINGS_DOC_ID,
  PRINTING_METHODS_SETTINGS_DOC_ID,
  SHIPPING_METHODS_SETTINGS_DOC_ID,
  SUPPORT_TAXONOMY_SETTINGS_DOC_ID,
  UNITS_PROOFING_SETTINGS_DOC_ID,
} from "@konfi/utils";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { generateText, Output } from "ai";
import { type DocumentData, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

const TRANSLATION_USAGE_SOURCE = "translation" as const;
const TRANSLATION_PROVIDER = "google-vertex";
const TRANSLATION_MODEL = MODELS.GEMINI_3_FLASH_LITE;

const managedTranslationRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    channelId: z.string().min(1),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("category"),
    channelId: z.string().min(1),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("attribute"),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("blogPost"),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("blogCategory"),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("blogTag"),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("hero"),
    channelId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("storeMetadata"),
    channelId: z.string().min(1),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("storePageContent"),
    channelId: z.string().min(1),
    entityId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("printingMethodsSettings"),
    channelId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("paymentMethodsSettings"),
    channelId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("shippingMethodsSettings"),
    channelId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("orderWorkflowStatusesSettings"),
    channelId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("orderRulePresetsSettings"),
    channelId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("unitsProofingSettings"),
    channelId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("supportTaxonomySettings"),
    channelId: z.string().min(1),
  }),
]);

const generatedTranslationSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      translatedText: z.string(),
    }),
  ),
});

const generateEntityTranslationSchema = z.object({
  ref: managedTranslationRefSchema,
  locale: z.nativeEnum(Locale),
  mode: z.enum(["missing", "stale"]).default("missing"),
});

const markReviewedSchema = z.object({
  ref: managedTranslationRefSchema,
  locale: z.nativeEnum(Locale),
});

function getManagedTranslationPaths(ref: ManagedTranslationRef) {
  switch (ref.kind) {
    case "product":
      return {
        sourcePath: `channels/${ref.channelId}/products/${ref.entityId}`,
        translationPath: `channels/${ref.channelId}/products/${ref.entityId}/translations`,
      };
    case "category":
      return {
        sourcePath: `channels/${ref.channelId}/categories/${ref.entityId}`,
        translationPath: `channels/${ref.channelId}/categories/${ref.entityId}/translations`,
      };
    case "attribute":
      return {
        sourcePath: `attributes/${ref.entityId}`,
        translationPath: `attributes/${ref.entityId}/translations`,
      };
    case "blogPost":
      return {
        sourcePath: `blogPosts/${ref.entityId}`,
        translationPath: `blogPosts/${ref.entityId}/translations`,
      };
    case "blogCategory":
      return {
        sourcePath: `blogCategories/${ref.entityId}`,
        translationPath: `blogCategories/${ref.entityId}/translations`,
      };
    case "blogTag":
      return {
        sourcePath: `blogTags/${ref.entityId}`,
        translationPath: `blogTags/${ref.entityId}/translations`,
      };
    case "hero":
      return {
        sourcePath: `channels/${ref.channelId}/cms/hero`,
        translationPath: `channels/${ref.channelId}/cms/hero/translations`,
      };
    case "storeMetadata":
      return {
        sourcePath: `channels/${ref.channelId}/metadata/${ref.entityId}`,
        translationPath: `channels/${ref.channelId}/metadata/${ref.entityId}/translations`,
      };
    case "storePageContent":
      return {
        sourcePath: `channels/${ref.channelId}/pages/${ref.entityId}`,
        translationPath: `channels/${ref.channelId}/pages/${ref.entityId}/translations`,
      };
    case "printingMethodsSettings":
      return {
        sourcePath: `channels/${ref.channelId}/settings/${PRINTING_METHODS_SETTINGS_DOC_ID}`,
        translationPath: `channels/${ref.channelId}/settings/${PRINTING_METHODS_SETTINGS_DOC_ID}/translations`,
      };
    case "paymentMethodsSettings":
      return {
        sourcePath: `channels/${ref.channelId}/settings/${PAYMENT_METHODS_SETTINGS_DOC_ID}`,
        translationPath: `channels/${ref.channelId}/settings/${PAYMENT_METHODS_SETTINGS_DOC_ID}/translations`,
      };
    case "shippingMethodsSettings":
      return {
        sourcePath: `channels/${ref.channelId}/settings/${SHIPPING_METHODS_SETTINGS_DOC_ID}`,
        translationPath: `channels/${ref.channelId}/settings/${SHIPPING_METHODS_SETTINGS_DOC_ID}/translations`,
      };
    case "orderWorkflowStatusesSettings":
      return {
        sourcePath: `channels/${ref.channelId}/settings/${ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID}`,
        translationPath: `channels/${ref.channelId}/settings/${ORDER_WORKFLOW_STATUSES_SETTINGS_DOC_ID}/translations`,
      };
    case "orderRulePresetsSettings":
      return {
        sourcePath: `channels/${ref.channelId}/settings/${ORDER_RULE_PRESETS_SETTINGS_DOC_ID}`,
        translationPath: `channels/${ref.channelId}/settings/${ORDER_RULE_PRESETS_SETTINGS_DOC_ID}/translations`,
      };
    case "unitsProofingSettings":
      return {
        sourcePath: `channels/${ref.channelId}/settings/${UNITS_PROOFING_SETTINGS_DOC_ID}`,
        translationPath: `channels/${ref.channelId}/settings/${UNITS_PROOFING_SETTINGS_DOC_ID}/translations`,
      };
    case "supportTaxonomySettings":
      return {
        sourcePath: `channels/${ref.channelId}/settings/${SUPPORT_TAXONOMY_SETTINGS_DOC_ID}`,
        translationPath: `channels/${ref.channelId}/settings/${SUPPORT_TAXONOMY_SETTINGS_DOC_ID}/translations`,
      };
  }
}

async function authorizeManagedTranslationRef(ref: ManagedTranslationRef) {
  const tenantContext = await getTenantContextForRequest();

  if ("channelId" in ref) {
    await requireTenantAdminChannelAccess(
      ref.channelId,
      tenantContext.tenantId,
    );
  } else {
    await requireAdminAuth();
  }

  const member = await getAuthenticatedAdminMember();
  return { member, tenantContext };
}

function readRecord(data: DocumentData | undefined) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  return data as Record<string, unknown>;
}

async function loadManagedTranslationData(
  ref: ManagedTranslationRef,
  locale: Locale,
) {
  const db = getAdminDb();
  const paths = getManagedTranslationPaths(ref);
  const sourceSnapshot = await db.doc(paths.sourcePath).get();

  if (!sourceSnapshot.exists) {
    throw new Error(`Source document not found for ${ref.kind}`);
  }

  const translationRef = db.doc(`${paths.translationPath}/${locale}`);
  const translationSnapshot = await translationRef.get();
  const source = readRecord(sourceSnapshot.data());
  const translation = translationSnapshot.exists
    ? (readRecord(translationSnapshot.data()) as ManagedTranslationDocument)
    : null;

  return {
    descriptor: createManagedTranslationDescriptor(ref.kind, source),
    source,
    translation,
    translationExists: translationSnapshot.exists,
    translationRef,
  };
}

function buildTranslationPrompt(
  locale: Locale,
  items: TranslationSourceItem[],
) {
  const payload = items.map((item) => ({
    key: item.key,
    label: item.label,
    text: item.text,
  }));

  return [
    `Translate the following managed content fields from Polish (${MANAGED_TRANSLATION_SOURCE_LOCALE}) to ${locale}.`,
    "Return one item for every input key. Keep the same keys.",
    "Preserve placeholders such as {name}, {{name}}, %s, %d, HTML tags, Markdown syntax, URLs, numbers, SKUs, brand names, and line breaks.",
    "For slug-like text, return a lowercase URL slug with hyphens.",
    "Do not add commentary.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

async function generateManagedTranslationItems(params: {
  channelId?: string;
  context: TenantContext;
  locale: Locale;
  items: TranslationSourceItem[];
  userId: string;
}) {
  if (params.items.length === 0) {
    return [];
  }

  const system = [
    "You are a precise e-commerce content translator.",
    "Translate only the provided field values and return valid structured output.",
    "Never translate placeholders, URLs, HTML/Markdown syntax, code-like tokens, product codes, or measurement units.",
  ].join("\n");
  const prompt = buildTranslationPrompt(params.locale, params.items);
  const vertex = await getVertexClient();
  const { output } = await runMeteredAdminAiText({
    channelId: params.channelId,
    context: params.context,
    input: { prompt, system },
    model: TRANSLATION_MODEL,
    provider: TRANSLATION_PROVIDER,
    run: () =>
      generateText({
        model: vertex(TRANSLATION_MODEL),
        output: Output.object({ schema: generatedTranslationSchema }),
        providerOptions: getVertexThinkingProviderOptions({
          thinkingLevel: "minimal",
        }),
        system,
        prompt,
        temperature: 0,
      }),
    source: TRANSLATION_USAGE_SOURCE as Parameters<
      typeof runMeteredAdminAiText
    >[0]["source"],
    userId: params.userId,
  });

  return output.items satisfies GeneratedTranslationItem[];
}

async function writeGeneratedTranslation(params: {
  ref: ManagedTranslationRef;
  locale: Locale;
  mode: "missing" | "stale";
}) {
  const { member, tenantContext } = await authorizeManagedTranslationRef(
    params.ref,
  );
  const { descriptor, source, translation, translationExists, translationRef } =
    await loadManagedTranslationData(params.ref, params.locale);
  const now = Timestamp.now();
  const { document, generatedFieldCount } =
    await buildGeneratedManagedTranslationDocument({
      kind: params.ref.kind,
      source,
      translation,
      locale: params.locale,
      mode: params.mode,
      generatedAt: now as unknown as ManagedTranslationMeta["generatedAt"],
      generatedBy: member.id,
      generatedProvider: TRANSLATION_PROVIDER,
      generatedModel: TRANSLATION_MODEL,
      generateText: (items) =>
        generateManagedTranslationItems({
          channelId:
            "channelId" in params.ref ? params.ref.channelId : undefined,
          context: tenantContext,
          locale: params.locale,
          items,
          userId: member.id,
        }),
    });

  if (generatedFieldCount === 0) {
    return {
      ok: true,
      generatedFieldCount: 0,
      sourceHash: descriptor.sourceHash,
    };
  }

  await translationRef.set(
    {
      ...document,
      id: params.locale,
      updatedAt: now,
      updatedBy: member,
      ...(translationExists
        ? {}
        : {
            createdAt: now,
            createdBy: member,
          }),
    },
    { merge: true },
  );

  return {
    ok: true,
    generatedFieldCount,
    sourceHash: descriptor.sourceHash,
  };
}

export async function ensureEntityTranslationsAction(input: unknown) {
  const ref = managedTranslationRefSchema.parse(input);
  const results = [];

  for (const locale of MANAGED_TRANSLATION_TARGET_LOCALES) {
    try {
      results.push(
        await writeGeneratedTranslation({
          ref,
          locale,
          mode: "missing",
        }),
      );
    } catch (error) {
      console.error("[managed-translations] Auto-generation failed", {
        error,
        kind: ref.kind,
        locale,
      });
      results.push({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        locale,
      });
    }
  }

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

export async function generateEntityTranslationAction(input: unknown) {
  const params = generateEntityTranslationSchema.parse(input);
  return writeGeneratedTranslation(params);
}

export async function markEntityTranslationReviewedAction(input: unknown) {
  const params = markReviewedSchema.parse(input);
  const { member } = await authorizeManagedTranslationRef(params.ref);
  const { descriptor, translation, translationRef } =
    await loadManagedTranslationData(params.ref, params.locale);

  if (!translation) {
    throw new Error("Translation document not found");
  }

  const now = Timestamp.now();
  await translationRef.set(
    {
      translationMeta: {
        ...translation.translationMeta,
        sourceLocale: MANAGED_TRANSLATION_SOURCE_LOCALE,
        sourceHash: descriptor.sourceHash,
        status: "reviewed",
        reviewedAt: now,
        reviewedBy: member.id,
      },
      updatedAt: now,
      updatedBy: member,
    },
    { merge: true },
  );

  return {
    ok: true,
    sourceHash: descriptor.sourceHash,
  };
}
