"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { ButtonLink } from "../ButtonLink";
import { MaterialSymbol } from "../MaterialSymbol";

interface Props {
  paymentDocumentId?: string;
  invoiceId?: number | string | null;
  viewUrl?: string;
  kind?: string;
  lng: string;
  t: TFunction;
}

function buildFakturowniaAppInvoiceUrl(
  viewUrl: string,
  invoiceId?: number | string | null,
) {
  const normalizedInvoiceId = String(invoiceId ?? "").trim();
  if (!normalizedInvoiceId) {
    return undefined;
  }

  try {
    return new URL(
      `/invoices/${encodeURIComponent(normalizedInvoiceId)}`,
      viewUrl,
    ).toString();
  } catch {
    return undefined;
  }
}

/**
 * Component to display a link to view an existing Fakturownia invoice
 */
export function FakturowniaInvoice({
  paymentDocumentId,
  invoiceId,
  viewUrl,
  kind,
  lng,
  t,
}: Props) {
  "use memo";

  if (!paymentDocumentId || !viewUrl) {
    return null;
  }

  const getIcon = (kind?: string) => {
    switch (kind) {
      case "proforma":
        return "description";
      case "estimate":
        return "orders";
      case "receipt":
        return "receipt";
      default:
        return "receipt_long";
    }
  };

  const getLabel = (kind?: string) => {
    if (!kind) return t("common.invoice", { defaultValue: "Invoice" });
    return t(`fakturownia.invoiceCreate.kindOptions.${kind}`, {
      defaultValue: kind,
    });
  };

  const label = getLabel(kind);
  const icon = getIcon(kind);
  const fakturowniaAppUrl = buildFakturowniaAppInvoiceUrl(viewUrl, invoiceId);

  return (
    <Box>
      <Stack
        direction={["column", "row"]}
        justify="space-between"
        align={["stretch", "center"]}
        gap={3}
      >
        <Text fontWeight="bold">{label}</Text>
        <HStack gap={2} flexWrap="wrap" justify={["stretch", "flex-end"]}>
          <ButtonLink
            lng={lng}
            href={viewUrl}
            colorPalette="primary"
            variant="surface"
            ariaLabel={t("order.viewDocument", {
              defaultValue: "View {{label}}",
              label,
            })}
            isExternal={true}
            w={["100%", "auto"]}
          >
            <MaterialSymbol>{icon}</MaterialSymbol>
            {t("order.viewDocument", {
              defaultValue: "View {{label}}",
              label,
            })}
          </ButtonLink>
          {fakturowniaAppUrl && (
            <ButtonLink
              lng={lng}
              href={fakturowniaAppUrl}
              colorPalette="primary"
              variant="outline"
              ariaLabel={t("order.openInFakturownia", {
                defaultValue: "Open in Fakturownia",
              })}
              isExternal={true}
              w={["100%", "auto"]}
            >
              <MaterialSymbol>open_in_new</MaterialSymbol>
              {t("order.openInFakturownia", {
                defaultValue: "Open in Fakturownia",
              })}
            </ButtonLink>
          )}
        </HStack>
      </Stack>
    </Box>
  );
}
