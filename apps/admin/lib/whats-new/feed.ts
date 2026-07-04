import "server-only";

import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";
import {
  getAdminDb,
  channelId as defaultStoreChannelId,
} from "@/lib/firebase/serverApp";
import { MODELS } from "@konfi/firebase";
import { FeatureHighlight, Locale } from "@konfi/types";
import { Output, generateText } from "ai";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { generateAndApplyMonthlySeoSuggestions } from "./seo-suggestions";
import {
  getMonthPeriodKey,
  getMonthStart,
  getWeekPeriodKey,
  getWeekStart,
  normalizeWhatsNewChange,
} from "./feed-utils";
import {
  feedGenerationOutputSchema,
  GeneratedFeedOutput,
  hasDuplicatedLocalizedText,
  hasRepetitiveHighlights,
  MAX_FEED_HIGHLIGHTS,
  monthlyFeedGenerationOutputSchema,
  MonthlyFeedModelOutput,
  normalizeGeneratedFeedOutput,
} from "./feed-output";
import {
  createMonthlyFeedPrompt,
  getMonthlyFeedSystemPrompt,
} from "./monthly-feed-prompt";
import {
  generateAndSaveWeeklyCampaignProposal,
  type WeeklyCampaignProposal,
} from "./campaign-proposals";
import {
  StoredWhatsNewChange,
  WhatsNewChange,
  WhatsNewChangeKind,
  WHATS_NEW_CHANGE_KIND,
  WHATS_NEW_CHANGE_SOURCE,
} from "./types";

const GENERATED_FEED_COLLECTION = "whatsNewFeed";
const WEEKLY_CHANGE_LIMIT = 24;
const MONTHLY_CHANGE_LIMIT = 36;
const PROMOTION_LIMIT = 12;
const PROMOTION_OVER_FETCH_MULTIPLIER = 3;
const CAMPAIGN_LIMIT = 8;
const MONTHLY_PRODUCT_CONTEXT_LIMIT = 80;
const MONTHLY_FEED_GENERATION_ATTEMPTS = 2;

const adminTimestampSchema = z.custom<Timestamp>((value) => {
  return (
    value instanceof Timestamp ||
    (typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof value.toDate === "function")
  );
});

const storedWhatsNewChangeSchema = z.object({
  id: z.string(),
  timestamp: adminTimestampSchema,
  title: z.record(z.string(), z.string()),
  description: z.record(z.string(), z.string()),
  imageUrl: z.string().optional(),
  seoSuggestionCount: z.number().optional(),
  campaignProposalCount: z.number().optional(),
  highlightFeatures: z
    .array(
      z.object({
        en: z.string(),
        pl: z.string(),
        category: z.record(z.string(), z.string()).optional(),
        icon: z.string().optional(),
        colorPalette: z
          .enum(["primary", "green", "orange", "purple"])
          .optional(),
        imageUrl: z.string().optional(),
      }),
    )
    .optional(),
  kind: z.enum([
    WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
    WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH,
  ]),
  source: z.literal(WHATS_NEW_CHANGE_SOURCE.AI),
  periodKey: z.string(),
  createdAt: adminTimestampSchema,
  updatedAt: adminTimestampSchema,
});

const changeLogDocSchema = z.object({
  entityType: z.string().optional(),
  timestamp: adminTimestampSchema.optional(),
  descriptions: z.record(z.string(), z.string()).optional(),
});

const campaignSummarySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

const promotionSummarySchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  type: z.string().optional(),
  isAutomatic: z.boolean().optional(),
  isOneTime: z.boolean().optional(),
  minimumOrderValue: z.number().nullable().optional(),
  campaignId: z.string().nullable().optional(),
  active: z.boolean(),
});

const productGrowthSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  category: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
  seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      slug: z.string().optional(),
    })
    .optional(),
  keywords: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

const heroCardSummarySchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  buttonLabel: z.string().optional(),
  buttonUrl: z.string().optional(),
  active: z.boolean().optional(),
});

const heroSchema = z.object({
  cards: z.array(heroCardSummarySchema).optional(),
});

interface ChangeSummary {
  entityType?: string;
  timestamp: string;
  description: string;
  descriptions: Record<Locale, string>;
}

