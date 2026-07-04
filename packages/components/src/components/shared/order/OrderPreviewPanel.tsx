"use client";

import {
  Box,
  Grid,
  GridItem,
  type GridProps,
  Text,
  VStack,
} from "@chakra-ui/react";
import { fetchOrderItemFiles, type TenantContext } from "@konfi/firebase";
import {
  isNestedCustomer,
  type ItemProblem,
  type ListResults,
  type Order,
  type OrderItem,
  type OrderWorkflowStatusesSettings,
  type ShippingMethodsSettings,
} from "@konfi/types";
import { isEmpty, isNull, isUndefined } from "es-toolkit/compat";
import { type FirebaseStorage } from "firebase/storage";
import { type i18n, type TFunction } from "i18next";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  memo,
  useCallback,
  useState,
} from "react";
import useSWRImmutable from "swr/immutable";
import { OrderItemsFileList } from "../storage";
import { Customer } from "./Customer";
import { SpecialNotesPanel } from "./SpecialNotes";

export interface OrderPreviewPanelProps {
  order: Order;
  storage?: FirebaseStorage;
  updateItemFulfillment?: (
    orderId: string,
    channelId: string,
    itemId: string,
    fulfilled: boolean,
  ) => Promise<void>;
  updateItemInProgress?: (
    orderId: string,
    channelId: string,
    itemId: string,
    inProgress: boolean,
  ) => Promise<void>;
  updateItemPriority?: (
    orderId: string,
    channelId: string,
    itemId: string,
    priority: boolean,
  ) => Promise<void>;
  onReportItemProblem?: (
    order: Order,
    orderItem: OrderItem,
    existingProblem?: ItemProblem,
  ) => void;
  onFileDownload?: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: Dispatch<SetStateAction<boolean>>,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  showFiles?: boolean;
  renderItemsSection?: (
    order: Order,
    helpers: {
      dirtyFlag: boolean;
      files: ListResults[] | undefined;
      onUploadComplete: () => void;
      setDirtyFlag: Dispatch<SetStateAction<boolean>>;
    },
  ) => ReactNode;
  renderUploadComponent?: (
    orderItem: OrderItem,
    helpers: { onUploadComplete: () => void },
  ) => ReactNode;
  renderAdditionalFileSections?: (orderItem: OrderItem) => ReactNode;
  tenantContext?: TenantContext;
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null;
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null;
  containerProps?: GridProps;
  t: TFunction;
  i18n: i18n;
}

