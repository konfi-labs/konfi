import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import OrderWorkflowStatusesPage from "./order-workflow-statuses-page";

export default async function Page() {
  return <OrderWorkflowStatusesPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configOrderWorkflowStatuses", {
      defaultValue: "Order Workflow Statuses",
    }),
  };
}