type ProductGrowthSummary = z.infer<typeof productGrowthSummarySchema>;

interface MonthlyEvidenceEntity {
  type: "product" | "promotion" | "campaign";
  id: string;
  label: string;
}

export interface FeedGenerationResult {
  created: boolean;
  id: string;
  kind: Exclude<WhatsNewChangeKind, "manual">;
  output?: GeneratedFeedOutput;
  periodKey: string;
  skipped?: boolean;
  reason?: string;
  evaluationContext?: Record<string, unknown>;
  campaignProposal?: WeeklyCampaignProposal;
  campaignProposalCount?: number;
  campaignProposalError?: string;
  campaignProposalReason?: string;
  seoSuggestionCount?: number;
  seoSuggestionAppliedCount?: number;
  seoSuggestionApplyFailures?: string[];
}

export interface FeedGenerationOptions {
  channelId?: string;
  force?: boolean;
  includeEvaluationContext?: boolean;
  includeOutput?: boolean;
  persist?: boolean;
}

interface NormalizedFeedGenerationOptions extends Required<
  Omit<FeedGenerationOptions, "channelId">
> {
  channelId?: string;
}

function normalizeFeedGenerationOptions(
  options: boolean | FeedGenerationOptions,
): NormalizedFeedGenerationOptions {
  if (typeof options === "boolean") {
    return {
      channelId: defaultStoreChannelId,
      force: options,
      includeEvaluationContext: false,
      includeOutput: false,
      persist: true,
    };
  }

  return {
    channelId: options.channelId?.trim() || defaultStoreChannelId,
    force: options.force ?? false,
    includeEvaluationContext: options.includeEvaluationContext ?? false,
    includeOutput: options.includeOutput ?? false,
    persist: options.persist ?? true,
  };
}

function getAdminFirestore() {
  return getAdminDb();
}

function getFeedDocumentId(
  kind: FeedGenerationResult["kind"],
  periodKey: string,
) {
  return `${kind}:${periodKey}`;
}

function mapStoredChangeToApi(change: StoredWhatsNewChange): WhatsNewChange {
  return normalizeWhatsNewChange({
    id: change.id,
    timestamp: change.timestamp.toDate().toISOString(),
    title: change.title,
    description: change.description,
    imageUrl: change.imageUrl,
    seoSuggestionCount: change.seoSuggestionCount,
    campaignProposalCount: change.campaignProposalCount,
    highlightFeatures: change.highlightFeatures,
    kind: change.kind,
    source: change.source,
  });
}

function getPrimaryChangeDescription(
  descriptions: Record<string, string> | undefined,
) {
  return (
    descriptions?.[Locale.en]?.trim() ??
    descriptions?.[Locale.pl]?.trim() ??
    "Updated business data."
  );
}

function expandChangeDescriptions(input: {
  en: string;
  pl: string;
}): Record<Locale, string> {
  return Object.fromEntries(
    Object.values(Locale).map((locale) => [
      locale,
      locale === Locale.pl ? input.pl : input.en,
    ]),
  ) as Record<Locale, string>;
}

