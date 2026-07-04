import {
  productionCooperationActionResultCodes,
  type ProductionCooperationActionResultCode,
} from "@/lib/production-cooperation/types";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import CooperationStatusPage from "./cooperation-status-page";

function normalizeCode(
  value: string | string[] | undefined,
): ProductionCooperationActionResultCode {
  const code = Array.isArray(value) ? value[0] : value;

  return productionCooperationActionResultCodes.includes(
    code as ProductionCooperationActionResultCode,
  )
    ? (code as ProductionCooperationActionResultCode)
    : "unavailable";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string | string[];
    requestId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestId = Array.isArray(params.requestId)
    ? params.requestId[0]
    : params.requestId;

  return (
    <CooperationStatusPage
      code={normalizeCode(params.code)}
      requestId={requestId}
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
    title: t("productionCooperation.statusPage.title", {
      defaultValue: "Cooperation Request Status",
    }),
  };
}
