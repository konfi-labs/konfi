"use client";

import type { OrderPrintHandler } from "@/components/orders/order-print-types";
import { useT } from "@/i18n/client";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import {
  MenuContent,
  MenuItem,
  MenuItemCommand,
  MenuRoot,
  MenuSeparator,
  MenuTriggerItem,
} from "@konfi/components/ui/menu";
import { isNestedCustomer, type Order, type SelectOption } from "@konfi/types";
import {
  getPaymentDocumentInvoiceCreateKind,
  getPaymentDocumentMeta,
} from "@konfi/utils/getters";

export interface ProductionOrderMenuActions {
  openFolder: (order: Order) => Promise<void>;
  showAttachments: (order: Order) => void;
  showComplaintForm: (order: Order) => void;
  showDeactivateDialog: (order: Order) => void;
  showDuplicateForm: (order: Order) => void;
  showNoteCreateForm: (order: Order) => void;
  showPaymentDocument: (order: Order) => void;
  showTracking: (order: Order) => void;
  showUpdateForm: (order: Order) => void;
}

interface ProductionOrderMenuContentProps {
  canSendParcel: boolean;
  fileStatusOptions: SelectOption[];
  hasFakturowniaKey: boolean;
  hasPolkurierKey: boolean;
  isElectronRuntime: boolean;
  onAction: ProductionOrderMenuActions;
  onFilesStatusChange: (value: string | undefined, order: Order) => void;
  onOpenDialog: (order: Order) => void;
  onOpenFullOrder: (order: Order) => void;
  onOrderStatusChange: (value: string | undefined, order: Order) => void;
  onPaymentStatusChange: (value: string | undefined, order: Order) => void;
  onPrintOrder: OrderPrintHandler;
  order: Order;
  orderStatusOptions: SelectOption[];
  paymentDocumentMeta: ReturnType<typeof getPaymentDocumentMeta>;
  paymentStatusOptions: SelectOption[];
  routerPush: (href: string) => void;
}

