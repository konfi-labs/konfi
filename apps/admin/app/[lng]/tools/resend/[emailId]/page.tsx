import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import SentEmailDetailPage from "./sent-email-detail-page";

export default function Page() {
  return (
    <IntegrationAvailabilityGate
      fallbackVariant="fields"
      flagKey="resendConfigured"
      integrationName="Resend"
    >
      <SentEmailDetailPage />
    </IntegrationAvailabilityGate>
  );
}
