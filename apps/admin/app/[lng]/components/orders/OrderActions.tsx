"use client";

import Menu from "@/components/Menu";
import { useT } from "@/i18n/client";
import {
  getPaymentDocumentValue,
  hasPaymentDocumentValue,
} from "@/lib/orders/payment-document";
import { Flex, IconButton } from "@chakra-ui/react";
import { IconButtonLink } from "@konfi/components/shared/IconButtonLink";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { type DataGridDensity } from "@konfi/components/shared/Table";
import { MenuItem } from "@konfi/components/ui/menu";
import { Tooltip } from "@konfi/components/ui/tooltip";
import {
  isAllegroFulfillmentManagedOrder,
  isNestedCustomer,
  Order,
  OrderStatus,
  ShippingOptions,
} from "@konfi/types";
import {
  getPaymentDocumentInvoiceCreateKind,
  getPaymentDocumentMeta,
} from "@konfi/utils/getters";
import { isShippingWithCourier } from "@konfi/utils/validators";
import { useChannels } from "context/channels";
import {
  useConfigurationSettings,
  useConfigurationWarehouses,
} from "context/configuration";
import { isEmpty } from "es-toolkit/compat";
import { useRouter } from "next/navigation";
import { memo, useMemo } from "react";
import type { OrderPrintHandler } from "./order-print-types";

export interface OrderActionsProps {
  density?: DataGridDensity;
  hasFakturowniaKey?: boolean;
  hasPolkurierKey?: boolean;
  order: Order;
  onShowAttachments: (order: Order) => void;
  onShowPaymentDocument: (order: Order) => void;
  onShowTracking: (order: Order) => void;
  onPreloadUpdateForm?: (order: Order) => void;
  onUpdateForm: (order: Order) => void;
  onDuplicateForm: (order: Order) => void;
  onDeactivate: (order: Order) => void;
  onShowComplaint: (order: Order) => void;
  onShowNoteCreate: (order: Order) => void;
  onOpenFolder?: (order: Order) => void;
  onPrintOrder?: OrderPrintHandler;
}

