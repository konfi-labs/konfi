import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import FulfillmentRequestsPage from "./fulfillment-requests-page";

interface PageProps {
  params: Promise<{ lng: string; id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <FulfillmentRequestsPage warehouseId={id} />;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.fulfillmentRequests"),
  };
}