function OrderPreviewPanelComponent({
  order,
  storage,
  updateItemFulfillment,
  updateItemInProgress,
  updateItemPriority,
  onReportItemProblem,
  onFileDownload,
  onFileDelete,
  showFiles,
  renderItemsSection,
  renderUploadComponent,
  renderAdditionalFileSections,
  tenantContext,
  orderWorkflowStatusesSettings,
  shippingMethodsSettings,
  containerProps,
  t,
  i18n,
}: OrderPreviewPanelProps) {
  const [dirtyFlag, setDirtyFlag] = useState(false);
  const borderColor = "gray.muted";
  const customerId = isNestedCustomer(order.customer) ? order.customer.id : "";
  const shouldFetchFiles =
    order.isFromStore &&
    !isEmpty(order.items) &&
    !isNull(order.items) &&
    !isUndefined(order.items) &&
    customerId.length > 0;

  const { data: files } = useSWRImmutable(
    shouldFetchFiles
      ? [
          order.id,
          customerId,
          order.channelId,
          order.items,
          dirtyFlag,
          tenantContext,
        ]
      : null,
    ([
      orderId,
      resolvedCustomerId,
      resolvedChannelId,
      orderItems,
      _dirtyFlag,
      resolvedTenantContext,
    ]) =>
      fetchOrderItemFiles(
        orderId,
        resolvedCustomerId,
        orderItems,
        resolvedTenantContext,
        resolvedChannelId,
      ),
  );

  const handleUploadComplete = useCallback(() => {
    setDirtyFlag((current) => !current);
  }, []);

  const handleFulfillItem = useCallback(
    (orderId: string, itemId: string, fulfilled: boolean) => {
      if (!updateItemFulfillment) {
        console.warn("updateItemFulfillment function is not provided");
        return;
      }

      updateItemFulfillment(orderId, order.channelId, itemId, fulfilled);
    },
    [order.channelId, updateItemFulfillment],
  );

  const handleSetItemInProgress = useCallback(
    (orderId: string, itemId: string, inProgress: boolean) => {
      if (!updateItemInProgress) {
        console.warn("updateItemInProgress function is not provided");
        return;
      }

      updateItemInProgress(orderId, order.channelId, itemId, inProgress);
    },
    [order.channelId, updateItemInProgress],
  );

  const handleSetItemPriority = useCallback(
    (orderId: string, itemId: string, priority: boolean) => {
      if (!updateItemPriority) {
        console.warn("updateItemPriority function is not provided");
        return;
      }

      updateItemPriority(orderId, order.channelId, itemId, priority);
    },
    [order.channelId, updateItemPriority],
  );

  const handleReportItemProblem = useCallback(
    (orderItem: OrderItem, problem?: ItemProblem) => {
      onReportItemProblem?.(order, orderItem, problem);
    },
    [onReportItemProblem, order],
  );

  return (
    <Grid
      gridTemplateColumns={"repeat(3, 1fr)"}
      gap={6}
      py={6}
      {...containerProps}
    >
      <GridItem colSpan={2}>
        {storage && (
          <Box
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
          >
            <Text as="h3" fontSize="lg" fontWeight="bold" mb={"4"}>
              {t("order.items", { defaultValue: "Items" })}
            </Text>
            {renderItemsSection ? (
              renderItemsSection(order, {
                dirtyFlag,
                files,
                onUploadComplete: handleUploadComplete,
                setDirtyFlag,
              })
            ) : (
              <OrderItemsFileList
                storage={storage}
                customerId={customerId}
                channelId={order.channelId}
                orderId={order.id}
                orderStatus={order.status}
                orderShippingOption={order.shippingOption}
                orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
                shippingMethodsSettings={shippingMethodsSettings}
                orderFulfilledItems={order.fulfilledItems}
                orderInProgressItems={order.inProgressItems}
                orderPriorityItems={order.priorityItems}
                orderProblemItems={order.problemItems}
                handleFulfillItem={handleFulfillItem}
                handleSetItemInProgress={handleSetItemInProgress}
                handleSetItemPriority={handleSetItemPriority}
                onReportItemProblem={
                  onReportItemProblem ? handleReportItemProblem : undefined
                }
                orderItems={order.items}
                listResults={files}
                onFileDownload={onFileDownload}
                onFileDelete={onFileDelete}
                setDirtyFlag={setDirtyFlag}
                dirtyFlag={dirtyFlag}
                showFiles={showFiles}
                isStore={order.isFromStore}
                renderUploadComponent={renderUploadComponent}
                renderAdditionalFileSections={renderAdditionalFileSections}
                tenantContext={tenantContext}
                t={t}
                i18n={i18n}
              />
            )}
          </Box>
        )}
      </GridItem>
      <GridItem colSpan={1}>
        <VStack align="stretch" gap={6} h="full">
          {order.specialNotes && (
            <SpecialNotesPanel
              density="compact"
              heading={t("orderPage.specialNotes.heading", {
                defaultValue: "Special Notes",
              })}
              specialNotes={order.specialNotes}
            />
          )}
          <Box
            border={"1px solid"}
            borderColor={borderColor}
            borderRadius={"3xl"}
            p={"8"}
            flex="1"
          >
            <Customer
              customer={order.customer}
              contact={order.contact}
              invoice={order.invoice}
              shipping={order.shipping}
              tracking={order.tracking}
              shippingOption={order.shippingOption}
              billing={order.billing}
              invoiceNotes={order.invoiceNotes}
              shippingMethodsSettings={shippingMethodsSettings}
              t={t}
              i18n={i18n}
            />
          </Box>
        </VStack>
      </GridItem>
    </Grid>
  );
}

function areOrderPreviewPanelPropsEqual(
  prevProps: OrderPreviewPanelProps,
  nextProps: OrderPreviewPanelProps,
) {
  return (
    prevProps.order === nextProps.order &&
    prevProps.storage === nextProps.storage &&
    prevProps.updateItemFulfillment === nextProps.updateItemFulfillment &&
    prevProps.updateItemInProgress === nextProps.updateItemInProgress &&
    prevProps.updateItemPriority === nextProps.updateItemPriority &&
    prevProps.onReportItemProblem === nextProps.onReportItemProblem &&
    prevProps.onFileDownload === nextProps.onFileDownload &&
    prevProps.onFileDelete === nextProps.onFileDelete &&
    prevProps.showFiles === nextProps.showFiles &&
    prevProps.renderItemsSection === nextProps.renderItemsSection &&
    prevProps.renderUploadComponent === nextProps.renderUploadComponent &&
    prevProps.renderAdditionalFileSections ===
      nextProps.renderAdditionalFileSections &&
    prevProps.tenantContext === nextProps.tenantContext &&
    prevProps.orderWorkflowStatusesSettings ===
      nextProps.orderWorkflowStatusesSettings &&
    prevProps.shippingMethodsSettings === nextProps.shippingMethodsSettings &&
    prevProps.containerProps === nextProps.containerProps &&
    prevProps.i18n.resolvedLanguage === nextProps.i18n.resolvedLanguage
  );
}

export const OrderPreviewPanel = memo(
  OrderPreviewPanelComponent,
  areOrderPreviewPanelPropsEqual,
);
