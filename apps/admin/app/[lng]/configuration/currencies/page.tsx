import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import CurrenciesPage from "./currencies-page";

export default async function Page() {
  return <CurrenciesPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configCurrencies", {
      defaultValue: "Currencies",
    }),
  };
}
