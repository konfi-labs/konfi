import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import StockManagementPage from "./stock-management-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  return <StockManagementPage warehouseId={resolvedParams.id} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.attributesStock", { defaultValue: "Material Stock" }),
  };
}
