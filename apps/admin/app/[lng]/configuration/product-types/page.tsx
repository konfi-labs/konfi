import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import ProductTypesPage from "./product-types-page";

export default async function Page() {
  return <ProductTypesPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configProductTypes"),
  };
}
