import i18next from "@/i18n/i18next";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { Metadata } from "next";
import { Suspense } from "react";
import EditProductPage from "./edit-product-page";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ channelId?: string }>;
}) {
  return (
    <Suspense fallback={<AdminLoadingSkeleton variant="form" rows={8} />}>
      <EditProductSearchParams searchParams={searchParams} />
    </Suspense>
  );
}

async function EditProductSearchParams({
  searchParams,
}: {
  searchParams: Promise<{ channelId?: string }>;
}) {
  const { channelId } = await searchParams;
  return <EditProductPage initialChannelId={channelId} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.catalogProductsEdit"),
  };
}
