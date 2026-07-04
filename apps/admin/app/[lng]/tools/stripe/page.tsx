import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import StripePage from "./stripe-page";

export default function Page() {
  return (
    <IntegrationAvailabilityGate
      fallbackVariant="fields"
      flagKey="stripeConfigured"
      integrationName="Stripe"
    >
      <StripePage />
    </IntegrationAvailabilityGate>
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
    title: t("ROUTES.stripe", { defaultValue: "Stripe" }),
  };
}
