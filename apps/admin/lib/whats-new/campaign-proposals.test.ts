import { describe, expect, it, vi } from "vitest";
import {
  CampaignAvailabilityTypeEnum,
  Locale,
  PromotionTypeEnum,
} from "@konfi/types";
import {
  buildCampaignProposalPayload,
  findCampaignProposalDuplicate,
  MAX_CAMPAIGN_DISCOUNT_PERCENT,
  MAX_CAMPAIGN_PRODUCT_COUNT,
  normalizeCampaignProposalModelResult,
  type CampaignProductSummary,
  type MarketingCalendarEvent,
} from "./campaign-proposals";

vi.mock("server-only", () => ({}));

const now = new Date("2026-05-03T12:00:00.000Z");

function createEvent(
  overrides: Partial<MarketingCalendarEvent> = {},
): MarketingCalendarEvent {
  return {
    countryCodes: ["PL"],
    endsAt: "2026-05-30",
    id: "communion-season",
    name: {
      en: "First Communion season",
      pl: "Sezon komunijny",
    },
    reason: {
      en: "Local Polish seasonal demand.",
      pl: "Lokalny polski sezon.",
    },
    source: "api",
    startsAt: "2026-05-01",
    ...overrides,
  };
}

function createProduct(
  id: string,
  name: string,
  categoryName: string,
): CampaignProductSummary {
  return {
    category: {
      name: categoryName,
    },
    description: `${name} for seasonal promotions.`,
    id,
    keywords: [categoryName],
    name,
    seo: {
      description: `${name} ${categoryName}`,
      title: name,
    },
  };
}

