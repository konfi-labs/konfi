import i18next from "@/i18n/i18next";
import { getProductionCooperationReview } from "@/lib/production-cooperation/service";
import type { Metadata } from "next";
import CooperationReviewPage from "./cooperation-review-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string }>;
  searchParams: Promise<{
    requestId?: string | string[];
    token?: string | string[];
  }>;
}) {
  const [{ lng }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const token = Array.isArray(resolvedSearchParams.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams.token;
  const requestId = Array.isArray(resolvedSearchParams.requestId)
    ? resolvedSearchParams.requestId[0]
    : resolvedSearchParams.requestId;
  const state = await getProductionCooperationReview({ requestId, token });

  return (
    <CooperationReviewPage
      lng={lng}
      requestId={requestId}
      state={state}
      token={token}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");

  return {
    title: t("productionCooperation.review.title", {
      defaultValue: "Review Cooperation Request",
    }),
  };
}
