"use client";

import {
  isNestedCustomer,
  type ItemProblem,
  type ListResults,
  type Order,
  type OrderItem,
  type OrderWorkflowStatusesSettings,
  type ShippingMethodsSettings,
  type Warehouse,
} from "@konfi/types";
import type { TenantContext } from "@konfi/firebase";
import type { FirebaseStorage } from "firebase/storage";
import type { i18n as I18n, TFunction } from "i18next";
import { useState, type ReactNode, type SetStateAction } from "react";
import BrowserOrderFilesSection from "./BrowserOrderFilesSection";
import DesktopOrderFilesSection from "./DesktopOrderFilesSection";
import OrderItemsWithUpload from "./OrderItemsWithUpload";

interface OrderItemsFilesSectionProps {
  storage: FirebaseStorage;
  order: Order;
  orderItems: OrderItem[];
  listResults: ListResults[];
  baseFolderPath?: string;
  channelId?: string;
  handleFulfillItem?: (
    orderId: string,
    itemId: string,
    fulfilled: boolean,
  ) => void;
  handleSetItemInProgress?: (
    orderId: string,
    itemId: string,
    inProgress: boolean,
  ) => void;
  handleMarkItemPickedUp?: (
    orderId: string,
    itemId: string,
    pickedUp: boolean,
  ) => void;
  handleMarkItemDelivered?: (
    orderId: string,
    itemId: string,
    delivered: boolean,
  ) => void;
  handleSetItemPriority?: (
    orderId: string,
    itemId: string,
    priority: boolean,
  ) => void;
  onReportItemProblem?: (
    orderItem: OrderItem,
    existingProblem?: ItemProblem,
  ) => void;
  onFileDownload?: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined;
  dirtyFlag?: boolean;
  showFiles?: boolean;
  warehouses?: Warehouse[] | null;
  getWarehouseName?: (warehouseId: string) => string;
  onAssignWarehouse?: (orderItem: OrderItem) => void;
  onManualFulfillmentRequest?: (orderItem: OrderItem) => void;
  onEditItem?: (orderItem: OrderItem) => void;
  renderItemActions?: (orderItem: OrderItem) => ReactNode;
  selectedItemId?: string | null;
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null;
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null;
  eagerImages?: boolean;
  onFilesChanged?: () => void | Promise<void>;
  tenantContext?: TenantContext;
  t: TFunction;
  i18n: I18n;
}

export default function OrderItemsFilesSection({
  storage,
  order,
  orderItems,
  listResults,
  baseFolderPath,
  channelId,
  handleFulfillItem,
  handleSetItemInProgress,
  handleMarkItemPickedUp,
  handleMarkItemDelivered,
  handleSetItemPriority,
  onReportItemProblem,
  onFileDownload,
  onFileDelete,
  setDirtyFlag,
  dirtyFlag,
  showFiles,
  warehouses,
  getWarehouseName,
  onAssignWarehouse,
  onManualFulfillmentRequest,
  onEditItem,
  renderItemActions,
  selectedItemId,
  orderWorkflowStatusesSettings,
  shippingMethodsSettings,
  eagerImages,
  onFilesChanged,
  tenantContext,
  t,
  i18n,
}: OrderItemsFilesSectionProps) {
  const [localFilesRefreshKey, setLocalFilesRefreshKey] = useState(0);
  const resolvedChannelId = order.channelId || channelId;
  const customerId = isNestedCustomer(order.customer)
    ? order.customer.id
    : undefined;

  const handleUploadComplete = () => {
    setLocalFilesRefreshKey((key) => key + 1);
    void onFilesChanged?.();
  };

  return (
    <>
      <OrderItemsWithUpload
        storage={storage}
        order={order}
        orderItems={orderItems}
        listResults={listResults}
        handleFulfillItem={handleFulfillItem}
        handleSetItemInProgress={handleSetItemInProgress}
        handleMarkItemPickedUp={handleMarkItemPickedUp}
        handleMarkItemDelivered={handleMarkItemDelivered}
        handleSetItemPriority={handleSetItemPriority}
        onReportItemProblem={onReportItemProblem}
        onFileDownload={onFileDownload}
        onFileDelete={onFileDelete}
        setDirtyFlag={setDirtyFlag}
        dirtyFlag={dirtyFlag}
        showFiles={showFiles}
        baseFolderPath={baseFolderPath}
        localFilesRefreshKey={localFilesRefreshKey}
        warehouses={warehouses}
        getWarehouseName={getWarehouseName}
        onAssignWarehouse={onAssignWarehouse}
        onManualFulfillmentRequest={onManualFulfillmentRequest}
        onEditItem={onEditItem}
        renderItemActions={renderItemActions}
        selectedItemId={selectedItemId}
        orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
        shippingMethodsSettings={shippingMethodsSettings}
        eagerImages={eagerImages}
        tenantContext={tenantContext}
        t={t}
        i18n={i18n}
      />
      <DesktopOrderFilesSection
        baseFolderPath={baseFolderPath}
        orderNumber={order.number}
        orderId={order.id}
        customerId={customerId}
        channelId={resolvedChannelId}
        orderItems={orderItems}
        onUploadComplete={handleUploadComplete}
      />
      <BrowserOrderFilesSection
        channelId={resolvedChannelId}
        orderNumber={order.number}
      />
    </>
  );
}
