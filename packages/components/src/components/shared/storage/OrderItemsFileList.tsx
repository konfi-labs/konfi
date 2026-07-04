"use client";

import {
  Badge,
  Box,
  Circle,
  Collapsible,
  HStack,
  IconButton,
  Presence,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  buildProductCdnThumbnail,
  fetchThumbnail,
  type TenantContext,
} from "@konfi/firebase";
import {
  ItemProblem,
  ListResults,
  OrderItem,
  type OrderWorkflowStatusesSettings,
  type OrderWorkflowStatusId,
  type ShippingMethodId,
  type ShippingMethodsSettings,
  ShippingTypes,
  Warehouse,
} from "@konfi/types";
import {
  getShippingMethodDefinition,
  isOrderWorkflowStatusFulfilled,
  isOrderWorkflowStatusReadyForPickup,
  isOrderWorkflowStatusTerminal,
  showFulfillmentStatus,
} from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { filter, isEmpty } from "es-toolkit/compat";
import { FirebaseStorage } from "firebase/storage";
import { i18n, TFunction } from "i18next";
import { SetStateAction } from "react";
import useSWR from "swr";
import { Image } from "../Image";
import { MaterialSymbol } from "../MaterialSymbol";
import { Item } from "../order";
import {
  MenuContent,
  MenuItem,
  MenuItemCommand,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "../../ui/menu";

export const OrderItemsFileList = ({
  storage,
  customerId,
  channelId,
  orderId,
  orderStatus,
  handleFulfillItem,
  handleSetItemInProgress,
  handleMarkItemPickedUp,
  handleMarkItemDelivered,
  handleSetItemPriority,
  orderFulfilledItems,
  orderInProgressItems,
  orderPickedUpItems,
  orderDeliveredItems,
  orderPriorityItems,
  orderProblemItems,
  orderShippingOption,
  orderWorkflowStatusesSettings,
  shippingMethodsSettings,
  onReportItemProblem,
  onEditItem,
  selectedItemId,
  orderItems,
  listResults,
  onFilePreview,
  onFileDownload,
  onFileDelete,
  setDirtyFlag,
  dirtyFlag,
  showFiles,
  isStore = true,
  warehouses,
  getWarehouseName,
  onAssignWarehouse,
  onManualFulfillmentRequest,
  renderItemActions,
  renderUploadComponent,
  renderAdditionalFileSections,
  eagerImages,
  tenantContext,
  t,
  i18n,
}: {
  storage: FirebaseStorage;
  customerId?: string;
  channelId?: string;
  orderId?: string;
  orderStatus?: OrderWorkflowStatusId;
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
  orderFulfilledItems?: string[];
  orderInProgressItems?: string[];
  orderPickedUpItems?: string[];
  orderDeliveredItems?: string[];
  orderPriorityItems?: string[];
  orderProblemItems?: ItemProblem[];
  orderShippingOption?: ShippingMethodId | null;
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null;
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null;
  onReportItemProblem?: (
    orderItem: OrderItem,
    existingProblem?: ItemProblem,
  ) => void;
  onEditItem?: (orderItem: OrderItem) => void;
  selectedItemId?: string | null;
  orderItems?: OrderItem[];
  listResults?: ListResults[];
  onFilePreview?: (url?: string) => Promise<void>;
  onFileDownload?: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined;
  dirtyFlag?: boolean;
  showFiles?: boolean;
  isStore?: boolean;
  warehouses?: Warehouse[] | null;
  getWarehouseName?: (warehouseId: string) => string;
  onAssignWarehouse?: (orderItem: OrderItem) => void;
  onManualFulfillmentRequest?: (orderItem: OrderItem) => void;
  renderItemActions?: (orderItem: OrderItem) => React.ReactNode;
  renderUploadComponent?: (
    orderItem: OrderItem,
    helpers: { onUploadComplete: () => void },
  ) => React.ReactNode;
  renderAdditionalFileSections?: (orderItem: OrderItem) => React.ReactNode;
  eagerImages?: boolean;
  tenantContext?: TenantContext;
  t: TFunction;
  i18n: i18n;
}) => {
  return (
    <VStack gap={2}>
      {orderItems?.map((orderItem: OrderItem, index) => (
        <OrderItemWithFileList
          key={orderItem.id || index}
          storage={storage}
          customerId={customerId}
          channelId={channelId}
          orderId={orderId}
          orderStatus={orderStatus}
          fulfilled={orderFulfilledItems?.includes(orderItem.id) ?? false}
          inProgress={orderInProgressItems?.includes(orderItem.id) ?? false}
          pickedUp={orderPickedUpItems?.includes(orderItem.id) ?? false}
          delivered={orderDeliveredItems?.includes(orderItem.id) ?? false}
          priority={orderPriorityItems?.includes(orderItem.id) ?? false}
          problem={orderProblemItems?.find((p) => p.itemId === orderItem.id)}
          handleFulfillItem={handleFulfillItem}
          handleSetItemInProgress={handleSetItemInProgress}
          handleMarkItemPickedUp={handleMarkItemPickedUp}
          handleMarkItemDelivered={handleMarkItemDelivered}
          handleSetItemPriority={handleSetItemPriority}
          orderShippingOption={orderShippingOption}
          orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
          shippingMethodsSettings={shippingMethodsSettings}
          onReportItemProblem={onReportItemProblem}
          onEditItem={onEditItem}
          selectedItemId={selectedItemId}
          index={index}
          orderItem={orderItem}
          listResults={filter(listResults ?? [], (listResult) => {
            // Check if the file path contains the item ID first (new format)
            if (
              listResult.storageReference.fullPath.includes(
                `/items/${orderItem.id}/`,
              )
            ) {
              return true;
            }
            // Fallback to index-based path (legacy format)
            return listResult.storageReference.fullPath.includes(
              `/items/${index}/`,
            );
          })}
          onFileDownload={onFileDownload}
          onFileDelete={onFileDelete}
          setDirtyFlag={setDirtyFlag}
          dirtyFlag={dirtyFlag}
          showFiles={showFiles}
          warehouses={warehouses}
          getWarehouseName={getWarehouseName}
          onAssignWarehouse={onAssignWarehouse}
          onManualFulfillmentRequest={onManualFulfillmentRequest}
          renderItemActions={renderItemActions}
          renderUploadComponent={renderUploadComponent}
          renderAdditionalFileSections={renderAdditionalFileSections}
          eagerImages={eagerImages}
          tenantContext={tenantContext}
          t={t}
          i18n={i18n}
          isStore={isStore}
        />
      ))}
    </VStack>
  );
};

function OrderItemWithFileList({
  storage,
  customerId,
  channelId,
  orderId,
  orderStatus,
  handleFulfillItem,
  handleSetItemInProgress,
  handleMarkItemPickedUp,
  handleMarkItemDelivered,
  handleSetItemPriority,
  onReportItemProblem,
  onEditItem,
  selectedItemId,
  fulfilled,
  inProgress,
  pickedUp,
  delivered,
  priority,
  problem,
  index,
  orderItem,
  listResults,
  onFilePreview,
  onFileDownload,
  onFileDelete,
  setDirtyFlag,
  dirtyFlag,
  showFiles,
  isStore,
  warehouses,
  getWarehouseName,
  onAssignWarehouse,
  onManualFulfillmentRequest,
  renderItemActions,
  orderShippingOption,
  orderWorkflowStatusesSettings,
  shippingMethodsSettings,
  renderUploadComponent,
  renderAdditionalFileSections,
  eagerImages,
  tenantContext,
  t,
  i18n,
}: {
  storage: FirebaseStorage;
  customerId?: string;
  channelId?: string;
  orderId?: string;
  orderStatus?: OrderWorkflowStatusId;
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
  onEditItem?: (orderItem: OrderItem) => void;
  selectedItemId?: string | null;
  fulfilled: boolean;
  inProgress: boolean;
  pickedUp: boolean;
  delivered: boolean;
  priority: boolean;
  problem?: ItemProblem;
  index: number;
  orderItem: OrderItem;
  listResults: ListResults[];
  onFilePreview?: (url?: string) => Promise<void>;
  onFileDownload?: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined;
  dirtyFlag?: boolean;
  showFiles?: boolean;
  isStore?: boolean;
  warehouses?: Warehouse[] | null;
  getWarehouseName?: (warehouseId: string) => string;
  onAssignWarehouse?: (orderItem: OrderItem) => void;
  onManualFulfillmentRequest?: (orderItem: OrderItem) => void;
  renderItemActions?: (orderItem: OrderItem) => React.ReactNode;
  orderShippingOption?: ShippingMethodId | null;
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null;
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null;
  renderUploadComponent?: (
    orderItem: OrderItem,
    helpers: { onUploadComplete: () => void },
  ) => React.ReactNode;
  renderAdditionalFileSections?: (orderItem: OrderItem) => React.ReactNode;
  eagerImages?: boolean;
  tenantContext?: TenantContext;
  t: TFunction;
  i18n: i18n;
}) {
  // Custom coloring rules: blue for inProgress, green for fulfilled, red for problem, default gray border otherwise.
  // When the overall order is ready for handoff or closed we hide item border/highlight colors (neutral styling).
  const orderClosed = Boolean(
    orderStatus &&
    (isOrderWorkflowStatusReadyForPickup(
      orderStatus,
      orderWorkflowStatusesSettings,
    ) ||
      isOrderWorkflowStatusFulfilled(
        orderStatus,
        orderWorkflowStatusesSettings,
      ) ||
      isOrderWorkflowStatusTerminal(
        orderStatus,
        orderWorkflowStatusesSettings,
      )),
  );
  const shippingMethod = orderShippingOption
    ? getShippingMethodDefinition(orderShippingOption, shippingMethodsSettings)
    : undefined;
  const isPickupOrder =
    shippingMethod?.kind === ShippingTypes.PERSONAL_COLLECTION;
  const handoffColor = delivered ? "blue" : pickedUp ? "orange" : undefined;
  const handoffLabel = delivered
    ? t("order.delivered", { defaultValue: "Delivered" })
    : pickedUp
      ? t("order.pickedUp", { defaultValue: "Picked up" })
      : null;
  const hasProblem = problem && !problem.resolved;
  const borderColor = orderClosed
    ? "gray.muted"
    : hasProblem
      ? "red.solid"
      : fulfilled
        ? "green.solid"
        : inProgress
          ? "blue.solid"
          : "gray.muted";
  const highlightColor = orderClosed
    ? undefined
    : hasProblem
      ? "red.solid"
      : fulfilled
        ? "green.solid"
        : inProgress
          ? "blue.solid"
          : undefined;
  const isSelected = selectedItemId === orderItem.id;
  // Priority adds an accent ring without overriding the status-colored border.
  const priorityRing = priority
    ? { boxShadow: "0 0 0 2px var(--chakra-colors-yellow-400)" }
    : {};
  const resolvedOrderId = orderId ?? null;
  const canShowFulfillmentActions = Boolean(
    resolvedOrderId &&
    orderStatus &&
    showFulfillmentStatus(orderStatus, orderWorkflowStatusesSettings),
  );
  const showInProgressAction = Boolean(handleSetItemInProgress && !fulfilled);
  const showFulfilledAction = Boolean(handleFulfillItem);
  const showPickedUpAction = Boolean(
    handleMarkItemPickedUp && fulfilled && (isPickupOrder || pickedUp),
  );
  const showDeliveredAction = Boolean(
    handleMarkItemDelivered && fulfilled && (!isPickupOrder || delivered),
  );
  const showPriorityAction = Boolean(handleSetItemPriority);
  const showProblemAction = Boolean(onReportItemProblem);
  const showEditAction = Boolean(onEditItem && canShowFulfillmentActions);
  const canChangeWarehouseAssignment =
    !fulfilled &&
    !pickedUp &&
    !delivered &&
    (!orderItem.warehouseId ||
      orderItem.fulfillmentAssignment?.assignmentSource === "DIRECT");
  const showAssignWarehouseAction = Boolean(
    onAssignWarehouse &&
    canShowFulfillmentActions &&
    canChangeWarehouseAssignment,
  );
  const showManualRequestAction = Boolean(
    onManualFulfillmentRequest &&
    !orderItem.warehouseId &&
    canShowFulfillmentActions,
  );
  const hasNonRoutingFulfillmentAction =
    showInProgressAction ||
    showFulfilledAction ||
    showPickedUpAction ||
    showDeliveredAction ||
    showPriorityAction ||
    showProblemAction;
  const showWarehouseRoutingActions =
    showAssignWarehouseAction || showManualRequestAction;
  const hasFulfillmentMenuActions =
    canShowFulfillmentActions &&
    (showEditAction ||
      showInProgressAction ||
      showFulfilledAction ||
      showPickedUpAction ||
      showDeliveredAction ||
      showPriorityAction ||
      showWarehouseRoutingActions);
  const showActionsMenu =
    Boolean(resolvedOrderId) &&
    (hasFulfillmentMenuActions || showProblemAction);
  const additionalActions = renderItemActions?.(orderItem);
  const showActionArea = showActionsMenu || Boolean(additionalActions);
  const badgeRightOffset = showActionsMenu ? 20 : 5;

  // Build product CDN thumbnail as fallback
  const productCdnThumbnail = buildProductCdnThumbnail({
    productId: orderItem.product?.id,
    channelId:
      orderItem.product?.channelId || process.env.NEXT_PUBLIC_STORE_CHANNEL_ID,
    imageFiles: orderItem.product?.spec?.images ?? [],
    choose: "first",
  });

  const {
    data: _thumbnailURL,
    isValidating,
    mutate,
  } = useSWR(
    !isUndefined(storage)
      ? [
          storage,
          customerId,
          orderId,
          index,
          orderItem.id,
          orderItem.product?.id,
          orderItem.product?.channelId,
          orderItem.product?.spec?.images,
          isEmpty(listResults),
          isStore,
          tenantContext,
          channelId,
        ]
      : null,
    ([
      storage,
      customerId,
      orderId,
      index,
      itemId,
      productId,
      productChannelId,
      productImages,
      noFiles,
      isStore,
      tenantContext,
      channelId,
    ]: [
      FirebaseStorage,
      string,
      string,
      number,
      string,
      string,
      string,
      string[] | undefined,
      boolean,
      boolean,
      TenantContext | undefined,
      string | undefined,
    ]) => {
      const itemIndexOrId = itemId || index;
      const resolvedChannelId =
        channelId ?? process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;

      // Store orders: use the item-level thumbnail from thumb_orders/{customerId}/{orderId}/items/{itemId}
      if (isStore && customerId && orderId) {
        return fetchThumbnail(
          undefined,
          storage,
          customerId,
          orderId,
          itemIndexOrId,
          productId,
          productChannelId,
          true, // force thumb_orders branch
          resolvedChannelId,
          productImages,
          tenantContext,
        );
      }

      // Admin: try to fetch thumbnail using customerId, orderId, and itemId
      if (!isStore && customerId && orderId && itemId) {
        return fetchThumbnail(
          undefined,
          storage,
          customerId,
          orderId,
          itemId,
          productId,
          productChannelId,
          true,
          resolvedChannelId,
          productImages,
          tenantContext,
        );
      }

      // Fallback: if there are files, show first file's generated thumb
      if (!noFiles && Array.isArray(listResults) && listResults.length > 0) {
        return fetchThumbnail(
          listResults[0],
          storage,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          process.env.NEXT_PUBLIC_STORE_CHANNEL_ID,
        );
      }

      // Return undefined to use fallback
      return undefined;
    },
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      fallbackData: productCdnThumbnail,
      dedupingInterval: 60000,
    },
  );

  return (
    <Box
      p={4}
      w={"100%"}
      border={"1px solid"}
      borderWidth={isSelected ? "3px" : "1px"}
      borderRadius={"3xl"}
      borderColor={isSelected ? "primary.solid" : borderColor}
      position="relative"
      overflow="hidden"
      {...priorityRing}
    >
      <Presence
        present={!orderClosed && (fulfilled || inProgress || hasProblem)}
      >
        <Circle
          position="absolute"
          top={0}
          right={0}
          size={32}
          bgColor={
            hasProblem
              ? "red.emphasized"
              : fulfilled
                ? "green.emphasized"
                : inProgress
                  ? "blue.emphasized"
                  : undefined
          }
          filter="blur(50px)"
          animation="float"
        />
      </Presence>
      {renderUploadComponent &&
        renderUploadComponent(orderItem, {
          onUploadComplete: () => {
            void mutate();
            if (setDirtyFlag && typeof dirtyFlag !== "undefined") {
              setDirtyFlag(!dirtyFlag);
            }
          },
        })}
      <Box>
        {!isUndefined(orderItem.warehouseId) &&
          orderItem.warehouseId !== null &&
          orderItem.warehouseId !== "" && (
            <Badge
              position="absolute"
              top={4}
              left={5}
              colorPalette="gray"
              variant="solid"
              pl={3}
              pr={3}
              zIndex={10}
            >
              <Text maxW="75px" truncate>
                {getWarehouseName
                  ? getWarehouseName(orderItem.warehouseId)
                  : orderItem.warehouseId}
              </Text>
            </Badge>
          )}
        {problem && (
          <Badge
            as={showProblemAction ? "button" : undefined}
            position="absolute"
            top={6}
            right={badgeRightOffset}
            colorPalette={problem.resolved ? "gray" : "red"}
            variant={problem.resolved ? "subtle" : "solid"}
            pl={3}
            pr={3}
            zIndex={10}
            cursor={showProblemAction ? "pointer" : undefined}
            onClick={
              showProblemAction
                ? () => onReportItemProblem?.(orderItem, problem)
                : undefined
            }
            aria-label={
              showProblemAction
                ? t("order.editItemProblem", {
                    defaultValue: "Edit Problem with Position",
                  })
                : undefined
            }
            _hover={
              showProblemAction ? { filter: "brightness(0.98)" } : undefined
            }
            _focusVisible={
              showProblemAction
                ? {
                    outline: "2px solid var(--chakra-colors-primary-solid)",
                    outlineOffset: "2px",
                  }
                : undefined
            }
          >
            <MaterialSymbol>
              {problem.resolved ? "check_circle" : "error"}
            </MaterialSymbol>
            <Text maxW="150px" truncate>
              {problem.description ||
                t("order.itemProblem", { defaultValue: "Problem" })}
            </Text>
          </Badge>
        )}
        {handoffLabel ? (
          <Badge
            position="absolute"
            top={problem ? 14 : 4}
            right={badgeRightOffset}
            colorPalette={handoffColor}
            variant="subtle"
            pl={3}
            pr={3}
            zIndex={10}
          >
            <MaterialSymbol>
              {delivered ? "local_shipping" : "shopping_bag"}
            </MaterialSymbol>
            <Text maxW="150px" truncate>
              {handoffLabel}
            </Text>
          </Badge>
        ) : null}
        <Item
          item={orderItem}
          channelId={orderItem.product?.channelId!}
          thumbnailURL={_thumbnailURL}
          thumbnailLoading={isValidating}
          imageFetchPriority={eagerImages ? "high" : undefined}
          imageLoading={eagerImages ? "eager" : undefined}
          t={t}
          i18n={i18n}
          highlightColor={highlightColor}
        >
          {showActionArea ? (
            <HStack
              justify="flex-end"
              ml="auto"
              align="start"
              flexShrink={0}
              position="relative"
              zIndex={20}
              gap={2}
              flexWrap="wrap"
            >
              {additionalActions}
              {showActionsMenu ? (
                <MenuRoot
                  lazyMount
                  positioning={{ placement: "bottom-end", strategy: "fixed" }}
                >
                  <MenuTrigger asChild>
                    <IconButton
                      variant="ghost"
                      aria-label={t("common.actions", {
                        defaultValue: "Actions",
                      })}
                      className="noprint"
                      flexShrink={0}
                    >
                      <MaterialSymbol aria-hidden="true">
                        menu_open
                      </MaterialSymbol>
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent zIndex="popover">
                    {showEditAction ? (
                      <>
                        <MenuItem
                          value="edit-item"
                          onClick={() => onEditItem?.(orderItem)}
                        >
                          <MaterialSymbol aria-hidden="true">
                            edit
                          </MaterialSymbol>
                          {t("order.editItem", {
                            defaultValue: "Edit item",
                          })}
                        </MenuItem>
                        {(showInProgressAction ||
                          showFulfilledAction ||
                          showPickedUpAction ||
                          showDeliveredAction ||
                          showPriorityAction ||
                          showProblemAction ||
                          showManualRequestAction) && <MenuSeparator />}
                      </>
                    ) : null}
                    {canShowFulfillmentActions && showInProgressAction ? (
                      <MenuItem
                        value="in-progress"
                        onClick={() =>
                          handleSetItemInProgress?.(
                            resolvedOrderId!,
                            orderItem.id,
                            !inProgress,
                          )
                        }
                        colorPalette={inProgress ? "blue" : undefined}
                      >
                        <MaterialSymbol aria-hidden="true">
                          pending
                        </MaterialSymbol>
                        {t("order.inProgress", {
                          defaultValue: "In Progress",
                        })}
                        {inProgress ? (
                          <MenuItemCommand>
                            <MaterialSymbol aria-hidden="true">
                              check
                            </MaterialSymbol>
                          </MenuItemCommand>
                        ) : null}
                      </MenuItem>
                    ) : null}
                    {canShowFulfillmentActions && showFulfilledAction ? (
                      <MenuItem
                        value="fulfilled"
                        onClick={() =>
                          handleFulfillItem?.(
                            resolvedOrderId!,
                            orderItem.id,
                            !fulfilled,
                          )
                        }
                        colorPalette={fulfilled ? "green" : undefined}
                      >
                        <MaterialSymbol aria-hidden="true">
                          check_circle
                        </MaterialSymbol>
                        {t("order.fulfilled", { defaultValue: "Fulfilled" })}
                        {fulfilled ? (
                          <MenuItemCommand>
                            <MaterialSymbol aria-hidden="true">
                              check
                            </MaterialSymbol>
                          </MenuItemCommand>
                        ) : null}
                      </MenuItem>
                    ) : null}
                    {canShowFulfillmentActions && showPickedUpAction ? (
                      <MenuItem
                        value="picked-up"
                        onClick={() =>
                          handleMarkItemPickedUp?.(
                            resolvedOrderId!,
                            orderItem.id,
                            !pickedUp,
                          )
                        }
                        colorPalette={pickedUp ? "orange" : undefined}
                      >
                        <MaterialSymbol aria-hidden="true">
                          shopping_bag
                        </MaterialSymbol>
                        {t("order.pickedUp", {
                          defaultValue: "Picked up",
                        })}
                        {pickedUp ? (
                          <MenuItemCommand>
                            <MaterialSymbol aria-hidden="true">
                              check
                            </MaterialSymbol>
                          </MenuItemCommand>
                        ) : null}
                      </MenuItem>
                    ) : null}
                    {canShowFulfillmentActions && showDeliveredAction ? (
                      <MenuItem
                        value="delivered"
                        onClick={() =>
                          handleMarkItemDelivered?.(
                            resolvedOrderId!,
                            orderItem.id,
                            !delivered,
                          )
                        }
                        colorPalette={delivered ? "blue" : undefined}
                      >
                        <MaterialSymbol aria-hidden="true">
                          local_shipping
                        </MaterialSymbol>
                        {t("order.delivered", {
                          defaultValue: "Delivered",
                        })}
                        {delivered ? (
                          <MenuItemCommand>
                            <MaterialSymbol aria-hidden="true">
                              check
                            </MaterialSymbol>
                          </MenuItemCommand>
                        ) : null}
                      </MenuItem>
                    ) : null}
                    {canShowFulfillmentActions && showPriorityAction ? (
                      <MenuItem
                        value="priority"
                        onClick={() =>
                          handleSetItemPriority?.(
                            resolvedOrderId!,
                            orderItem.id,
                            !priority,
                          )
                        }
                        colorPalette={priority ? "yellow" : undefined}
                      >
                        <MaterialSymbol aria-hidden="true">
                          priority_high
                        </MaterialSymbol>
                        {t("order.priority", { defaultValue: "Priority" })}
                        {priority ? (
                          <MenuItemCommand>
                            <MaterialSymbol aria-hidden="true">
                              check
                            </MaterialSymbol>
                          </MenuItemCommand>
                        ) : null}
                      </MenuItem>
                    ) : null}
                    {showProblemAction ? (
                      <MenuItem
                        value="problem"
                        onClick={() =>
                          onReportItemProblem?.(orderItem, problem)
                        }
                        colorPalette={
                          hasProblem
                            ? "red"
                            : problem?.resolved
                              ? "gray"
                              : undefined
                        }
                      >
                        <MaterialSymbol aria-hidden="true">
                          error
                        </MaterialSymbol>
                        {t("order.itemProblem", {
                          defaultValue: "Problem with position",
                        })}
                        {problem ? (
                          <MenuItemCommand>
                            <MaterialSymbol aria-hidden="true">
                              {problem.resolved ? "check" : "warning"}
                            </MaterialSymbol>
                          </MenuItemCommand>
                        ) : null}
                      </MenuItem>
                    ) : null}
                    {showWarehouseRoutingActions &&
                    canShowFulfillmentActions &&
                    hasNonRoutingFulfillmentAction ? (
                      <MenuSeparator />
                    ) : null}
                    {showAssignWarehouseAction ? (
                      <MenuItem
                        value="assign-warehouse"
                        onClick={() => onAssignWarehouse?.(orderItem)}
                      >
                        <MaterialSymbol aria-hidden="true">
                          warehouse
                        </MaterialSymbol>
                        {orderItem.warehouseId
                          ? t("admin.changeWarehouseAssignment", {
                              defaultValue: "Change warehouse assignment",
                            })
                          : t("admin.assignWarehouse", {
                              defaultValue: "Assign warehouse",
                            })}
                      </MenuItem>
                    ) : null}
                    {showManualRequestAction ? (
                      <MenuItem
                        value="request-fulfillment"
                        onClick={() => onManualFulfillmentRequest?.(orderItem)}
                      >
                        <MaterialSymbol aria-hidden="true">
                          assignment_add
                        </MaterialSymbol>
                        {t("admin.requestFulfillment", {
                          defaultValue: "Request fulfillment",
                        })}
                      </MenuItem>
                    ) : null}
                  </MenuContent>
                </MenuRoot>
              ) : null}
            </HStack>
          ) : null}
        </Item>
      </Box>
      <Collapsible.Root open={showFiles} defaultOpen>
        <Collapsible.Content>
          {renderAdditionalFileSections?.(orderItem)}
          {listResults.map((listResult, j) => (
            <OrderItemFile
              key={j}
              index={j}
              storage={storage}
              listResult={listResult}
              onFilePreview={onFilePreview}
              onFileDownload={onFileDownload}
              onFileDelete={onFileDelete}
              setDirtyFlag={setDirtyFlag}
              dirtyFlag={dirtyFlag}
              isStore={isStore}
              t={t}
              i18n={i18n}
            />
          ))}
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}

function OrderItemFile({
  index,
  storage,
  listResult,
  onFilePreview,
  onFileDownload,
  onFileDelete,
  setDirtyFlag,
  dirtyFlag,
  isStore,
  t,
  i18n,
}: {
  index: number;
  storage: FirebaseStorage;
  listResult: ListResults;
  onFilePreview?: (url?: string) => Promise<void>;
  onFileDownload?: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined;
  dirtyFlag?: boolean;
  isStore?: boolean;
  t: TFunction;
  i18n: i18n;
}) {
  const { data: _thumbnailURL, isValidating } = useSWR(
    !isUndefined(listResult) &&
      !isUndefined(storage) &&
      typeof isStore !== "undefined"
      ? [listResult, storage, isStore]
      : null,
    ([listResult, storage, isStore]: [
      ListResults,
      FirebaseStorage,
      boolean,
    ]) => {
      // If isStore is true, use the original thumbnail fetching logic
      if (isStore) {
        return fetchThumbnail(
          listResult,
          storage,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          process.env.NEXT_PUBLIC_STORE_CHANNEL_ID,
        );
      }
      // If isStore is false, return null to show the file icon instead
      return null;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    },
  );

  return (
    <Box
      key={index}
      mt={4}
      p={4}
      w={"100%"}
      border={"1px solid"}
      borderRadius="3xl"
      borderColor={"gray.muted"}
    >
      <HStack gap={4} w={"full"} align={"start"}>
        <Skeleton loading={isValidating}>
          {_thumbnailURL ? (
            <Image
              src={_thumbnailURL}
              alt={""}
              ratio={1}
              objectFit={"contain"}
              minW={"64px"}
              width={64}
              height={64}
              priority={false}
              borderRadius={"xl"}
            />
          ) : (
            <Box
              p={"6px"}
              top={"2px"}
              pb={0}
              borderRadius={"md"}
              border={"1px solid"}
              borderColor={{ base: "blackAlpha.200", _dark: "whiteAlpha.200" }}
            >
              <MaterialSymbol>insert_drive_file</MaterialSymbol>
            </Box>
          )}
        </Skeleton>
        <VStack gap={0} align={"start"}>
          <Text fontWeight={"600"}>{listResult.storageReference.name}</Text>
          <Text>
            {new Intl.NumberFormat(i18n.resolvedLanguage, {
              style: "decimal",
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            }).format(listResult.metadata.size / (1024 * 1024))}{" "}
            MB
          </Text>
        </VStack>
        <HStack ml={"auto"}>
          {!isUndefined(onFilePreview) && (
            <IconButton
              variant={"ghost"}
              onClick={() =>
                onFilePreview(listResult.storageReference.fullPath)
              }
              aria-label={t("admin.preview", { defaultValue: "Preview" })}
            >
              <MaterialSymbol>preview</MaterialSymbol>
            </IconButton>
          )}
          {!isUndefined(onFileDownload) && (
            <IconButton
              variant={"ghost"}
              onClick={() =>
                onFileDownload(listResult.storageReference.fullPath)
              }
              aria-label={t("admin.download", { defaultValue: "Download" })}
            >
              <MaterialSymbol>download</MaterialSymbol>
            </IconButton>
          )}
          {!isUndefined(onFileDelete) &&
            !isUndefined(setDirtyFlag) &&
            !isUndefined(dirtyFlag) && (
              <IconButton
                variant={"ghost"}
                onClick={() =>
                  onFileDelete(
                    listResult.storageReference.fullPath,
                    setDirtyFlag,
                    dirtyFlag,
                  )
                }
                aria-label={t("common.delete", { defaultValue: "Delete" })}
              >
                <MaterialSymbol>delete</MaterialSymbol>
              </IconButton>
            )}
        </HStack>
      </HStack>
    </Box>
  );
}
