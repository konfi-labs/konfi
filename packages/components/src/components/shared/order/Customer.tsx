"use client";

import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Presence,
  Show,
  Span,
  Text,
  useClipboard,
} from "@chakra-ui/react";
import {
  Order,
  OrderStatus,
  ShippingOptions,
  StoreOrder,
  type ShippingMethodsSettings,
} from "@konfi/types";
import {
  formatStreetLine,
  getInvoiceRecipientFromAddress,
  getInvoiceRecipientRoleTranslationKey,
  getPaymentDocumentMeta,
  getShippingMethodLabel,
  isShippingWithCourier,
} from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { Dispatch } from "react";
import { toaster, Tooltip } from "../../ui";
import { ButtonLink } from "../ButtonLink";
import { MaterialSymbol } from "../MaterialSymbol";
import { MiddleTruncatedText } from "../text";
import { SpecialNotesPanel } from "./SpecialNotes";

interface Props {
  customer: Order["customer"];
  contact?: StoreOrder["contact"];
  invoice?: Order["invoice"];
  shipping?: Order["shipping"];
  tracking?: Order["tracking"];
  shippingOption: Order["shippingOption"];
  billing?: Order["billing"];
  invoiceNotes?: Order["invoiceNotes"];
  paymentType?: Order["paymentType"];
  anonymousPackageShipping?: Order["anonymousPackageShipping"];
  isShop?: boolean;
  hasPolkurierKey?: boolean;
  invoiceHref?: string;
  paymentDocumentId?: string;
  hasFakturowniaKey?: boolean;
  status?: Order["status"];
  channelId?: string;
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null;
  setShowSendParcelDialog?: Dispatch<React.SetStateAction<boolean>>;
  shippingExtra?: React.ReactNode;
  t: TFunction;
  i18n: i18n;
}

function CopyableField({
  copyValue,
  displayValue,
  children,
  isShop,
  t,
}: {
  copyValue?: string;
  displayValue?: string;
  children: React.ReactNode;
  isShop: boolean;
  t: TFunction;
}) {
  "use memo";
  const clipboard = useClipboard({ value: copyValue || displayValue || "" });

  const handleCopy = () => {
    if (copyValue || displayValue) {
      clipboard.copy();
      toaster.dismiss();
      toaster.info({
        title: t("actions.copied", { defaultValue: "Copied!" }),
      });
    }
  };

  return (
    <Show when={!isShop} fallback={children}>
      <Text
        as="button"
        className="group"
        display="flex"
        alignItems="center"
        textAlign="left"
        cursor={copyValue || displayValue ? "pointer" : "default"}
        onClick={handleCopy}
        background="transparent"
        border="none"
        padding={0}
        _hover={copyValue || displayValue ? { opacity: 0.8 } : {}}
      >
        {children}
        {(copyValue || displayValue) && (
          <Span fontSize="xs">
            <MaterialSymbol
              ml={2}
              opacity={0}
              _groupHover={{ opacity: 1 }}
              transition="opacity 0.3s ease-in-out"
            >
              content_copy
            </MaterialSymbol>
          </Span>
        )}
      </Text>
    </Show>
  );
}

