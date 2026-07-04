import i18next from "@/i18n/i18next";
import { listProductionCooperationRequests } from "@/lib/production-cooperation/service";
import type { Metadata } from "next";
import CooperationPage from "./cooperation-page";

export default async function Page() {
  const { requests } = await listProductionCooperationRequests();
  return <CooperationPage requests={requests} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");

  return {
    title: t("ROUTES.productionCooperation", {
      defaultValue: "Production Cooperation",
    }),
  };
}
