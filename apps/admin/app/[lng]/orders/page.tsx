import i18next from "@/i18n/i18next";
import { FulfillmentRequestsProvider } from "context/fulfillment-requests";
import { Metadata } from "next";
import { ComplaintsProvider } from "../complaints/complaints-page";
import OrdersPage from "./orders-page";

export default async function Page() {
  return (
    <ComplaintsProvider>
      <FulfillmentRequestsProvider>
        <OrdersPage />
      </FulfillmentRequestsProvider>
    </ComplaintsProvider>
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
    title: t("ROUTES.orders"),
  };
}
