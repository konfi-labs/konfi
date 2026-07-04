import i18next from "@/i18n/i18next";
import { getAppForServer } from "@/lib/firebase/serverApp";
import { serializeFirestoreTimestamp } from "@/lib/firestore-timestamp";
import { Campaign, Promotion } from "@konfi/types";
import { Metadata } from "next";
import PromotionPage from "./promotion-page";

type CampaignBudgetType = NonNullable<Campaign["budget"]>["type"];

type PromotionPageRule = {
  id: string;
  description?: string | null;
  attribute?: NonNullable<Promotion["rules"]>[number]["attribute"];
  operator?: NonNullable<Promotion["rules"]>[number]["operator"];
  values: string[];
};

type PromotionPagePromotion = {
  id: string;
  code?: string;
  type?: Promotion["type"];
  isAutomatic?: boolean;
  isOneTime?: boolean;
  minimumOrderValue?: number | null;
  active: boolean;
  campaignId?: string | null;
  applicationMethod?: {
    type?: NonNullable<Promotion["applicationMethod"]>["type"];
    targetType?: NonNullable<Promotion["applicationMethod"]>["targetType"];
    allocation?: NonNullable<Promotion["applicationMethod"]>["allocation"];
    value?: number;
    currencyCode?: string;
    maxQuantity?: number | null;
    buyRulesMinQuantity?: number | null;
    applyToQuantity?: number | null;
  };
  rules?: PromotionPageRule[];
  createdAt?: string;
  updatedAt?: string;
};

type PromotionPageCampaign = {
  id: string;
  name?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  availabilityTypes?: Campaign["availabilityTypes"];
  budget?: {
    type?: CampaignBudgetType;
    limit?: number | null;
    used?: number;
    currencyCode?: string;
  };
};

async function getPromotion(id: string) {
  try {
    if (!id) return undefined;
    const where = (await import("firebase/firestore")).where;
    const get = (await import("@konfi/firebase")).get;
    const db = (await import("@konfi/firebase")).db;
    const { firestore } = await getAppForServer();
    const result = await get(
      db.query<Promotion>(firestore, "promotions", 1, undefined, [
        where("id", "==", id),
      ]),
    );
    if (!result) return undefined;
    const [promotions] = result;
    return promotions[0];
  } catch (error) {
    console.error("Error fetching promotion:", error);
    return undefined;
  }
}

async function getCampaign(id: string) {
  try {
    if (!id) return undefined;
    const where = (await import("firebase/firestore")).where;
    const get = (await import("@konfi/firebase")).get;
    const db = (await import("@konfi/firebase")).db;
    const { firestore } = await getAppForServer();
    const result = await get(
      db.query<Campaign>(firestore, "campaigns", 1, undefined, [
        where("id", "==", id),
      ]),
    );
    if (!result) return undefined;
    const [campaigns] = result;
    return campaigns[0];
  } catch (error) {
    console.error("Error fetching promotion campaign:", error);
    return undefined;
  }
}

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const promotion = await getPromotion(id);
  const campaign = promotion?.campaignId
    ? await getCampaign(promotion.campaignId)
    : undefined;

  const promotionPagePromotion: PromotionPagePromotion | undefined = promotion
    ? {
        id: promotion.id,
        code: promotion.code,
        type: promotion.type,
        isAutomatic: promotion.isAutomatic,
        isOneTime: promotion.isOneTime,
        minimumOrderValue: promotion.minimumOrderValue,
        active: promotion.active,
        campaignId: promotion.campaignId,
        applicationMethod: promotion.applicationMethod
          ? {
              type: promotion.applicationMethod.type,
              targetType: promotion.applicationMethod.targetType,
              allocation: promotion.applicationMethod.allocation,
              value: promotion.applicationMethod.value,
              currencyCode: promotion.applicationMethod.currencyCode,
              maxQuantity: promotion.applicationMethod.maxQuantity,
              buyRulesMinQuantity:
                promotion.applicationMethod.buyRulesMinQuantity,
              applyToQuantity: promotion.applicationMethod.applyToQuantity,
            }
          : undefined,
        rules: promotion.rules?.map((rule) => ({
          id: rule.id,
          description: rule.description,
          attribute: rule.attribute,
          operator: rule.operator,
          values: rule.values,
        })),
        createdAt: serializeFirestoreTimestamp(promotion.createdAt),
        updatedAt: serializeFirestoreTimestamp(promotion.updatedAt),
      }
    : undefined;
  const promotionPageCampaign: PromotionPageCampaign | undefined = campaign
    ? {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        availabilityTypes: campaign.availabilityTypes,
        budget: campaign.budget
          ? {
              type: campaign.budget.type,
              limit: campaign.budget.limit,
              used: campaign.budget.used,
              currencyCode: campaign.budget.currencyCode,
            }
          : undefined,
      }
    : undefined;

  return (
    <PromotionPage
      promotion={promotionPagePromotion}
      campaign={promotionPageCampaign}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.promotion"),
  };
}