export function Customer({
  customer,
  contact,
  invoice,
  shipping,
  tracking,
  shippingOption,
  billing,
  invoiceNotes,
  paymentType,
  anonymousPackageShipping,
  isShop = false,
  hasPolkurierKey,
  invoiceHref,
  paymentDocumentId,
  hasFakturowniaKey,
  status,
  channelId,
  shippingMethodsSettings,
  setShowSendParcelDialog,
  shippingExtra,
  t,
  i18n,
}: Props) {
  "use memo";
  const paymentDocumentMeta = getPaymentDocumentMeta(paymentType, !!billing);
  const shippingStreetLine = formatStreetLine(
    shipping?.street,
    shipping?.number,
    shipping?.local,
  );
  const billingStreetLine = formatStreetLine(
    billing?.street,
    billing?.number,
    billing?.local,
  );
  const invoiceRecipient = getInvoiceRecipientFromAddress(billing);
  const invoiceRecipientRoleLabel =
    invoiceRecipient.role === "other" && invoiceRecipient.roleDescription
      ? invoiceRecipient.roleDescription
      : t(getInvoiceRecipientRoleTranslationKey(invoiceRecipient.role), {
          defaultValue: invoiceRecipient.role,
        });
  const invoiceRecipientPostalLine =
    `${invoiceRecipient.zip} ${invoiceRecipient.city}`.trim();
  const invoiceNotesText = invoiceNotes?.trim() ?? "";

  return (
    <>
      <Text as="h2" fontSize="lg" fontWeight="bold" mb={6}>
        {t("orderPage.customer.heading", { defaultValue: "Customer" })}
      </Text>
      {!isShop && (
        <>
          {typeof customer === "object" ? (
            customer.id ? (
              <>
                <ButtonLink
                  lng={i18n.resolvedLanguage}
                  href={`/customers/${customer.id}`}
                  ariaLabel={t("orderPage.customer.name", {
                    defaultValue: customer.name,
                  })}
                  variant={"outline"}
                  colorPalette={"primary"}
                  maxW="100%"
                  justifyContent="flex-start"
                  title={customer.name}
                >
                  <HStack gap={2} minW={0} maxW="100%">
                    <MiddleTruncatedText value={customer.name ?? ""} flex="1" />
                    <MaterialSymbol flexShrink={0}>open_in_new</MaterialSymbol>
                  </HStack>
                </ButtonLink>
              </>
            ) : (
              "-"
            )
          ) : customer ? (
            <Text mb={"2"}>{customer}</Text>
          ) : (
            "-"
          )}
        </>
      )}
      {contact && (
        <Flex mt={6}>
          <Box>
            <Text fontWeight="bold">
              {t("orderPage.customer.contact", { defaultValue: "Contact" })}
            </Text>
            <CopyableField copyValue={contact.name} isShop={isShop} t={t}>
              <Text>{contact.name}</Text>
            </CopyableField>
            <CopyableField copyValue={contact.email} isShop={isShop} t={t}>
              <Text>{contact.email}</Text>
            </CopyableField>
            <CopyableField
              copyValue={contact.phone || ""}
              isShop={isShop}
              t={t}
            >
              <Text>{contact.phone && `${contact.phone}`}</Text>
            </CopyableField>
          </Box>
        </Flex>
      )}
      {shipping && (
        <Flex mt={6}>
          <Box w="100%">
            <HStack justify="space-between">
              <HStack gap={2} wrap="wrap">
                <Text fontWeight="bold">
                  {t("orderPage.customer.shipping", {
                    defaultValue: "Shipping",
                  })}
                </Text>
                <Show when={anonymousPackageShipping}>
                  <Badge colorPalette="orange" size="sm" variant="subtle">
                    {t("orderPage.customer.anonymousPackageShipping", {
                      defaultValue: "Anonymous package shipping",
                    })}
                  </Badge>
                </Show>
              </HStack>
              <Presence
                present={
                  !isShop &&
                  hasPolkurierKey &&
                  status !== OrderStatus.CANCELED &&
                  status !== OrderStatus.FULFILLED &&
                  isShippingWithCourier(
                    shippingOption,
                    true,
                    shippingMethodsSettings,
                  ) &&
                  !tracking &&
                  !!channelId
                }
              >
                <Tooltip
                  content={t("order.sendParcel", {
                    defaultValue: "Send parcel",
                  })}
                >
                  <Button
                    className="noprint"
                    colorPalette={"primary"}
                    variant={"surface"}
                    onClick={() =>
                      setShowSendParcelDialog && setShowSendParcelDialog(true)
                    }
                    aria-label={t("order.sendParcel", {
                      defaultValue: "Send parcel",
                    })}
                  >
                    <MaterialSymbol>box_add</MaterialSymbol>
                    {t("order.sendParcel", { defaultValue: "Send parcel" })}
                  </Button>
                </Tooltip>
              </Presence>
            </HStack>
            <Text
              fontSize={"sm"}
              fontWeight={"semibold"}
              color={"primary.solid"}
            >
              {shippingOption
                ? getShippingMethodLabel(
                    shippingOption,
                    shippingMethodsSettings,
                    t,
                    i18n.resolvedLanguage ?? i18n.language,
                  )
                : "-"}
            </Text>
            <CopyableField
              copyValue={shipping?.name || ""}
              isShop={isShop}
              t={t}
            >
              <Text>{shipping?.name}</Text>
            </CopyableField>
            <CopyableField copyValue={shippingStreetLine} isShop={isShop} t={t}>
              <Text>{shippingStreetLine}</Text>
            </CopyableField>
            <CopyableField copyValue={`${shipping?.zip}`} isShop={isShop} t={t}>
              <Text>
                {shipping?.zip} {shipping?.city}
              </Text>
            </CopyableField>
            <CopyableField
              copyValue={shipping?.country || ""}
              isShop={isShop}
              t={t}
            >
              <Text>{shipping?.country}</Text>
            </CopyableField>
            {shippingExtra}
            {tracking && (
              <>
                <Show when={tracking.link}>
                  <ButtonLink
                    lng={i18n.resolvedLanguage}
                    mt={2}
                    href={tracking.link}
                    ariaLabel={t("orderPage.customer.trackingAriaLabel", {
                      defaultValue: "Open in new window",
                    })}
                    variant={"outline"}
                    colorPalette={"primary"}
                    isExternal={true}
                  >
                    {t("orderPage.customer.tracking", {
                      defaultValue: "Tracking",
                    })}
                    <MaterialSymbol>open_in_new</MaterialSymbol>
                  </ButtonLink>
                </Show>
                <Show
                  when={
                    tracking.lastScan &&
                    !isShop &&
                    (
                      [
                        ShippingOptions.COMPANY_COURIER,
                        ShippingOptions.PERSONAL_COLLECTION,
                      ] as string[]
                    ).includes(shippingOption!)
                  }
                >
                  <Badge colorPalette={"primary"} mt={2}>
                    {t(`TrackingScanStage.${tracking.lastScan?.stage}`)}
                  </Badge>
                </Show>
              </>
            )}
          </Box>
        </Flex>
      )}
      {invoice && billing ? (
        <Flex mt={6}>
          <Box w="100%">
            <HStack justify="space-between">
              <Text fontWeight="bold">
                {t("orderPage.customer.billing", { defaultValue: "Billing" })}
                <Badge colorPalette={"primary"} ml="1">
                  {t("common.invoice", { defaultValue: "Invoice" })}
                </Badge>
              </Text>
              <Presence
                present={
                  !isShop &&
                  hasFakturowniaKey &&
                  !!invoiceHref &&
                  !paymentDocumentId
                }
              >
                <ButtonLink
                  className="noprint"
                  lng={i18n.resolvedLanguage}
                  href={invoiceHref || "#"}
                  colorPalette={"primary"}
                  variant={"surface"}
                  ariaLabel={t(paymentDocumentMeta.translationKey, {
                    defaultValue: paymentDocumentMeta.defaultLabel,
                  })}
                  disabled={!!paymentDocumentId}
                >
                  <MaterialSymbol>{paymentDocumentMeta.icon}</MaterialSymbol>
                  {t(paymentDocumentMeta.translationKey, {
                    defaultValue: paymentDocumentMeta.defaultLabel,
                  })}
                </ButtonLink>
              </Presence>
            </HStack>
            <CopyableField
              copyValue={billing?.name || ""}
              isShop={isShop}
              t={t}
            >
              <Text>{billing?.name}</Text>
            </CopyableField>
            <CopyableField
              copyValue={billing?.companyName || ""}
              isShop={isShop}
              t={t}
            >
              <Text>{billing?.companyName}</Text>
            </CopyableField>
            <CopyableField copyValue={billing?.nip || ""} isShop={isShop} t={t}>
              <Text>{billing?.nip && `NIP: ${billing.nip}`}</Text>
            </CopyableField>
            <CopyableField copyValue={billingStreetLine} isShop={isShop} t={t}>
              <Text>{billingStreetLine}</Text>
            </CopyableField>
            <CopyableField copyValue={`${billing?.zip}`} isShop={isShop} t={t}>
              <Text>
                {billing?.zip} {billing?.city}
              </Text>
            </CopyableField>
            <CopyableField
              copyValue={billing?.country || ""}
              isShop={isShop}
              t={t}
            >
              <Text>{billing?.country}</Text>
            </CopyableField>
            {invoiceNotesText && (
              <Box mt={4} overflowWrap="anywhere">
                <SpecialNotesPanel
                  heading={t("forms.labels.invoiceNotes", {
                    defaultValue: "Invoice notes",
                  })}
                  specialNotes={invoiceNotesText}
                  density="compact"
                />
              </Box>
            )}
            {invoiceRecipient.enabled && (
              <Box
                mt={4}
                pt={3}
                borderTopWidth="1px"
                borderColor="border.muted"
              >
                <HStack gap={2} mb={1} wrap="wrap">
                  <Text fontWeight="bold">
                    {t("orderPage.customer.invoiceRecipient", {
                      defaultValue: "Invoice recipient",
                    })}
                  </Text>
                  <Badge colorPalette="gray" variant="subtle">
                    {invoiceRecipientRoleLabel}
                  </Badge>
                </HStack>
                {invoiceRecipient.name && (
                  <CopyableField
                    copyValue={invoiceRecipient.name}
                    isShop={isShop}
                    t={t}
                  >
                    <Text>{invoiceRecipient.name}</Text>
                  </CopyableField>
                )}
                {invoiceRecipient.nip && (
                  <CopyableField
                    copyValue={invoiceRecipient.nip}
                    isShop={isShop}
                    t={t}
                  >
                    <Text>NIP: {invoiceRecipient.nip}</Text>
                  </CopyableField>
                )}
                {invoiceRecipient.street && (
                  <CopyableField
                    copyValue={invoiceRecipient.street}
                    isShop={isShop}
                    t={t}
                  >
                    <Text>{invoiceRecipient.street}</Text>
                  </CopyableField>
                )}
                {invoiceRecipientPostalLine && (
                  <CopyableField
                    copyValue={invoiceRecipientPostalLine}
                    isShop={isShop}
                    t={t}
                  >
                    <Text>{invoiceRecipientPostalLine}</Text>
                  </CopyableField>
                )}
              </Box>
            )}
          </Box>
        </Flex>
      ) : (
        <HStack justify="space-between">
          <Badge colorPalette={"primary"} mt={6}>
            {t("common.noBillingAddress", {
              defaultValue: "No billing address",
            })}
          </Badge>
          <Presence
            present={
              !isShop &&
              hasFakturowniaKey &&
              !!invoiceHref &&
              !paymentDocumentId
            }
          >
            <ButtonLink
              className="noprint"
              lng={i18n.resolvedLanguage}
              href={invoiceHref || "#"}
              colorPalette={"primary"}
              variant={"surface"}
              ariaLabel={t(paymentDocumentMeta.translationKey, {
                defaultValue: paymentDocumentMeta.defaultLabel,
              })}
              disabled={!!paymentDocumentId}
            >
              <MaterialSymbol>{paymentDocumentMeta.icon}</MaterialSymbol>
              {t(paymentDocumentMeta.translationKey, {
                defaultValue: paymentDocumentMeta.defaultLabel,
              })}
            </ButtonLink>
          </Presence>
        </HStack>
      )}
    </>
  );
}