async function saveGeneratedChange(
  kind: FeedGenerationResult["kind"],
  periodKey: string,
  output: GeneratedFeedOutput,
  timestamp: Date,
  seoSuggestionCount?: number,
  campaignProposalCount?: number,
) {
  const firestore = getAdminFirestore();
  const id = getFeedDocumentId(kind, periodKey);
  const now = Timestamp.now();
  const docRef = firestore.collection(GENERATED_FEED_COLLECTION).doc(id);

  const data: StoredWhatsNewChange = {
    id,
    timestamp: Timestamp.fromDate(timestamp),
    title: output.title,
    description: output.description,
    ...(typeof seoSuggestionCount === "number" ? { seoSuggestionCount } : {}),
    ...(typeof campaignProposalCount === "number"
      ? { campaignProposalCount }
      : {}),
    highlightFeatures: output.highlightFeatures as FeatureHighlight[],
    kind,
    source: WHATS_NEW_CHANGE_SOURCE.AI,
    periodKey,
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(data);

  return data;
}

async function getExistingGeneratedChange(id: string) {
  const firestore = getAdminFirestore();
  const docRef = firestore.collection(GENERATED_FEED_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return null;
  }

  const parsed = storedWhatsNewChangeSchema.safeParse(doc.data());
  if (!parsed.success) {
    console.error("Invalid generated What's New document:", parsed.error);
    return null;
  }

  return parsed.data;
}

async function getRecentChanges(startDate: Date, limitCount: number) {
  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection("changes")
    .where("timestamp", ">=", Timestamp.fromDate(startDate))
    .orderBy("timestamp", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
    const parsed = changeLogDocSchema.safeParse(doc.data());
    if (!parsed.success) {
      console.error(
        "Invalid change log entry for What's New feed:",
        parsed.error,
      );
    }
    const data = parsed.success ? parsed.data : null;
    const descriptionEn = getPrimaryChangeDescription(data?.descriptions);
    const descriptionPl = data?.descriptions?.[Locale.pl]?.trim() ?? "";

    return {
      entityType: data?.entityType,
      timestamp:
        data?.timestamp?.toDate().toISOString() ?? startDate.toISOString(),
      description: descriptionEn,
      descriptions: expandChangeDescriptions({
        en: descriptionEn,
        pl: descriptionPl,
      }),
    } satisfies ChangeSummary;
  });
}

async function getActivePromotions() {
  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection("promotions")
    .orderBy("updatedAt", "desc")
    .limit(PROMOTION_LIMIT * PROMOTION_OVER_FETCH_MULTIPLIER)
    .get();

  return snapshot.docs
    .map((doc) => promotionSummarySchema.safeParse(doc.data()))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter((promotion) => promotion.active)
    .slice(0, PROMOTION_LIMIT)
    .map((data) => ({
      id: data.id,
      code: data.code,
      type: data.type,
      isAutomatic: data.isAutomatic,
      isOneTime: data.isOneTime,
      minimumOrderValue: data.minimumOrderValue,
      campaignId: data.campaignId,
    }));
}

async function getRecentCampaigns() {
  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection("campaigns")
    .orderBy("updatedAt", "desc")
    .limit(CAMPAIGN_LIMIT)
    .get();

  return snapshot.docs
    .map((doc) => campaignSummarySchema.safeParse(doc.data()))
    .filter((result) => result.success)
    .map((result) => result.data);
}

async function getActiveStoreProductsForGrowth(channelId: string | undefined) {
  if (!channelId) {
    return [];
  }

  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection(`channels/${channelId}/products`)
    .where("active", "==", true)
    .orderBy(FieldPath.documentId())
    .limit(MONTHLY_PRODUCT_CONTEXT_LIMIT)
    .get();

  return snapshot.docs
    .map((doc) =>
      productGrowthSummarySchema.safeParse({
        ...doc.data(),
        id: doc.id,
      }),
    )
    .filter((result) => result.success)
    .map((result) => result.data)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

async function getCurrentHeroCards(channelId: string | undefined) {
  if (!channelId) {
    return [];
  }

  const firestore = getAdminFirestore();
  const docRef = firestore.doc(`channels/${channelId}/cms/hero`);
  const doc = await docRef.get();

  if (!doc.exists) {
    return [];
  }

  const parsedHero = heroSchema.safeParse(doc.data());
  if (!parsedHero.success) {
    console.error(
      "Invalid hero data for monthly What's New feed:",
      parsedHero.error,
    );
    return [];
  }

  const data = parsedHero.data;
  return (data.cards ?? []).map((card) => ({
    title: card.title,
    subtitle: card.subtitle,
    buttonLabel: card.buttonLabel,
    buttonUrl: card.buttonUrl,
    active: card.active,
  }));
}

function truncateText(value: string | undefined, maxLength: number) {
  const text = value?.trim() ?? "";

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function mapProductsForMonthlyContext(products: ProductGrowthSummary[]) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category?.name ?? "",
    description: truncateText(product.description, 180),
    seoTitle: product.seo?.title ?? "",
    seoDescription: truncateText(product.seo?.description, 180),
    keywords: product.keywords ?? [],
  }));
}

