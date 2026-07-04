import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import i18next from "@/i18n/i18next";
import type { Metadata } from "next";
import SentEmailsPage from "./sent-emails-page";

export default function Page() {
  return (
    <IntegrationAvailabilityGate
      fallbackRows={8}
      fallbackVariant="table"
      flagKey="resendConfigured"
      integrationName="Resend"
    >
      <SentEmailsPage />
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
    title: t("resend.title", { defaultValue: "Resend" }),
  };
}
