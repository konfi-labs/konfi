"use client";

import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import { useSearchParams } from "next/navigation";
import SendParcelPage from "./send-parcel-page";

function normalizedOptionalValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export default function SendParcelRoute() {
  const searchParams = useSearchParams();

  return (
    <IntegrationAvailabilityGate
      fallbackRows={6}
      fallbackVariant="form"
      flagKey="polkurierApiKeyProvided"
      integrationName="Polkurier"
    >
      <SendParcelPage
        channelId={normalizedOptionalValue(searchParams.get("channelId"))}
        orderId={normalizedOptionalValue(searchParams.get("orderId"))}
      />
    </IntegrationAvailabilityGate>
  );
}