export const OrderActions = memo(
  ({
    density = "comfortable",
    hasFakturowniaKey = false,
    hasPolkurierKey = false,
    order,
    onShowAttachments,
    onShowPaymentDocument,
    onShowTracking,
    onPreloadUpdateForm,
    onUpdateForm,
    onDuplicateForm,
    onDeactivate,
    onShowComplaint,
    onShowNoteCreate,
    onOpenFolder,
    onPrintOrder,
  }: OrderActionsProps) => {
    const { t, i18n } = useT(["order", "orders", "translation"]);
    const { channel } = useChannels();
    const { shippingMethodsSettings } = useConfigurationSettings();
    const { warehouses } = useConfigurationWarehouses();
    const router = useRouter();
    const isExternallyFulfilled = isAllegroFulfillmentManagedOrder(order);
    const actionIconFontSize = density === "compact" ? "18px" : undefined;
    const actionSize = density === "compact" ? "2xs" : undefined;

    const shouldShowTracking = useMemo(() => {
      if (isExternallyFulfilled) {
        return false;
      }

      let show = false;
      if (order.shippingOption === ShippingOptions.COMPANY_COURIER) {
        show = true;
      }
      if (warehouses && channel && !isEmpty(channel.warehouses)) {
        if (
          warehouses.find(
            (warehouse) =>
              warehouse.address?.name === order.shipping?.name &&
              !channel.warehouses.includes(warehouse.id),
          )
        ) {
          show = true;
        }
      }
      return show;
    }, [channel, isExternallyFulfilled, order, warehouses]);

    const paymentDocumentMeta = useMemo(
      () => getPaymentDocumentMeta(order.paymentType, !!order.billing),
      [order.paymentType, order.billing],
    );
    const paymentDocumentValue = getPaymentDocumentValue(order);
    const hasPaymentDocument = hasPaymentDocumentValue(order);
    const canSendParcel =
      hasPolkurierKey &&
      !isExternallyFulfilled &&
      order.status !== OrderStatus.CANCELED &&
      order.status !== OrderStatus.FULFILLED &&
      isShippingWithCourier(
        order.shippingOption,
        true,
        shippingMethodsSettings,
      ) &&
      !order.tracking;
    const orderPreviewHref = useMemo(
      () =>
        `/orders/${order.id}?channelId=${encodeURIComponent(order.channelId)}`,
      [order.channelId, order.id],
    );

    return (
      <Flex justify="end" gap="1" onClick={(event) => event.stopPropagation()}>
        <IconButtonLink
          lng={i18n.resolvedLanguage}
          href={orderPreviewHref}
          icon="open_in_new"
          ariaLabel={t("orders.actions.preview")}
          fontSize={actionIconFontSize}
          size={actionSize}
          tooltipLabel={t("orders.actions.preview")}
        />
        <IconButtonLink
          href={`${order.mailLink}`}
          icon="mail"
          ariaLabel={t("orders.actions.email")}
          fontSize={actionIconFontSize}
          size={actionSize}
          tooltipLabel={t("orders.actions.email")}
          isExternal
          prefetch={false}
          disabled={!order.mailLink}
        />
        {isNestedCustomer(order.customer) ? (
          <Tooltip content={t("orders.actions.attachments")} lazyMount>
            <span>
              <IconButton
                aria-label={t("orders.actions.attachments")}
                fontSize={actionIconFontSize}
                onClick={() => onShowAttachments(order)}
                size={actionSize}
                variant={hasPaymentDocument ? "solid" : "ghost"}
                colorPalette={hasPaymentDocument ? "primary" : undefined}
              >
                <MaterialSymbol>file_present</MaterialSymbol>
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <Tooltip
            content={
              paymentDocumentValue
                ? paymentDocumentValue
                : t("orders.actions.noPaymentDocument")
            }
            lazyMount
          >
            <IconButton
              aria-label={t("orders.actions.noPaymentDocument")}
              colorPalette={hasPaymentDocument ? "primary" : undefined}
              fontSize={actionIconFontSize}
              variant={hasPaymentDocument ? "solid" : "ghost"}
              size={actionSize}
              onClick={() => onShowPaymentDocument(order)}
            >
              <MaterialSymbol>file_present</MaterialSymbol>
            </IconButton>
          </Tooltip>
        )}
        <Tooltip content={t("orders.actions.tracking")} lazyMount>
          <span>
            <IconButton
              aria-label={t("orders.actions.tracking")}
              fontSize={actionIconFontSize}
              onClick={() => onShowTracking(order)}
              variant="ghost"
              colorPalette={order.tracking ? "primary" : undefined}
              disabled={!shouldShowTracking}
              size={actionSize}
            >
              <MaterialSymbol>package</MaterialSymbol>
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip content={t("orders.actions.edit")} lazyMount>
          <IconButton
            aria-label={t("orders.actions.edit")}
            fontSize={actionIconFontSize}
            onFocus={() => onPreloadUpdateForm?.(order)}
            onClick={() => onUpdateForm(order)}
            onPointerEnter={() => onPreloadUpdateForm?.(order)}
            variant="ghost"
            size={actionSize}
          >
            <MaterialSymbol>edit_square</MaterialSymbol>
          </IconButton>
        </Tooltip>
        <Menu
          icon={
            <MaterialSymbol style={{ fontSize: actionIconFontSize }}>
              menu_open
            </MaterialSymbol>
          }
          ariaLabel={t("orders.actions.heading", { defaultValue: "Actions" })}
          size={actionSize}
        >
          {onPrintOrder && (
            <>
              <MenuItem
                value="print-full-order"
                onClick={() => onPrintOrder(order, "full")}
              >
                <MaterialSymbol>print</MaterialSymbol>
                {t("orders.actions.printFull", {
                  defaultValue: "Print full order",
                })}
              </MenuItem>
              <MenuItem
                value="print-with-customer"
                onClick={() => onPrintOrder(order, "withCustomer")}
              >
                <MaterialSymbol>print</MaterialSymbol>
                {t("orders.actions.printWithCustomer", {
                  defaultValue: "Print with customer part & footer",
                })}
              </MenuItem>
            </>
          )}
          <MenuItem
            value="duplicate-form"
            onClick={() => onDuplicateForm(order)}
          >
            <MaterialSymbol>content_copy</MaterialSymbol>
            {t("orders.actions.duplicate")}
          </MenuItem>
          <MenuItem
            value="complaint-form"
            onClick={() => onShowComplaint(order)}
          >
            <MaterialSymbol>warning</MaterialSymbol>
            {t("orders.actions.complaint")}
          </MenuItem>
          <MenuItem
            value="note-create-form"
            onClick={() => onShowNoteCreate(order)}
          >
            <MaterialSymbol>note_add</MaterialSymbol>
            {t("orders.actions.createNote")}
          </MenuItem>
          {hasPolkurierKey && (
            <MenuItem
              value="send-parcel"
              onClick={(event) => {
                event.stopPropagation();
                if (!canSendParcel) {
                  return;
                }
                router.push(
                  `/${i18n.resolvedLanguage}/send-parcel?orderId=${order.id}&channelId=${order.channelId}`,
                );
              }}
              disabled={!canSendParcel}
            >
              <MaterialSymbol>local_shipping</MaterialSymbol>
              {t("orders.actions.sendParcel", { defaultValue: "Send parcel" })}
            </MenuItem>
          )}
          {hasFakturowniaKey && (
            <MenuItem
              value="create-invoice"
              onClick={(event) => {
                event.stopPropagation();
                if (order.paymentDocumentId) return;
                const params = new URLSearchParams({
                  orderId: order.id,
                  channelId: order.channelId,
                });
                const invoiceCreateKind =
                  getPaymentDocumentInvoiceCreateKind(paymentDocumentMeta);
                if (invoiceCreateKind) {
                  params.set("kind", invoiceCreateKind);
                }
                router.push(
                  `/${i18n.resolvedLanguage}/fakturownia/invoices/new?${params.toString()}`,
                );
              }}
              disabled={!!order.paymentDocumentId}
            >
              <MaterialSymbol>{paymentDocumentMeta.icon}</MaterialSymbol>
              {t(paymentDocumentMeta.translationKey, {
                defaultValue: paymentDocumentMeta.defaultLabel,
              })}
            </MenuItem>
          )}
          {onOpenFolder && (
            <MenuItem value="open-folder" onClick={() => onOpenFolder(order)}>
              <MaterialSymbol>folder_open</MaterialSymbol>
              {t("orders.actions.openFolder")}
            </MenuItem>
          )}
          <MenuItem
            value="deactivate-modal"
            onClick={() => onDeactivate(order)}
            color="fg.error"
            _hover={{ bg: "bg.error", color: "fg.error" }}
          >
            <MaterialSymbol>visibility_off</MaterialSymbol>
            {t("orders.actions.deactivate")}
          </MenuItem>
        </Menu>
      </Flex>
    );
  },
);