function getMonthlyEvidenceEntities(input: {
  products: ProductGrowthSummary[];
  promotions: Awaited<ReturnType<typeof getActivePromotions>>;
  campaigns: Awaited<ReturnType<typeof getRecentCampaigns>>;
}) {
  return [
    ...input.products.map((product) => ({
      type: "product" as const,
      id: product.id,
      label: product.name,
    })),
    ...input.promotions.map((promotion) => ({
      type: "promotion" as const,
      id: promotion.id,
      label: promotion.code ? `promotion ${promotion.code}` : promotion.id,
    })),
    ...input.campaigns.map((campaign) => ({
      type: "campaign" as const,
      id: campaign.id,
      label: campaign.name ?? campaign.id,
    })),
  ] satisfies MonthlyEvidenceEntity[];
}

function normalizeMonthlyGrowthFeedOutput(
  output: MonthlyFeedModelOutput,
  entities: MonthlyEvidenceEntity[],
): GeneratedFeedOutput {
  const allowedEntityKeys = new Set(
    entities.map((entity) => `${entity.type}:${entity.id}`),
  );
  const groundedHighlights = output.highlightFeatures
    .filter((highlight) =>
      allowedEntityKeys.has(
        `${highlight.supportingEntityType}:${highlight.supportingEntityId}`,
      ),
    )
    .map((highlight) => ({
      en: highlight.en,
      pl: highlight.pl,
    }));

  if (groundedHighlights.length < 2) {
    throw new Error(
      "Generated monthly What's New feed did not include at least two highlights grounded in provided products, promotions, or campaigns.",
    );
  }

  return normalizeGeneratedFeedOutput({
    ...output,
    highlightFeatures: groundedHighlights.slice(0, MAX_FEED_HIGHLIGHTS),
  });
}

async function getMarketResearch(now: Date) {
  try {
    const model = await getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH);
    const result = await generateText({
      model,
      prompt: [
        "Research upcoming e-commerce and print marketing opportunities for the next 30 days in Poland.",
        "Focus on seasonal demand signals, campaign timing, and promotion angles a print shop can evaluate against its existing product catalog.",
        "Do not recommend specific product lines or SKUs. The product catalog is not available in this research step.",
        `Current date: ${now.toISOString()}.`,
        "Return only concise findings.",
      ].join("\n"),
      system:
        "You provide concise planning context for a Polish printing/e-commerce admin. Use English.",
    });

    return result.text.trim();
  } catch (error) {
    console.error("Failed to fetch market research for monthly feed:", error);
    return "Market research was unavailable for this run.";
  }
}

function getWeeklyFeedQualityIssues(output: GeneratedFeedOutput) {
  const issues: string[] = [];

  if (hasDuplicatedLocalizedText(output)) {
    issues.push(
      "Polish fields duplicate English text instead of idiomatic Polish copy.",
    );
  }

  if (hasRepetitiveHighlights(output)) {
    issues.push(
      "Highlights are repetitive raw entries instead of concise topic-level summaries.",
    );
  }

  return issues;
}

