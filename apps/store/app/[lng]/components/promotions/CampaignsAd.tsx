import {
  getAdminDb,
  shouldSkipStaticDataDuringCiBuild,
} from "@/lib/firebase/serverApp";
import { Campaign, Promotion, type StorefrontButtonStyle } from "@konfi/types";
import { validatePromotion } from "@konfi/utils";
import { connection } from "next/server";
import CampaignsAdClient from "./CampaignsAdClient";

async function getCampaigns(): Promise<Campaign[]> {
  try {
    const firestore = getAdminDb();
    const campaignsSnapshot = await firestore
      .collection("campaigns")
      .limit(5)
      .get();
    const campaigns = campaignsSnapshot.docs.map(
      (doc) => doc.data() as Campaign,
    );
    const _campaigns: Campaign[] = [];
    for (const campaign of campaigns) {
      const promotionsSnapshot = await firestore
        .collection("promotions")
        .where("campaignId", "==", campaign.id)
        .where("active", "==", true)
        .limit(5)
        .get();
      const promotions = promotionsSnapshot.docs.map(
        (doc) => doc.data() as Promotion,
      );
      campaign.promotions = [];
      for (const promotion of promotions) {
        if (validatePromotion(promotion, campaign)) {
          campaign.promotions.push(promotion);
        }
      }
      if (campaign.promotions.length) _campaigns.push(campaign);
    }
    return _campaigns;
  } catch {
    console.warn("Error while fetching campaigns");
    return [];
  }
}

export async function getCampaignsAdPayload() {
  if (shouldSkipStaticDataDuringCiBuild()) {
    return undefined;
  }

  await connection();

  const campaigns = await getCampaigns();

  return campaigns.length ? JSON.stringify(campaigns) : undefined;
}

export default async function CampaignsAd(
  lng: string,
  buttonStyle: StorefrontButtonStyle = "solid",
) {
  const campaigns = await getCampaignsAdPayload();

  if (!campaigns) return null;
  return (
    <CampaignsAdClient
      key={"campaigns-ad-client"}
      buttonStyle={buttonStyle}
      campaigns={campaigns}
      lng={lng ?? ""}
    />
  );
}
