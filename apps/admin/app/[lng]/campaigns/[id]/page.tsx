import i18next from "@/i18n/i18next";
import { getAppForServer } from "@/lib/firebase/serverApp";
import { serializeFirestoreTimestamp } from "@/lib/firestore-timestamp";
import { Campaign, Promotion } from "@konfi/types";
import { Metadata } from "next";
import CampaignPage from "./campaign-page";

type CampaignBudgetType = NonNullable<Campaign["budget"]>["type"];
type PromotionApplicationMethodType = NonNullable<
  Promotion["applicationMethod"]
>["type"];

type CampaignPagePromotion = {
  id: string;
  code?: string;
  type?: Promotion["type"];
  active: boolean;
  applicationMethod?: {
    type?: PromotionApplicationMethodType;
    value?: number;
    currencyCode?: string;
  };
};

type CampaignPageCampaign = {
  id: string;
  name?: string;
  description?: string;
  campaignIdentifier?: string;
  startsAt?: string;
  endsAt?: string;
  availabilityTypes?: Campaign["availabilityTypes"];
  budget?: {
    type?: CampaignBudgetType;
    limit?: number | null;
    used?: number;
    currencyCode?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  promotions?: CampaignPagePromotion[];
};

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
    console.error("Error fetching campaign:", error);
    return undefined;
  }
}

async function getCampaignPromotions(campaignId: string) {
  try {
    if (!campaignId) return [];
    const where = (await import("firebase/firestore")).where;
    const get = (await import("@konfi/firebase")).get;
    const db = (await import("@konfi/firebase")).db;
    const { firestore } = await getAppForServer();
    const result = await get(
      db.query<Promotion>(firestore, "promotions", 250, undefined, [
        where("campaignId", "==", campaignId),
      ]),
    );

    if (!result) {
      return [];
    }

    const [promotions] = result;

    return promotions.sort((left, right) =>
      (left.code ?? left.id).localeCompare(right.code ?? right.id),
    );
  } catch (error) {
    console.error("Error fetching campaign promotions:", error);
    return [];
  }
}

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  const promotions = campaign ? await getCampaignPromotions(campaign.id) : [];
  const campaignPageCampaign: CampaignPageCampaign | undefined = campaign
    ? {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        campaignIdentifier: campaign.campaignIdentifier,
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
        createdAt: serializeFirestoreTimestamp(campaign.createdAt),
        updatedAt: serializeFirestoreTimestamp(campaign.updatedAt),
        promotions: promotions.map((promotion) => ({
          id: promotion.id,
          code: promotion.code,
          type: promotion.type,
          active: promotion.active,
          applicationMethod: promotion.applicationMethod
            ? {
                type: promotion.applicationMethod.type,
                value: promotion.applicationMethod.value,
                currencyCode: promotion.applicationMethod.currencyCode,
              }
            : undefined,
        })),
      }
    : undefined;

  return <CampaignPage campaign={campaignPageCampaign} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.campaigns"),
  };
}
