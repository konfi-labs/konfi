import "server-only";

import { AGENT_HARNESS_SHARED_INSTRUCTIONS } from "@/lib/ai/agent-harness";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { getAdminVertexLanguageModel } from "@/lib/ai/vertex-language-model.server";
import {
  getAdminDb,
  channelId as storeChannelId,
} from "@/lib/firebase/serverApp";
import {
  ApplicationMethodAllocationEnum,
  ApplicationMethodTargetTypeEnum,
  ApplicationMethodTypeEnum,
  CampaignAvailabilityTypeEnum,
  Locale,
  PromotionRuleAttributeEnum,
  PromotionRuleOperatorEnum,
  PromotionTypeEnum,
} from "@konfi/types";
import { MODELS } from "@konfi/firebase";
import { Output, generateText } from "ai";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const CAMPAIGN_PROPOSALS_SUBCOLLECTION = "campaignProposals";
const CAMPAIGN_PRODUCT_CONTEXT_LIMIT = 80;
const CAMPAIGN_PLANNING_WINDOW_DAYS = 42;
const EXISTING_CAMPAIGN_CONTEXT_LIMIT = 20;
const EXISTING_PROMOTION_CONTEXT_LIMIT = 40;
const EXISTING_CAMPAIGN_PROPOSAL_CONTEXT_LIMIT = 12;
export const MAX_CAMPAIGN_DISCOUNT_PERCENT = 30;
export const MIN_CAMPAIGN_PRODUCT_COUNT = 1;
export const MAX_CAMPAIGN_PRODUCT_COUNT = 3;

const DEFAULT_COMPANY_COUNTRY_CODE = "PL";
const DEFAULT_COMPANY_LOCATION_LABEL = "Poland";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD date.");
const dateLikeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/u,
    "Expected YYYY-MM-DD date or ISO datetime.",
  );

const localizedTextSchema = z.object({
  en: z.string().min(1),
  pl: z.string().min(1),
});

const campaignProductSchema = z.object({
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

const marketingCalendarEventSchema = z.object({
  id: z.string().min(1),
  name: localizedTextSchema,
  startsAt: dateLikeSchema,
  endsAt: dateLikeSchema,
  countryCodes: z.array(z.string().min(2)),
  source: z.enum(["api", "agent"]),
  sourceUrl: z.string().url().optional(),
  reason: localizedTextSchema,
});

const publicHolidayApiSchema = z.array(
  z.object({
    date: dateOnlySchema,
    localName: z.string(),
    name: z.string(),
    countryCode: z.string(),
  }),
);

const campaignProposalDraftSchema = z.object({
  calendarEvent: marketingCalendarEventSchema,
  campaignName: z.string().min(1),
  campaignIdentifier: z.string().min(1),
  description: localizedTextSchema,
  startsAt: dateLikeSchema,
  endsAt: dateLikeSchema,
  availabilityTypes: z
    .array(
      z.enum([
        CampaignAvailabilityTypeEnum.ONLINE,
        CampaignAvailabilityTypeEnum.POS,
      ]),
    )
    .min(1),
  discountPercent: z.number().min(1),
  productIds: z.array(z.string().min(1)).min(1),
  promotionCode: z.string().min(1).optional(),
  justification: localizedTextSchema,
});

const campaignProposalModelOutputSchema = z.object({
  shouldCreateCampaign: z.boolean(),
  skipReason: localizedTextSchema.optional(),
  proposal: campaignProposalDraftSchema.optional(),
});

const existingCampaignContextSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  campaignIdentifier: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  availabilityTypes: z.array(z.string()).optional(),
});

const existingPromotionContextSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  active: z.boolean().optional(),
  campaignId: z.string().nullable().optional(),
  isAutomatic: z.boolean().optional(),
  applicationMethod: z
    .object({
      type: z.string().optional(),
      targetType: z.string().optional(),
      value: z.number().optional(),
      currencyCode: z.string().optional(),
    })
    .optional(),
  rules: z
    .array(
      z.object({
        attribute: z.string().optional(),
        values: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const existingCampaignProposalContextSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  calendarEvent: marketingCalendarEventSchema.optional(),
  discountPercent: z.number().optional(),
  productIds: z.array(z.string()).optional(),
  campaign: z
    .object({
      campaignIdentifier: z.string().optional(),
      name: z.string().optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
    })
    .optional(),
});

export type CampaignProductSummary = z.infer<typeof campaignProductSchema>;
export type MarketingCalendarEvent = z.infer<
  typeof marketingCalendarEventSchema
>;
type CampaignProposalDraftOutput = z.infer<typeof campaignProposalDraftSchema>;
export type CampaignProposalModelOutput = z.infer<
  typeof campaignProposalModelOutputSchema
>;

export interface GeneratedCampaignPayload {
  availabilityTypes: CampaignAvailabilityTypeEnum[];
  budget: null;
  campaignIdentifier: string;
  description: string;
  endsAt: string;
  id: string;
  name: string;
  startsAt: string;
}

export interface GeneratedPromotionPayload {
  active: boolean;
  applicationMethod: {
    allocation: typeof ApplicationMethodAllocationEnum.EACH;
    applyToQuantity: number;
    buyRulesMinQuantity: number;
    currencyCode: "PLN";
    maxQuantity: number;
    targetType: typeof ApplicationMethodTargetTypeEnum.ITEMS;
    type: typeof ApplicationMethodTypeEnum.PERCENTAGE;
    value: number;
  };
  campaignId: string;
  code: string;
  isAutomatic: boolean;
  type: typeof PromotionTypeEnum.STANDARD;
  rules: Array<{
    attribute: typeof PromotionRuleAttributeEnum.PRODUCT;
    description: string;
    id: string;
    operator: typeof PromotionRuleOperatorEnum.IN;
    type: typeof PromotionTypeEnum.STANDARD;
    values: string[];
  }>;
}

type CampaignProposalStatus = "pending_review" | "applied";

export interface WeeklyCampaignProposal {
  campaign: GeneratedCampaignPayload;
  calendarEvent: MarketingCalendarEvent;
  discountPercent: number;
  id: string;
  justification: Record<Locale, string>;
  localizedDescription: Record<Locale, string>;
  productIds: string[];
  promotion: GeneratedPromotionPayload;
  source: "ai";
  status: CampaignProposalStatus;
}

interface StoredWeeklyCampaignProposal extends WeeklyCampaignProposal {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface AppliedGeneratedCampaignPayload extends GeneratedCampaignPayload {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface AppliedGeneratedPromotionPayload extends GeneratedPromotionPayload {
  createdAt: Timestamp;
  id: string;
  updatedAt: Timestamp;
}

export interface WeeklyCampaignProposalGenerationResult {
  applied?: boolean;
  applyReason?: string;
  campaignId?: string;
  proposal?: WeeklyCampaignProposal;
  proposalCount: number;
  promotionId?: string;
  reason?: string;
}

interface BuildCampaignProposalPayloadOptions {
  countryCode?: string;
  modelOutput: CampaignProposalDraftOutput;
  now: Date;
  productSummaries: CampaignProductSummary[];
  ruleIdFactory?: () => string;
}

interface NormalizeCampaignProposalModelResultOptions {
  countryCode?: string;
  modelOutput: CampaignProposalModelOutput;
  now: Date;
  productSummaries: CampaignProductSummary[];
  ruleIdFactory?: () => string;
}

interface CampaignProposalDuplicateCampaign {
  campaignIdentifier?: string;
  id: string;
}

interface CampaignProposalDuplicatePromotion {
  code?: string;
  id: string;
}

interface CampaignProposalDuplicateOptions {
  existingCampaigns: CampaignProposalDuplicateCampaign[];
  existingPromotions: CampaignProposalDuplicatePromotion[];
  proposal: WeeklyCampaignProposal;
  promotionId?: string;
}

interface CampaignProposalDuplicateResult {
  entityId: string;
  entityType: "campaign" | "promotion";
  reason: string;
}

function getAdminFirestore() {
  return getAdminDb();
}

function getCompanyCountryCode() {
  const countryCode = (
    process.env.NEXT_PUBLIC_COMPANY_COUNTRY_CODE ?? DEFAULT_COMPANY_COUNTRY_CODE
  )
    .trim()
    .toUpperCase();

  return countryCode || DEFAULT_COMPANY_COUNTRY_CODE;
}

function getCompanyLocationLabel(countryCode: string) {
  return countryCode === DEFAULT_COMPANY_COUNTRY_CODE
    ? DEFAULT_COMPANY_LOCATION_LABEL
    : countryCode;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) {
    return new Date(Number.NaN);
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function maxDate(left: Date, right: Date) {
  return left.getTime() > right.getTime() ? left : right;
}

function minDate(left: Date, right: Date) {
  return left.getTime() < right.getTime() ? left : right;
}

function clampDate(value: Date, min: Date, max: Date) {
  return minDate(maxDate(value, min), max);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizeIdentifier(value: string, fallback: string) {
  const normalized = normalizeSearchText(value)
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

  return normalized || fallback;
}

function normalizePromotionCode(value: string | undefined, fallback: string) {
  const normalized = normalizeSearchText(value ?? fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, "")
    .slice(0, 24);

  return normalized || fallback.toUpperCase().replace(/[^A-Z0-9]+/gu, "");
}

function normalizeComparablePromotionCode(value: string | undefined) {
  return normalizePromotionCode(value, "");
}

function normalizeDiscountPercent(value: number) {
  return Math.max(
    1,
    Math.min(MAX_CAMPAIGN_DISCOUNT_PERCENT, Math.round(value)),
  );
}

function getGeneratedPromotionId(proposal: WeeklyCampaignProposal) {
  return proposal.campaign.id;
}

function buildAppliedCampaignPayload(
  proposal: WeeklyCampaignProposal,
  timestamp: Timestamp,
): AppliedGeneratedCampaignPayload {
  return {
    ...proposal.campaign,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildAppliedPromotionPayload(
  proposal: WeeklyCampaignProposal,
  promotionId: string,
  timestamp: Timestamp,
): AppliedGeneratedPromotionPayload {
  return {
    ...proposal.promotion,
    id: promotionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function findCampaignProposalDuplicate({
  existingCampaigns,
  existingPromotions,
  proposal,
  promotionId = getGeneratedPromotionId(proposal),
}: CampaignProposalDuplicateOptions): CampaignProposalDuplicateResult | null {
  const proposalCampaignIdentifier = normalizeIdentifier(
    proposal.campaign.campaignIdentifier,
    proposal.campaign.id,
  );
  const duplicateCampaign = existingCampaigns.find((campaign) => {
    if (campaign.id === proposal.campaign.id) {
      return false;
    }

    const campaignIdentifier = campaign.campaignIdentifier?.trim();
    if (!campaignIdentifier) {
      return false;
    }

    return (
      normalizeIdentifier(campaignIdentifier, campaign.id) ===
      proposalCampaignIdentifier
    );
  });

  if (duplicateCampaign) {
    return {
      entityId: duplicateCampaign.id,
      entityType: "campaign",
      reason: `Campaign proposal already matches existing campaign ${duplicateCampaign.id}.`,
    };
  }

  const proposalPromotionCode = normalizeComparablePromotionCode(
    proposal.promotion.code,
  );
  const duplicatePromotion = existingPromotions.find((promotion) => {
    if (promotion.id === promotionId) {
      return false;
    }

    const promotionCode = normalizeComparablePromotionCode(promotion.code);
    return Boolean(promotionCode && promotionCode === proposalPromotionCode);
  });

  if (duplicatePromotion) {
    return {
      entityId: duplicatePromotion.id,
      entityType: "promotion",
      reason: `Campaign proposal already matches existing promotion ${duplicatePromotion.id}.`,
    };
  }

  return null;
}

function isEventRelevantToCountry(
  event: MarketingCalendarEvent,
  countryCode: string,
) {
  return event.countryCodes
    .map((code) => code.toUpperCase())
    .includes(countryCode.toUpperCase());
}

function isEventUpcoming(event: MarketingCalendarEvent, now: Date) {
  const today = parseDateOnly(formatDateOnly(now));
  return parseDateOnly(event.endsAt).getTime() >= today.getTime();
}

function getLocalizedSkipReason(
  skipReason: Record<"en" | "pl", string> | undefined,
) {
  const reason = skipReason?.en.trim() || skipReason?.pl.trim();

  return reason || "Campaign proposal generation skipped by the model.";
}

function expandGeneratedLocalizedText(input: {
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

function selectProposalProducts(options: {
  modelProductIds: string[];
  products: CampaignProductSummary[];
}) {
  const productsById = new Map(
    options.products.map((product) => [product.id, product]),
  );
  const seenProductIds = new Set<string>();
  const selectedProductIds = options.modelProductIds.filter((productId) => {
    if (seenProductIds.has(productId)) {
      return false;
    }
    seenProductIds.add(productId);

    const product = productsById.get(productId);
    return Boolean(product);
  });

  if (selectedProductIds.length >= MIN_CAMPAIGN_PRODUCT_COUNT) {
    return selectedProductIds.slice(0, MAX_CAMPAIGN_PRODUCT_COUNT);
  }

  return [];
}

function normalizeCampaignDateRange(options: {
  modelOutput: CampaignProposalDraftOutput;
  now: Date;
}) {
  const today = parseDateOnly(formatDateOnly(options.now));
  const eventStart = parseDateOnly(options.modelOutput.calendarEvent.startsAt);
  const eventEnd = parseDateOnly(options.modelOutput.calendarEvent.endsAt);
  const minStart = maxDate(today, eventStart);
  const modelStart = parseDateOnly(options.modelOutput.startsAt);
  const modelEnd = parseDateOnly(options.modelOutput.endsAt);
  const startsAt = clampDate(modelStart, minStart, eventEnd);
  const endsAt = clampDate(
    modelEnd.getTime() >= startsAt.getTime() ? modelEnd : addDays(startsAt, 13),
    startsAt,
    eventEnd,
  );

  return {
    startsAt: formatDateOnly(startsAt),
    endsAt: formatDateOnly(endsAt),
  };
}

function normalizeMarketingCalendarEventDates(
  event: MarketingCalendarEvent,
): MarketingCalendarEvent {
  return {
    ...event,
    endsAt: formatDateOnly(parseDateOnly(event.endsAt)),
    startsAt: formatDateOnly(parseDateOnly(event.startsAt)),
  };
}

function normalizeAvailabilityTypes(
  values: CampaignProposalDraftOutput["availabilityTypes"],
) {
  const allowed = new Set<CampaignAvailabilityTypeEnum>([
    CampaignAvailabilityTypeEnum.ONLINE,
    CampaignAvailabilityTypeEnum.POS,
  ]);
  const normalized = Array.from(new Set(values)).filter(
    (value): value is CampaignAvailabilityTypeEnum => allowed.has(value),
  );

  return normalized.length > 0
    ? normalized
    : [CampaignAvailabilityTypeEnum.ONLINE, CampaignAvailabilityTypeEnum.POS];
}

export function buildCampaignProposalPayload({
  countryCode = DEFAULT_COMPANY_COUNTRY_CODE,
  modelOutput,
  now,
  productSummaries,
  ruleIdFactory = randomUUID,
}: BuildCampaignProposalPayloadOptions): WeeklyCampaignProposal {
  const event = normalizeMarketingCalendarEventDates(modelOutput.calendarEvent);
  const normalizedModelOutput: CampaignProposalDraftOutput = {
    ...modelOutput,
    calendarEvent: event,
  };

  if (!isEventRelevantToCountry(event, countryCode)) {
    throw new Error(
      `Marketing calendar event ${event.id} is not relevant to ${countryCode}.`,
    );
  }

  if (!isEventUpcoming(event, now)) {
    throw new Error(`Marketing calendar event ${event.id} is not upcoming.`);
  }

  const productIds = selectProposalProducts({
    modelProductIds: modelOutput.productIds,
    products: productSummaries,
  });

  if (
    productIds.length < MIN_CAMPAIGN_PRODUCT_COUNT ||
    productIds.length > MAX_CAMPAIGN_PRODUCT_COUNT
  ) {
    throw new Error("Campaign proposals require one to three known products.");
  }

  const discountPercent = normalizeDiscountPercent(modelOutput.discountPercent);
  const { startsAt, endsAt } = normalizeCampaignDateRange({
    modelOutput: normalizedModelOutput,
    now,
  });
  const eventYear = startsAt.slice(0, 4);
  const campaignIdentifier = normalizeIdentifier(
    modelOutput.campaignIdentifier,
    `${event.id}-${eventYear}`,
  );
  const campaignId = `proposal-${campaignIdentifier}`;
  const promotionCode = normalizePromotionCode(
    modelOutput.promotionCode,
    campaignIdentifier,
  );
  const localizedDescription = expandGeneratedLocalizedText(
    modelOutput.description,
  );
  const justification = expandGeneratedLocalizedText(modelOutput.justification);

  return {
    campaign: {
      availabilityTypes: normalizeAvailabilityTypes(
        modelOutput.availabilityTypes,
      ),
      budget: null,
      campaignIdentifier,
      description: localizedDescription[Locale.pl],
      endsAt,
      id: campaignId,
      name: modelOutput.campaignName.trim(),
      startsAt,
    },
    calendarEvent: event,
    discountPercent,
    id: campaignIdentifier,
    justification,
    localizedDescription,
    productIds,
    promotion: {
      active: true,
      applicationMethod: {
        allocation: ApplicationMethodAllocationEnum.EACH,
        applyToQuantity: 0,
        buyRulesMinQuantity: 0,
        currencyCode: "PLN",
        maxQuantity: 1,
        targetType: ApplicationMethodTargetTypeEnum.ITEMS,
        type: ApplicationMethodTypeEnum.PERCENTAGE,
        value: discountPercent,
      },
      campaignId,
      code: promotionCode,
      isAutomatic: true,
      type: PromotionTypeEnum.STANDARD,
      rules: [
        {
          attribute: PromotionRuleAttributeEnum.PRODUCT,
          description: localizedDescription[Locale.pl],
          id: ruleIdFactory(),
          operator: PromotionRuleOperatorEnum.IN,
          type: PromotionTypeEnum.STANDARD,
          values: productIds,
        },
      ],
    },
    source: "ai",
    status: "pending_review",
  };
}

export function normalizeCampaignProposalModelResult({
  countryCode = DEFAULT_COMPANY_COUNTRY_CODE,
  modelOutput,
  now,
  productSummaries,
  ruleIdFactory,
}: NormalizeCampaignProposalModelResultOptions): WeeklyCampaignProposalGenerationResult {
  if (!modelOutput.shouldCreateCampaign) {
    return {
      proposalCount: 0,
      reason: getLocalizedSkipReason(modelOutput.skipReason),
    };
  }

  if (!modelOutput.proposal) {
    return {
      proposalCount: 0,
      reason: "Campaign proposal generation did not return a proposal.",
    };
  }

  return {
    proposal: buildCampaignProposalPayload({
      countryCode,
      modelOutput: modelOutput.proposal,
      now,
      productSummaries,
      ruleIdFactory,
    }),
    proposalCount: 1,
  };
}

function mapHolidayToMarketingEvent(
  holiday: z.infer<typeof publicHolidayApiSchema>[number],
): MarketingCalendarEvent {
  const holidayDate = parseDateOnly(holiday.date);

  return {
    id: normalizeIdentifier(holiday.localName, holiday.date),
    countryCodes: [holiday.countryCode.toUpperCase()],
    endsAt: formatDateOnly(addDays(holidayDate, 2)),
    name: {
      en: holiday.name,
      pl: holiday.localName,
    },
    reason: {
      en: `${holiday.name} is a local public holiday in ${holiday.countryCode}, so timing is relevant to the company's operating calendar.`,
      pl: `${holiday.localName} to lokalne święto w ${holiday.countryCode}, więc termin pasuje do kalendarza działania firmy.`,
    },
    source: "api",
    sourceUrl: `https://date.nager.at/api/v3/PublicHolidays/${holidayDate.getUTCFullYear()}/${holiday.countryCode.toUpperCase()}`,
    startsAt: formatDateOnly(addDays(holidayDate, -14)),
  };
}

async function fetchPublicHolidayMarketingEvents(options: {
  countryCode: string;
  now: Date;
}) {
  const countryCode = options.countryCode.toUpperCase();
  const years = Array.from(
    new Set([options.now.getUTCFullYear(), options.now.getUTCFullYear() + 1]),
  );
  const results = await Promise.allSettled(
    years.map(async (year) => {
      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
      );

      if (!response.ok) {
        throw new Error(
          `Marketing calendar public-holiday API failed with ${response.status}.`,
        );
      }

      const data: unknown = await response.json();
      const parsed = publicHolidayApiSchema.parse(data);
      return parsed.map(mapHolidayToMarketingEvent);
    }),
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
}

export async function getMarketingCalendarEvents(options: {
  countryCode: string;
  now: Date;
}) {
  const apiEvents = await fetchPublicHolidayMarketingEvents(options);

  return apiEvents
    .filter((event) => isEventRelevantToCountry(event, options.countryCode))
    .filter((event) => isEventUpcoming(event, options.now))
    .filter((event) => marketingCalendarEventSchema.safeParse(event).success);
}

async function getActiveCampaignProducts() {
  if (!storeChannelId) {
    return [];
  }

  const firestore = getAdminFirestore();
  const snapshot = await firestore
    .collection(`channels/${storeChannelId}/products`)
    .where("active", "==", true)
    .where("availability.published", "==", true)
    .limit(CAMPAIGN_PRODUCT_CONTEXT_LIMIT)
    .get();

  return snapshot.docs
    .map((doc) =>
      campaignProductSchema.safeParse({
        ...doc.data(),
        id: doc.id,
      }),
    )
    .filter((result) => result.success)
    .map((result) => result.data)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

async function getExistingCampaignContext() {
  try {
    const snapshot = await getAdminFirestore()
      .collection("campaigns")
      .orderBy("updatedAt", "desc")
      .limit(EXISTING_CAMPAIGN_CONTEXT_LIMIT)
      .get();

    return snapshot.docs
      .map((doc) =>
        existingCampaignContextSchema.safeParse({
          ...doc.data(),
          id: doc.id,
        }),
      )
      .filter((result) => result.success)
      .map((result) => result.data);
  } catch (error) {
    console.error("Failed to load existing campaign context:", error);
    return [];
  }
}

async function getExistingPromotionContext() {
  try {
    const snapshot = await getAdminFirestore()
      .collection("promotions")
      .orderBy("updatedAt", "desc")
      .limit(EXISTING_PROMOTION_CONTEXT_LIMIT)
      .get();

    return snapshot.docs
      .map((doc) =>
        existingPromotionContextSchema.safeParse({
          ...doc.data(),
          id: doc.id,
        }),
      )
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter((promotion) => promotion.active !== false);
  } catch (error) {
    console.error("Failed to load existing promotion context:", error);
    return [];
  }
}

async function getExistingCampaignProposalContext() {
  try {
    const snapshot = await getAdminFirestore()
      .collectionGroup(CAMPAIGN_PROPOSALS_SUBCOLLECTION)
      .orderBy("updatedAt", "desc")
      .limit(EXISTING_CAMPAIGN_PROPOSAL_CONTEXT_LIMIT)
      .get();

    return snapshot.docs
      .map((doc) =>
        existingCampaignProposalContextSchema.safeParse({
          ...doc.data(),
          id: doc.id,
        }),
      )
      .filter((result) => result.success)
      .map((result) => result.data);
  } catch (error) {
    console.error("Failed to load existing campaign proposal context:", error);
    return [];
  }
}

function createCampaignProposalPrompt(context: Record<string, unknown>) {
  return [
    "Create one simple promotional campaign proposal from this marketing calendar context:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

async function generateCampaignProposalModelOutput(options: {
  countryCode: string;
  events: MarketingCalendarEvent[];
  existingCampaignProposals: Array<
    z.infer<typeof existingCampaignProposalContextSchema>
  >;
  existingCampaigns: Array<z.infer<typeof existingCampaignContextSchema>>;
  existingPromotions: Array<z.infer<typeof existingPromotionContextSchema>>;
  now: Date;
  products: CampaignProductSummary[];
}) {
  const model = await getAdminVertexLanguageModel(MODELS.GEMINI_3_FLASH);
  const meteredGenerateText = createMeteredAdminGenerateText({
    channelId: storeChannelId,
    generateText,
    model: MODELS.GEMINI_3_FLASH,
    provider: "google-vertex",
    source: "admin-action",
  });
  const locationLabel = getCompanyLocationLabel(options.countryCode);
  const context = {
    companyLocation: {
      countryCode: options.countryCode,
      label: locationLabel,
    },
    currentDate: formatDateOnly(options.now),
    planningWindow: {
      startsAt: formatDateOnly(options.now),
      endsAt: formatDateOnly(
        addDays(options.now, CAMPAIGN_PLANNING_WINDOW_DAYS),
      ),
    },
    marketingCalendarEvents: options.events,
    products: options.products.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category?.name ?? "",
      description: product.description,
      seoTitle: product.seo?.title ?? "",
      seoDescription: product.seo?.description ?? "",
      keywords: product.keywords ?? [],
    })),
    existingCampaigns: options.existingCampaigns,
    existingPromotions: options.existingPromotions,
    existingCampaignProposals: options.existingCampaignProposals,
  };
  const { output } = await meteredGenerateText({
    model,
    instructions: [
      AGENT_HARNESS_SHARED_INSTRUCTIONS,
      "You prepare reviewable promotional campaign proposals for a Polish printing/e-commerce admin.",
      "Decide whether to create zero or one campaign proposal for the planning window.",
      "Return shouldCreateCampaign=false when there is no strong upcoming local opportunity or when an existing campaign, active promotion, or pending campaign proposal already covers the same occasion, product set, or promotion angle.",
      "Use the provided marketing calendar API events when one fits the company location, timing, and products.",
      "If no API event fits but the company location, current date, planning window, products, and existing plan context support a concrete upcoming local business or seasonal opportunity, you may create a calendarEvent with source 'agent'.",
      "Do not invent a generic global occasion. The event must be specific to the company location, local business calendar, seasonality, or the provided products.",
      "Use date-only strings in YYYY-MM-DD format for all startsAt and endsAt fields.",
      `Choose ${MIN_CAMPAIGN_PRODUCT_COUNT}-${MAX_CAMPAIGN_PRODUCT_COUNT} target product IDs from the provided products only.`,
      `The percentage discount must be ${MAX_CAMPAIGN_DISCOUNT_PERCENT} or lower.`,
      "Use natural English and Polish copy.",
      "Set availabilityTypes to ONLINE and POS unless the event or product fit clearly supports only one channel.",
      "When proposing a campaign, return a short justification that names the selected local event and explains why it fits the selected products.",
      "When skipping, return a concise skipReason explaining what existing plan covers it or why no campaign should be generated.",
    ].join("\n\n"),
    prompt: createCampaignProposalPrompt(context),
    output: Output.object({ schema: campaignProposalModelOutputSchema }),
  });

  return output;
}

function getCampaignProposalsCollection(changeId: string) {
  return getAdminFirestore()
    .collection("whatsNewFeed")
    .doc(changeId)
    .collection(CAMPAIGN_PROPOSALS_SUBCOLLECTION);
}

async function replaceWeeklyCampaignProposal(
  changeId: string,
  proposal: WeeklyCampaignProposal,
) {
  const collection = getCampaignProposalsCollection(changeId);
  const existingDocs = await collection.get();
  const batch = getAdminFirestore().batch();
  const now = Timestamp.now();
  const storedProposal: StoredWeeklyCampaignProposal = {
    ...proposal,
    createdAt: now,
    updatedAt: now,
  };

  existingDocs.docs.forEach((doc) => batch.delete(doc.ref));
  batch.set(collection.doc(proposal.id), storedProposal);

  await batch.commit();
}

async function clearWeeklyCampaignProposals(changeId: string) {
  const collection = getCampaignProposalsCollection(changeId);
  const existingDocs = await collection.get();

  if (existingDocs.empty) {
    return;
  }

  const batch = getAdminFirestore().batch();
  existingDocs.docs.forEach((doc) => batch.delete(doc.ref));

  await batch.commit();
}

async function applyWeeklyCampaignProposal(
  proposal: WeeklyCampaignProposal,
): Promise<
  Required<
    Pick<
      WeeklyCampaignProposalGenerationResult,
      "applied" | "campaignId" | "promotionId"
    >
  > & {
    applyReason?: string;
  }
> {
  const firestore = getAdminFirestore();
  const campaignId = proposal.campaign.id;
  const promotionId = getGeneratedPromotionId(proposal);
  const campaignRef = firestore.collection("campaigns").doc(campaignId);
  const promotionRef = firestore.collection("promotions").doc(promotionId);

  return await firestore.runTransaction(async (transaction) => {
    const [campaignDoc, promotionDoc, matchingCampaigns, matchingPromotions] =
      await Promise.all([
        transaction.get(campaignRef),
        transaction.get(promotionRef),
        transaction.get(
          firestore
            .collection("campaigns")
            .where(
              "campaignIdentifier",
              "==",
              proposal.campaign.campaignIdentifier,
            )
            .limit(1),
        ),
        transaction.get(
          firestore
            .collection("promotions")
            .where("code", "==", proposal.promotion.code)
            .limit(1),
        ),
      ]);
    const duplicate = findCampaignProposalDuplicate({
      existingCampaigns: matchingCampaigns.docs.map((doc) => ({
        id: doc.id,
        campaignIdentifier:
          typeof doc.get("campaignIdentifier") === "string"
            ? doc.get("campaignIdentifier")
            : undefined,
      })),
      existingPromotions: matchingPromotions.docs.map((doc) => ({
        id: doc.id,
        code: typeof doc.get("code") === "string" ? doc.get("code") : undefined,
      })),
      proposal,
      promotionId,
    });

    if (duplicate) {
      return {
        applied: false,
        applyReason: duplicate.reason,
        campaignId,
        promotionId,
      };
    }

    if (campaignDoc.exists && promotionDoc.exists) {
      return {
        applied: false,
        applyReason: "Campaign proposal has already been applied.",
        campaignId,
        promotionId,
      };
    }

    const now = Timestamp.now();

    if (!campaignDoc.exists) {
      transaction.set(campaignRef, buildAppliedCampaignPayload(proposal, now));
    }

    if (!promotionDoc.exists) {
      transaction.set(
        promotionRef,
        buildAppliedPromotionPayload(proposal, promotionId, now),
      );
    }

    return {
      applied: true,
      campaignId,
      promotionId,
    };
  });
}

export async function generateAndSaveWeeklyCampaignProposal(options: {
  changeId: string;
  now: Date;
  persist: boolean;
}): Promise<WeeklyCampaignProposalGenerationResult> {
  const countryCode = getCompanyCountryCode();
  const [
    products,
    events,
    existingCampaigns,
    existingPromotions,
    existingCampaignProposals,
  ] = await Promise.all([
    getActiveCampaignProducts(),
    getMarketingCalendarEvents({
      countryCode,
      now: options.now,
    }),
    getExistingCampaignContext(),
    getExistingPromotionContext(),
    getExistingCampaignProposalContext(),
  ]);

  if (products.length === 0) {
    if (options.persist) {
      await clearWeeklyCampaignProposals(options.changeId);
    }

    return {
      proposalCount: 0,
      reason: "No active store products available for campaign proposals.",
    };
  }

  const modelOutput = await generateCampaignProposalModelOutput({
    countryCode,
    events,
    existingCampaignProposals,
    existingCampaigns,
    existingPromotions,
    now: options.now,
    products,
  });
  const result = normalizeCampaignProposalModelResult({
    modelOutput,
    now: options.now,
    countryCode,
    productSummaries: products,
  });

  if (result.proposalCount === 0 || !result.proposal) {
    if (options.persist) {
      await clearWeeklyCampaignProposals(options.changeId);
    }

    return result;
  }

  if (options.persist) {
    const duplicate = findCampaignProposalDuplicate({
      existingCampaigns,
      existingPromotions,
      proposal: result.proposal,
    });

    if (duplicate) {
      await clearWeeklyCampaignProposals(options.changeId);

      return {
        applied: false,
        applyReason: duplicate.reason,
        campaignId: result.proposal.campaign.id,
        proposalCount: 0,
        promotionId: getGeneratedPromotionId(result.proposal),
        reason: duplicate.reason,
      };
    }

    const applyResult = await applyWeeklyCampaignProposal(result.proposal);

    if (!applyResult.applied) {
      await clearWeeklyCampaignProposals(options.changeId);

      return {
        ...applyResult,
        proposalCount: 0,
        reason: applyResult.applyReason,
      };
    }

    const appliedProposal: WeeklyCampaignProposal = {
      ...result.proposal,
      status: "applied",
    };

    await replaceWeeklyCampaignProposal(options.changeId, appliedProposal);

    return {
      ...result,
      ...applyResult,
      proposal: appliedProposal,
    };
  }

  return result;
}
