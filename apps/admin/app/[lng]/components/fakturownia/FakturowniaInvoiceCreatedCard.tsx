"use client";

import { Badge, Card, HStack, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { Invoice } from "@konfi/fakturownia/out/client/models";
import type { RefObject } from "react";
import { useT } from "@/i18n/client";

interface FakturowniaInvoiceCreatedCardProps {
  invoice: Invoice;
  successMessageRef: RefObject<HTMLDivElement | null>;
}

export function FakturowniaInvoiceCreatedCard({
  invoice,
  successMessageRef,
}: FakturowniaInvoiceCreatedCardProps) {
  const { t } = useT(["fakturownia", "translation"]);

  return (
    <Card.Root
      ref={successMessageRef}
      variant="subtle"
      borderWidth="2px"
      colorPalette="success"
    >
      <Card.Body>
        <VStack gap={2} align="stretch">
          <HStack gap={2} align="center">
            <MaterialSymbol>check_circle</MaterialSymbol>
            <Text fontWeight="bold">
              {t("fakturownia.invoiceCreate.invoiceCreated", {
                defaultValue: "Invoice created",
              })}
            </Text>
          </HStack>
          {invoice.number && (
            <Text>
              {t("fakturownia.invoiceCreate.invoiceNumber", {
                defaultValue: "Invoice number",
              })}
              : <Badge>{invoice.number}</Badge>
            </Text>
          )}
          <Text>
            {t("fakturownia.invoiceCreate.invoiceCreatedDescription", {
              defaultValue: "You can find the invoice in Fakturownia.",
            })}
          </Text>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