describe("weekly campaign proposals", () => {
  it("caps percentage discounts and keeps one to three products", () => {
    const proposal = buildCampaignProposalPayload({
      countryCode: "PL",
      modelOutput: {
        availabilityTypes: [
          CampaignAvailabilityTypeEnum.ONLINE,
          CampaignAvailabilityTypeEnum.POS,
        ],
        calendarEvent: createEvent(),
        campaignIdentifier: "Komunia 2026",
        campaignName: "Komunia -45%",
        description: {
          en: "Discount for communion-season print.",
          pl: "Rabat na druki komunijne.",
        },
        discountPercent: 45,
        endsAt: "2026-05-20",
        justification: {
          en: "Uses a Polish seasonal event.",
          pl: "Wykorzystuje polski sezon.",
        },
        productIds: ["banner-1", "poster-1", "sticker-1", "calendar-1"],
        promotionCode: "KOMUNIA45",
        startsAt: "2026-05-05",
      },
      now,
      productSummaries: [
        createProduct("banner-1", "Outdoor banner", "banner"),
        createProduct("poster-1", "Event poster", "poster"),
        createProduct("sticker-1", "Round sticker", "sticker"),
        createProduct("calendar-1", "Desk calendar", "calendar"),
      ],
      ruleIdFactory: () => "rule-1",
    });

    expect(proposal.discountPercent).toBe(MAX_CAMPAIGN_DISCOUNT_PERCENT);
    expect(proposal.promotion.applicationMethod.value).toBe(
      MAX_CAMPAIGN_DISCOUNT_PERCENT,
    );
    expect(proposal.promotion.type).toBe(PromotionTypeEnum.STANDARD);
    expect(proposal.productIds).toHaveLength(MAX_CAMPAIGN_PRODUCT_COUNT);
    expect(proposal.promotion.rules[0]?.values).toEqual([
      "banner-1",
      "poster-1",
      "sticker-1",
    ]);
  });

  it("rejects model-selected calendar events outside the company country", () => {
    expect(() =>
      buildCampaignProposalPayload({
        countryCode: "PL",
        modelOutput: {
          availabilityTypes: [CampaignAvailabilityTypeEnum.ONLINE],
          calendarEvent: createEvent({
            countryCodes: ["US"],
            id: "us-tax-day",
          }),
          campaignIdentifier: "US Tax Day",
          campaignName: "US Tax Day campaign",
          description: {
            en: "Invalid local campaign.",
            pl: "Nieprawidłowa lokalna kampania.",
          },
          discountPercent: 20,
          endsAt: "2026-05-20",
          justification: {
            en: "Not local to Poland.",
            pl: "Nie jest lokalne dla Polski.",
          },
          productIds: ["banner-1"],
          startsAt: "2026-05-05",
        },
        now,
        productSummaries: [
          createProduct("banner-1", "Outdoor banner", "banner"),
        ],
        ruleIdFactory: () => "rule-1",
      }),
    ).toThrow("not relevant to PL");
  });

  it("bounds campaign dates to the selected local calendar window", () => {
    const proposal = buildCampaignProposalPayload({
      countryCode: "PL",
      modelOutput: {
        availabilityTypes: [CampaignAvailabilityTypeEnum.ONLINE],
        calendarEvent: createEvent({
          endsAt: "2026-05-12",
          startsAt: "2026-04-20",
        }),
        campaignIdentifier: "Maj Local",
        campaignName: "Majowa kampania",
        description: {
          en: "Local May campaign.",
          pl: "Lokalna kampania majowa.",
        },
        discountPercent: 20,
        endsAt: "2026-06-30",
        justification: {
          en: "Selected for the local Polish calendar.",
          pl: "Wybrane z lokalnego polskiego kalendarza.",
        },
        productIds: ["banner-1"],
        startsAt: "2026-04-01",
      },
      now,
      productSummaries: [createProduct("banner-1", "Outdoor banner", "banner")],
      ruleIdFactory: () => "rule-1",
    });

    expect(proposal.campaign.startsAt).toBe("2026-05-03");
    expect(proposal.campaign.endsAt).toBe("2026-05-12");
    expect(proposal.justification[Locale.en]).toContain("local Polish");
  });

  it("normalizes ISO datetimes from model output into campaign dates", () => {
    const proposal = buildCampaignProposalPayload({
      countryCode: "PL",
      modelOutput: {
        availabilityTypes: [
          CampaignAvailabilityTypeEnum.ONLINE,
          CampaignAvailabilityTypeEnum.POS,
        ],
        calendarEvent: createEvent({
          endsAt: "2026-05-26T23:59:59Z",
          id: "dzien-matki-2026-pl",
          name: {
            en: "Mother's Day",
            pl: "Dzień Matki",
          },
          source: "agent",
          startsAt: "2026-05-05T00:00:00Z",
        }),
        campaignIdentifier: "dzien-matki-2026",
        campaignName: "Dzień Matki - Personalizowane Prezenty",
        description: {
          en: "Celebrate Mother's Day with a discount.",
          pl: "Świętuj Dzień Matki z rabatem.",
        },
        discountPercent: 20,
        endsAt: "2026-05-26T23:59:59Z",
        justification: {
          en: "Mother's Day fits personalized print products.",
          pl: "Dzień Matki pasuje do personalizowanych druków.",
        },
        productIds: ["mug-1", "canvas-1", "poster-1"],
        promotionCode: "MAMA20",
        startsAt: "2026-05-05T08:00:00Z",
      },
      now,
      productSummaries: [
        createProduct("mug-1", "White mug", "mug"),
        createProduct("canvas-1", "Photo canvas", "canvas"),
        createProduct("poster-1", "Premium poster", "poster"),
      ],
      ruleIdFactory: () => "rule-1",
    });

    expect(proposal.calendarEvent.startsAt).toBe("2026-05-05");
    expect(proposal.calendarEvent.endsAt).toBe("2026-05-26");
    expect(proposal.campaign.startsAt).toBe("2026-05-05");
    expect(proposal.campaign.endsAt).toBe("2026-05-26");
    expect(proposal.promotion.code).toBe("MAMA20");
  });

  it("allows the model to skip when an existing campaign already covers it", () => {
    const result = normalizeCampaignProposalModelResult({
      countryCode: "PL",
      modelOutput: {
        shouldCreateCampaign: false,
        skipReason: {
          en: "Existing campaign already covers this opportunity.",
          pl: "Istniejąca kampania już pokrywa tę okazję.",
        },
      },
      now,
      productSummaries: [createProduct("banner-1", "Outdoor banner", "banner")],
    });

    expect(result.proposalCount).toBe(0);
    expect(result.proposal).toBeUndefined();
    expect(result.reason).toContain("Existing campaign");
  });

  it("detects duplicate campaign ideas before applying generated documents", () => {
    const proposal = buildCampaignProposalPayload({
      countryCode: "PL",
      modelOutput: {
        availabilityTypes: [CampaignAvailabilityTypeEnum.ONLINE],
        calendarEvent: createEvent(),
        campaignIdentifier: "Dzień Matki 2026",
        campaignName: "Dzień Matki",
        description: {
          en: "Mother's Day print campaign.",
          pl: "Kampania druków na Dzień Matki.",
        },
        discountPercent: 15,
        endsAt: "2026-05-26",
        justification: {
          en: "Mother's Day fits gift prints.",
          pl: "Dzień Matki pasuje do druków prezentowych.",
        },
        productIds: ["poster-1"],
        promotionCode: "MAMA15",
        startsAt: "2026-05-10",
      },
      now,
      productSummaries: [createProduct("poster-1", "Premium poster", "poster")],
      ruleIdFactory: () => "rule-1",
    });

    const duplicate = findCampaignProposalDuplicate({
      existingCampaigns: [
        {
          id: "manual-campaign",
          campaignIdentifier: "dzien-matki-2026",
        },
      ],
      existingPromotions: [],
      proposal,
    });

    expect(duplicate).toEqual({
      entityId: "manual-campaign",
      entityType: "campaign",
      reason:
        "Campaign proposal already matches existing campaign manual-campaign.",
    });
  });

  it("detects duplicate promotion codes before applying generated documents", () => {
    const proposal = buildCampaignProposalPayload({
      countryCode: "PL",
      modelOutput: {
        availabilityTypes: [CampaignAvailabilityTypeEnum.ONLINE],
        calendarEvent: createEvent(),
        campaignIdentifier: "Komunia 2026",
        campaignName: "Komunia",
        description: {
          en: "Communion season print campaign.",
          pl: "Kampania druków komunijnych.",
        },
        discountPercent: 20,
        endsAt: "2026-05-20",
        justification: {
          en: "Communion season fits invitations.",
          pl: "Sezon komunijny pasuje do zaproszeń.",
        },
        productIds: ["poster-1"],
        promotionCode: "Komunia 20",
        startsAt: "2026-05-05",
      },
      now,
      productSummaries: [createProduct("poster-1", "Premium poster", "poster")],
      ruleIdFactory: () => "rule-1",
    });

    const duplicate = findCampaignProposalDuplicate({
      existingCampaigns: [],
      existingPromotions: [
        {
          id: "existing-promotion",
          code: "KOMUNIA20",
        },
      ],
      proposal,
    });

    expect(duplicate).toEqual({
      entityId: "existing-promotion",
      entityType: "promotion",
      reason:
        "Campaign proposal already matches existing promotion existing-promotion.",
    });
  });
});
