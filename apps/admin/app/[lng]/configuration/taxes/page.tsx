import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import TaxesPage from "./taxes-page";

export default async function Page() {
  return <TaxesPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configTaxes", {
      defaultValue: "Taxes & Regions",
    }),
  };
}