function createWeeklyFeedPrompt(context: Record<string, unknown>) {
  return [
    "Create a weekly update feed entry from this context:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

async function generateFeedContent(input: {
  channelId?: string;
  kind: FeedGenerationResult["kind"];
  context: Record<string, unknown>;
  monthlyEvidenceEntities?: MonthlyEvidenceEntity[];
}) {
  const model = await getAdminVertexLanguageModel(MODELS.GEMINI_3_PRO);
  const meteredGenerateText = createMeteredAdminGenerateText({
    channelId: input.channelId,
    generateText,
    model: MODELS.GEMINI_3_PRO,
    provider: "google-vertex",
    source: "admin-action",
  });

  if (input.kind === WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE) {
    const { output } = await meteredGenerateText({
      model,
      instructions: [
        "You write short internal product update feed entries for admins.",
        "Keep it straight to the point.",
        "Summarize only the most important changes from the provided weekly context.",
        "Group related raw change-log entries into admin-facing summaries instead of copying logs verbatim.",
        "Return 2-4 topic-level highlights. Do not list individual changed option names unless one change dominates the week.",
        "Prioritize the largest activity groups by count, especially product SEO or storefront publishing changes.",
        "Mention concrete changed entities when helpful, but avoid truncated fragments, field paths, and internal implementation wording.",
        "Make the description one short sentence.",
        "Make each highlight informative for a print shop admin.",
        "Use neutral update-summary phrasing; weekly highlights do not need to be commands or recommendations.",
        `Return no more than ${MAX_FEED_HIGHLIGHTS} highlights.`,
        "Return natural English and Polish text.",
        "The pl fields must be idiomatic Polish. Never repeat English text in Polish fields; translate or synthesize the Polish copy when the context has no Polish evidence.",
      ].join(" "),
      prompt: createWeeklyFeedPrompt(input.context),
      output: Output.object({ schema: feedGenerationOutputSchema }),
    });

    const normalizedOutput = normalizeGeneratedFeedOutput(output);
    const qualityIssues = getWeeklyFeedQualityIssues(normalizedOutput);
    if (qualityIssues.length > 0) {
      throw new Error(
        `Generated weekly What's New feed failed quality validation: ${qualityIssues.join(" ")}`,
      );
    }

    return normalizedOutput;
  }

  const monthlyEvidenceEntities = input.monthlyEvidenceEntities ?? [];
  let qualityIssues: string[] = [];
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MONTHLY_FEED_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const { output } = await meteredGenerateText({
        model,
        instructions: getMonthlyFeedSystemPrompt(MAX_FEED_HIGHLIGHTS),
        prompt: createMonthlyFeedPrompt(input.context, qualityIssues),
        output: Output.object({ schema: monthlyFeedGenerationOutputSchema }),
      });

      return normalizeMonthlyGrowthFeedOutput(output, monthlyEvidenceEntities);
    } catch (error) {
      lastError = error;
      qualityIssues = [
        "The previous attempt failed before returning valid structured output grounded in provided products, promotions, or campaigns.",
      ];
      console.error(
        `Failed to generate monthly What's New feed output on attempt ${attempt}:`,
        error,
      );
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Failed to generate monthly What's New feed output.");
}

export async function listGeneratedWhatsNewChanges(limitCount: number = 12) {
  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection(GENERATED_FEED_COLLECTION)
    .orderBy("timestamp", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs
    .map((doc) => storedWhatsNewChangeSchema.safeParse(doc.data()))
    .filter((result) => result.success)
    .map((result) => mapStoredChangeToApi(result.data));
}

export async function generateWeeklyWhatsNewChange(
  options: boolean | FeedGenerationOptions = false,
): Promise<FeedGenerationResult> {
  const generationOptions = normalizeFeedGenerationOptions(options);
  const now = new Date();
  const periodKey = getWeekPeriodKey(now);
  const id = getFeedDocumentId(WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE, periodKey);
  const existing = await getExistingGeneratedChange(id);

  if (generationOptions.persist && existing && !generationOptions.force) {
    return {
      created: false,
      skipped: true,
      reason: "Weekly update already exists for the current period.",
      id,
      kind: WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
      periodKey,
    };
  }

  const weeklyChanges = await getRecentChanges(
    getWeekStart(now),
    WEEKLY_CHANGE_LIMIT,
  );

  if (weeklyChanges.length === 0) {
    return {
      created: false,
      skipped: true,
      reason: "No recent changes found for the weekly update.",
      id,
      kind: WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
      periodKey,
    };
  }

  const evaluationContext = {
    periodKey,
    changes: weeklyChanges,
    changeCount: weeklyChanges.length,
    entityBreakdown: weeklyChanges.reduce<Record<string, number>>(
      (accumulator, change) => {
        const key = change.entityType ?? "Other";
        accumulator[key] = (accumulator[key] ?? 0) + 1;
        return accumulator;
      },
      {},
    ),
  };
  const output = await generateFeedContent({
    channelId: generationOptions.channelId,
    kind: WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
    context: evaluationContext,
  });
  let campaignProposal: WeeklyCampaignProposal | undefined;
  let campaignProposalCount = 0;
  let campaignProposalError: string | undefined;
  let campaignProposalReason: string | undefined;

  try {
    const campaignProposalResult = await generateAndSaveWeeklyCampaignProposal({
      changeId: id,
      now,
      persist: generationOptions.persist,
    });
    campaignProposal = campaignProposalResult.proposal;
    campaignProposalCount = campaignProposalResult.proposalCount;
    campaignProposalReason = campaignProposalResult.reason;
  } catch (error) {
    console.error("Failed to generate weekly campaign proposal:", error);
    campaignProposalError =
      error instanceof Error
        ? error.message
        : "Unknown campaign proposal generation error.";
  }

  if (generationOptions.persist) {
    await saveGeneratedChange(
      WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
      periodKey,
      output,
      now,
      0,
      campaignProposalCount,
    );
  }

  const resultEvaluationContext = {
    ...evaluationContext,
    campaignProposal: campaignProposal
      ? {
          campaignIdentifier: campaignProposal.campaign.campaignIdentifier,
          discountPercent: campaignProposal.discountPercent,
          endsAt: campaignProposal.campaign.endsAt,
          eventId: campaignProposal.calendarEvent.id,
          productIds: campaignProposal.productIds,
          startsAt: campaignProposal.campaign.startsAt,
        }
      : undefined,
    campaignProposalReason,
  };

  return {
    created: true,
    id,
    kind: WHATS_NEW_CHANGE_KIND.WEEKLY_UPDATE,
    output: generationOptions.includeOutput ? output : undefined,
    periodKey,
    campaignProposal,
    campaignProposalCount,
    campaignProposalError,
    campaignProposalReason,
    evaluationContext: generationOptions.includeEvaluationContext
      ? resultEvaluationContext
      : undefined,
  };
}

export async function generateMonthlyGrowthWhatsNewChange(
  options: boolean | FeedGenerationOptions = false,
): Promise<FeedGenerationResult> {
  const generationOptions = normalizeFeedGenerationOptions(options);
  const now = new Date();
  const periodKey = getMonthPeriodKey(now);
  const id = getFeedDocumentId(WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH, periodKey);
  const existing = await getExistingGeneratedChange(id);

  if (generationOptions.persist && existing && !generationOptions.force) {
    return {
      created: false,
      skipped: true,
      reason: "Monthly growth update already exists for the current period.",
      id,
      kind: WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH,
      periodKey,
    };
  }

  const [monthlyChanges, promotions, campaigns, heroCards, products, research] =
    await Promise.all([
      getRecentChanges(getMonthStart(now), MONTHLY_CHANGE_LIMIT),
      getActivePromotions(),
      getRecentCampaigns(),
      getCurrentHeroCards(generationOptions.channelId),
      getActiveStoreProductsForGrowth(generationOptions.channelId),
      getMarketResearch(now),
    ]);
  const monthlyEvidenceEntities = getMonthlyEvidenceEntities({
    products,
    promotions,
    campaigns,
  });
  const evaluationContext = {
    periodKey,
    recentChanges: monthlyChanges,
    activeStoreProducts: mapProductsForMonthlyContext(products),
    activePromotions: promotions,
    recentCampaigns: campaigns,
    currentHeroCards: heroCards,
    marketResearch: research,
  };

  const output = await generateFeedContent({
    channelId: generationOptions.channelId,
    kind: WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH,
    context: evaluationContext,
    monthlyEvidenceEntities,
  });

  const seoSuggestionResult = generationOptions.persist
    ? await generateAndApplyMonthlySeoSuggestions(id, research)
    : {
        appliedCount: 0,
        failedProducts: [],
        generatedCount: 0,
      };
  const seoSuggestionCount = seoSuggestionResult.generatedCount;

  if (seoSuggestionResult.failedProducts.length > 0) {
    console.error("Some monthly SEO suggestions were not applied:", {
      changeId: id,
      failedProducts: seoSuggestionResult.failedProducts,
    });
  }

  if (generationOptions.persist) {
    await saveGeneratedChange(
      WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH,
      periodKey,
      output,
      now,
      seoSuggestionCount,
    );
  }

  return {
    created: true,
    id,
    kind: WHATS_NEW_CHANGE_KIND.MONTHLY_GROWTH,
    output: generationOptions.includeOutput ? output : undefined,
    periodKey,
    evaluationContext: generationOptions.includeEvaluationContext
      ? evaluationContext
      : undefined,
    seoSuggestionCount,
    seoSuggestionAppliedCount: seoSuggestionResult.appliedCount,
    seoSuggestionApplyFailures: seoSuggestionResult.failedProducts,
  };
}
