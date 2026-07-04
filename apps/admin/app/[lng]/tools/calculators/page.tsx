import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import CalculatorsPage from "./calculators-page";

export default async function Page() {
  return <CalculatorsPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.calculators"),
  };
}
