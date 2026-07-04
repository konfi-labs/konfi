import i18next from "@/i18n/i18next";
import { Metadata, Viewport } from "next";
import LogisticsPage from "./logistics-page";

export default async function Page() {
  return <LogisticsPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.logistics"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  userScalable: false,
};
