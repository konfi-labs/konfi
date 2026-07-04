import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import Przelewy24Page from "./przelewy24-page";

export default function Page() {
  return (
    <IntegrationAvailabilityGate
      fallbackVariant="fields"
      flagKey="przelewy24Configured"
      integrationName="Przelewy24"
    >
      <Przelewy24Page />
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
    title: t("ROUTES.przelewy24", { defaultValue: "Przelewy24" }),
  };
}
