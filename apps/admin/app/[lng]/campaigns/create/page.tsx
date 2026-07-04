import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import CampaignCreatePage from "./create-campaign-page";

export default async function Page() {
  return <CampaignCreatePage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string; }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.campaignsCreate"),
  };
}
