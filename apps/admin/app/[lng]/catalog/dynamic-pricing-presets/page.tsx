import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import PresetsPage from "./presets-page";

export default async function Page() {
  return <PresetsPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("admin.dynamicPricing.title", {
      defaultValue: "Dynamic pricing",
    }),
  };
}
