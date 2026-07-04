import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import CreateProductPage from "./create-product-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    agentRunId?: string;
    duplicate?: string;
    externalProductId?: string;
    categoryId?: string;
  }>;
}) {
  const { agentRunId, duplicate, externalProductId, categoryId } = await searchParams;
  return (
    <CreateProductPage
      agentRunId={agentRunId}
      duplicateId={duplicate}
      externalProductId={externalProductId}
      categoryId={categoryId}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string; }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.catalogProductsCreate"),
  };
}