export function ProductionOrderMenuContent({
  canSendParcel,
  fileStatusOptions,
  hasFakturowniaKey,
  hasPolkurierKey,
  isElectronRuntime,
  onAction,
  onFilesStatusChange,
  onOpenDialog,
  onOpenFullOrder,
  onOrderStatusChange,
  onPaymentStatusChange,
  onPrintOrder,
  order,
  orderStatusOptions,
  paymentDocumentMeta,
  paymentStatusOptions,
  routerPush,
}: ProductionOrderMenuContentProps) {
  const { t, i18n } = useT(["orders", "order", "translation"]);

  return (
    <MenuContent
      data-production-row-action
      minW="18rem"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <StatusSubmenu
        currentValue={order.status}
        icon="fact_check"
        label={t("orders.productionView.context.orderStatus", {
          defaultValue: "Order status",
        })}
        options={orderStatusOptions}
        value="order-status"
        onSelect={(value) => onOrderStatusChange(value, order)}
      />
      <StatusSubmenu
        currentValue={order.filesStatus}
        icon="draft"
        label={t("orders.productionView.context.filesStatus", {
          defaultValue: "Files status",
        })}
        options={fileStatusOptions}
        value="files-status"
        onSelect={(value) => onFilesStatusChange(value, order)}
      />
      <StatusSubmenu
        currentValue={order.paymentStatus}
        icon="payments"
        label={t("orders.productionView.context.paymentStatus", {
          defaultValue: "Payment status",
        })}
        options={paymentStatusOptions}
        value="payment-status"
        onSelect={(value) => onPaymentStatusChange(value, order)}
      />
      <MenuSeparator />
      <MenuItem value="open-dialog" onClick={() => onOpenDialog(order)}>
        <MaterialSymbol>preview</MaterialSymbol>
        {t("orders.productionView.openDialog", {
          defaultValue: "Open production preview",
        })}
      </MenuItem>
      <MenuItem value="open-details" onClick={() => onOpenFullOrder(order)}>
        <MaterialSymbol>open_in_new</MaterialSymbol>
        {t("orders.actions.preview", {
          defaultValue: "Open details",
        })}
      </MenuItem>
      <MenuItem value="print-full" onClick={() => onPrintOrder(order, "full")}>
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
      <MenuSeparator />
      <MenuItem value="edit" onClick={() => onAction.showUpdateForm(order)}>
        <MaterialSymbol>edit_square</MaterialSymbol>
        {t("orders.actions.edit", {
          defaultValue: "Edit",
        })}
      </MenuItem>
      <MenuItem
        value="duplicate"
        onClick={() => onAction.showDuplicateForm(order)}
      >
        <MaterialSymbol>content_copy</MaterialSymbol>
        {t("orders.actions.duplicate", {
          defaultValue: "Duplicate",
        })}
      </MenuItem>
      {isNestedCustomer(order.customer) ? (
        <MenuItem
          value="attachments"
          onClick={() => onAction.showAttachments(order)}
        >
          <MaterialSymbol>file_present</MaterialSymbol>
          {t("orders.actions.attachments", {
            defaultValue: "Attachments",
          })}
        </MenuItem>
      ) : (
        <MenuItem
          value="payment-document"
          onClick={() => onAction.showPaymentDocument(order)}
        >
          <MaterialSymbol>file_present</MaterialSymbol>
          {t("orders.actions.noPaymentDocument", {
            defaultValue: "Payment document",
          })}
        </MenuItem>
      )}
      <MenuItem value="tracking" onClick={() => onAction.showTracking(order)}>
        <MaterialSymbol>package</MaterialSymbol>
        {t("orders.actions.tracking", {
          defaultValue: "Tracking",
        })}
      </MenuItem>
      <MenuItem value="note" onClick={() => onAction.showNoteCreateForm(order)}>
        <MaterialSymbol>note_add</MaterialSymbol>
        {t("orders.actions.createNote", {
          defaultValue: "Create note",
        })}
      </MenuItem>
      <MenuItem
        value="complaint"
        onClick={() => onAction.showComplaintForm(order)}
      >
        <MaterialSymbol>warning</MaterialSymbol>
        {t("orders.actions.complaint", {
          defaultValue: "Complaint",
        })}
      </MenuItem>
      {hasPolkurierKey && (
        <MenuItem
          disabled={!canSendParcel}
          value="send-parcel"
          onClick={() => {
            if (!canSendParcel) {
              return;
            }

            routerPush(
              `/${i18n.resolvedLanguage}/send-parcel?orderId=${order.id}&channelId=${order.channelId}`,
            );
          }}
        >
          <MaterialSymbol>local_shipping</MaterialSymbol>
          {t("orders.actions.sendParcel", {
            defaultValue: "Send parcel",
          })}
        </MenuItem>
      )}
      {hasFakturowniaKey && (
        <MenuItem
          disabled={!!order.paymentDocumentId}
          value="create-invoice"
          onClick={() => {
            if (order.paymentDocumentId) {
              return;
            }

            const params = new URLSearchParams({
              channelId: order.channelId,
              orderId: order.id,
            });

            const invoiceCreateKind =
              getPaymentDocumentInvoiceCreateKind(paymentDocumentMeta);
            if (invoiceCreateKind) {
              params.set("kind", invoiceCreateKind);
            }

            routerPush(
              `/${i18n.resolvedLanguage}/fakturownia/invoices/new?${params.toString()}`,
            );
          }}
        >
          <MaterialSymbol>{paymentDocumentMeta.icon}</MaterialSymbol>
          {t(paymentDocumentMeta.translationKey, {
            defaultValue: paymentDocumentMeta.defaultLabel,
          })}
        </MenuItem>
      )}
      {isElectronRuntime && (
        <MenuItem
          value="open-folder"
          onClick={() => onAction.openFolder(order)}
        >
          <MaterialSymbol>folder_open</MaterialSymbol>
          {t("orders.actions.openFolder", {
            defaultValue: "Open folder",
          })}
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem
        color="fg.error"
        value="deactivate"
        onClick={() => onAction.showDeactivateDialog(order)}
      >
        <MaterialSymbol>visibility_off</MaterialSymbol>
        {t("orders.actions.deactivate", {
          defaultValue: "Deactivate",
        })}
      </MenuItem>
    </MenuContent>
  );
}

interface StatusSubmenuProps {
  currentValue: string | undefined;
  icon: string;
  label: string;
  onSelect: (value: string) => void;
  options: SelectOption[];
  value: string;
}

function StatusSubmenu({
  currentValue,
  icon,
  label,
  onSelect,
  options,
  value,
}: StatusSubmenuProps) {
  return (
    <MenuRoot positioning={{ gutter: 4, placement: "right-start" }}>
      <MenuTriggerItem
        startIcon={<MaterialSymbol>{icon}</MaterialSymbol>}
        value={value}
      >
        {label}
      </MenuTriggerItem>
      <MenuContent
        data-production-row-action
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {options.map((option) => (
          <MenuItem
            key={option.value}
            colorPalette={option.value === currentValue ? "primary" : undefined}
            value={`${value}-${option.value}`}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
            {option.value === currentValue ? (
              <MenuItemCommand>
                <MaterialSymbol aria-hidden="true">check</MaterialSymbol>
              </MenuItemCommand>
            ) : null}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuRoot>
  );
}
