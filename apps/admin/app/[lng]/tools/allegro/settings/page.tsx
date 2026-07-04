import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import AllegroSettingsPage from "./allegro-settings-page";

export default function Page() {
  return (
    <IntegrationAvailabilityGate
      fallbackVariant="fields"
      flagKey="allegroConfigured"
      integrationName="Allegro"
    >
      <AllegroSettingsPage />
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
    title: t("allegro.settings.title", {
      defaultValue: "Allegro settings",
    }),
  };
}
