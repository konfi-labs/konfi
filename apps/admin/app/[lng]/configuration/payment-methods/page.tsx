import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import PaymentMethodsPage from "./payment-methods-page";

export default async function Page() {
  return <PaymentMethodsPage />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.configPaymentMethods", {
      defaultValue: "Payment Methods",
    }),
  };
}
