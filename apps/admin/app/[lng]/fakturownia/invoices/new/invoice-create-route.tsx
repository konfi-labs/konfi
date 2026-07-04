"use client";

import { IntegrationAvailabilityGate } from "@/components/integrations/IntegrationAvailabilityGate";
import { useSearchParams } from "next/navigation";
import InvoiceCreatePage from "./invoice-create-page";
import { readInvoiceCreateSearchParams } from "./invoice-create-search-params";

export default function InvoiceCreateRoute() {
  const searchParams = useSearchParams();
  const invoiceParams = readInvoiceCreateSearchParams(searchParams);

  return (
    <IntegrationAvailabilityGate
      fallbackRows={8}
      fallbackVariant="form"
      flagKey="fakturowniaApiKeyProvided"
      integrationName="Fakturownia"
    >
      <InvoiceCreatePage {...invoiceParams} />
    </IntegrationAvailabilityGate>
  );
}
