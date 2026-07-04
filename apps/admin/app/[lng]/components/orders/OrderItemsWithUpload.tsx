"use client";

import { getOrderItemFolderName } from "@/lib/order-item-folder";
import {
  Box,
  Center,
  Image as ChakraImage,
  HStack,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, OrderItemsFileList } from "@konfi/components";
import type { TenantContext } from "@konfi/firebase";
import {
  isNestedCustomer,
  ItemProblem,
  ListResults,
  Order,
  OrderItem,
  type OrderWorkflowStatusesSettings,
  ShippingOptions,
  type ShippingMethodsSettings,
  Warehouse,
} from "@konfi/types";
import { isElectron } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { FirebaseStorage } from "firebase/storage";
import { i18n, TFunction } from "i18next";
import {
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface OrderItemsWithUploadProps {
  storage: FirebaseStorage;
  order: Order;
  orderItems: OrderItem[];
  listResults: ListResults[];
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
  baseFolderPath?: string;
  localFilesRefreshKey?: number;
  warehouses?: Warehouse[] | null;
  getWarehouseName?: (warehouseId: string) => string;
  onAssignWarehouse?: (orderItem: OrderItem) => void;
  onManualFulfillmentRequest?: (orderItem: OrderItem) => void;
  onEditItem?: (orderItem: OrderItem) => void;
  renderItemActions?: (orderItem: OrderItem) => React.ReactNode;
  selectedItemId?: string | null;
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null;
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null;
  eagerImages?: boolean;
  tenantContext?: TenantContext;
  t: TFunction;
  i18n: i18n;
}

interface LocalOrderFile {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modified: number;
  extension: string;
  kind: "image" | "pdf" | "other";
  previewId?: string;
  previewUrl?: string;
}

export default function OrderItemsWithUpload({
  storage,
  order,
  orderItems,
  listResults,
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
  baseFolderPath,
  localFilesRefreshKey,
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
  tenantContext,
  t,
  i18n,
}: OrderItemsWithUploadProps) {
  const customerId = isNestedCustomer(order.customer) ? order.customer.id : "";
  const orderNumber = order.number;

  const [localFilesByItem, setLocalFilesByItem] = useState<
    Record<string, LocalOrderFile[]>
  >({});
  const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(
    new Set(),
  );
  const previewIdsRef = useRef<Set<string>>(new Set());

  const releasePreviews = useCallback((previewIds: Iterable<string>) => {
    for (const previewId of previewIds) {
      void window.konfiDesktop?.orders.releasePreview(previewId);
    }
  }, []);

  useEffect(() => {
    if (
      !isElectron() ||
      !baseFolderPath ||
      orderNumber === undefined ||
      orderNumber === null ||
      isEmpty(orderItems)
    ) {
      if (previewIdsRef.current.size > 0) {
        releasePreviews(previewIdsRef.current);
        previewIdsRef.current = new Set();
      }
      setLocalFilesByItem({});
      return;
    }

    let cancelled = false;
    const pendingPreviews: string[] = [];
    const electronOrder = window.konfiDesktop?.orders;
    if (!electronOrder) {
      setLocalFilesByItem({});
      return;
    }

    const load = async () => {
      try {
        const entries = await Promise.all(
          orderItems.map(async (item) => {
            const itemFolder = getOrderItemFolderName(item);
            try {
              const response = await electronOrder.listItemFiles({
                baseFolderPath,
                orderNumber,
                itemFolder,
              });
              if (response?.success && Array.isArray(response.files)) {
                const files = await Promise.all(
                  response.files.map(async (file) => {
                    let previewId: string | undefined;
                    let previewUrl: string | undefined;
                    if (file.kind === "image" || file.kind === "pdf") {
                      try {
                        const preview = await electronOrder.generatePreview({
                          baseFolderPath,
                          orderNumber,
                          relativePath: file.relativePath,
                          options: { width: 192, height: 192 },
                        });
                        if (preview?.success && preview.previewId) {
                          pendingPreviews.push(preview.previewId);
                          previewId = preview.previewId;
                          previewUrl = preview.previewUrl;
                        }
                      } catch (error) {
                        console.warn(
                          "Failed to generate preview for",
                          file.path,
                          error,
                        );
                      }
                    }

                    return {
                      id: file.path,
                      name: file.name,
                      path: file.path,
                      relativePath: file.relativePath,
                      size: file.size,
                      modified: file.modified,
                      extension: file.extension,
                      kind: file.kind,
                      previewId,
                      previewUrl,
                    } satisfies LocalOrderFile;
                  }),
                );
                return [item.id, files] as const;
              }
            } catch (error) {
              console.warn("Failed to list local files for", item.id, error);
            }
            return [item.id, []] as const;
          }),
        );

        if (cancelled) {
          releasePreviews(pendingPreviews);
          return;
        }

        const nextFiles = Object.fromEntries(entries) as Record<
          string,
          LocalOrderFile[]
        >;

        // Reset loaded previews when files change
        setLocalFilesByItem(nextFiles);

        const nextPreviewSet = new Set(pendingPreviews);
        const prevPreviewSet = previewIdsRef.current;
        for (const previewId of prevPreviewSet) {
          if (!nextPreviewSet.has(previewId)) {
            void electronOrder.releasePreview(previewId);
          }
        }
        previewIdsRef.current = nextPreviewSet;
      } catch (error) {
        console.error("Failed to load local order files", error);
        if (!cancelled) {
          setLocalFilesByItem({});
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      releasePreviews(pendingPreviews);
    };
  }, [
    baseFolderPath,
    dirtyFlag,
    orderItems,
    orderNumber,
    localFilesRefreshKey,
    releasePreviews,
  ]);

  useEffect(
    () => () => {
      releasePreviews(previewIdsRef.current);
      previewIdsRef.current = new Set();
    },
    [releasePreviews],
  );

  const formatSize = useCallback(
    (bytes: number) =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "decimal",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(bytes / (1024 * 1024)),
    [i18n.resolvedLanguage],
  );

  const handleLocalDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>, file: LocalOrderFile) => {
      if (!window.konfiDesktop?.orders || !baseFolderPath) return;
      event.preventDefault();
      event.dataTransfer.effectAllowed = "copy";
      try {
        event.dataTransfer.setData("text/plain", file.path);
      } catch {
        // Ignore inability to set data transfer payload
      }
      void window.konfiDesktop.orders.startDrag({
        baseFolderPath,
        orderNumber,
        relativePaths: [file.relativePath],
        iconPreviewId: file.previewId ?? null,
      });
    },
    [baseFolderPath, orderNumber],
  );

  const handleOpenFolder = useCallback(
    (relativePath: string) => {
      if (!baseFolderPath) return;
      void window.konfiDesktop?.orders.openContainingFolder({
        baseFolderPath,
        orderNumber,
        relativePath,
      });
    },
    [baseFolderPath, orderNumber],
  );

  const renderLocalFiles = useCallback(
    (orderItem: OrderItem) => {
      if (!isElectron()) return null;
      const files = localFilesByItem[orderItem.id] ?? [];
      if (files.length === 0) return null;

      return (
        <VStack gap={2} align="stretch" mt={4} className="noprint">
          <Text fontSize="xs" fontWeight="600" color="fg.muted">
            {t("order.localFiles", { defaultValue: "Local files" })}
          </Text>
          {files.map((file) => {
            const previewSrc = file.previewUrl ?? null;
            const isLoadingPreview = file.previewId
              ? loadingPreviews.has(file.previewId)
              : false;

            return (
              <Box
                key={file.id}
                w="100%"
                border="1px solid"
                borderRadius="2xl"
                py={2}
                px={4}
                borderColor="gray.muted"
                draggable
                onDragStart={(event) => handleLocalDragStart(event, file)}
              >
                <HStack gap={4} align="start">
                  {previewSrc ? (
                    <ChakraImage
                      src={previewSrc}
                      alt={file.name}
                      w="64px"
                      h="64px"
                      borderRadius="xl"
                      objectFit="contain"
                    />
                  ) : isLoadingPreview ? (
                    <Center w="64px" h="64px" borderRadius="xl" bg="bg.muted">
                      <Spinner size="sm" />
                    </Center>
                  ) : file.kind === "image" || file.kind === "pdf" ? (
                    <Center w="64px" h="64px" borderRadius="xl" bg="bg.muted">
                      <MaterialSymbol color="fg.muted">
                        {file.kind === "image" ? "image" : "picture_as_pdf"}
                      </MaterialSymbol>
                    </Center>
                  ) : (
                    <Center w="64px" h="64px">
                      <MaterialSymbol color="fg.muted">
                        insert_drive_file
                      </MaterialSymbol>
                    </Center>
                  )}
                  <VStack align="start" gap={0} flex={1}>
                    <Text fontWeight="600" fontSize="sm" lineClamp={1}>
                      {file.name}
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      {formatSize(file.size)} MB
                    </Text>
                  </VStack>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleOpenFolder(file.relativePath);
                    }}
                    aria-label={t("admin.openContainingFolder", {
                      defaultValue: "Open containing folder",
                    })}
                  >
                    <MaterialSymbol>folder_open</MaterialSymbol>
                  </IconButton>
                </HStack>
              </Box>
            );
          })}
        </VStack>
      );
    },
    [
      formatSize,
      handleLocalDragStart,
      handleOpenFolder,
      localFilesByItem,
      loadingPreviews,
      t,
    ],
  );

  return (
    <VStack gap={2} align="stretch" w="100%">
      <OrderItemsFileList
        storage={storage}
        customerId={customerId}
        channelId={order.channelId}
        orderId={order.id}
        orderStatus={order.status}
        orderFulfilledItems={order.fulfilledItems}
        orderInProgressItems={order.inProgressItems}
        orderPickedUpItems={order.pickedUpItems}
        orderDeliveredItems={order.deliveredItems}
        orderPriorityItems={order.priorityItems}
        orderProblemItems={order.problemItems}
        handleFulfillItem={handleFulfillItem}
        handleSetItemInProgress={handleSetItemInProgress}
        handleMarkItemPickedUp={handleMarkItemPickedUp}
        handleMarkItemDelivered={handleMarkItemDelivered}
        handleSetItemPriority={handleSetItemPriority}
        orderShippingOption={order.shippingOption ?? ShippingOptions.CUSTOM}
        orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
        shippingMethodsSettings={shippingMethodsSettings}
        onReportItemProblem={onReportItemProblem}
        orderItems={orderItems}
        listResults={listResults}
        onFileDownload={onFileDownload}
        onFileDelete={onFileDelete}
        setDirtyFlag={setDirtyFlag}
        dirtyFlag={dirtyFlag}
        showFiles={showFiles}
        isStore={order.isFromStore}
        warehouses={warehouses}
        getWarehouseName={getWarehouseName}
        onAssignWarehouse={onAssignWarehouse}
        onManualFulfillmentRequest={onManualFulfillmentRequest}
        onEditItem={onEditItem}
        renderItemActions={renderItemActions}
        selectedItemId={selectedItemId}
        renderAdditionalFileSections={renderLocalFiles}
        eagerImages={eagerImages}
        tenantContext={tenantContext}
        t={t}
        i18n={i18n}
      />
    </VStack>
  );
}
