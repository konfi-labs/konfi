import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import AllegroPage from "./allegro-page";

export default function Page() {
  return (
    <IntegrationAvailabilityGate
      fallbackVariant="table"
      flagKey="allegroConfigured"
      integrationName="Allegro"
    >
      <AllegroPage />
    </IntegrationAvailabilityGate>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  if (i18next.resolvedLanguage !== lng) {
    await i18next.changeLanguage(lng);
  }
  await i18next.loadNamespaces(["allegro", "translation"]);

  const t = i18next.getFixedT(lng, ["allegro", "translation"]);
  return {
    title: t("allegro.title", { defaultValue: "Allegro" }),
  };
}
