"use client";

import { getAdminConfigFlags } from "@/actions";
import {
  classifyAndPersistProductionGroupingsBatchAdmin,
  getProductionGroupingClassificationsAdmin,
} from "@/actions/production-grouping-classifications";
import { getInvoices } from "@/actions/fakturownia";
import { sendOrderStatusEmail } from "@/actions/order-status-email";
import { updateOrderStatusField } from "@/actions/order-updates";
import Drawer from "@/components/Drawer";
import NoteForm from "@/components/notes/NoteForm";
import ComplaintForm from "@/components/orders/ComplaintForm";
import { ItemProblemDialog } from "@/components/orders/ItemProblemDialog";
import {
  getOrderPrintPageStyle,
  OrderPrintDocument,
  type OrderPrintInvoice,
  type PreparedOrderPrintData,
} from "@/components/orders/OrderPrintDocument";
import { OrderPrintPreparingDialog } from "@/components/orders/OrderPrintPreparingDialog";
import type {
  OrderPrintHandler,
  OrderPrintMode,
} from "@/components/orders/order-print-types";
import PaymentDocumentForm from "@/components/orders/PaymentDocumentForm";
import PaymentProofUploader from "@/components/orders/PaymentProofUploader";
import {
  ProductionOrderMenuContent,
  type ProductionOrderMenuActions,
} from "@/components/orders/ProductionOrderMenuContent";
import { ProductionOrdersToolbar } from "@/components/orders/ProductionOrdersToolbar";
import { PrintTypeCompletionBadges } from "@/components/orders/PrintTypeCompletionBadges";
import { ProductionStatusSummaryStrip } from "@/components/orders/ProductionStatusSummaryStrip";
import { StatusActorSelectionDialog } from "@/components/orders/StatusActorSelectionDialog";
import { useTenantContext } from "@/context/tenant";
import { useOrderFolderSettings } from "@/hooks/useOrderFolderSettings";
import { useProductionOrderActions } from "@/hooks/useProductionOrderActions";
import { useT } from "@/i18n/client";
import { firestore, storage } from "@/lib/firebase/clientApp";
import { list as listStorage } from "@/lib/firebase/storage";
import {
  getProductionGroupingCacheKey,
  getProductionGroupingItemRef,
  isFreshProductionGroupingClassification,
  PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
  resolveProductionGroupingClassification,
  toSerializableProductionGroupingItems,
  type ProductionGroupingClassificationItem,
} from "@/lib/orders/production-materials";
import {
  getOrderFolderPath,
  onFileDelete,
  onFileDownload,
  openOrderFolder,
} from "@/lib/helpers";
import {
  getOrderAgeInMinutes,
  shouldRequireStatusActorSelection,
  shouldRequireStatusEmailConfirmation,
  shouldWarnOrderMayBeIncomplete,
} from "@/lib/orders/status-change-confirmation";
import {
  getDefaultProductionVisibleStatusIds,
  getOrderItemProductionStatus,
  getOrderItemStatusChangeForDrop,
  getProductionFileStatusIds,
  getProductionOrderItemConfigurationParts,
  getProductionOrderItemDisplayName,
  getProductionOrderItemDisplayQuantity,
  getProductionOrderItemOriginalProductName,
  getProductionOrderItemTotalVolume,
  getProductionOrderPrintingMethodIds,
  getProductionPrintTypeCompletionGroups,
  getProductionOrderQuickFilterText,
  getProductionSectionQuerySpecs,
  isProductionWorkflowStatus,
  normalizeProductionGroupingMode,
  normalizeProductionVisibleStatusIds,
  orderItemMatchesProductionPrintingMethodFilter,
  orderMatchesProductionPrintingMethodFilter,
  planSectionPresetConstraints,
  PRODUCTION_GROUPING_MODES,
  PRODUCTION_ORDERS_PAGE_SIZE,
  PRODUCTION_ORDER_GROUPS,
  sortProductionOrders,
  sortProductionOrdersByDeadline,
  type ProductionGroupingMode,
  type ProductionItemDropStatus,
  type ProductionOrderGroup,
  type ProductionOrdersSort,
  type ProductionOrdersSortKey,
  type ProductionPrintTypeCompletionGroup,
  type ProductionSectionKey,
  type ProductionSectionQuerySpec,
  type SectionPresetPlan,
} from "@/lib/orders/production-view";
import {
  ActionBar,
  Badge,
  Box,
  Button,
  Collapsible,
  Dialog,
  Flex,
  Grid,
  HStack,
  IconButton,
  Popover,
  Portal,
  Separator,
  Skeleton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { AlertDialog } from "@konfi/components/shared/AlertDialog";
import { Empty } from "@konfi/components/shared/Empty";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { OrderPreviewPanel } from "@konfi/components/shared/OrderPreviewPanel";
import { Checkbox } from "@konfi/components/ui/checkbox";
import {
  MenuContent,
  MenuContextTrigger,
  MenuRadioItem,
  MenuRadioItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@konfi/components/ui/menu";
import { toaster } from "@konfi/components/ui/toaster";
import { Tooltip } from "@konfi/components/ui/tooltip";
import {
  buildProductCdnThumbnail,
  db,
  fetchOrderItemFiles,
  getComplaints,
  getNotes,
  tenant,
  tenantStoragePaths,
  update,
} from "@konfi/firebase";
import {
  ActivityStatus,
  type Channel,
  isAllegroExternalOrder,
  isAllegroFulfillmentManagedOrder,
  isNestedCustomer,
  type ItemProblem,
  type ListResults,
  type NestedMember,
  NoteEntityType,
  type Order,
  type OrderStatus,
  type OrderFileStatusId,
  type OrderItem,
  type OrderWorkflowStatusesSettings,
  type OrderWorkflowStatusId,
  PaymentStatusAsOptions,
  type ProductionGroupingClassification,
  type ProductionGroupingClassificationCacheResult,
  type ProductionGroupingProfile,
  type PrintingMethodId,
  type PrintingMethodsSettings,
  type Rule,
  type RulePreset,
  type RulesState,
  type SelectOption,
} from "@konfi/types";
import { applyOrderItemStatusChange } from "@konfi/utils/order-item-status";
import {
  compileOrderRulePresets,
  getEnabledOrderRulePresetDefinitions,
} from "@konfi/utils/order-rule-presets";
import {
  getDeadlineColorPalette,
  timeToDeadline,
} from "@konfi/utils/formatters";
import {
  getEnabledOrderFileStatusDefinitions,
  getEnabledOrderWorkflowStatusDefinitions,
  getOrderFileStatusColorPalette,
  getOrderFileStatusLabel,
  getOrderWorkflowStatusColorPalette,
  getOrderWorkflowStatusIcon,
  getOrderWorkflowStatusLabel,
} from "@konfi/utils/order-workflow-statuses";
import { getPaymentDocumentMeta } from "@konfi/utils/getters";
import {
  getPaymentMethodColorPalette,
  getPaymentMethodLabel,
} from "@konfi/utils/payment-methods";
import {
  getEnabledPrintingMethodDefinitions,
  getPrintingMethodColorPalette,
  getPrintingMethodIcon,
  getPrintingMethodLabel,
} from "@konfi/utils/printing-methods";
import { rulesStateReducer } from "@konfi/utils/reducers";
import { safeLocalStorage } from "@konfi/utils/safe-local-storage";
import { isElectron } from "@konfi/utils/browser-platform";
import { isShippingWithCourier } from "@konfi/utils/validators";
import { useAuth } from "context/auth";
import { useChannels } from "context/channels";
import {
  useConfigurationMembers,
  useConfigurationSettings,
  useConfigurationWarehouses,
} from "context/configuration";
import {
  arrayUnion,
  FieldPath,
  getCountFromServer,
  onSnapshot,
  Timestamp,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getMetadata } from "firebase/storage";
import type { Route } from "next";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  startTransition,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useReactToPrint } from "react-to-print";
import useSWRImmutable from "swr/immutable";
import { getFakturowniaDocumentId } from "../../orders/[id]/get-fakturownia-document-id";

const VISIBLE_STATUSES_STORAGE_KEY = "homepageProductionOrders.visibleStatuses";
const PRINTING_METHODS_STORAGE_KEY = "homepageProductionOrders.printingMethods";
const GROUPING_MODE_STORAGE_KEY = "homepageProductionOrders.groupingMode";
const COLLAPSED_SECTIONS_STORAGE_KEY =
  "homepageProductionOrders.collapsedSections";
const LOCAL_FILTERS_STORAGE_KEY = "homepageProductionOrders.localFilters";
const SORT_STORAGE_KEY = "homepageProductionOrders.sort";
const PRODUCTION_GROUPING_HEADER_COLOR_PALETTES = [
  "blue",
  "green",
  "orange",
  "teal",
  "cyan",
  "purple",
  "pink",
  "yellow",
] as const;
const ORDER_PRINT_MIN_SETTLE_DELAY_MS = 600;
const ORDER_PRINT_ASSET_TIMEOUT_MS = 2500;
const ORDER_DIALOG_PREVIEW_PANEL_PROPS = {
  py: 0,
} as const;
const PRODUCTION_VIEW_SECTION_RADIUS = "3xl";
const PRODUCTION_VIEW_ROW_RADIUS = "2xl";
// Tracks must stay content-independent (fixed px or fr, never auto/min-content):
// the header row and each order row are separate grids sharing this template, and
// auto tracks would resolve to different widths per grid, breaking column alignment.
const PRODUCTION_VIEW_COLUMN_TEMPLATE =
  "minmax(190px,0.92fr) minmax(500px,3.55fr) minmax(188px,0.78fr) 82px";

const OrderForm = dynamic(() => import("@/components/orders/OrderForm"), {
  loading: () => <Skeleton h="60vh" rounded="3xl" w="full" />,
  ssr: false,
});
const StoreOrderUpdateForm = dynamic(
  () => import("@/components/orders/StoreOrderUpdateForm"),
  {
    loading: () => <Skeleton h="60vh" rounded="3xl" w="full" />,
    ssr: false,
  },
);
const TrackingForm = dynamic(() => import("@/components/orders/TrackingForm"), {
  loading: () => <Skeleton h="60vh" rounded="3xl" w="full" />,
  ssr: false,
});

type PendingStatusChange = {
  name: "status";
  order: Order;
  updatedBy?: NestedMember;
  value: OrderWorkflowStatusId;
};

type ProductionLocalFiltersStorage = {
  enabledPresetIndex: number | null;
  enabledPresetId?: string | null;
  endDate: string | null;
  presetEnabled: boolean;
  quickFilter: string | null;
  ruleValues: string[][];
  startDate: string | null;
};

type PreparedOrderPrintJob = {
  channel: Pick<Channel, "id" | "warehouses"> | null;
  data: PreparedOrderPrintData;
  mode: OrderPrintMode;
};

type DraggedItem = {
  itemId: string;
  order: Order;
};

type OptimisticOrderPatch = Partial<Order>;
type OptimisticOrderPatches = Record<string, OptimisticOrderPatch>;

type DateLike =
  | Date
  | {
      seconds?: number;
      toDate?: () => Date;
    }
  | null
  | undefined;

function getOrderStorageKey(order: Pick<Order, "channelId" | "id">) {
  return `${order.channelId}:${order.id}`;
}

function getCustomerLabel(order: Order) {
  return isNestedCustomer(order.customer)
    ? order.customer.name
    : order.customer;
}

function formatCompactDate(value: DateLike, locale: string) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : value.toDate?.();
  return date
    ? date.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
      })
    : "-";
}

function formatProductionNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

function getOrderDetailsHref(language: string | undefined, order: Order) {
  const lng = language || "pl";
  return `/${lng}/orders/${order.id}?channelId=${encodeURIComponent(
    order.channelId,
  )}`;
}

function shouldIgnoreRowClick(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(target.closest("[data-production-row-action]"))
    : false;
}

function stopProductionRowActionEvent(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

function orderHasUnresolvedProblem(order: Order) {
  return Boolean(order.problemItems?.some((problem) => !problem.resolved));
}

function countUnresolvedItemProblems(order: Order) {
  return order.problemItems?.filter((problem) => !problem.resolved).length ?? 0;
}

function isOrderOverdue(order: Pick<Order, "deadlineString">) {
  if (!order.deadlineString) {
    return false;
  }

  const deadlineMillis = new Date(order.deadlineString).getTime();
  return Number.isFinite(deadlineMillis) && deadlineMillis < Date.now();
}

interface ProductionSectionMetrics {
  itemCount: number;
  orderCount: number;
  overdueCount: number;
  problemCount: number;
  totalVolume: number;
}

function getProductionSectionMetrics(
  orders: Order[],
): ProductionSectionMetrics {
  return orders.reduce<ProductionSectionMetrics>(
    (metrics, order) => {
      metrics.orderCount += 1;
      metrics.itemCount += order.items.length;
      metrics.totalVolume += order.items.reduce(
        (sum, item) => sum + (getProductionOrderItemTotalVolume(item) ?? 0),
        0,
      );
      if (isOrderOverdue(order)) {
        metrics.overdueCount += 1;
      }
      if (orderHasUnresolvedProblem(order)) {
        metrics.problemCount += 1;
      }
      return metrics;
    },
    {
      itemCount: 0,
      orderCount: 0,
      overdueCount: 0,
      problemCount: 0,
      totalVolume: 0,
    },
  );
}

const PRODUCTION_PRINTING_METHOD_OTHER_KEY = "__other__";

interface ProductionPrintingMethodGroup {
  key: string;
  label: string;
  orders: Order[];
}

function groupOrdersByPrintingMethod(
  orders: Order[],
  availableMethodIds: PrintingMethodId[],
  methodLabels: Map<string, string>,
  otherLabel: string,
): ProductionPrintingMethodGroup[] {
  const groups = new Map<string, ProductionPrintingMethodGroup>();

  for (const order of orders) {
    const methodIds = getProductionOrderPrintingMethodIds(
      order,
      availableMethodIds,
    );
    const primaryMethodId =
      methodIds[0] ?? PRODUCTION_PRINTING_METHOD_OTHER_KEY;
    const existing = groups.get(primaryMethodId);

    if (existing) {
      existing.orders.push(order);
    } else {
      groups.set(primaryMethodId, {
        key: primaryMethodId,
        label:
          primaryMethodId === PRODUCTION_PRINTING_METHOD_OTHER_KEY
            ? otherLabel
            : (methodLabels.get(primaryMethodId) ?? primaryMethodId),
        orders: [order],
      });
    }
  }

  return Array.from(groups.values()).toSorted((left, right) => {
    if (left.key === PRODUCTION_PRINTING_METHOD_OTHER_KEY) {
      return 1;
    }
    if (right.key === PRODUCTION_PRINTING_METHOD_OTHER_KEY) {
      return -1;
    }
    return left.label.localeCompare(right.label);
  });
}

interface ProductionGroupingGroupedItem {
  classification: ProductionGroupingClassification;
  item: OrderItem;
  order: Order;
}

interface ProductionGroupingSourceItem {
  item: OrderItem;
  order: Order;
}

interface ProductionGroupingProcessingBatch {
  itemCount: number;
  orderCount: number;
}

type ProductionGroupingProcessingBatches = Record<
  string,
  ProductionGroupingProcessingBatch
>;

interface ProductionGroupingSecondaryGroup {
  itemCount: number;
  key: string;
  label: string;
  overdueOrderCount: number;
  problemItemCount: number;
  rows: ProductionGroupingGroupedItem[];
  totalProducedQuantity: number;
  totalVolume: number;
}

interface ProductionGroupingGroup extends ProductionGroupingSecondaryGroup {
  secondaryGroups: ProductionGroupingSecondaryGroup[];
}

type InternalProductionGroupingGroup = ProductionGroupingGroup & {
  secondaryGroupsByKey: Map<string, ProductionGroupingSecondaryGroup>;
};

function orderItemHasUnresolvedProblem(order: Order, itemId: string): boolean {
  return Boolean(
    order.problemItems?.some(
      (problem) => problem.itemId === itemId && !problem.resolved,
    ),
  );
}

function createEmptyProductionGroupingSecondaryGroup(
  key: string,
  label: string,
): ProductionGroupingSecondaryGroup {
  return {
    itemCount: 0,
    key,
    label,
    overdueOrderCount: 0,
    problemItemCount: 0,
    rows: [],
    totalProducedQuantity: 0,
    totalVolume: 0,
  };
}

function createEmptyProductionGroupingGroup(
  key: string,
  label: string,
): InternalProductionGroupingGroup {
  return {
    ...createEmptyProductionGroupingSecondaryGroup(key, label),
    secondaryGroups: [],
    secondaryGroupsByKey: new Map(),
  };
}

function addProductionGroupingMetrics(
  bucket: ProductionGroupingSecondaryGroup,
  item: OrderItem,
  order: Order,
) {
  bucket.itemCount += 1;
  bucket.totalProducedQuantity += getProductionOrderItemDisplayQuantity(item);
  bucket.totalVolume += getProductionOrderItemTotalVolume(item) ?? 0;
  if (isOrderOverdue(order)) {
    bucket.overdueOrderCount += 1;
  }
  if (orderItemHasUnresolvedProblem(order, item.id)) {
    bucket.problemItemCount += 1;
  }
}

function sortProductionGroupingBuckets<
  T extends Pick<ProductionGroupingSecondaryGroup, "key" | "label">,
>(buckets: T[]): T[] {
  return buckets.toSorted((left, right) => {
    if (left.key === PRODUCTION_GROUPING_UNCLASSIFIED_KEY) {
      return 1;
    }
    if (right.key === PRODUCTION_GROUPING_UNCLASSIFIED_KEY) {
      return -1;
    }

    return left.label.localeCompare(right.label);
  });
}

function getProductionGroupingHeaderColorPalette(groupKey: string) {
  if (groupKey === PRODUCTION_GROUPING_UNCLASSIFIED_KEY) {
    return "gray";
  }

  let hash = 0;
  for (const character of groupKey) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return PRODUCTION_GROUPING_HEADER_COLOR_PALETTES[
    hash % PRODUCTION_GROUPING_HEADER_COLOR_PALETTES.length
  ];
}

function createProductionGroupingGroups(
  items: ProductionGroupingSourceItem[],
  classifications: ProductionGroupingClassificationCacheResult,
  profile: ProductionGroupingProfile,
  unclassifiedLabel: string,
  unclassifiedSecondaryLabel: string,
): ProductionGroupingGroup[] {
  const groups = new Map<string, InternalProductionGroupingGroup>();

  for (const { item, order } of items) {
    const [serializableItem] = toSerializableProductionGroupingItems([item]);

    if (!serializableItem) {
      continue;
    }

    const cacheKey = getProductionGroupingCacheKey(order.id, item.id);
    const classification = resolveProductionGroupingClassification(
      serializableItem,
      profile,
      classifications[cacheKey],
    );
    const groupKey = classification.primary.groupKey;
    const existing = groups.get(groupKey);
    const group =
      existing ??
      createEmptyProductionGroupingGroup(
        groupKey,
        groupKey === PRODUCTION_GROUPING_UNCLASSIFIED_KEY
          ? unclassifiedLabel
          : classification.primary.label,
      );

    addProductionGroupingMetrics(group, item, order);
    group.rows.push({
      classification,
      item,
      order,
    });

    if (profile.secondaryAxis) {
      const secondaryKey =
        classification.secondary?.groupKey ??
        `${groupKey}:${PRODUCTION_GROUPING_UNCLASSIFIED_KEY}`;
      const secondaryLabel =
        classification.secondary?.label ?? unclassifiedSecondaryLabel;
      const existingSecondary = group.secondaryGroupsByKey.get(secondaryKey);
      const secondaryGroup =
        existingSecondary ??
        createEmptyProductionGroupingSecondaryGroup(
          secondaryKey,
          secondaryLabel,
        );

      addProductionGroupingMetrics(secondaryGroup, item, order);
      secondaryGroup.rows.push({
        classification,
        item,
        order,
      });

      if (!existingSecondary) {
        group.secondaryGroupsByKey.set(secondaryKey, secondaryGroup);
      }
    }

    if (!existing) {
      groups.set(groupKey, group);
    }
  }

  return sortProductionGroupingBuckets(
    Array.from(groups.values()).map((group) => {
      const { secondaryGroupsByKey: _secondaryGroupsByKey, ...publicGroup } =
        group;

      return {
        ...publicGroup,
        secondaryGroups: sortProductionGroupingBuckets(
          Array.from(group.secondaryGroupsByKey.values()),
        ),
      };
    }),
  );
}

function fileStatusConstraint(fileStatusIds: readonly OrderFileStatusId[]) {
  if (fileStatusIds.length === 1) {
    return where("filesStatus", "==", fileStatusIds[0]);
  }

  return where("filesStatus", "in", fileStatusIds);
}

function buildSectionConstraints(
  tenantContext: ReturnType<typeof useTenantContext>,
  spec: ProductionSectionQuerySpec,
  fileStatusIds: readonly OrderFileStatusId[],
  extraConstraints: readonly QueryConstraint[],
) {
  return tenant.queryConstraints(tenantContext, [
    where("active", "==", true),
    where("status", "==", spec.statusId),
    fileStatusConstraint(fileStatusIds),
    ...extraConstraints,
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      image.removeEventListener("load", cleanup);
      image.removeEventListener("error", cleanup);
      resolve();
    };

    image.addEventListener("load", cleanup, {
      once: true,
    });
    image.addEventListener("error", cleanup, {
      once: true,
    });
  });
}

async function decodeLoadedImage(image: HTMLImageElement): Promise<void> {
  if (!image.complete || typeof image.decode !== "function") {
    return;
  }

  try {
    await image.decode();
  } catch {
    // Printing can continue even when the browser refuses to decode a loaded image.
  }
}

async function waitForOrderPrintAssets(root: HTMLElement | null) {
  await delay(ORDER_PRINT_MIN_SETTLE_DELAY_MS);

  if (!root) {
    return;
  }

  const imagePromises = Array.from(root.querySelectorAll("img")).map(
    async (image) => {
      await waitForImageLoad(image);
      await decodeLoadedImage(image);
    },
  );
  const fontPromise =
    document.fonts?.ready.then(() => undefined) ?? Promise.resolve();

  await Promise.race([
    Promise.allSettled([...imagePromises, fontPromise]),
    delay(ORDER_PRINT_ASSET_TIMEOUT_MS),
  ]);
}

async function fetchOrderPrintAttachments(
  tenantContext: ReturnType<typeof useTenantContext>,
  channelId: string,
  orderId: string,
  customerId: string,
): Promise<ListResults[]> {
  const data = await listStorage(
    `${tenantStoragePaths.orderAttachmentFolder(
      tenantContext,
      channelId,
      customerId,
      orderId,
    )}/`,
  );

  if (!data) {
    return [];
  }

  return Promise.all(
    data.map(async (result) => {
      const metadata = await getMetadata(result);
      return {
        metadata,
        storageReference: result,
      };
    }),
  );
}

function isOrderPrintInvoice(value: unknown): value is OrderPrintInvoice {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const viewUrl = record.viewUrl;
  const kind = record.kind;

  return (
    (viewUrl === undefined || typeof viewUrl === "string") &&
    (kind === undefined || typeof kind === "string" || kind === null)
  );
}

function createSectionGroupLabel(group: ProductionOrderGroup) {
  return group === "ready"
    ? {
        icon: "manufacturing",
        key: "ready",
      }
    : {
        icon: "upload_file",
        key: "pendingFiles",
      };
}

function getProductionGroupingModeIcon(mode: ProductionGroupingMode) {
  switch (mode) {
    case "printType":
      return "category";
    case "material":
      return "layers";
    case "flat":
    default:
      return "view_list";
  }
}

function getProductionGroupingModeDefaultLabel(mode: ProductionGroupingMode) {
  switch (mode) {
    case "printType":
      return "Print Type";
    case "material":
      return "Material";
    case "flat":
    default:
      return "Flat";
  }
}

function getDefaultCollapsedSectionKeys(
  visibleStatusIds: readonly OrderWorkflowStatusId[],
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
) {
  const specs = getProductionSectionQuerySpecs(visibleStatusIds, settings);
  const initiallyExpandedSectionKeys = new Set<ProductionSectionKey>();

  for (const group of PRODUCTION_ORDER_GROUPS) {
    const firstGroupSection = specs.find((spec) => spec.group === group);

    if (firstGroupSection) {
      initiallyExpandedSectionKeys.add(firstGroupSection.key);
    }
  }

  return specs
    .filter((spec) => !initiallyExpandedSectionKeys.has(spec.key))
    .map((spec) => spec.key);
}

function getInitialCollapsedSectionKeys(
  visibleStatusIds: readonly OrderWorkflowStatusId[],
  settings?: Partial<OrderWorkflowStatusesSettings> | null,
) {
  const storedSectionKeys = safeLocalStorage.getJSON<ProductionSectionKey[]>(
    COLLAPSED_SECTIONS_STORAGE_KEY,
    null,
  );

  return (
    storedSectionKeys ??
    getDefaultCollapsedSectionKeys(visibleStatusIds, settings)
  );
}

const PRODUCTION_SORT_KEYS: ProductionOrdersSortKey[] = [
  "createdAt",
  "deadline",
  "number",
  "totalPrice",
];
const PRODUCTION_SORT_DIRECTIONS: ProductionOrdersSort["direction"][] = [
  "asc",
  "desc",
];
const DEFAULT_PRODUCTION_SORT: ProductionOrdersSort = {
  direction: "asc",
  key: "deadline",
};

function getInitialProductionSort(): ProductionOrdersSort {
  const stored = safeLocalStorage.getJSON<unknown>(SORT_STORAGE_KEY, null);

  if (
    stored !== null &&
    typeof stored === "object" &&
    !Array.isArray(stored) &&
    "key" in stored &&
    "direction" in stored &&
    PRODUCTION_SORT_KEYS.includes(stored.key as ProductionOrdersSortKey) &&
    PRODUCTION_SORT_DIRECTIONS.includes(
      stored.direction as ProductionOrdersSort["direction"],
    )
  ) {
    return {
      direction: stored.direction as ProductionOrdersSort["direction"],
      key: stored.key as ProductionOrdersSortKey,
    };
  }

  return DEFAULT_PRODUCTION_SORT;
}

function normalizeProductionPrintingMethodIds(
  requestedMethodIds: readonly string[] | null | undefined,
  activeMethodIds: readonly PrintingMethodId[],
): PrintingMethodId[] {
  if (activeMethodIds.length === 0) {
    return [];
  }

  if (!requestedMethodIds || requestedMethodIds.length === 0) {
    return [...activeMethodIds];
  }

  const activeMethodSet = new Set(activeMethodIds);
  const normalizedMethodIds = activeMethodIds.filter((methodId) =>
    requestedMethodIds.includes(methodId),
  );

  if (
    normalizedMethodIds.length === 0 ||
    normalizedMethodIds.length === activeMethodSet.size
  ) {
    return [...activeMethodIds];
  }

  return normalizedMethodIds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeProductionDateFilter(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function normalizeProductionRuleValues(
  values: unknown,
  rules: readonly Rule[],
): string[][] {
  const rawValues = Array.isArray(values) ? values : [];

  return rules.map((rule, index) => {
    const allowedValues = new Set(
      rule.options?.map((option) => option.value) ?? [],
    );
    const ruleValues = rawValues[index];

    if (!Array.isArray(ruleValues) || allowedValues.size === 0) {
      return [];
    }

    return ruleValues
      .filter(
        (value): value is string =>
          typeof value === "string" && allowedValues.has(value),
      )
      .slice(0, 3);
  });
}

function getProductionRuleQueryValue(value: string): string | boolean {
  if (value === "false") {
    return false;
  }

  if (value === "true") {
    return true;
  }

  return value;
}

function buildProductionRulesQueries(
  rules: readonly Rule[],
  values: readonly string[][],
): QueryConstraint[][] {
  return rules.map((rule, index) => {
    const ruleValues = values[index] ?? [];

    if (ruleValues.length === 0) {
      return [];
    }

    if (rule.opStr === "in") {
      return [
        where(
          rule.fieldPath,
          "in",
          ruleValues.map(getProductionRuleQueryValue),
        ),
      ];
    }

    if (rule.opStr === "==") {
      return ruleValues.map((value) =>
        where(rule.fieldPath, "==", getProductionRuleQueryValue(value)),
      );
    }

    return [];
  });
}

function getStoredProductionLocalFilters(): ProductionLocalFiltersStorage {
  const storedFilters = safeLocalStorage.getJSON<unknown>(
    LOCAL_FILTERS_STORAGE_KEY,
    null,
  );

  if (!isRecord(storedFilters)) {
    return {
      enabledPresetIndex: null,
      enabledPresetId: null,
      endDate: null,
      presetEnabled: false,
      quickFilter: null,
      ruleValues: [],
      startDate: null,
    };
  }

  const enabledPresetIndex = storedFilters.enabledPresetIndex;
  const enabledPresetId = storedFilters.enabledPresetId;
  const quickFilter = storedFilters.quickFilter;
  const ruleValues = storedFilters.ruleValues;

  return {
    enabledPresetIndex:
      typeof enabledPresetIndex === "number" &&
      Number.isInteger(enabledPresetIndex) &&
      enabledPresetIndex >= 0
        ? enabledPresetIndex
        : null,
    enabledPresetId:
      typeof enabledPresetId === "string" && enabledPresetId.trim().length > 0
        ? enabledPresetId.trim()
        : null,
    endDate: normalizeProductionDateFilter(storedFilters.endDate),
    presetEnabled: storedFilters.presetEnabled === true,
    quickFilter:
      typeof quickFilter === "string" && quickFilter.trim().length > 0
        ? quickFilter.trim()
        : null,
    ruleValues: Array.isArray(ruleValues)
      ? ruleValues
          .filter(Array.isArray)
          .map((values) =>
            values.filter(
              (value): value is string => typeof value === "string",
            ),
          )
      : [],
    startDate: normalizeProductionDateFilter(storedFilters.startDate),
  };
}

function createStoredProductionLocalFilters(
  rulesState: RulesState,
  quickFilter: string | null,
  startDate?: string,
  endDate?: string,
): ProductionLocalFiltersStorage {
  return {
    enabledPresetIndex: rulesState.enabledPresetIndex,
    enabledPresetId: rulesState.enabledPresetId ?? null,
    endDate: endDate ?? null,
    presetEnabled: rulesState.presetEnabled,
    quickFilter:
      quickFilter && quickFilter.trim().length > 0 ? quickFilter.trim() : null,
    ruleValues: rulesState.values,
    startDate: startDate ?? null,
  };
}

function ProductionOrdersView() {
  const { t, i18n } = useT(["orders", "order", "translation", "allegro"]);
  const activeLocale = i18n.resolvedLanguage ?? i18n.language;
  const router = useRouter();
  const pathname = usePathname();
  const { data: configFlags } = useSWRImmutable("admin-config-flags", () =>
    getAdminConfigFlags(),
  );
  const hasFakturowniaKey = configFlags?.fakturowniaApiKeyProvided === true;
  const hasPolkurierKey = configFlags?.polkurierApiKeyProvided === true;
  const { channel, channels } = useChannels();
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const { filteredMembers } = useConfigurationMembers();
  const {
    orderWorkflowStatusesSettings,
    orderRulePresetsSettings,
    paymentMethodsSettings,
    printingMethodsSettings,
    productionGroupingSettings,
    shippingMethodsSettings,
  } = useConfigurationSettings();
  const { warehouses } = useConfigurationWarehouses();
  const getWarehouseName = useCallback(
    (warehouseId: string) =>
      warehouses?.find((warehouse) => warehouse.id === warehouseId)?.name ??
      warehouseId,
    [warehouses],
  );
  const { getFolderPath } = useOrderFolderSettings();
  const {
    deactivateOrder,
    updateItemFulfillment,
    updateItemInProgress,
    updateItemPriority,
    updateItemProblem,
  } = useProductionOrderActions({ fallbackChannelId: channel?.id });
  const [itemProblemTarget, setItemProblemTarget] = useState<{
    item: OrderItem;
    order: Order;
  } | null>(null);
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [groupingMode, setGroupingMode] = useState<ProductionGroupingMode>(() =>
    normalizeProductionGroupingMode(
      safeLocalStorage.getJSON<string>(GROUPING_MODE_STORAGE_KEY, null),
    ),
  );
  const groupByPrintingMethod = groupingMode === "printType";
  const groupByProductionGrouping = groupingMode === "material";
  const [quickFilter, setQuickFilter] = useState<string | null>(
    () => getStoredProductionLocalFilters().quickFilter,
  );
  const [queryConstraints, setQueryConstraints] = useState<QueryConstraint[]>(
    [],
  );
  const [rulesState, dispatchRulesState] = useReducer(rulesStateReducer, {
    enabledPresetIndex: null,
    enabledPresetId: null,
    presetEnabled: false,
    rulesQueries: [],
    values: [],
  });
  const [startDate, setStartDate] = useState<string | undefined>(
    () => getStoredProductionLocalFilters().startDate ?? undefined,
  );
  const [endDate, setEndDate] = useState<string | undefined>(
    () => getStoredProductionLocalFilters().endDate ?? undefined,
  );
  const [visibleStatusIds, setVisibleStatusIds] = useState<
    OrderWorkflowStatusId[]
  >(() =>
    normalizeProductionVisibleStatusIds(
      safeLocalStorage.getJSON<string[]>(VISIBLE_STATUSES_STORAGE_KEY, null),
      orderWorkflowStatusesSettings,
    ),
  );
  const [selectedPrintingMethodIds, setSelectedPrintingMethodIds] = useState<
    PrintingMethodId[]
  >(() =>
    normalizeProductionPrintingMethodIds(
      safeLocalStorage.getJSON<string[]>(PRINTING_METHODS_STORAGE_KEY, null),
      getEnabledPrintingMethodDefinitions(printingMethodsSettings).map(
        (method) => method.id,
      ),
    ),
  );
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<
    ProductionSectionKey[]
  >(() =>
    getInitialCollapsedSectionKeys(
      visibleStatusIds,
      orderWorkflowStatusesSettings,
    ),
  );
  const [sortPreference, setSortPreference] = useState<ProductionOrdersSort>(
    () => getInitialProductionSort(),
  );
  const [optimisticPatches, setOptimisticPatches] =
    useState<OptimisticOrderPatches>({});
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedOrders, setSelectedOrders] = useState<Map<string, Order>>(
    () => new Map(),
  );

  const toggleOrderSelected = useCallback(
    (order: Order, selected?: boolean) => {
      const key = getOrderStorageKey(order);
      setSelectedOrders((current) => {
        const next = new Map(current);
        const nextSelected = selected ?? !next.has(key);

        if (nextSelected) {
          next.set(key, order);
        } else {
          next.delete(key);
        }

        return next;
      });
    },
    [],
  );

  const setOrdersSelected = useCallback(
    (orders: Order[], selected: boolean) => {
      setSelectedOrders((current) => {
        const next = new Map(current);
        for (const order of orders) {
          const key = getOrderStorageKey(order);
          if (selected) {
            next.set(key, order);
          } else {
            next.delete(key);
          }
        }
        return next;
      });
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelectedOrders(new Map());
  }, []);

  // Clear selection when the channel changes
  useEffect(() => {
    clearSelection();
  }, [channel?.id, clearSelection]);

  useEffect(() => {
    safeLocalStorage.setJSON(GROUPING_MODE_STORAGE_KEY, groupingMode);
  }, [groupingMode]);

  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [dialogOrder, setDialogOrder] = useState<Order | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showAttachmentsForm, setShowAttachmentsForm] = useState(false);
  const [showPaymentDocumentForm, setShowPaymentDocumentForm] = useState(false);
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [showNoteCreateForm, setShowNoteCreateForm] = useState(false);
  const [pendingStatusConfirmation, setPendingStatusConfirmation] = useState<
    | (PendingStatusChange & {
        kind: "status-email" | "incomplete-order";
      })
    | null
  >(null);
  const [pendingStatusActorSelection, setPendingStatusActorSelection] =
    useState<PendingStatusChange | null>(null);
  const orderPrintRef = useRef<HTMLDivElement>(null);
  const activeOrderPrintRef = useRef<PreparedOrderPrintJob | null>(null);
  const orderPrintBusyRef = useRef(false);
  const orderPrintAttemptKeyRef = useRef<string | null>(null);
  const previousDocumentTitleRef = useRef<string | null>(null);
  const [preparedOrderPrint, setPreparedOrderPrint] =
    useState<PreparedOrderPrintJob | null>(null);
  const [isPreparingOrderPrint, setIsPreparingOrderPrint] = useState(false);
  const isElectronRuntime = isElectron();

  const resetTransientOrderModals = useCallback(() => {
    setShowUpdateForm(false);
    setShowDuplicateForm(false);
    setCurrentOrder(null);
  }, []);

  useLayoutEffect(() => {
    if (!pathname) {
      return;
    }

    return () => resetTransientOrderModals();
  }, [pathname, resetTransientOrderModals]);

  const orderStatusDefinitions = useMemo(
    () =>
      getEnabledOrderWorkflowStatusDefinitions(orderWorkflowStatusesSettings),
    [orderWorkflowStatusesSettings],
  );
  const productionStatusDefinitions = useMemo(
    () => orderStatusDefinitions.filter(isProductionWorkflowStatus),
    [orderStatusDefinitions],
  );
  const fileStatusDefinitions = useMemo(
    () => getEnabledOrderFileStatusDefinitions(orderWorkflowStatusesSettings),
    [orderWorkflowStatusesSettings],
  );
  const printingMethodDefinitions = useMemo(
    () => getEnabledPrintingMethodDefinitions(printingMethodsSettings),
    [printingMethodsSettings],
  );
  const activePrintingMethodIds = useMemo(
    () => printingMethodDefinitions.map((method) => method.id),
    [printingMethodDefinitions],
  );
  const printingMethodRulePresets = useMemo(
    () =>
      getEnabledOrderRulePresetDefinitions(
        orderRulePresetsSettings,
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
      ).filter((preset) => preset.printingMethodIds.length > 0),
    [
      orderRulePresetsSettings,
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
    ],
  );
  const orderStatusOptions = useMemo<SelectOption[]>(
    () =>
      orderStatusDefinitions.map((status) => ({
        color: getOrderWorkflowStatusColorPalette(
          status.id,
          orderWorkflowStatusesSettings,
        ),
        label: getOrderWorkflowStatusLabel(
          status.id,
          orderWorkflowStatusesSettings,
          t,
          activeLocale,
        ),
        value: status.id,
      })),
    [activeLocale, orderStatusDefinitions, orderWorkflowStatusesSettings, t],
  );
  const fileStatusOptions = useMemo<SelectOption[]>(
    () =>
      fileStatusDefinitions.map((status) => ({
        color: getOrderFileStatusColorPalette(
          status.id,
          orderWorkflowStatusesSettings,
        ),
        label: getOrderFileStatusLabel(
          status.id,
          orderWorkflowStatusesSettings,
          t,
          activeLocale,
        ),
        value: status.id,
      })),
    [activeLocale, fileStatusDefinitions, orderWorkflowStatusesSettings, t],
  );
  const paymentStatusOptions = useMemo<SelectOption[]>(
    () =>
      PaymentStatusAsOptions.map((paymentStatus) => ({
        label: t(`PaymentStatus.${paymentStatus.label}`, {
          defaultValue: paymentStatus.label,
        }),
        value: paymentStatus.value,
      })),
    [t],
  );
  const paymentTypeOptions = useMemo<SelectOption[]>(
    () =>
      paymentMethodsSettings.methods
        .filter((method) => method.enabled && !method.archived)
        .map((method) => ({
          color: getPaymentMethodColorPalette(
            method.id,
            paymentMethodsSettings,
          ),
          label: getPaymentMethodLabel(
            method.id,
            paymentMethodsSettings,
            t,
            activeLocale,
          ),
          value: method.id,
        })),
    [activeLocale, paymentMethodsSettings, t],
  );
  const membersOptions = useMemo<SelectOption[]>(
    () =>
      filteredMembers?.map((member) => ({
        label: member.name,
        value: member.id,
      })) ?? [],
    [filteredMembers],
  );
  const warehouseOptions = useMemo<SelectOption[]>(
    () =>
      warehouses?.map((warehouse) => ({
        label: warehouse.name,
        value: warehouse.address?.street ?? "",
      })) ?? [],
    [warehouses],
  );
  const printingMethodOptions = useMemo<SelectOption[]>(
    () =>
      printingMethodDefinitions.map((method) => ({
        color: getPrintingMethodColorPalette(
          method.id,
          printingMethodsSettings,
        ),
        label: getPrintingMethodLabel(
          method.id,
          printingMethodsSettings,
          t,
          activeLocale,
        ),
        object: {
          icon: getPrintingMethodIcon(method.id, printingMethodsSettings),
        },
        value: method.id,
      })),
    [activeLocale, printingMethodDefinitions, printingMethodsSettings, t],
  );
  const printingMethodLabelMap = useMemo(
    () =>
      new Map(
        printingMethodOptions.map((option) => [option.value, option.label]),
      ),
    [printingMethodOptions],
  );

  const sectionSpecs = useMemo(
    () =>
      getProductionSectionQuerySpecs(
        visibleStatusIds,
        orderWorkflowStatusesSettings,
      ),
    [orderWorkflowStatusesSettings, visibleStatusIds],
  );
  const specsByGroup = useMemo(() => {
    const nextSpecsByGroup: Record<
      ProductionOrderGroup,
      ProductionSectionQuerySpec[]
    > = {
      pendingFiles: [],
      ready: [],
    };

    for (const spec of sectionSpecs) {
      nextSpecsByGroup[spec.group].push(spec);
    }

    return nextSpecsByGroup;
  }, [sectionSpecs]);
  const extraVisibleStatusKey = useMemo(() => {
    const productionIds = new Set(
      productionStatusDefinitions.map((status) => status.id),
    );
    return visibleStatusIds
      .filter((id) => !productionIds.has(id))
      .toSorted()
      .join("|");
  }, [productionStatusDefinitions, visibleStatusIds]);
  const allSectionSpecs = useMemo(() => {
    const extraVisibleIds = extraVisibleStatusKey
      .split("|")
      .filter(Boolean) as OrderWorkflowStatusId[];
    const unionIds = [
      ...productionStatusDefinitions.map((status) => status.id),
      ...extraVisibleIds,
    ];
    return getProductionSectionQuerySpecs(
      unionIds,
      orderWorkflowStatusesSettings,
    );
  }, [
    extraVisibleStatusKey,
    orderWorkflowStatusesSettings,
    productionStatusDefinitions,
  ]);
  const [sectionCounts, setSectionCounts] = useState<
    Record<ProductionSectionKey, number | null>
  >({} as Record<ProductionSectionKey, number | null>);
  const rulePresets = useMemo<RulePreset[]>(
    () =>
      compileOrderRulePresets(
        orderRulePresetsSettings,
        orderWorkflowStatusesSettings,
        printingMethodsSettings,
        { locale: activeLocale, t },
      ),
    [
      activeLocale,
      orderRulePresetsSettings,
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
      t,
    ],
  );
  // The active preset (if any) is used by the section planner to budget Firestore
  // disjunctions without re-emitting a status-in clause (sections already pin status).
  const activePreset = useMemo<RulePreset | undefined>(() => {
    if (!rulesState.presetEnabled) {
      return undefined;
    }

    if (rulesState.enabledPresetId != null) {
      return rulePresets.find((p) => p.id === rulesState.enabledPresetId);
    }

    if (rulesState.enabledPresetIndex != null) {
      return rulePresets[rulesState.enabledPresetIndex];
    }

    return undefined;
  }, [
    rulePresets,
    rulesState.enabledPresetId,
    rulesState.enabledPresetIndex,
    rulesState.presetEnabled,
  ]);

  const collapsedSectionSet = useMemo(
    () => new Set(collapsedSectionKeys),
    [collapsedSectionKeys],
  );

  useEffect(() => {
    setSectionCounts(
      Object.fromEntries(
        allSectionSpecs.map((spec) => [spec.key, null]),
      ) as Record<ProductionSectionKey, number | null>,
    );
  }, [
    activePreset,
    allSectionSpecs,
    channel?.id,
    endDate,
    queryConstraints,
    refreshKey,
    startDate,
    tenantContext,
  ]);

  useEffect(() => {
    const channelId = channel?.id;

    if (!channelId) {
      return;
    }

    let cancelled = false;

    for (const spec of allSectionSpecs) {
      const plan: SectionPresetPlan = planSectionPresetConstraints(
        spec,
        activePreset,
      );

      if (plan.skipSection) {
        setSectionCounts((current) => ({
          ...current,
          [spec.key]: 0,
        }));
        continue;
      }

      const chunks = plan.fileStatusChunks;
      // Non-preset constraints (user-defined rules) still apply when no preset is active.
      const sectionExtraConstraints = activePreset
        ? plan.extraConstraints
        : queryConstraints;

      if (chunks.length === 0) {
        setSectionCounts((current) => ({
          ...current,
          [spec.key]: 0,
        }));
        continue;
      }

      void Promise.all(
        chunks.map(async (chunk) => {
          const countQuery = db.query<Order>(
            firestore,
            `/channels/${channelId}/orders`,
            999999,
            undefined,
            buildSectionConstraints(
              tenantContext,
              spec,
              chunk,
              sectionExtraConstraints,
            ),
            startDate,
            endDate,
          );
          const snapshot = await getCountFromServer(countQuery);
          return snapshot.data().count;
        }),
      )
        .then((counts) => {
          if (cancelled) {
            return;
          }

          setSectionCounts((current) => ({
            ...current,
            [spec.key]: counts.reduce((sum, n) => sum + n, 0),
          }));
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          console.error("Failed to load production section count", {
            error,
            section: spec.key,
          });
          setSectionCounts((current) => ({
            ...current,
            [spec.key]: 0,
          }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    activePreset,
    channel?.id,
    endDate,
    allSectionSpecs,
    queryConstraints,
    refreshKey,
    startDate,
    tenantContext,
  ]);

  const visibleStatusSet = useMemo(
    () => new Set(visibleStatusIds),
    [visibleStatusIds],
  );
  const selectedPrintingMethodSet = useMemo(
    () => new Set(selectedPrintingMethodIds),
    [selectedPrintingMethodIds],
  );
  const visibleStatusOptionCount = useMemo(
    () =>
      orderStatusOptions.filter((option) => visibleStatusSet.has(option.value))
        .length,
    [orderStatusOptions, visibleStatusSet],
  );
  const allPrintingMethodsSelected =
    selectedPrintingMethodIds.length === 0 ||
    selectedPrintingMethodIds.length >= activePrintingMethodIds.length;
  const allVisibleStatusesSelected =
    orderStatusOptions.length === 0 ||
    visibleStatusOptionCount >= orderStatusOptions.length;
  const statusSummaryAggregates = useMemo((): Array<{
    count: number | null;
    statusId: string;
  }> => {
    return productionStatusDefinitions.map((status) => {
      const statusId = status.id;
      const specsForStatus = allSectionSpecs.filter(
        (spec) => spec.statusId === statusId,
      );
      if (specsForStatus.length === 0) {
        return { count: 0, statusId };
      }

      const counts = specsForStatus.map(
        (spec) => sectionCounts[spec.key] ?? null,
      );
      const hasUnknownCount = counts.some((c) => c === null);

      if (hasUnknownCount) {
        return { count: null, statusId };
      }

      const total = counts.reduce<number>((sum, c) => sum + (c ?? 0), 0);
      return { count: total, statusId };
    });
  }, [allSectionSpecs, productionStatusDefinitions, sectionCounts]);
  const selectedPrintingMethodLabel = useMemo(() => {
    if (allPrintingMethodsSelected || selectedPrintingMethodIds.length === 0) {
      return t("orders.productionView.printingMethods.all", {
        defaultValue: "All print types",
      });
    }

    if (selectedPrintingMethodIds.length === 1) {
      const selectedMethodId = selectedPrintingMethodIds[0];
      const selectedOption = printingMethodOptions.find(
        (option) => option.value === selectedMethodId,
      );

      return selectedOption?.label ?? selectedMethodId;
    }

    return t("orders.productionView.printingMethods.selectedCount", {
      count: selectedPrintingMethodIds.length,
      defaultValue: "{{count}} print types",
    });
  }, [
    allPrintingMethodsSelected,
    printingMethodOptions,
    selectedPrintingMethodIds,
    t,
  ]);
  const blockedOnlyLabel = t("orders.productionView.blockedOnly", {
    defaultValue: "Blocked only",
  });
  const visibleStatusesLabel = t("orders.productionView.visibleStatuses", {
    defaultValue: "Visible statuses",
  });
  const groupingViewLabel = t("orders.productionView.view", {
    defaultValue: "View",
  });
  const productionGroupingModeOptions = useMemo(
    () =>
      PRODUCTION_GROUPING_MODES.map((mode) => ({
        icon: getProductionGroupingModeIcon(mode),
        label:
          mode === "material"
            ? productionGroupingSettings.profile.primaryAxis.label
            : t(`orders.productionView.grouping.${mode}`, {
                defaultValue: getProductionGroupingModeDefaultLabel(mode),
              }),
        mode,
      })),
    [productionGroupingSettings.profile.primaryAxis.label, t],
  );
  const resolvedLanguage = i18n.resolvedLanguage;

  useEffect(() => {
    setVisibleStatusIds((current) =>
      normalizeProductionVisibleStatusIds(
        current,
        orderWorkflowStatusesSettings,
      ),
    );
  }, [orderWorkflowStatusesSettings]);

  useEffect(() => {
    safeLocalStorage.setJSON(VISIBLE_STATUSES_STORAGE_KEY, visibleStatusIds);
  }, [visibleStatusIds]);

  useEffect(() => {
    setSelectedPrintingMethodIds((current) =>
      normalizeProductionPrintingMethodIds(current, activePrintingMethodIds),
    );
  }, [activePrintingMethodIds]);

  useEffect(() => {
    safeLocalStorage.setJSON(
      PRINTING_METHODS_STORAGE_KEY,
      selectedPrintingMethodIds,
    );
  }, [selectedPrintingMethodIds]);

  useEffect(() => {
    safeLocalStorage.setJSON(
      COLLAPSED_SECTIONS_STORAGE_KEY,
      collapsedSectionKeys,
    );
  }, [collapsedSectionKeys]);

  useEffect(() => {
    safeLocalStorage.setJSON(SORT_STORAGE_KEY, sortPreference);
  }, [sortPreference]);

  const rules: Rule[] = useMemo(
    () => [
      {
        fieldPath: new FieldPath("paymentStatus"),
        label: t("orders.productionView.filters.paymentStatus", {
          defaultValue: "Payment status",
        }),
        opStr: "in",
        options: paymentStatusOptions,
      },
      {
        fieldPath: new FieldPath("paymentType"),
        label: t("orders.productionView.filters.paymentType", {
          defaultValue: "Payment type",
        }),
        opStr: "in",
        options: paymentTypeOptions,
      },
      {
        fieldPath: new FieldPath("paymentDocumentId"),
        label: t("orders.productionView.filters.noPaymentDocument", {
          defaultValue: "Without payment document",
        }),
        opStr: "==",
        options: [
          {
            label: t("orders.productionView.filters.noPaymentDocument", {
              defaultValue: "Without payment document",
            }),
            value: "",
          },
        ],
      },
      {
        fieldPath: new FieldPath("createdBy", "id"),
        label: t("orders.productionView.filters.createdBy", {
          defaultValue: "Created by",
        }),
        opStr: "in",
        options: membersOptions,
      },
      {
        fieldPath: new FieldPath("shipping", "street"),
        label: t("orders.productionView.filters.pickupAt", {
          defaultValue: "Pickup at",
        }),
        opStr: "in",
        options: warehouseOptions,
      },
    ],
    [
      membersOptions,
      paymentStatusOptions,
      paymentTypeOptions,
      t,
      warehouseOptions,
    ],
  );
  useEffect(() => {
    if (rulesState.rulesQueries.length > 0) {
      return;
    }

    const storedFilters = getStoredProductionLocalFilters();
    const values = normalizeProductionRuleValues(
      storedFilters.ruleValues,
      rules,
    );
    const rulesQueries = buildProductionRulesQueries(rules, values);
    const storedPreset =
      storedFilters.enabledPresetId !== null
        ? rulePresets.find(
            (preset) => preset.id === storedFilters.enabledPresetId,
          )
        : storedFilters.enabledPresetIndex !== null
          ? rulePresets[storedFilters.enabledPresetIndex]
          : undefined;
    const hasStoredPreset =
      storedFilters.presetEnabled && Boolean(storedPreset);
    const initialRulesQueries =
      hasStoredPreset && storedPreset
        ? storedPreset.values.map((value) => [value])
        : rulesQueries;

    setQueryConstraints(initialRulesQueries.flat());
    dispatchRulesState({
      enabledPresetIndex: hasStoredPreset
        ? storedFilters.enabledPresetIndex
        : null,
      enabledPresetId: hasStoredPreset ? storedFilters.enabledPresetId : null,
      presetEnabled: hasStoredPreset,
      rulesQueries: initialRulesQueries,
      type: "INIT",
      values,
    });
  }, [rulePresets, rules, rulesState.rulesQueries.length]);

  useEffect(() => {
    if (rules.length === 0 || rulesState.values.length !== rules.length) {
      return;
    }

    safeLocalStorage.setJSON(
      LOCAL_FILTERS_STORAGE_KEY,
      createStoredProductionLocalFilters(
        rulesState,
        quickFilter,
        startDate,
        endDate,
      ),
    );
  }, [
    endDate,
    quickFilter,
    rules.length,
    rulesState,
    rulesState.values.length,
    startDate,
  ]);

  const refreshCounts = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const patchOrderLocally = useCallback(
    (order: Pick<Order, "channelId" | "id">, patch: OptimisticOrderPatch) => {
      setOptimisticPatches((current) => ({
        ...current,
        [getOrderStorageKey(order)]: {
          ...current[getOrderStorageKey(order)],
          ...patch,
        },
      }));
      setCurrentOrder((previousOrder) =>
        previousOrder &&
        getOrderStorageKey(previousOrder) === getOrderStorageKey(order)
          ? {
              ...previousOrder,
              ...patch,
            }
          : previousOrder,
      );
      setDialogOrder((previousOrder) =>
        previousOrder &&
        getOrderStorageKey(previousOrder) === getOrderStorageKey(order)
          ? {
              ...previousOrder,
              ...patch,
            }
          : previousOrder,
      );
    },
    [],
  );

  const getOrderPrintChannel = useCallback(
    (order: Order): Pick<Channel, "id" | "name" | "warehouses"> | null => {
      const matchingChannel =
        channels?.find((candidate) => candidate.id === order.channelId) ??
        (channel?.id === order.channelId ? channel : null);

      return matchingChannel
        ? {
            id: matchingChannel.id,
            name: matchingChannel.name,
            warehouses: matchingChannel.warehouses,
          }
        : null;
    },
    [channel, channels],
  );

  const prepareOrderPrintData = useCallback(
    async (order: Order): Promise<PreparedOrderPrintData> => {
      const customerId = isNestedCustomer(order.customer)
        ? order.customer.id
        : "";
      const fakturowniaDocumentId = getFakturowniaDocumentId(order);
      const orderChannel = getOrderPrintChannel(order);
      const filesPromise: Promise<ListResults[]> = customerId
        ? fetchOrderItemFiles(
            order.id,
            customerId,
            order.items,
            tenantContext,
            order.channelId,
          ).then((files) => files ?? [])
        : Promise.resolve([]);
      const attachmentsPromise: Promise<ListResults[]> =
        customerId && order.isFromStore
          ? fetchOrderPrintAttachments(
              tenantContext,
              order.channelId,
              order.id,
              customerId,
            )
          : Promise.resolve([]);
      const notesPromise = getNotes(firestore, order.id);
      const complaintsPromise =
        order.complaints && order.complaints.length > 0
          ? getComplaints(firestore, order.complaints, order.channelId)
          : Promise.resolve([]);
      const invoicePromise: Promise<OrderPrintInvoice | null> =
        hasFakturowniaKey && fakturowniaDocumentId
          ? getInvoices({
              number: fakturowniaDocumentId,
            }).then((invoices) => {
              const invoiceResults = invoices as unknown[];
              return invoiceResults.find(isOrderPrintInvoice) ?? null;
            })
          : Promise.resolve(null);

      const [files, attachments, notes, complaints, fakturowniaInvoice] =
        await Promise.all([
          filesPromise,
          attachmentsPromise,
          notesPromise,
          complaintsPromise,
          invoicePromise,
        ]);

      return {
        attachments,
        channelName: orderChannel?.name ?? order.channelId,
        complaints,
        fakturowniaDocumentId,
        fakturowniaInvoice,
        files,
        notes,
        order,
      };
    },
    [getOrderPrintChannel, hasFakturowniaKey, tenantContext],
  );

  const clearPreparedOrderPrint = useCallback(() => {
    activeOrderPrintRef.current = null;
    orderPrintBusyRef.current = false;
    orderPrintAttemptKeyRef.current = null;
    setIsPreparingOrderPrint(false);
    setPreparedOrderPrint(null);
  }, []);

  const handlePreparedOrderPrint = useReactToPrint({
    contentRef: orderPrintRef,
    copyShadowRoots: true,
    onAfterPrint: () => {
      const activePrint = activeOrderPrintRef.current;

      if (previousDocumentTitleRef.current) {
        document.title = previousDocumentTitleRef.current;
      }
      previousDocumentTitleRef.current = null;

      if (activePrint) {
        update(
          {
            activities: arrayUnion({
              timestamp: Timestamp.now(),
              type: ActivityStatus.ORDER_PRINTED,
              value: "ORDER_PRINTED",
            }),
          },
          db.doc(
            firestore,
            `/channels/${activePrint.data.order.channelId}/orders`,
            activePrint.data.order.id,
          ),
          tenantContext,
        ).catch((error: unknown) => {
          console.error("Failed to append order print activity", error);
        });
      }

      clearPreparedOrderPrint();
    },
    onBeforePrint: () => {
      const activePrint = activeOrderPrintRef.current;
      previousDocumentTitleRef.current = document.title;

      if (activePrint) {
        document.title = `${t("ROUTES.order", {
          defaultValue: "Order",
        })} ${activePrint.data.channelName}#${activePrint.data.order.number}`;
      }

      return Promise.resolve();
    },
    onPrintError: (errorLocation, error) => {
      console.error("Failed to print order from production view", {
        error,
        errorLocation,
      });

      if (previousDocumentTitleRef.current) {
        document.title = previousDocumentTitleRef.current;
      }
      previousDocumentTitleRef.current = null;
      toaster.error({
        description: t("orders.print.prepareFailedDescription", {
          defaultValue:
            "The order could not be prepared for printing. Try again.",
        }),
        title: t("orders.print.prepareFailedTitle", {
          defaultValue: "Print failed",
        }),
      });
      clearPreparedOrderPrint();
    },
    pageStyle: getOrderPrintPageStyle(preparedOrderPrint?.mode ?? "full"),
  });

  const handlePrintOrder = useCallback<OrderPrintHandler>(
    async (order, mode) => {
      if (orderPrintBusyRef.current) {
        toaster.warning({
          description: t("orders.print.busyDescription", {
            defaultValue:
              "Wait for the current print dialog before starting another print.",
          }),
          title: t("orders.print.busyTitle", {
            defaultValue: "Print is already being prepared",
          }),
        });
        return;
      }

      orderPrintBusyRef.current = true;
      setIsPreparingOrderPrint(true);

      try {
        const printData = await prepareOrderPrintData(order);
        const printChannel = getOrderPrintChannel(order);
        const nextPrint: PreparedOrderPrintJob = {
          channel: printChannel
            ? {
                id: printChannel.id,
                warehouses: printChannel.warehouses,
              }
            : null,
          data: printData,
          mode,
        };

        activeOrderPrintRef.current = nextPrint;
        setPreparedOrderPrint(nextPrint);
        setIsPreparingOrderPrint(false);
      } catch (error) {
        console.error("Failed to prepare order print", error);
        toaster.error({
          description: t("orders.print.prepareFailedDescription", {
            defaultValue:
              "The order could not be prepared for printing. Try again.",
          }),
          title: t("orders.print.prepareFailedTitle", {
            defaultValue: "Print failed",
          }),
        });
        clearPreparedOrderPrint();
      }
    },
    [clearPreparedOrderPrint, getOrderPrintChannel, prepareOrderPrintData, t],
  );

  // useReactToPrint recreates its callback on every render, so the print
  // effect must not depend on it directly: any re-render (e.g. a live order
  // snapshot) during the asset-settle wait would cancel the queued print and
  // leave the non-dismissable preparing dialog blocking the page.
  const handlePreparedOrderPrintRef = useRef(handlePreparedOrderPrint);

  useEffect(() => {
    handlePreparedOrderPrintRef.current = handlePreparedOrderPrint;
  }, [handlePreparedOrderPrint]);

  useEffect(() => {
    if (!preparedOrderPrint || isPreparingOrderPrint) {
      return;
    }

    const printKey = `${preparedOrderPrint.data.order.channelId}:${preparedOrderPrint.data.order.id}:${preparedOrderPrint.mode}`;
    if (orderPrintAttemptKeyRef.current === printKey) {
      return;
    }

    orderPrintAttemptKeyRef.current = printKey;
    let isCancelled = false;
    void waitForOrderPrintAssets(orderPrintRef.current).then(() => {
      if (!isCancelled) {
        handlePreparedOrderPrintRef.current();
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isPreparingOrderPrint, preparedOrderPrint]);

  const handleUpdateStatus = useCallback(
    (
      name: "status" | "filesStatus" | "paymentStatus",
      value: string | undefined,
      order: Order,
      updatedBy?: NestedMember,
    ) => {
      if (!value) {
        return;
      }

      const previousValue = order[name];
      const shouldAttachStatusActor = name === "status" && !!updatedBy;
      const optimisticPatch = {
        [name]: value,
        ...(shouldAttachStatusActor
          ? {
              createdBy: updatedBy,
              updatedAt: Timestamp.now(),
              updatedBy,
            }
          : {}),
      } as Partial<Order>;
      const rollbackPatch = {
        [name]: previousValue,
        ...(shouldAttachStatusActor
          ? {
              createdBy: order.createdBy,
              updatedAt: order.updatedAt,
              updatedBy: order.updatedBy,
            }
          : {}),
      } as Partial<Order>;

      patchOrderLocally(order, optimisticPatch);
      setPendingStatusConfirmation(null);

      void updateOrderStatusField({
        channelId: order.channelId,
        field: name,
        orderId: order.id,
        source: "admin-production-orders",
        updatedBy,
        value,
      })
        .then(async () => {
          refreshCounts();

          if (name === "status") {
            void sendOrderStatusEmail(
              order.channelId,
              order.id,
              value as OrderStatus,
            )
              .then((result) => {
                if (!result.sent && result.error) {
                  toaster.warning({
                    description: t("orders.statusEmailSendFailed", {
                      defaultValue:
                        "Order status was updated, but notification email was not sent: {{reason}}",
                      reason: result.error,
                    }),
                    title: t("orders.warning", {
                      defaultValue: "Warning!",
                    }),
                  });
                }
              })
              .catch((error: unknown) => {
                const reason =
                  error instanceof Error
                    ? error.message
                    : t("orders.unknownError", {
                        defaultValue: "Unknown error",
                      });
                toaster.warning({
                  description: t("orders.statusEmailSendFailed", {
                    defaultValue:
                      "Order status was updated, but notification email was not sent: {{reason}}",
                    reason,
                  }),
                  title: t("orders.warning", {
                    defaultValue: "Warning!",
                  }),
                });
              });
          }
        })
        .catch((error: unknown) => {
          console.error("Failed to update order status from production view", {
            error,
            name,
            orderId: order.id,
            value,
          });
          patchOrderLocally(order, rollbackPatch);
          toaster.error({
            description: t("orders.updateFailed", {
              defaultValue: "Failed to update order. Please try again.",
            }),
            title: t("orders.error", {
              defaultValue: "Error",
            }),
          });
        });
    },
    [patchOrderLocally, refreshCounts, t],
  );

  const queueOrApplyStatusChange = useCallback(
    (statusChange: PendingStatusChange) => {
      if (
        shouldRequireStatusEmailConfirmation(
          statusChange.order,
          statusChange.value,
        )
      ) {
        setPendingStatusConfirmation({
          ...statusChange,
          kind: "status-email",
        });
        return;
      }

      if (
        shouldWarnOrderMayBeIncomplete(statusChange.order, statusChange.value)
      ) {
        setPendingStatusConfirmation({
          ...statusChange,
          kind: "incomplete-order",
        });
        return;
      }

      handleUpdateStatus(
        statusChange.name,
        statusChange.value,
        statusChange.order,
        statusChange.updatedBy,
      );
    },
    [handleUpdateStatus],
  );

  const handleOrderStatusChange = useCallback(
    (value: string | undefined, order: Order) => {
      if (!value || value === order.status) {
        return;
      }

      const statusChange: PendingStatusChange = {
        name: "status",
        order,
        value,
      };

      if (shouldRequireStatusActorSelection(order)) {
        setPendingStatusActorSelection(statusChange);
        return;
      }

      queueOrApplyStatusChange(statusChange);
    },
    [queueOrApplyStatusChange],
  );

  const handleFilesStatusChange = useCallback(
    (value: string | undefined, order: Order) => {
      if (!value || value === order.filesStatus) {
        return;
      }

      handleUpdateStatus("filesStatus", value, order);
    },
    [handleUpdateStatus],
  );

  const handlePaymentStatusChange = useCallback(
    (value: string | undefined, order: Order) => {
      if (!value || value === order.paymentStatus) {
        return;
      }

      handleUpdateStatus("paymentStatus", value, order);
    },
    [handleUpdateStatus],
  );

  const handleItemDropStatus = useCallback(
    (order: Order, itemId: string, nextStatus: ProductionItemDropStatus) => {
      const change = getOrderItemStatusChangeForDrop(itemId, nextStatus);

      try {
        const nextCollections = applyOrderItemStatusChange(order, change);
        patchOrderLocally(order, nextCollections);
        void update(
          nextCollections,
          db.doc(firestore, `/channels/${order.channelId}/orders`, order.id),
          tenantContext,
        );
      } catch (error) {
        console.error("Failed to apply production item status change", error);
        toaster.error({
          description:
            error instanceof Error
              ? error.message
              : t("order.itemStatusUpdateError", {
                  defaultValue: "Failed to update item status",
                }),
          title: t("orders.error", {
            defaultValue: "Error",
          }),
        });
      }
    },
    [patchOrderLocally, t, tenantContext],
  );

  const handlePrintTypeGroupFulfilled = useCallback(
    (order: Order, group: ProductionPrintTypeCompletionGroup) => {
      const pendingItemIds = group.itemIds.filter(
        (itemId) => !group.completedItemIds.includes(itemId),
      );

      if (pendingItemIds.length === 0) {
        return;
      }

      try {
        let nextCollections = {
          deliveredItems: order.deliveredItems ?? [],
          fulfilledItems: order.fulfilledItems ?? [],
          inProgressItems: order.inProgressItems ?? [],
          pickedUpItems: order.pickedUpItems ?? [],
        };

        for (const itemId of pendingItemIds) {
          nextCollections = applyOrderItemStatusChange(
            nextCollections,
            getOrderItemStatusChangeForDrop(itemId, "fulfilled"),
          );
        }

        patchOrderLocally(order, nextCollections);
        void update(
          nextCollections,
          db.doc(firestore, `/channels/${order.channelId}/orders`, order.id),
          tenantContext,
        );
        toaster.success({
          title: t("orders.productionView.printTypeCompletion.fulfilledToast", {
            defaultValue: "Print type items marked fulfilled",
          }),
        });
      } catch (error) {
        console.error("Failed to apply print type completion change", error);
        toaster.error({
          description:
            error instanceof Error
              ? error.message
              : t("order.itemStatusUpdateError", {
                  defaultValue: "Failed to update item status",
                }),
          title: t("orders.error", {
            defaultValue: "Error",
          }),
        });
      }
    },
    [patchOrderLocally, t, tenantContext],
  );

  const handleReportItemProblem = useCallback(
    (order: Order, item: OrderItem) => {
      setItemProblemTarget({ item, order });
    },
    [],
  );

  const handleItemProblemSubmit = useCallback(
    (problem: ItemProblem | null) => {
      if (!itemProblemTarget) {
        return;
      }

      const { item, order } = itemProblemTarget;
      const remainingProblems = (order.problemItems ?? []).filter(
        (candidate) => candidate.itemId !== item.id,
      );
      patchOrderLocally(order, {
        problemItems: problem
          ? [...remainingProblems, problem]
          : remainingProblems,
      });
      void updateItemProblem(order.id, order.channelId, item.id, problem);
    },
    [itemProblemTarget, patchOrderLocally, updateItemProblem],
  );

  const toggleSectionCollapsed = useCallback((key: ProductionSectionKey) => {
    setCollapsedSectionKeys((current) =>
      current.includes(key)
        ? current.filter((sectionKey) => sectionKey !== key)
        : [...current, key],
    );
  }, []);

  const handleVisibleStatusToggle = useCallback(
    (statusId: OrderWorkflowStatusId, checked: boolean) => {
      setVisibleStatusIds((current) => {
        const next = checked
          ? [...current, statusId]
          : current.filter((currentStatusId) => currentStatusId !== statusId);

        return normalizeProductionVisibleStatusIds(
          next,
          orderWorkflowStatusesSettings,
        );
      });
    },
    [orderWorkflowStatusesSettings],
  );

  const resetVisibleStatuses = useCallback(() => {
    setVisibleStatusIds(
      getDefaultProductionVisibleStatusIds(orderWorkflowStatusesSettings),
    );
  }, [orderWorkflowStatusesSettings]);

  const setPrintingMethodPreset = useCallback(
    (methodIds: readonly PrintingMethodId[]) => {
      setSelectedPrintingMethodIds(
        normalizeProductionPrintingMethodIds(
          methodIds,
          activePrintingMethodIds,
        ),
      );
    },
    [activePrintingMethodIds],
  );

  const handlePrintingMethodToggle = useCallback(
    (methodId: PrintingMethodId, checked: boolean) => {
      setSelectedPrintingMethodIds((current) => {
        const source =
          current.length >= activePrintingMethodIds.length
            ? activePrintingMethodIds
            : current;
        const next = checked
          ? [...source, methodId]
          : source.filter((currentMethodId) => currentMethodId !== methodId);

        return normalizeProductionPrintingMethodIds(
          next.length > 0 ? next : activePrintingMethodIds,
          activePrintingMethodIds,
        );
      });
    },
    [activePrintingMethodIds],
  );

  const handleSetDate = useCallback(
    (nextStartDate: string, nextEndDate: string) => {
      setStartDate(nextStartDate || undefined);
      setEndDate(nextEndDate || undefined);
    },
    [],
  );

  const openOrderDialog = useCallback((order: Order) => {
    setDialogOrder(order);
  }, []);

  const openFullOrder = useCallback(
    (order: Order) => {
      router.push(getOrderDetailsHref(resolvedLanguage, order) as Route);
    },
    [resolvedLanguage, router],
  );

  const modalHandlers = useMemo(
    () => ({
      openFolder: async (order: Order) => {
        const basePath = getFolderPath(order.channelId);

        if (!basePath) {
          toaster.error({
            description: t("orders.noFolderConfigured", {
              defaultValue: "No folder path configured for this channel",
            }),
            title: t("orders.error", {
              defaultValue: "Error",
            }),
          });
          return;
        }

        const folderPath = getOrderFolderPath(basePath, order.number);
        const success = await openOrderFolder(folderPath);

        if (!success) {
          toaster.error({
            description: t("orders.folderOpenError", {
              defaultValue:
                "Failed to open folder. Please check if the folder exists.",
            }),
            title: t("orders.error", {
              defaultValue: "Error",
            }),
          });
        }
      },
      showAttachments: (order: Order) => {
        setCurrentOrder(order);
        setShowAttachmentsForm(true);
      },
      showComplaintForm: (order: Order) => {
        setCurrentOrder(order);
        setShowComplaintForm(true);
      },
      showDeactivateDialog: (order: Order) => {
        setCurrentOrder(order);
        setShowDeactivateDialog(true);
      },
      showDuplicateForm: (order: Order) => {
        setCurrentOrder(order);
        setShowDuplicateForm(true);
      },
      showNoteCreateForm: (order: Order) => {
        setCurrentOrder(order);
        setShowNoteCreateForm(true);
      },
      showPaymentDocument: (order: Order) => {
        setCurrentOrder(order);
        setShowPaymentDocumentForm(true);
      },
      showTracking: (order: Order) => {
        setCurrentOrder(order);
        setShowTrackingForm(true);
      },
      showUpdateForm: (order: Order) => {
        setCurrentOrder(order);
        setShowUpdateForm(true);
      },
    }),
    [getFolderPath, t],
  );

  const pendingStatusAgeMinutes = useMemo(() => {
    if (!pendingStatusConfirmation) {
      return null;
    }

    return pendingStatusConfirmation.kind === "incomplete-order"
      ? getOrderAgeInMinutes(pendingStatusConfirmation.order)
      : null;
  }, [pendingStatusConfirmation]);

  const viewRootRef = useRef<HTMLDivElement | null>(null);
  const [floatingBarMetrics, setFloatingBarMetrics] = useState<{
    centerX: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const node = viewRootRef.current;

    if (!node) {
      return;
    }

    const update = () => {
      const rect = node.getBoundingClientRect();
      setFloatingBarMetrics({
        centerX: rect.left + rect.width / 2,
        width: rect.width,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [channel?.id, user]);

  if (!channel?.id || !user) {
    return (
      <Empty
        description={t("orders.productionView.noChannelDescription", {
          defaultValue: "Select a channel to see production orders.",
        })}
        icon="orders"
        title={t("orders.productionView.noChannel", {
          defaultValue: "No channel selected",
        })}
      />
    );
  }

  return (
    <>
      <OrderPrintPreparingDialog
        open={isPreparingOrderPrint || preparedOrderPrint !== null}
        t={t}
      />
      {preparedOrderPrint && (
        <Box
          aria-hidden="true"
          left="-10000px"
          opacity={0}
          pointerEvents="none"
          position="fixed"
          top="0"
          w="1600px"
          zIndex="-1"
        >
          <Box ref={orderPrintRef} w="1600px">
            <OrderPrintDocument
              channel={preparedOrderPrint.channel}
              data={preparedOrderPrint.data}
              getFolderPath={getFolderPath}
              i18n={i18n}
              onFileDownload={onFileDownload}
              orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
              printingMethodsSettings={printingMethodsSettings}
              shippingMethodsSettings={shippingMethodsSettings}
              storage={storage}
              t={t}
              warehouses={warehouses}
            />
          </Box>
        </Box>
      )}

      <ActionBar.Root
        closeOnInteractOutside={false}
        lazyMount
        open={Boolean(draggedOrder) && orderStatusDefinitions.length > 0}
        unmountOnExit
      >
        <Portal>
          <ActionBar.Positioner
            style={{
              insetInlineStart: floatingBarMetrics
                ? `${floatingBarMetrics.centerX - floatingBarMetrics.width / 2}px`
                : undefined,
              width: floatingBarMetrics
                ? `${floatingBarMetrics.width}px`
                : undefined,
              zIndex: 1500,
            }}
          >
            <ActionBar.Content maxW="100%" overflowX="auto">
              {draggedOrder ? (
                <>
                  <HStack color="fg.muted" flexShrink={0} gap={1} pl={1} pr={2}>
                    <MaterialSymbol>drag_pan</MaterialSymbol>
                    <Text fontSize="xs" fontWeight="medium" whiteSpace="nowrap">
                      {t("orders.productionView.dropToSetStatus", {
                        defaultValue: "Drop on a status to move",
                      })}
                    </Text>
                  </HStack>
                  {orderStatusDefinitions.map((status) => {
                    const isCurrent = draggedOrder.status === status.id;
                    const statusColor = getOrderWorkflowStatusColorPalette(
                      status.id,
                      orderWorkflowStatusesSettings,
                    );
                    const statusIcon = getOrderWorkflowStatusIcon(
                      status.id,
                      orderWorkflowStatusesSettings,
                    );
                    const statusLabel = getOrderWorkflowStatusLabel(
                      status.id,
                      orderWorkflowStatusesSettings,
                      t,
                      activeLocale,
                    );

                    return (
                      <HStack
                        key={status.id}
                        bg={isCurrent ? "bg.muted" : "colorPalette.subtle"}
                        borderColor="colorPalette.muted"
                        borderRadius="xl"
                        borderWidth="1px"
                        color={isCurrent ? "fg.muted" : "colorPalette.fg"}
                        colorPalette={statusColor}
                        cursor={isCurrent ? "not-allowed" : "copy"}
                        flexShrink={0}
                        gap={1}
                        opacity={isCurrent ? 0.5 : 1}
                        px={3}
                        py={2}
                        transition="background 120ms ease, transform 120ms ease"
                        onDragOver={(event) => {
                          if (!isCurrent) {
                            event.preventDefault();
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!isCurrent) {
                            handleOrderStatusChange(status.id, draggedOrder);
                          }
                          setDraggedOrder(null);
                        }}
                        _hover={
                          isCurrent
                            ? undefined
                            : {
                                bg: "colorPalette.muted",
                                transform: "translateY(-2px)",
                              }
                        }
                      >
                        <MaterialSymbol>{statusIcon}</MaterialSymbol>
                        <Text
                          fontSize="sm"
                          fontWeight="medium"
                          whiteSpace="nowrap"
                        >
                          {statusLabel}
                        </Text>
                      </HStack>
                    );
                  })}
                </>
              ) : null}
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>

      <VStack ref={viewRootRef} align="stretch" gap={4}>
        <ProductionOrdersToolbar
          activeLocale={activeLocale}
          activePrintingMethodIds={activePrintingMethodIds}
          allPrintingMethodsSelected={allPrintingMethodsSelected}
          allVisibleStatusesSelected={allVisibleStatusesSelected}
          blockedOnlyLabel={blockedOnlyLabel}
          dispatchRulesState={dispatchRulesState}
          endDate={endDate}
          groupingMode={groupingMode}
          groupingViewLabel={groupingViewLabel}
          handlePrintingMethodToggle={handlePrintingMethodToggle}
          handleSetDate={handleSetDate}
          handleVisibleStatusToggle={handleVisibleStatusToggle}
          i18n={i18n}
          orderStatusOptions={orderStatusOptions}
          printingMethodOptions={printingMethodOptions}
          printingMethodRulePresets={printingMethodRulePresets}
          productionGroupingModeOptions={productionGroupingModeOptions}
          queryConstraints={queryConstraints}
          quickFilter={quickFilter}
          refreshCounts={refreshCounts}
          resetVisibleStatuses={resetVisibleStatuses}
          rulePresets={rulePresets}
          rules={rules}
          rulesState={rulesState}
          selectedPrintingMethodIds={selectedPrintingMethodIds}
          selectedPrintingMethodLabel={selectedPrintingMethodLabel}
          selectedPrintingMethodSet={selectedPrintingMethodSet}
          setGroupingMode={setGroupingMode}
          setPrintingMethodPreset={setPrintingMethodPreset}
          setQueryConstraints={setQueryConstraints}
          setQuickFilter={setQuickFilter}
          setShowBlockedOnly={setShowBlockedOnly}
          showBlockedOnly={showBlockedOnly}
          startDate={startDate}
          t={t}
          visibleStatusOptionCount={visibleStatusOptionCount}
          visibleStatusesLabel={visibleStatusesLabel}
          visibleStatusSet={visibleStatusSet}
        />

        <ProductionStatusSummaryStrip
          activeLocale={activeLocale}
          borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
          onVisibleStatusToggle={handleVisibleStatusToggle}
          orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
          statusSummaryAggregates={statusSummaryAggregates}
          t={t}
          visibleStatusSet={visibleStatusSet}
        />
        {PRODUCTION_ORDER_GROUPS.map((group) => {
          const groupMeta = createSectionGroupLabel(group);
          const groupFileStatusIds = getProductionFileStatusIds(
            group,
            orderWorkflowStatusesSettings,
          );

          return (
            <Box key={group} minW={0}>
              <HStack
                bg="bg.subtle"
                borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
                gap={2}
                mb={2}
                px={3}
                py={2}
                w="fit-content"
              >
                <MaterialSymbol>{groupMeta.icon}</MaterialSymbol>
                <Text fontSize="sm" fontWeight="semibold">
                  {t(`orders.productionView.groups.${groupMeta.key}`, {
                    defaultValue:
                      group === "ready"
                        ? "Ready for production"
                        : "Pending files",
                  })}
                </Text>
                <Badge size="sm" variant="surface">
                  {groupFileStatusIds.length}
                </Badge>
              </HStack>
              <VStack align="stretch" gap={2}>
                {specsByGroup[group].map((spec) => (
                  <ProductionStatusSection
                    key={spec.key}
                    activePreset={activePreset}
                    channelId={channel.id}
                    collapsed={collapsedSectionSet.has(spec.key)}
                    draggedItem={draggedItem}
                    draggedOrder={draggedOrder}
                    endDate={endDate}
                    fileStatusOptions={fileStatusOptions}
                    groupByProductionGrouping={groupByProductionGrouping}
                    groupByPrintingMethod={groupByPrintingMethod}
                    getWarehouseName={getWarehouseName}
                    hasFakturowniaKey={hasFakturowniaKey}
                    hasPolkurierKey={hasPolkurierKey}
                    isElectronRuntime={isElectronRuntime}
                    onAction={modalHandlers}
                    onDragItem={setDraggedItem}
                    onDragOrder={setDraggedOrder}
                    onFilesStatusChange={handleFilesStatusChange}
                    onItemDropStatus={handleItemDropStatus}
                    onOpenDialog={openOrderDialog}
                    onOpenFullOrder={openFullOrder}
                    onOrderStatusChange={handleOrderStatusChange}
                    onPaymentStatusChange={handlePaymentStatusChange}
                    onPrintOrder={handlePrintOrder}
                    onPrintTypeGroupFulfilled={handlePrintTypeGroupFulfilled}
                    onReportItemProblem={handleReportItemProblem}
                    onSetOrdersSelected={setOrdersSelected}
                    onSortChange={setSortPreference}
                    onToggleCollapsed={toggleSectionCollapsed}
                    onToggleOrderSelected={toggleOrderSelected}
                    optimisticPatches={optimisticPatches}
                    orderWorkflowStatusesSettings={
                      orderWorkflowStatusesSettings
                    }
                    orderStatusOptions={orderStatusOptions}
                    paymentStatusOptions={paymentStatusOptions}
                    printingMethodLabelMap={printingMethodLabelMap}
                    printingMethodsSettings={printingMethodsSettings}
                    productionGroupingProfile={
                      productionGroupingSettings.profile
                    }
                    queryConstraints={queryConstraints}
                    quickFilter={quickFilter?.trim().toLowerCase() ?? ""}
                    selectedOrders={selectedOrders}
                    selectedPrintingMethodIds={selectedPrintingMethodIds}
                    shippingMethodsSettings={shippingMethodsSettings}
                    showBlockedOnly={showBlockedOnly}
                    sort={sortPreference}
                    spec={spec}
                    startDate={startDate}
                    tenantContext={tenantContext}
                    totalCount={sectionCounts[spec.key] ?? null}
                    activePrintingMethodIds={activePrintingMethodIds}
                  />
                ))}
              </VStack>
            </Box>
          );
        })}
      </VStack>

      <ActionBar.Root
        closeOnInteractOutside={false}
        lazyMount
        open={selectedOrders.size > 0}
        unmountOnExit
        onOpenChange={({ open }) => {
          if (!open) {
            clearSelection();
          }
        }}
      >
        <Portal>
          <ActionBar.Positioner
            style={{
              insetInlineStart: floatingBarMetrics
                ? `${floatingBarMetrics.centerX - floatingBarMetrics.width / 2}px`
                : undefined,
              width: floatingBarMetrics
                ? `${floatingBarMetrics.width}px`
                : undefined,
              zIndex: 1500,
            }}
          >
            <ActionBar.Content>
              <ActionBar.SelectionTrigger>
                {t("orders.productionView.bulk.selectedCount", {
                  count: selectedOrders.size,
                  defaultValue: "{{count}} selected",
                })}
              </ActionBar.SelectionTrigger>
              <ActionBar.Separator />
              <HStack gap={2} wrap="wrap">
                {ITEM_DROP_STATUSES.map((status) => {
                  const statusColor =
                    getProductionItemStatusColorPalette(status);
                  const statusLabel = t(
                    `orders.productionView.itemStatus.${status}`,
                    {
                      defaultValue: getProductionItemStatusDefaultLabel(status),
                    },
                  );

                  return (
                    <Button
                      key={status}
                      colorPalette={statusColor}
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        const orders = Array.from(selectedOrders.values());
                        for (const order of orders) {
                          for (const item of order.items) {
                            const currentItemStatus =
                              getOrderItemProductionStatus(order, item.id);
                            if (currentItemStatus !== status) {
                              handleItemDropStatus(order, item.id, status);
                            }
                          }
                        }
                        toaster.success({
                          title: t("orders.productionView.bulk.applied", {
                            count: orders.length,
                            defaultValue:
                              "Production status updated for {{count}} orders",
                          }),
                        });
                        clearSelection();
                      }}
                    >
                      {statusLabel}
                    </Button>
                  );
                })}
              </HStack>
              <ActionBar.CloseTrigger asChild>
                <IconButton
                  aria-label={t("orders.productionView.bulk.clear", {
                    defaultValue: "Clear selection",
                  })}
                  size="xs"
                  variant="ghost"
                >
                  <MaterialSymbol>close</MaterialSymbol>
                </IconButton>
              </ActionBar.CloseTrigger>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>

      <Dialog.Root
        open={!!dialogOrder}
        onOpenChange={({ open }) => {
          if (!open) {
            setDialogOrder(null);
          }
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner
            alignItems="flex-start"
            justifyContent="center"
            p={{
              base: 2,
              md: 3,
            }}
          >
            <Dialog.Content
              borderRadius={PRODUCTION_VIEW_SECTION_RADIUS}
              h={{
                base: "calc(100dvh - 16px)",
                md: "calc(100dvh - 24px)",
              }}
              maxH={{
                base: "calc(100dvh - 16px)",
                md: "calc(100dvh - 24px)",
              }}
              maxW={{
                base: "calc(100vw - 16px)",
                md: "calc(100vw - 24px)",
              }}
              my={0}
            >
              <Dialog.Header pb={2}>
                <HStack justify="space-between" w="full">
                  <Dialog.Title>
                    {dialogOrder
                      ? `${getOrderPrintChannel(dialogOrder)?.name ?? dialogOrder.channelId}#${dialogOrder.number}`
                      : t("orders.productionView.orderDialog", {
                          defaultValue: "Order",
                        })}
                  </Dialog.Title>
                  {dialogOrder && (
                    <HStack data-production-row-action gap={2}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrintOrder(dialogOrder, "full")}
                        loading={isPreparingOrderPrint}
                      >
                        <MaterialSymbol>print</MaterialSymbol>
                        {t("orders.actions.printFull", {
                          defaultValue: "Print full order",
                        })}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handlePrintOrder(dialogOrder, "withCustomer")
                        }
                        loading={isPreparingOrderPrint}
                      >
                        <MaterialSymbol>print</MaterialSymbol>
                        {t("orders.actions.printWithCustomer", {
                          defaultValue: "Print with customer part & footer",
                        })}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openFullOrder(dialogOrder)}
                      >
                        <MaterialSymbol>open_in_new</MaterialSymbol>
                        {t("orders.actions.preview", {
                          defaultValue: "Open details",
                        })}
                      </Button>
                    </HStack>
                  )}
                </HStack>
              </Dialog.Header>
              <Dialog.Body overflowY="auto" pt={0}>
                {dialogOrder ? (
                  <OrderPreviewPanel
                    containerProps={ORDER_DIALOG_PREVIEW_PANEL_PROPS}
                    i18n={i18n}
                    onFileDelete={onFileDelete}
                    onFileDownload={onFileDownload}
                    onReportItemProblem={handleReportItemProblem}
                    order={dialogOrder}
                    orderWorkflowStatusesSettings={
                      orderWorkflowStatusesSettings
                    }
                    shippingMethodsSettings={shippingMethodsSettings}
                    showFiles
                    storage={storage}
                    tenantContext={tenantContext}
                    t={t}
                    updateItemFulfillment={updateItemFulfillment}
                    updateItemInProgress={updateItemInProgress}
                    updateItemPriority={updateItemPriority}
                  />
                ) : null}
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root
        role="alertdialog"
        open={!!pendingStatusConfirmation}
        onOpenChange={({ open }) => {
          if (!open) {
            setPendingStatusConfirmation(null);
          }
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {pendingStatusConfirmation?.kind === "incomplete-order"
                    ? t("orders.incompleteStatusChangeTitle", {
                        defaultValue: "Order may still be incomplete",
                      })
                    : t("orders.warning", {
                        defaultValue: "Warning!",
                      })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <VStack align="stretch" gap={3}>
                  {pendingStatusConfirmation?.kind === "incomplete-order" ? (
                    <>
                      <Text>
                        {t("orders.incompleteStatusChangeRecentOrder", {
                          defaultValue:
                            "This order was created {{minutes}} minutes ago and the files are not marked as ready for printing.",
                          minutes: pendingStatusAgeMinutes ?? 1,
                        })}
                      </Text>
                      <Text>
                        {t("orders.incompleteStatusChangeReason", {
                          defaultValue:
                            "It may still be missing uploads, waiting for file preparation or approval, or contain item settings that still need review.",
                        })}
                      </Text>
                    </>
                  ) : pendingStatusConfirmation ? (
                    <>
                      <Text>
                        {t("orders.changeStatusConfirm", {
                          defaultValue:
                            "Are you sure you want to change the order status to {{status}}?",
                          status: getOrderWorkflowStatusLabel(
                            pendingStatusConfirmation.value,
                            orderWorkflowStatusesSettings,
                            t,
                            activeLocale,
                          ),
                        })}
                      </Text>
                      <Text>
                        {t("orders.changeStatusEmailNote", {
                          defaultValue:
                            "Changing the status will send an email notification to the customer.",
                        })}
                      </Text>
                    </>
                  ) : null}
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setPendingStatusConfirmation(null)}
                  >
                    {t("orders.cancel", {
                      defaultValue: "Cancel",
                    })}
                  </Button>
                </Dialog.ActionTrigger>
                <Dialog.ActionTrigger asChild>
                  <Button
                    colorPalette="primary"
                    onClick={() => {
                      if (!pendingStatusConfirmation) {
                        return;
                      }

                      handleUpdateStatus(
                        pendingStatusConfirmation.name,
                        pendingStatusConfirmation.value,
                        pendingStatusConfirmation.order,
                        pendingStatusConfirmation.updatedBy,
                      );
                      setPendingStatusConfirmation(null);
                    }}
                  >
                    {t("orders.changeStatus", {
                      defaultValue: "Change status",
                    })}
                  </Button>
                </Dialog.ActionTrigger>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <StatusActorSelectionDialog
        members={filteredMembers}
        open={!!pendingStatusActorSelection}
        onConfirm={(member) => {
          if (!pendingStatusActorSelection) {
            return;
          }

          const statusChange = {
            ...pendingStatusActorSelection,
            updatedBy: member,
          };

          setPendingStatusActorSelection(null);
          queueOrApplyStatusChange(statusChange);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingStatusActorSelection(null);
          }
        }}
      />

      {currentOrder && showUpdateForm ? (
        currentOrder.isFromStore ? (
          <Drawer
            closeOnOverlayClick={false}
            header={t("orders.actions.edit", {
              defaultValue: "Edit",
            })}
            lazyMount
            open={showUpdateForm}
            restoreFocus={false}
            setOpen={setShowUpdateForm}
            size="xl"
            unmountOnExit
          >
            <StoreOrderUpdateForm
              order={currentOrder}
              setOptimisticOrder={(patch) =>
                patchOrderLocally(currentOrder, patch)
              }
            />
          </Drawer>
        ) : (
          <OrderForm
            asDrawer
            open={showUpdateForm}
            order={currentOrder}
            setOpen={setShowUpdateForm}
            setOptimisticOrder={(patch) =>
              patchOrderLocally(currentOrder, patch)
            }
            type="UPDATE"
          />
        )
      ) : null}
      {currentOrder && showDuplicateForm && (
        <OrderForm
          asDrawer
          open={showDuplicateForm}
          order={currentOrder}
          setOpen={setShowDuplicateForm}
          type="DUPLICATE"
          onCreateSuccess={() => {
            setShowDuplicateForm(false);
            setCurrentOrder(null);
          }}
        />
      )}
      {currentOrder && showDeactivateDialog && (
        <AlertDialog
          handle={() =>
            deactivateOrder(currentOrder.id, currentOrder.channelId)
          }
          header={t("orders.confirmDeactivateOrder", {
            defaultValue: "Are you sure you want to deactivate the order?",
          })}
          open={showDeactivateDialog}
          setOpen={setShowDeactivateDialog}
          t={t}
        >
          <Text>
            {t("orders.deactivateOrderDescription", {
              defaultValue:
                "After deactivation, the order will only be visible under the filter - inactive.",
            })}
          </Text>
        </AlertDialog>
      )}
      {currentOrder && showAttachmentsForm && (
        <PaymentProofUploader
          open={showAttachmentsForm}
          order={currentOrder}
          setOpen={setShowAttachmentsForm}
          setOptimisticOrder={(patch) => patchOrderLocally(currentOrder, patch)}
        />
      )}
      {currentOrder && showTrackingForm && (
        <TrackingForm
          open={showTrackingForm}
          order={currentOrder}
          setOpen={setShowTrackingForm}
          setOptimisticOrder={(patch) => patchOrderLocally(currentOrder, patch)}
        />
      )}
      {currentOrder && showComplaintForm && (
        <ComplaintForm
          open={showComplaintForm}
          order={currentOrder}
          setOpen={setShowComplaintForm}
          type="CREATE"
        />
      )}
      {currentOrder && showNoteCreateForm && (
        <NoteForm
          asDrawer
          entityId={`${currentOrder.id}?channelId=${currentOrder.channelId}`}
          entityType={NoteEntityType.ORDER}
          open={showNoteCreateForm}
          setOpen={setShowNoteCreateForm}
          type="CREATE"
        />
      )}
      {currentOrder && showPaymentDocumentForm && (
        <PaymentDocumentForm
          channelId={currentOrder.channelId}
          open={showPaymentDocumentForm}
          orderId={currentOrder.id}
          paymentDocumentId={currentOrder.paymentDocumentId}
          paymentStatus={currentOrder.paymentStatus}
          proformaDocumentId={currentOrder.proformaDocumentId}
          setOpen={setShowPaymentDocumentForm}
          setOptimisticOrder={(patch) => patchOrderLocally(currentOrder, patch)}
        />
      )}
      <ItemProblemDialog
        existingProblem={itemProblemTarget?.order.problemItems?.find(
          (problem) => problem.itemId === itemProblemTarget.item.id,
        )}
        onOpenChange={(open) => {
          if (!open) {
            setItemProblemTarget(null);
          }
        }}
        onSubmit={handleItemProblemSubmit}
        open={Boolean(itemProblemTarget)}
        orderItem={itemProblemTarget?.item ?? null}
      />
    </>
  );
}

interface ProductionStatusSectionProps {
  activePrintingMethodIds: PrintingMethodId[];
  /** Active order-rule preset, used by the section planner to budget Firestore disjunctions. */
  activePreset: RulePreset | undefined;
  channelId: string;
  collapsed: boolean;
  draggedItem: DraggedItem | null;
  draggedOrder: Order | null;
  endDate?: string;
  fileStatusOptions: SelectOption[];
  getWarehouseName: (warehouseId: string) => string;
  groupByProductionGrouping: boolean;
  groupByPrintingMethod: boolean;
  hasFakturowniaKey: boolean;
  hasPolkurierKey: boolean;
  isElectronRuntime: boolean;
  onAction: ProductionOrderMenuActions;
  onDragItem: (item: DraggedItem | null) => void;
  onDragOrder: (order: Order | null) => void;
  onFilesStatusChange: (value: string | undefined, order: Order) => void;
  onItemDropStatus: (
    order: Order,
    itemId: string,
    status: ProductionItemDropStatus,
  ) => void;
  onOpenDialog: (order: Order) => void;
  onOpenFullOrder: (order: Order) => void;
  onOrderStatusChange: (value: string | undefined, order: Order) => void;
  onPaymentStatusChange: (value: string | undefined, order: Order) => void;
  onPrintOrder: OrderPrintHandler;
  onPrintTypeGroupFulfilled: (
    order: Order,
    group: ProductionPrintTypeCompletionGroup,
  ) => void;
  onReportItemProblem: (order: Order, item: OrderItem) => void;
  onSetOrdersSelected: (orders: Order[], selected: boolean) => void;
  onSortChange: (sort: ProductionOrdersSort) => void;
  onToggleCollapsed: (key: ProductionSectionKey) => void;
  onToggleOrderSelected: (order: Order, selected?: boolean) => void;
  optimisticPatches: OptimisticOrderPatches;
  orderWorkflowStatusesSettings:
    | Partial<OrderWorkflowStatusesSettings>
    | null
    | undefined;
  orderStatusOptions: SelectOption[];
  paymentStatusOptions: SelectOption[];
  printingMethodLabelMap: Map<string, string>;
  printingMethodsSettings: Partial<PrintingMethodsSettings> | null | undefined;
  productionGroupingProfile: ProductionGroupingProfile;
  queryConstraints: QueryConstraint[];
  quickFilter: string;
  selectedOrders: Map<string, Order>;
  selectedPrintingMethodIds: PrintingMethodId[];
  shippingMethodsSettings: ReturnType<
    typeof useConfigurationSettings
  >["shippingMethodsSettings"];
  showBlockedOnly: boolean;
  sort: ProductionOrdersSort;
  spec: ProductionSectionQuerySpec;
  startDate?: string;
  tenantContext: ReturnType<typeof useTenantContext>;
  totalCount: number | null;
}

function ProductionStatusSection({
  activePrintingMethodIds,
  activePreset,
  channelId,
  collapsed,
  draggedItem,
  draggedOrder,
  endDate,
  fileStatusOptions,
  getWarehouseName,
  groupByProductionGrouping,
  groupByPrintingMethod,
  hasFakturowniaKey,
  hasPolkurierKey,
  isElectronRuntime,
  onAction,
  onDragItem,
  onDragOrder,
  onFilesStatusChange,
  onItemDropStatus,
  onOpenDialog,
  onOpenFullOrder,
  onOrderStatusChange,
  onPaymentStatusChange,
  onPrintOrder,
  onPrintTypeGroupFulfilled,
  onReportItemProblem,
  onSetOrdersSelected,
  onSortChange,
  onToggleCollapsed,
  onToggleOrderSelected,
  optimisticPatches,
  orderWorkflowStatusesSettings,
  orderStatusOptions,
  paymentStatusOptions,
  printingMethodLabelMap,
  printingMethodsSettings,
  productionGroupingProfile,
  queryConstraints,
  quickFilter,
  selectedOrders,
  selectedPrintingMethodIds,
  shippingMethodsSettings,
  showBlockedOnly,
  sort,
  spec,
  startDate,
  tenantContext,
  totalCount,
}: ProductionStatusSectionProps) {
  const { t, i18n } = useT(["orders", "order", "translation", "allegro"]);
  const locale = i18n.resolvedLanguage ?? "pl";
  const [rows, setRows] = useState<Order[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [pageLimit, setPageLimit] = useState(PRODUCTION_ORDERS_PAGE_SIZE);
  const [
    backgroundProductionGroupingClassifications,
    setBackgroundProductionGroupingClassifications,
  ] = useState<ProductionGroupingClassificationCacheResult>({});
  const [
    productionGroupingProcessingBatches,
    setProductionGroupingProcessingBatches,
  ] = useState<ProductionGroupingProcessingBatches>({});
  const requestedProductionGroupingClassificationsRef = useRef<Set<string>>(
    new Set(),
  );
  const productionGroupingBatchSequenceRef = useRef(0);
  const productionGroupingProcessingSummary = useMemo(() => {
    const batches = Object.values(productionGroupingProcessingBatches);

    if (batches.length === 0) {
      return null;
    }

    return batches.reduce<ProductionGroupingProcessingBatch>(
      (summary, batch) => ({
        itemCount: summary.itemCount + batch.itemCount,
        orderCount: summary.orderCount + batch.orderCount,
      }),
      {
        itemCount: 0,
        orderCount: 0,
      },
    );
  }, [productionGroupingProcessingBatches]);
  const statusLabel = getOrderWorkflowStatusLabel(
    spec.statusId,
    orderWorkflowStatusesSettings,
    t,
    locale,
  );
  const statusColor = getOrderWorkflowStatusColorPalette(
    spec.statusId,
    orderWorkflowStatusesSettings,
  );
  const statusIcon = getOrderWorkflowStatusIcon(
    spec.statusId,
    orderWorkflowStatusesSettings,
  );
  const sectionOpen = !collapsed;
  const canDropOrder =
    draggedOrder !== null && draggedOrder.status !== spec.statusId;
  const hasPrintingMethodFilter =
    selectedPrintingMethodIds.length < activePrintingMethodIds.length;
  const filteredRows = useMemo(() => {
    const patchedRows = rows.map((order) => ({
      ...order,
      ...optimisticPatches[getOrderStorageKey(order)],
    }));

    const filtered = patchedRows.filter((order) => {
      if (
        !orderMatchesProductionPrintingMethodFilter(
          order,
          selectedPrintingMethodIds,
          activePrintingMethodIds,
        )
      ) {
        return false;
      }

      if (showBlockedOnly && !orderHasUnresolvedProblem(order)) {
        return false;
      }

      return quickFilter
        ? getProductionOrderQuickFilterText(order).includes(quickFilter)
        : true;
    });

    return sortProductionOrders(filtered, sort);
  }, [
    activePrintingMethodIds,
    optimisticPatches,
    quickFilter,
    rows,
    selectedPrintingMethodIds,
    showBlockedOnly,
    sort,
  ]);
  const sectionMetrics = useMemo(
    () => getProductionSectionMetrics(filteredRows),
    [filteredRows],
  );
  const printingMethodGroups = useMemo(
    () =>
      groupByPrintingMethod
        ? groupOrdersByPrintingMethod(
            filteredRows,
            activePrintingMethodIds,
            printingMethodLabelMap,
            t("orders.productionView.otherPrintType", {
              defaultValue: "Other",
            }),
          )
        : null,
    [
      activePrintingMethodIds,
      filteredRows,
      groupByPrintingMethod,
      printingMethodLabelMap,
      t,
    ],
  );
  const productionGroupingItems = useMemo<
    ProductionGroupingSourceItem[]
  >(() => {
    if (!groupByProductionGrouping) {
      return [];
    }

    return filteredRows.flatMap((order) =>
      order.items
        .filter((item) =>
          orderItemMatchesProductionPrintingMethodFilter(
            item,
            order,
            selectedPrintingMethodIds,
            activePrintingMethodIds,
          ),
        )
        .map((item) => ({
          item,
          order,
        })),
    );
  }, [
    activePrintingMethodIds,
    filteredRows,
    groupByProductionGrouping,
    selectedPrintingMethodIds,
  ]);
  const productionGroupingItemRefs = useMemo(() => {
    if (!groupByProductionGrouping) {
      return [];
    }

    return productionGroupingItems.map(({ item, order }) =>
      getProductionGroupingItemRef(order.id, item, productionGroupingProfile),
    );
  }, [
    groupByProductionGrouping,
    productionGroupingItems,
    productionGroupingProfile,
  ]);
  const productionGroupingItemRefsKey = useMemo(
    () =>
      productionGroupingItemRefs
        .map((itemRef) =>
          [
            itemRef.orderId,
            itemRef.itemId,
            itemRef.inputHash,
            itemRef.profileHash,
            itemRef.signatureHash,
          ].join(":"),
        )
        .join("|"),
    [productionGroupingItemRefs],
  );
  const {
    data: cachedProductionGroupingClassifications,
    isLoading: loadingCachedProductionGroupingClassifications,
  } = useSWRImmutable<ProductionGroupingClassificationCacheResult>(
    groupByProductionGrouping && productionGroupingItemRefs.length > 0
      ? [
          "production-grouping-classifications",
          channelId,
          productionGroupingProfile.id,
          productionGroupingItemRefsKey,
        ]
      : null,
    () =>
      getProductionGroupingClassificationsAdmin({
        channelId,
        itemRefs: productionGroupingItemRefs,
        profile: productionGroupingProfile,
      }),
  );
  const productionGroupingClassifications = useMemo(
    () => ({
      ...(cachedProductionGroupingClassifications ?? {}),
      ...backgroundProductionGroupingClassifications,
    }),
    [
      backgroundProductionGroupingClassifications,
      cachedProductionGroupingClassifications,
    ],
  );
  const productionGroupingGroups = useMemo(
    () =>
      groupByProductionGrouping
        ? createProductionGroupingGroups(
            productionGroupingItems,
            productionGroupingClassifications,
            productionGroupingProfile,
            t("orders.productionView.unclassifiedGrouping", {
              defaultValue: "Unclassified",
            }),
            t("orders.productionView.otherSecondaryGrouping", {
              defaultValue: "Unclassified",
            }),
          )
        : null,
    [
      groupByProductionGrouping,
      productionGroupingClassifications,
      productionGroupingItems,
      productionGroupingProfile,
      t,
    ],
  );

  useEffect(() => {
    setBackgroundProductionGroupingClassifications({});
    setProductionGroupingProcessingBatches({});
    requestedProductionGroupingClassificationsRef.current.clear();
  }, [channelId, productionGroupingProfile.id, spec.key]);

  useEffect(() => {
    if (!groupByProductionGrouping || productionGroupingItems.length === 0) {
      return;
    }

    if (loadingCachedProductionGroupingClassifications) {
      return;
    }

    const pendingItemsByOrder = new Map<
      string,
      ProductionGroupingClassificationItem[]
    >();

    for (const { item, order } of productionGroupingItems) {
      const [serializableItem] = toSerializableProductionGroupingItems([item]);

      if (!serializableItem) {
        continue;
      }

      const itemRef = getProductionGroupingItemRef(
        order.id,
        serializableItem,
        productionGroupingProfile,
      );
      const cacheKey = getProductionGroupingCacheKey(
        order.id,
        serializableItem.id,
      );

      if (
        isFreshProductionGroupingClassification(
          productionGroupingClassifications[cacheKey],
          itemRef.inputHash,
          productionGroupingProfile,
        )
      ) {
        continue;
      }

      const requestKey = [
        channelId,
        order.id,
        serializableItem.id,
        itemRef.inputHash,
        itemRef.profileHash,
        itemRef.signatureHash,
      ].join(":");

      if (
        requestedProductionGroupingClassificationsRef.current.has(requestKey)
      ) {
        continue;
      }

      requestedProductionGroupingClassificationsRef.current.add(requestKey);
      const orderItems = pendingItemsByOrder.get(order.id) ?? [];
      orderItems.push(serializableItem);
      pendingItemsByOrder.set(order.id, orderItems);
    }

    const pendingOrders = Array.from(pendingItemsByOrder.entries()).map(
      ([orderId, items]) => ({
        items,
        orderId,
      }),
    );

    if (pendingOrders.length === 0) {
      return;
    }

    const batchKey = `${spec.key}:${productionGroupingBatchSequenceRef.current}`;
    productionGroupingBatchSequenceRef.current += 1;
    const pendingItemCount = pendingOrders.reduce(
      (count, order) => count + order.items.length,
      0,
    );

    setProductionGroupingProcessingBatches((current) => ({
      ...current,
      [batchKey]: {
        itemCount: pendingItemCount,
        orderCount: pendingOrders.length,
      },
    }));

    void classifyAndPersistProductionGroupingsBatchAdmin({
      channelId,
      orders: pendingOrders,
      profile: productionGroupingProfile,
    })
      .then((classifications) => {
        if (Object.keys(classifications).length === 0) {
          return;
        }

        setBackgroundProductionGroupingClassifications((current) => ({
          ...current,
          ...classifications,
        }));
      })
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to classify production groupings for production view: ${errorMessage}`,
          {
            error,
            orderCount: pendingOrders.length,
          },
        );
      })
      .finally(() => {
        setProductionGroupingProcessingBatches((current) => {
          const next = { ...current };
          delete next[batchKey];
          return next;
        });
      });
  }, [
    channelId,
    groupByProductionGrouping,
    loadingCachedProductionGroupingClassifications,
    productionGroupingItems,
    productionGroupingClassifications,
    productionGroupingProfile,
    spec.key,
  ]);

  const selectedCountInSection = useMemo(() => {
    let count = 0;
    for (const order of filteredRows) {
      if (selectedOrders.has(getOrderStorageKey(order))) {
        count += 1;
      }
    }
    return count;
  }, [filteredRows, selectedOrders]);

  const allInSectionSelected =
    filteredRows.length > 0 && selectedCountInSection === filteredRows.length;
  const someInSectionSelected =
    selectedCountInSection > 0 && !allInSectionSelected;
  const hasVisibleRows = groupByProductionGrouping
    ? productionGroupingItems.length > 0
    : filteredRows.length > 0;

  useEffect(() => {
    setPageLimit(PRODUCTION_ORDERS_PAGE_SIZE);
  }, [endDate, queryConstraints, spec.key, startDate]);

  useEffect(() => {
    if (!sectionOpen) {
      return;
    }

    const plan: SectionPresetPlan = planSectionPresetConstraints(
      spec,
      activePreset,
    );

    // If the preset excludes this section's status, render it as empty.
    if (plan.skipSection) {
      setLoadingRows(false);
      setRows([]);
      return;
    }

    setLoadingRows(true);
    const chunks = plan.fileStatusChunks;
    // Non-preset constraints (user-defined rules) still apply when no preset is active.
    const sectionExtraConstraints = activePreset
      ? plan.extraConstraints
      : queryConstraints;
    const snapshotsByChunk = new Map<number, Order[]>();

    function publishRows() {
      const rowsByKey = new Map<string, Order>();

      for (const snapshotRows of snapshotsByChunk.values()) {
        for (const order of snapshotRows) {
          rowsByKey.set(getOrderStorageKey(order), order);
        }
      }

      startTransition(() => {
        setRows(
          sortProductionOrdersByDeadline([...rowsByKey.values()]).slice(
            0,
            pageLimit,
          ),
        );
        setLoadingRows(false);
      });
    }

    if (chunks.length === 0) {
      startTransition(() => {
        setRows([]);
        setLoadingRows(false);
      });
      return;
    }

    const unsubscribes = chunks.map((chunk, index) =>
      onSnapshot(
        db.query<Order>(
          firestore,
          `/channels/${channelId}/orders`,
          pageLimit,
          undefined,
          buildSectionConstraints(
            tenantContext,
            spec,
            chunk,
            sectionExtraConstraints,
          ),
          startDate,
          endDate,
        ),
        (snapshot) => {
          snapshotsByChunk.set(
            index,
            snapshot.docs.map((doc) => ({
              ...doc.data(),
              channelId,
              id: doc.id,
            })),
          );
          publishRows();
        },
        (error) => {
          console.error("Failed to subscribe to production section", {
            error,
            section: spec.key,
          });
          setLoadingRows(false);
        },
      ),
    );

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [
    activePreset,
    channelId,
    endDate,
    pageLimit,
    queryConstraints,
    sectionOpen,
    spec,
    startDate,
    tenantContext,
  ]);

  const renderOrderRow = (order: Order, withSeparator: boolean) => (
    <Fragment key={getOrderStorageKey(order)}>
      {withSeparator ? (
        <Separator borderColor="border.subtle" mx={3} my={1.5} opacity={0.9} />
      ) : null}
      <ProductionOrderRow
        draggedItem={draggedItem}
        fileStatusOptions={fileStatusOptions}
        hasFakturowniaKey={hasFakturowniaKey}
        hasPolkurierKey={hasPolkurierKey}
        getWarehouseName={getWarehouseName}
        isElectronRuntime={isElectronRuntime}
        isSelected={selectedOrders.has(getOrderStorageKey(order))}
        onAction={onAction}
        onDragItem={onDragItem}
        onDragOrder={onDragOrder}
        onFilesStatusChange={onFilesStatusChange}
        onItemDropStatus={onItemDropStatus}
        onOpenDialog={onOpenDialog}
        onOpenFullOrder={onOpenFullOrder}
        onOrderStatusChange={onOrderStatusChange}
        onPaymentStatusChange={onPaymentStatusChange}
        onPrintOrder={onPrintOrder}
        onPrintTypeGroupFulfilled={onPrintTypeGroupFulfilled}
        onReportItemProblem={onReportItemProblem}
        onToggleSelected={onToggleOrderSelected}
        order={order}
        orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
        orderStatusOptions={orderStatusOptions}
        paymentStatusOptions={paymentStatusOptions}
        printingMethodsSettings={printingMethodsSettings}
        shippingMethodsSettings={shippingMethodsSettings}
        activePrintingMethodIds={activePrintingMethodIds}
      />
    </Fragment>
  );
  const renderMaterialItemRow = (
    row: ProductionGroupingGroupedItem,
    withSeparator: boolean,
  ) => (
    <Fragment key={`${getOrderStorageKey(row.order)}:${row.item.id}`}>
      {withSeparator ? (
        <Separator borderColor="border.subtle" mx={3} my={1.5} opacity={0.9} />
      ) : null}
      <ProductionMaterialItemRow
        draggedItem={draggedItem}
        fileStatusOptions={fileStatusOptions}
        hasFakturowniaKey={hasFakturowniaKey}
        hasPolkurierKey={hasPolkurierKey}
        getWarehouseName={getWarehouseName}
        isElectronRuntime={isElectronRuntime}
        isSelected={selectedOrders.has(getOrderStorageKey(row.order))}
        item={row.item}
        onAction={onAction}
        onDragItem={onDragItem}
        onDragOrder={onDragOrder}
        onFilesStatusChange={onFilesStatusChange}
        onItemDropStatus={onItemDropStatus}
        onOpenDialog={onOpenDialog}
        onOpenFullOrder={onOpenFullOrder}
        onOrderStatusChange={onOrderStatusChange}
        onPaymentStatusChange={onPaymentStatusChange}
        onPrintOrder={onPrintOrder}
        onPrintTypeGroupFulfilled={onPrintTypeGroupFulfilled}
        onReportItemProblem={onReportItemProblem}
        onToggleSelected={onToggleOrderSelected}
        order={row.order}
        orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
        orderStatusOptions={orderStatusOptions}
        paymentStatusOptions={paymentStatusOptions}
        printingMethodsSettings={printingMethodsSettings}
        shippingMethodsSettings={shippingMethodsSettings}
        activePrintingMethodIds={activePrintingMethodIds}
      />
    </Fragment>
  );

  return (
    <Box
      borderColor={canDropOrder ? "primary.muted" : "border.subtle"}
      borderRadius={PRODUCTION_VIEW_SECTION_RADIUS}
      borderWidth="1px"
      onDragOver={(event) => {
        if (canDropOrder) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!draggedOrder || draggedOrder.status === spec.statusId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onOrderStatusChange(spec.statusId, draggedOrder);
        onDragOrder(null);
      }}
      overflow="visible"
      p={1}
      transition="border-color 120ms ease"
    >
      <HStack
        bg={
          canDropOrder
            ? "primary.subtle"
            : sectionOpen
              ? "bg.subtle"
              : "transparent"
        }
        borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
        data-production-row-action
        gap={2}
        align="center"
        wrap={{ base: "wrap", lg: "nowrap" }}
        minH="44px"
        px={3}
        py={2}
      >
        <IconButton
          aria-label={
            sectionOpen
              ? t("orders.productionView.collapseSection", {
                  defaultValue: "Collapse section",
                })
              : t("orders.productionView.expandSection", {
                  defaultValue: "Expand section",
                })
          }
          onClick={() => onToggleCollapsed(spec.key)}
          size="2xs"
          variant="ghost"
        >
          <MaterialSymbol>
            {sectionOpen ? "keyboard_arrow_down" : "chevron_right"}
          </MaterialSymbol>
        </IconButton>
        <Badge colorPalette={statusColor} size="sm" variant="surface">
          <MaterialSymbol>{statusIcon}</MaterialSymbol>
          {statusLabel}
        </Badge>
        <Text color="fg.muted" fontSize="xs">
          {totalCount === null
            ? t("orders.productionView.countLoading", {
                defaultValue: "Counting...",
              })
            : t("orders.productionView.count", {
                count: totalCount,
                defaultValue: "{{count}} orders",
              })}
        </Text>
        {sectionOpen && filteredRows.length > 0 && (
          <Text color="fg.muted" fontSize="xs">
            {t("orders.productionView.loaded", {
              count: filteredRows.length,
              defaultValue: "{{count}} loaded",
            })}
          </Text>
        )}
        {sectionOpen && productionGroupingProcessingSummary && (
          <Tooltip
            content={t(
              "orders.productionView.materialGroups.processingTooltip",
              {
                defaultValue:
                  "AI classification is running. Items: {{itemCount}}, orders: {{orderCount}}.",
                itemCount: productionGroupingProcessingSummary.itemCount,
                orderCount: productionGroupingProcessingSummary.orderCount,
              },
            )}
          >
            <Badge colorPalette="blue" size="xs" variant="surface">
              <Spinner size="xs" />
              {t("orders.productionView.materialGroups.processing", {
                count: productionGroupingProcessingSummary.itemCount,
                defaultValue: "Classifying {{count}} items",
              })}
            </Badge>
          </Tooltip>
        )}
        {sectionOpen && filteredRows.length > 0 && (
          <HStack data-production-row-action gap={1} wrap="wrap">
            {sectionMetrics.overdueCount > 0 && (
              <Tooltip
                content={t("orders.productionView.metrics.overdueTooltip", {
                  defaultValue: "Orders past their deadline",
                })}
              >
                <Badge colorPalette="red" size="xs" variant="surface">
                  <MaterialSymbol>schedule</MaterialSymbol>
                  {t("orders.productionView.metrics.overdue", {
                    count: sectionMetrics.overdueCount,
                    defaultValue: "{{count}} overdue",
                  })}
                </Badge>
              </Tooltip>
            )}
            {sectionMetrics.problemCount > 0 && (
              <Tooltip
                content={t("orders.productionView.metrics.blockedTooltip", {
                  defaultValue: "Orders with unresolved item problems",
                })}
              >
                <Badge colorPalette="red" size="xs" variant="surface">
                  <MaterialSymbol>error</MaterialSymbol>
                  {t("orders.productionView.metrics.blocked", {
                    count: sectionMetrics.problemCount,
                    defaultValue: "{{count}} blocked",
                  })}
                </Badge>
              </Tooltip>
            )}
            <Badge colorPalette="gray" size="xs" variant="surface">
              <MaterialSymbol>inventory_2</MaterialSymbol>
              {t("orders.productionView.metrics.items", {
                count: sectionMetrics.itemCount,
                defaultValue: "{{count}} items",
              })}
            </Badge>
            {sectionMetrics.totalVolume > 0 && (
              <Tooltip
                content={t("orders.productionView.metrics.volumeTooltip", {
                  defaultValue: "Total volume of loaded orders",
                })}
              >
                <Badge colorPalette="gray" size="xs" variant="surface">
                  <MaterialSymbol>straighten</MaterialSymbol>
                  {formatProductionNumber(sectionMetrics.totalVolume, locale)}
                </Badge>
              </Tooltip>
            )}
          </HStack>
        )}
        <Box display={{ base: "none", lg: "block" }} flex="1" />
        <Box
          data-production-row-action
          display="flex"
          justifyContent={{ base: "flex-start", lg: "flex-end" }}
          w={{ base: "100%", lg: "auto" }}
        >
          <MenuRoot positioning={{ placement: "bottom-end" }}>
            <MenuTrigger asChild>
              <Button color="fg.muted" maxW="100%" size="xs" variant="ghost">
                <MaterialSymbol>swap_vert</MaterialSymbol>
                {t("orders.productionView.sort.label", {
                  defaultValue: "Sort",
                })}
                {": "}
                {t(`orders.productionView.sort.${sort.key}`, {
                  defaultValue: sort.key,
                })}
                <MaterialSymbol>
                  {sort.direction === "asc" ? "arrow_upward" : "arrow_downward"}
                </MaterialSymbol>
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuRadioItemGroup
                onValueChange={(details) => {
                  if (
                    PRODUCTION_SORT_KEYS.includes(
                      details.value as ProductionOrdersSortKey,
                    )
                  ) {
                    onSortChange({
                      ...sort,
                      key: details.value as ProductionOrdersSortKey,
                    });
                  }
                }}
                value={sort.key}
              >
                <MenuRadioItem value="deadline">
                  {t("orders.productionView.sort.deadline", {
                    defaultValue: "Deadline",
                  })}
                </MenuRadioItem>
                <MenuRadioItem value="createdAt">
                  {t("orders.productionView.sort.createdAt", {
                    defaultValue: "Acceptance date",
                  })}
                </MenuRadioItem>
                <MenuRadioItem value="number">
                  {t("orders.productionView.sort.number", {
                    defaultValue: "Order number",
                  })}
                </MenuRadioItem>
                <MenuRadioItem value="totalPrice">
                  {t("orders.productionView.sort.totalPrice", {
                    defaultValue: "Value",
                  })}
                </MenuRadioItem>
              </MenuRadioItemGroup>
              <MenuSeparator />
              <MenuRadioItemGroup
                onValueChange={(details) => {
                  if (details.value === "asc" || details.value === "desc") {
                    onSortChange({ ...sort, direction: details.value });
                  }
                }}
                value={sort.direction}
              >
                <MenuRadioItem value="asc">
                  {t("orders.productionView.sort.asc", {
                    defaultValue: "Ascending",
                  })}
                </MenuRadioItem>
                <MenuRadioItem value="desc">
                  {t("orders.productionView.sort.desc", {
                    defaultValue: "Descending",
                  })}
                </MenuRadioItem>
              </MenuRadioItemGroup>
            </MenuContent>
          </MenuRoot>
        </Box>
        {loadingRows && sectionOpen && <Spinner size="xs" />}
      </HStack>
      <Collapsible.Root open={sectionOpen} unmountOnExit>
        <Collapsible.Content>
          <VStack align="stretch" gap={0}>
            {hasVisibleRows && (
              <Grid
                columnGap={2}
                display={{ base: "none", lg: "grid" }}
                gridTemplateColumns={PRODUCTION_VIEW_COLUMN_TEMPLATE}
                mt={1}
                px={3}
                py={1}
              >
                <HStack gap={2}>
                  <Box
                    alignItems="center"
                    data-production-row-action
                    display="flex"
                    flexShrink={0}
                    onClick={stopProductionRowActionEvent}
                    onKeyDown={stopProductionRowActionEvent}
                    onPointerDown={stopProductionRowActionEvent}
                  >
                    <Checkbox
                      aria-label={t("orders.productionView.bulk.selectAll", {
                        defaultValue: "Select all loaded orders",
                      })}
                      checked={
                        allInSectionSelected
                          ? true
                          : someInSectionSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={({ checked }) =>
                        onSetOrdersSelected(filteredRows, checked === true)
                      }
                      size="sm"
                    />
                  </Box>
                  <Text color="fg.muted" fontSize="xs" fontWeight="medium">
                    {t("orders.productionView.columns.orderCustomer", {
                      defaultValue: "Order / Customer",
                    })}
                  </Text>
                </HStack>
                <Text color="fg.muted" fontSize="xs" fontWeight="medium">
                  {t("orders.productionView.columns.products", {
                    defaultValue: "Products / Details",
                  })}
                </Text>
                <Text color="fg.muted" fontSize="xs" fontWeight="medium">
                  {t("orders.productionView.columns.productionStatus", {
                    defaultValue: "Production status",
                  })}
                </Text>
                <Text
                  color="fg.muted"
                  fontSize="xs"
                  fontWeight="medium"
                  textAlign="end"
                >
                  {t("orders.productionView.columns.actions", {
                    defaultValue: "Actions",
                  })}
                </Text>
              </Grid>
            )}
            {!hasVisibleRows && !loadingRows ? (
              <Box
                bg="bg"
                borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
                mt={1}
                px={4}
                py={6}
              >
                <Text color="fg.muted" fontSize="sm">
                  {quickFilter || hasPrintingMethodFilter
                    ? t("orders.productionView.noLoadedMatches", {
                        defaultValue:
                          "No loaded orders match the local filters.",
                      })
                    : t("orders.productionView.noOrdersInSection", {
                        defaultValue: "No orders in this section.",
                      })}
                </Text>
              </Box>
            ) : productionGroupingGroups ? (
              productionGroupingGroups.map((group, groupIndex) => {
                const groupColorPalette =
                  getProductionGroupingHeaderColorPalette(group.key);

                return (
                  <Box key={group.key} mt={groupIndex === 0 ? 3 : 6}>
                    <HStack
                      bg="bg.subtle"
                      borderColor="border.subtle"
                      borderWidth="1px"
                      borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
                      color="fg"
                      gap={2}
                      mb={2.5}
                      px={3}
                      py={2.5}
                      position={{ lg: "sticky" }}
                      top={{ lg: 1 }}
                      wrap="wrap"
                      w="full"
                      zIndex={2}
                    >
                      <HStack flex="1" gap={2} minW="14rem">
                        <Box
                          as="span"
                          color="colorPalette.fg"
                          colorPalette={groupColorPalette}
                          display="inline-flex"
                          flexShrink={0}
                        >
                          <MaterialSymbol>layers</MaterialSymbol>
                        </Box>
                        <Text fontSize="sm" fontWeight="semibold" truncate>
                          {group.label}
                        </Text>
                      </HStack>
                      <HStack
                        gap={1.5}
                        justify={{ base: "start", md: "end" }}
                        ml={{ md: "auto" }}
                        wrap="wrap"
                      >
                        <Badge size="xs" variant="surface">
                          <MaterialSymbol>inventory_2</MaterialSymbol>
                          {t("orders.productionView.metrics.items", {
                            count: group.itemCount,
                            defaultValue: "{{count}} items",
                          })}
                        </Badge>
                        <Badge size="xs" variant="surface">
                          {t("orders.productionView.materialGroups.produced", {
                            count: group.totalProducedQuantity,
                            defaultValue: "{{count}} produced",
                          })}
                        </Badge>
                        {group.totalVolume > 0 ? (
                          <Badge size="xs" variant="surface">
                            <MaterialSymbol>straighten</MaterialSymbol>
                            {formatProductionNumber(group.totalVolume, locale)}
                          </Badge>
                        ) : null}
                        {group.overdueOrderCount > 0 ? (
                          <Badge colorPalette="red" size="xs" variant="surface">
                            <MaterialSymbol>schedule</MaterialSymbol>
                            {t("orders.productionView.metrics.overdue", {
                              count: group.overdueOrderCount,
                              defaultValue: "{{count}} overdue",
                            })}
                          </Badge>
                        ) : null}
                        {group.problemItemCount > 0 ? (
                          <Badge colorPalette="red" size="xs" variant="surface">
                            <MaterialSymbol>error</MaterialSymbol>
                            {t("orders.productionView.metrics.blocked", {
                              count: group.problemItemCount,
                              defaultValue: "{{count}} blocked",
                            })}
                          </Badge>
                        ) : null}
                      </HStack>
                    </HStack>
                    {group.secondaryGroups.length > 0
                      ? group.secondaryGroups.map((secondaryGroup) => (
                          <Box key={secondaryGroup.key} mt={2}>
                            <HStack
                              bg="transparent"
                              borderColor="border.subtle"
                              borderWidth="1px"
                              borderRadius="xl"
                              color="fg.muted"
                              gap={2}
                              mx={1}
                              px={3}
                              py={1.5}
                              wrap="wrap"
                            >
                              <MaterialSymbol>
                                subdirectory_arrow_right
                              </MaterialSymbol>
                              <Text
                                color="fg"
                                fontSize="xs"
                                fontWeight="semibold"
                                truncate
                              >
                                {secondaryGroup.label}
                              </Text>
                              <HStack gap={1.5} ml={{ md: "auto" }} wrap="wrap">
                                <Badge size="xs" variant="surface">
                                  {t("orders.productionView.metrics.items", {
                                    count: secondaryGroup.itemCount,
                                    defaultValue: "{{count}} items",
                                  })}
                                </Badge>
                                <Badge size="xs" variant="surface">
                                  {t(
                                    "orders.productionView.materialGroups.produced",
                                    {
                                      count:
                                        secondaryGroup.totalProducedQuantity,
                                      defaultValue: "{{count}} produced",
                                    },
                                  )}
                                </Badge>
                              </HStack>
                            </HStack>
                            {secondaryGroup.rows.map((row, index) =>
                              renderMaterialItemRow(row, index > 0),
                            )}
                          </Box>
                        ))
                      : group.rows.map((row, index) =>
                          renderMaterialItemRow(row, index > 0),
                        )}
                  </Box>
                );
              })
            ) : printingMethodGroups ? (
              printingMethodGroups.map((methodGroup) => (
                <Box key={methodGroup.key} mt={3}>
                  <HStack
                    bg="bg.subtle"
                    borderColor="border.subtle"
                    borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
                    borderWidth="1px"
                    gap={2}
                    mb={1.5}
                    px={3}
                    py={2}
                    position={{ lg: "sticky" }}
                    top={{ lg: 1 }}
                    w="full"
                    zIndex={2}
                  >
                    <HStack flex="1" gap={2} minW="14rem">
                      <MaterialSymbol>category</MaterialSymbol>
                      <Text fontSize="sm" fontWeight="semibold" truncate>
                        {methodGroup.label}
                      </Text>
                    </HStack>
                    <Badge
                      colorPalette="gray"
                      ml={{ md: "auto" }}
                      size="xs"
                      variant="surface"
                    >
                      {methodGroup.orders.length}
                    </Badge>
                  </HStack>
                  {methodGroup.orders.map((order, index) =>
                    renderOrderRow(order, index > 0),
                  )}
                </Box>
              ))
            ) : (
              filteredRows.map((order, index) =>
                renderOrderRow(order, index > 0),
              )
            )}
            {totalCount !== null &&
              totalCount > rows.length &&
              !quickFilter && (
                <Box
                  bg="bg"
                  borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
                  mt={1}
                  px={3}
                  py={3}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPageLimit(
                        (current) => current + PRODUCTION_ORDERS_PAGE_SIZE,
                      )
                    }
                  >
                    <MaterialSymbol>expand_more</MaterialSymbol>
                    {t("orders.productionView.loadMore", {
                      defaultValue: "Load more",
                    })}
                  </Button>
                </Box>
              )}
          </VStack>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}

interface ProductionOrderRowProps {
  activePrintingMethodIds: PrintingMethodId[];
  draggedItem: DraggedItem | null;
  fileStatusOptions: SelectOption[];
  getWarehouseName: (warehouseId: string) => string;
  hasFakturowniaKey: boolean;
  hasPolkurierKey: boolean;
  isElectronRuntime: boolean;
  isSelected: boolean;
  onAction: ProductionStatusSectionProps["onAction"];
  onDragItem: (item: DraggedItem | null) => void;
  onDragOrder: (order: Order | null) => void;
  onFilesStatusChange: (value: string | undefined, order: Order) => void;
  onItemDropStatus: (
    order: Order,
    itemId: string,
    status: ProductionItemDropStatus,
  ) => void;
  onOpenDialog: (order: Order) => void;
  onOpenFullOrder: (order: Order) => void;
  onOrderStatusChange: (value: string | undefined, order: Order) => void;
  onPaymentStatusChange: (value: string | undefined, order: Order) => void;
  onPrintOrder: OrderPrintHandler;
  onPrintTypeGroupFulfilled: (
    order: Order,
    group: ProductionPrintTypeCompletionGroup,
  ) => void;
  onReportItemProblem: (order: Order, item: OrderItem) => void;
  onToggleSelected: (order: Order, selected?: boolean) => void;
  order: Order;
  orderWorkflowStatusesSettings:
    | Partial<OrderWorkflowStatusesSettings>
    | null
    | undefined;
  orderStatusOptions: SelectOption[];
  paymentStatusOptions: SelectOption[];
  printingMethodsSettings: Partial<PrintingMethodsSettings> | null | undefined;
  shippingMethodsSettings: ReturnType<
    typeof useConfigurationSettings
  >["shippingMethodsSettings"];
}

interface ProductionOrderMetaFooterProps {
  customerLabel: string;
  deadlineColor: ReturnType<typeof getDeadlineColorPalette>;
  deadlineDate: Date;
  deadlineLabel: string;
  footerGridRow: string;
  isExternalOrder: boolean;
  onPrintTypeGroupFulfilled: (
    group: ProductionPrintTypeCompletionGroup,
  ) => void;
  printingMethodsSettings: Partial<PrintingMethodsSettings> | null | undefined;
  printTypeCompletionGroups: readonly ProductionPrintTypeCompletionGroup[];
  unresolvedProblemCount: number;
}

function ProductionOrderMetaFooter({
  customerLabel,
  deadlineColor,
  deadlineDate,
  deadlineLabel,
  footerGridRow,
  isExternalOrder,
  onPrintTypeGroupFulfilled,
  printingMethodsSettings,
  printTypeCompletionGroups,
  unresolvedProblemCount,
}: ProductionOrderMetaFooterProps) {
  const { t } = useT(["orders", "allegro"]);
  const daysOverdue = Math.abs(Math.min(timeToDeadline(deadlineDate), 0));

  return (
    <Flex
      align="center"
      bg="bg.subtle"
      borderColor="border.subtle"
      borderRadius="xl"
      borderWidth="1px"
      columnGap={{ base: 2, md: 2.5 }}
      gridColumn={{ lg: "1 / -1" }}
      gridRow={{ lg: footerGridRow }}
      minW={0}
      px={2}
      py={1}
      rowGap={1.5}
      wrap="wrap"
    >
      <Text
        color="fg.muted"
        fontSize="xs"
        fontWeight="medium"
        lineHeight="1.15"
        maxW={{ base: "100%", md: "14rem" }}
        minW={0}
        truncate
      >
        {customerLabel}
      </Text>
      <PrintTypeCompletionBadges
        groups={printTypeCompletionGroups}
        maxLabelWidth="6.5rem"
        onMarkFulfilled={onPrintTypeGroupFulfilled}
        printingMethodsSettings={printingMethodsSettings}
      />
      {isExternalOrder && (
        <Badge colorPalette="orange" size="xs" variant="surface">
          {t("allegro.badge", {
            defaultValue: "Allegro",
          })}
        </Badge>
      )}
      {unresolvedProblemCount > 0 && (
        <Tooltip
          content={t("orders.productionView.metrics.blockedTooltip", {
            defaultValue: "Orders with unresolved item problems",
          })}
        >
          <Badge colorPalette="red" size="xs" variant="surface">
            <MaterialSymbol>error</MaterialSymbol>
            {unresolvedProblemCount}
          </Badge>
        </Tooltip>
      )}
      <Badge colorPalette={deadlineColor} px={2.5} size="xs" variant="surface">
        <MaterialSymbol>event</MaterialSymbol>
        {deadlineLabel}
      </Badge>
      {daysOverdue > 0 && (
        <Badge colorPalette="red" px={2.5} size="xs" variant="surface">
          {t("orders.productionView.overdueDays", {
            count: daysOverdue,
            defaultValue: "{{count}} days overdue",
          })}
        </Badge>
      )}
    </Flex>
  );
}

const ProductionOrderRow = memo(function ProductionOrderRow({
  activePrintingMethodIds,
  draggedItem,
  fileStatusOptions,
  getWarehouseName,
  hasFakturowniaKey,
  hasPolkurierKey,
  isElectronRuntime,
  isSelected,
  onAction,
  onDragItem,
  onDragOrder,
  onFilesStatusChange,
  onItemDropStatus,
  onOpenDialog,
  onOpenFullOrder,
  onOrderStatusChange,
  onPaymentStatusChange,
  onPrintOrder,
  onPrintTypeGroupFulfilled,
  onReportItemProblem,
  onToggleSelected,
  order,
  orderWorkflowStatusesSettings,
  orderStatusOptions,
  paymentStatusOptions,
  printingMethodsSettings,
  shippingMethodsSettings,
}: ProductionOrderRowProps) {
  const { t, i18n } = useT(["orders", "order", "translation", "allegro"]);
  const orderRowSpan = Math.max(order.items.length, 1);
  const customerLabel = getCustomerLabel(order) || "-";
  const unresolvedProblemCount = countUnresolvedItemProblems(order);
  const deadlineDate = new Date(order.deadlineString);
  const deadlineColor = getDeadlineColorPalette(deadlineDate);
  const deadlineLabel = formatCompactDate(
    order.deadline,
    i18n.resolvedLanguage ?? "pl",
  );
  const orderStatusLabel = getOrderWorkflowStatusLabel(
    order.status,
    orderWorkflowStatusesSettings,
    t,
    i18n.resolvedLanguage ?? i18n.language,
  );
  const isExternallyFulfilled = isAllegroFulfillmentManagedOrder(order);
  const canSendParcel =
    hasPolkurierKey &&
    !isExternallyFulfilled &&
    order.status !== "CANCELED" &&
    order.status !== "FULFILLED" &&
    isShippingWithCourier(
      order.shippingOption,
      true,
      shippingMethodsSettings,
    ) &&
    !order.tracking;
  const paymentDocumentMeta = getPaymentDocumentMeta(
    order.paymentType,
    !!order.billing,
  );
  const printTypeCompletionGroups = useMemo(
    () =>
      getProductionPrintTypeCompletionGroups(order, activePrintingMethodIds),
    [activePrintingMethodIds, order],
  );
  const router = useRouter();

  return (
    <MenuRoot positioning={{ placement: "right-start" }}>
      <MenuContextTrigger asChild>
        <Box
          borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
          className="group"
          cursor="grab"
          draggable
          mt={1}
          onDragEnd={() => onDragOrder(null)}
          onDragStart={(event) => {
            if (shouldIgnoreRowClick(event.target)) {
              event.preventDefault();
              onDragOrder(null);
              return;
            }

            onDragOrder(order);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-konfi-order",
              getOrderStorageKey(order),
            );
            setProductionDragPreview(event.dataTransfer, {
              badge: orderStatusLabel,
              meta: `${customerLabel} - ${deadlineLabel}`,
              title: `#${order.number}`,
            });
          }}
          onClick={(event) => {
            if (!shouldIgnoreRowClick(event.target)) {
              onOpenDialog(order);
            }
          }}
          onKeyDown={(event) => {
            if (
              (event.key === "Enter" || event.key === " ") &&
              !shouldIgnoreRowClick(event.target)
            ) {
              event.preventDefault();
              onOpenDialog(order);
            }
          }}
          role="button"
          tabIndex={0}
          _active={{
            cursor: "grabbing",
          }}
          _hover={{
            bg: "bg.subtle",
          }}
        >
          <Grid
            columnGap={2}
            gridTemplateColumns={{
              base: "1fr",
              lg: PRODUCTION_VIEW_COLUMN_TEMPLATE,
            }}
            px={{ base: 2, md: 3 }}
            py={1.5}
            rowGap={1.5}
          >
            {/* Order id - col 1, spans all item rows */}
            <VStack
              align="start"
              alignSelf="start"
              gap={0.75}
              gridColumn={{ lg: "1" }}
              gridRow={{
                lg: `1 / span ${orderRowSpan}`,
              }}
              minW={0}
              pt={0}
            >
              {/* Row 1: checkbox + order number */}
              <HStack gap={1.5} minW={0}>
                <Box
                  alignItems="center"
                  data-production-row-action
                  display="flex"
                  flexShrink={0}
                  onClick={stopProductionRowActionEvent}
                  onKeyDown={stopProductionRowActionEvent}
                  onPointerDown={stopProductionRowActionEvent}
                >
                  <Checkbox
                    aria-label={t("orders.productionView.bulk.selectOrder", {
                      defaultValue: "Select order",
                    })}
                    checked={isSelected}
                    onCheckedChange={({ checked }) =>
                      onToggleSelected(order, checked === true)
                    }
                    size="sm"
                  />
                </Box>
                <Text fontSize="sm" fontWeight="semibold" truncate>
                  #{order.number}
                </Text>
              </HStack>
            </VStack>
            {/* Per-item rows: details (col 2) + status (col 3) interleaved for mobile */}
            {order.items.map((item, itemIndex) => (
              <Fragment key={item.id}>
                <ProductionOrderItemDetailsCell
                  getWarehouseName={getWarehouseName}
                  item={item}
                  itemIndex={itemIndex}
                  onReportItemProblem={onReportItemProblem}
                  order={order}
                />
                <ProductionOrderItemStatusCell
                  draggedItem={draggedItem}
                  item={item}
                  itemIndex={itemIndex}
                  onDragItem={onDragItem}
                  onItemDropStatus={onItemDropStatus}
                  onReportItemProblem={onReportItemProblem}
                  order={order}
                />
              </Fragment>
            ))}
            <ProductionOrderMetaFooter
              customerLabel={customerLabel}
              deadlineColor={deadlineColor}
              deadlineDate={deadlineDate}
              deadlineLabel={deadlineLabel}
              footerGridRow={String(orderRowSpan + 1)}
              isExternalOrder={isAllegroExternalOrder(order)}
              onPrintTypeGroupFulfilled={(group) =>
                onPrintTypeGroupFulfilled(order, group)
              }
              printingMethodsSettings={printingMethodsSettings}
              printTypeCompletionGroups={printTypeCompletionGroups}
              unresolvedProblemCount={unresolvedProblemCount}
            />
            {/* Actions — col 4, spans all item rows */}
            <HStack
              alignSelf="start"
              data-production-row-action
              gap={1}
              gridColumn={{ lg: "4" }}
              gridRow={{
                lg: `1 / span ${orderRowSpan}`,
              }}
              justify={{ base: "start", lg: "end" }}
              minW={0}
              pt={0.5}
              wrap="wrap"
            >
              <Tooltip
                content={t("orders.productionView.openDialog", {
                  defaultValue: "Open production preview",
                })}
              >
                <IconButton
                  aria-label={t("orders.productionView.openDialog", {
                    defaultValue: "Open production preview",
                  })}
                  onClick={() => onOpenDialog(order)}
                  size="2xs"
                  variant="ghost"
                >
                  <MaterialSymbol>preview</MaterialSymbol>
                </IconButton>
              </Tooltip>
              <Tooltip
                content={t("orders.actions.preview", {
                  defaultValue: "Open details",
                })}
              >
                <IconButton
                  aria-label={t("orders.actions.preview", {
                    defaultValue: "Open details",
                  })}
                  onClick={() => onOpenFullOrder(order)}
                  size="2xs"
                  variant="ghost"
                >
                  <MaterialSymbol>open_in_new</MaterialSymbol>
                </IconButton>
              </Tooltip>
              <MenuRoot positioning={{ placement: "bottom-end" }}>
                <MenuTrigger asChild>
                  <IconButton
                    aria-label={t("orders.actions.heading", {
                      defaultValue: "Actions",
                    })}
                    size="2xs"
                    variant="ghost"
                  >
                    <MaterialSymbol>more_vert</MaterialSymbol>
                  </IconButton>
                </MenuTrigger>
                <ProductionOrderMenuContent
                  canSendParcel={canSendParcel}
                  fileStatusOptions={fileStatusOptions}
                  hasFakturowniaKey={hasFakturowniaKey}
                  hasPolkurierKey={hasPolkurierKey}
                  isElectronRuntime={isElectronRuntime}
                  onAction={onAction}
                  onFilesStatusChange={onFilesStatusChange}
                  onOpenDialog={onOpenDialog}
                  onOpenFullOrder={onOpenFullOrder}
                  onOrderStatusChange={onOrderStatusChange}
                  onPaymentStatusChange={onPaymentStatusChange}
                  onPrintOrder={onPrintOrder}
                  order={order}
                  orderStatusOptions={orderStatusOptions}
                  paymentDocumentMeta={paymentDocumentMeta}
                  paymentStatusOptions={paymentStatusOptions}
                  routerPush={(href) => router.push(href as Route)}
                />
              </MenuRoot>
            </HStack>
          </Grid>
        </Box>
      </MenuContextTrigger>
      <ProductionOrderMenuContent
        canSendParcel={canSendParcel}
        fileStatusOptions={fileStatusOptions}
        hasFakturowniaKey={hasFakturowniaKey}
        hasPolkurierKey={hasPolkurierKey}
        isElectronRuntime={isElectronRuntime}
        onAction={onAction}
        onFilesStatusChange={onFilesStatusChange}
        onOpenDialog={onOpenDialog}
        onOpenFullOrder={onOpenFullOrder}
        onOrderStatusChange={onOrderStatusChange}
        onPaymentStatusChange={onPaymentStatusChange}
        onPrintOrder={onPrintOrder}
        order={order}
        orderStatusOptions={orderStatusOptions}
        paymentDocumentMeta={paymentDocumentMeta}
        paymentStatusOptions={paymentStatusOptions}
        routerPush={(href) => router.push(href as Route)}
      />
    </MenuRoot>
  );
});

interface ProductionMaterialItemRowProps {
  activePrintingMethodIds: PrintingMethodId[];
  draggedItem: DraggedItem | null;
  fileStatusOptions: SelectOption[];
  getWarehouseName: (warehouseId: string) => string;
  hasFakturowniaKey: boolean;
  hasPolkurierKey: boolean;
  isElectronRuntime: boolean;
  isSelected: boolean;
  item: OrderItem;
  onAction: ProductionStatusSectionProps["onAction"];
  onDragItem: (item: DraggedItem | null) => void;
  onDragOrder: (order: Order | null) => void;
  onFilesStatusChange: (value: string | undefined, order: Order) => void;
  onItemDropStatus: (
    order: Order,
    itemId: string,
    status: ProductionItemDropStatus,
  ) => void;
  onOpenDialog: (order: Order) => void;
  onOpenFullOrder: (order: Order) => void;
  onOrderStatusChange: (value: string | undefined, order: Order) => void;
  onPaymentStatusChange: (value: string | undefined, order: Order) => void;
  onPrintOrder: OrderPrintHandler;
  onPrintTypeGroupFulfilled: (
    order: Order,
    group: ProductionPrintTypeCompletionGroup,
  ) => void;
  onReportItemProblem: (order: Order, item: OrderItem) => void;
  onToggleSelected: (order: Order, selected?: boolean) => void;
  order: Order;
  orderWorkflowStatusesSettings:
    | Partial<OrderWorkflowStatusesSettings>
    | null
    | undefined;
  orderStatusOptions: SelectOption[];
  paymentStatusOptions: SelectOption[];
  printingMethodsSettings: Partial<PrintingMethodsSettings> | null | undefined;
  shippingMethodsSettings: ReturnType<
    typeof useConfigurationSettings
  >["shippingMethodsSettings"];
}

const ProductionMaterialItemRow = memo(function ProductionMaterialItemRow({
  activePrintingMethodIds,
  draggedItem,
  fileStatusOptions,
  getWarehouseName,
  hasFakturowniaKey,
  hasPolkurierKey,
  isElectronRuntime,
  isSelected,
  item,
  onAction,
  onDragItem,
  onDragOrder,
  onFilesStatusChange,
  onItemDropStatus,
  onOpenDialog,
  onOpenFullOrder,
  onOrderStatusChange,
  onPaymentStatusChange,
  onPrintOrder,
  onPrintTypeGroupFulfilled,
  onReportItemProblem,
  onToggleSelected,
  order,
  orderWorkflowStatusesSettings,
  orderStatusOptions,
  paymentStatusOptions,
  printingMethodsSettings,
  shippingMethodsSettings,
}: ProductionMaterialItemRowProps) {
  const { t, i18n } = useT(["orders", "order", "translation", "allegro"]);
  const customerLabel = getCustomerLabel(order) || "-";
  const unresolvedProblemCount = countUnresolvedItemProblems(order);
  const deadlineDate = new Date(order.deadlineString);
  const deadlineColor = getDeadlineColorPalette(deadlineDate);
  const deadlineLabel = formatCompactDate(
    order.deadline,
    i18n.resolvedLanguage ?? "pl",
  );
  const orderStatusLabel = getOrderWorkflowStatusLabel(
    order.status,
    orderWorkflowStatusesSettings,
    t,
    i18n.resolvedLanguage ?? i18n.language,
  );
  const isExternallyFulfilled = isAllegroFulfillmentManagedOrder(order);
  const canSendParcel =
    hasPolkurierKey &&
    !isExternallyFulfilled &&
    order.status !== "CANCELED" &&
    order.status !== "FULFILLED" &&
    isShippingWithCourier(
      order.shippingOption,
      true,
      shippingMethodsSettings,
    ) &&
    !order.tracking;
  const paymentDocumentMeta = getPaymentDocumentMeta(
    order.paymentType,
    !!order.billing,
  );
  const router = useRouter();
  const printTypeCompletionGroups = useMemo(
    () =>
      getProductionPrintTypeCompletionGroups(
        {
          ...order,
          items: [item],
        },
        activePrintingMethodIds,
      ),
    [activePrintingMethodIds, item, order],
  );

  return (
    <MenuRoot positioning={{ placement: "right-start" }}>
      <MenuContextTrigger asChild>
        <Box
          borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
          className="group"
          cursor="grab"
          draggable
          mt={1}
          onDragEnd={() => onDragOrder(null)}
          onDragStart={(event) => {
            if (shouldIgnoreRowClick(event.target)) {
              event.preventDefault();
              onDragOrder(null);
              return;
            }

            onDragOrder(order);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-konfi-order",
              getOrderStorageKey(order),
            );
            setProductionDragPreview(event.dataTransfer, {
              badge: orderStatusLabel,
              meta: `${customerLabel} - ${deadlineLabel}`,
              title: `#${order.number}`,
            });
          }}
          onClick={(event) => {
            if (!shouldIgnoreRowClick(event.target)) {
              onOpenDialog(order);
            }
          }}
          onKeyDown={(event) => {
            if (
              (event.key === "Enter" || event.key === " ") &&
              !shouldIgnoreRowClick(event.target)
            ) {
              event.preventDefault();
              onOpenDialog(order);
            }
          }}
          role="button"
          tabIndex={0}
          _active={{
            cursor: "grabbing",
          }}
          _hover={{
            bg: "bg.subtle",
          }}
        >
          <Grid
            columnGap={2}
            gridTemplateColumns={{
              base: "1fr",
              lg: PRODUCTION_VIEW_COLUMN_TEMPLATE,
            }}
            px={{ base: 2, md: 3 }}
            py={1.5}
            rowGap={1.5}
          >
            <VStack
              align="start"
              alignSelf="start"
              gap={0.75}
              gridColumn={{ lg: "1" }}
              minW={0}
              pt={0}
            >
              <HStack gap={1.5} minW={0}>
                <Box
                  alignItems="center"
                  data-production-row-action
                  display="flex"
                  flexShrink={0}
                  onClick={stopProductionRowActionEvent}
                  onKeyDown={stopProductionRowActionEvent}
                  onPointerDown={stopProductionRowActionEvent}
                >
                  <Checkbox
                    aria-label={t("orders.productionView.bulk.selectOrder", {
                      defaultValue: "Select order",
                    })}
                    checked={isSelected}
                    onCheckedChange={({ checked }) =>
                      onToggleSelected(order, checked === true)
                    }
                    size="sm"
                  />
                </Box>
                <Text fontSize="sm" fontWeight="semibold" truncate>
                  #{order.number}
                </Text>
              </HStack>
            </VStack>
            <ProductionOrderItemDetailsCell
              getWarehouseName={getWarehouseName}
              item={item}
              itemIndex={0}
              onReportItemProblem={onReportItemProblem}
              order={order}
            />
            <ProductionOrderItemStatusCell
              draggedItem={draggedItem}
              item={item}
              itemIndex={0}
              onDragItem={onDragItem}
              onItemDropStatus={onItemDropStatus}
              onReportItemProblem={onReportItemProblem}
              order={order}
            />
            <ProductionOrderMetaFooter
              customerLabel={customerLabel}
              deadlineColor={deadlineColor}
              deadlineDate={deadlineDate}
              deadlineLabel={deadlineLabel}
              footerGridRow="2"
              isExternalOrder={isAllegroExternalOrder(order)}
              onPrintTypeGroupFulfilled={(group) =>
                onPrintTypeGroupFulfilled(order, group)
              }
              printingMethodsSettings={printingMethodsSettings}
              printTypeCompletionGroups={printTypeCompletionGroups}
              unresolvedProblemCount={unresolvedProblemCount}
            />
            <HStack
              alignSelf="start"
              data-production-row-action
              gap={1}
              gridColumn={{ lg: "4" }}
              gridRow={{ lg: "1" }}
              justify={{ base: "start", lg: "end" }}
              minW={0}
              pt={0.5}
              wrap="wrap"
            >
              <Tooltip
                content={t("orders.productionView.openDialog", {
                  defaultValue: "Open production preview",
                })}
              >
                <IconButton
                  aria-label={t("orders.productionView.openDialog", {
                    defaultValue: "Open production preview",
                  })}
                  onClick={() => onOpenDialog(order)}
                  size="2xs"
                  variant="ghost"
                >
                  <MaterialSymbol>preview</MaterialSymbol>
                </IconButton>
              </Tooltip>
              <Tooltip
                content={t("orders.actions.preview", {
                  defaultValue: "Open details",
                })}
              >
                <IconButton
                  aria-label={t("orders.actions.preview", {
                    defaultValue: "Open details",
                  })}
                  onClick={() => onOpenFullOrder(order)}
                  size="2xs"
                  variant="ghost"
                >
                  <MaterialSymbol>open_in_new</MaterialSymbol>
                </IconButton>
              </Tooltip>
              <MenuRoot positioning={{ placement: "bottom-end" }}>
                <MenuTrigger asChild>
                  <IconButton
                    aria-label={t("orders.actions.heading", {
                      defaultValue: "Actions",
                    })}
                    size="2xs"
                    variant="ghost"
                  >
                    <MaterialSymbol>more_vert</MaterialSymbol>
                  </IconButton>
                </MenuTrigger>
                <ProductionOrderMenuContent
                  canSendParcel={canSendParcel}
                  fileStatusOptions={fileStatusOptions}
                  hasFakturowniaKey={hasFakturowniaKey}
                  hasPolkurierKey={hasPolkurierKey}
                  isElectronRuntime={isElectronRuntime}
                  onAction={onAction}
                  onFilesStatusChange={onFilesStatusChange}
                  onOpenDialog={onOpenDialog}
                  onOpenFullOrder={onOpenFullOrder}
                  onOrderStatusChange={onOrderStatusChange}
                  onPaymentStatusChange={onPaymentStatusChange}
                  onPrintOrder={onPrintOrder}
                  order={order}
                  orderStatusOptions={orderStatusOptions}
                  paymentDocumentMeta={paymentDocumentMeta}
                  paymentStatusOptions={paymentStatusOptions}
                  routerPush={(href) => router.push(href as Route)}
                />
              </MenuRoot>
            </HStack>
          </Grid>
        </Box>
      </MenuContextTrigger>
      <ProductionOrderMenuContent
        canSendParcel={canSendParcel}
        fileStatusOptions={fileStatusOptions}
        hasFakturowniaKey={hasFakturowniaKey}
        hasPolkurierKey={hasPolkurierKey}
        isElectronRuntime={isElectronRuntime}
        onAction={onAction}
        onFilesStatusChange={onFilesStatusChange}
        onOpenDialog={onOpenDialog}
        onOpenFullOrder={onOpenFullOrder}
        onOrderStatusChange={onOrderStatusChange}
        onPaymentStatusChange={onPaymentStatusChange}
        onPrintOrder={onPrintOrder}
        order={order}
        orderStatusOptions={orderStatusOptions}
        paymentDocumentMeta={paymentDocumentMeta}
        paymentStatusOptions={paymentStatusOptions}
        routerPush={(href) => router.push(href as Route)}
      />
    </MenuRoot>
  );
});

interface ProductionOrderItemRowProps {
  draggedItem: DraggedItem | null;
  item: OrderItem;
  itemIndex: number;
  onDragItem: (item: DraggedItem | null) => void;
  onItemDropStatus: (
    order: Order,
    itemId: string,
    status: ProductionItemDropStatus,
  ) => void;
  onReportItemProblem: (order: Order, item: OrderItem) => void;
  order: Order;
}

interface ProductionOrderItemDetailsCellProps {
  getWarehouseName: (warehouseId: string) => string;
  item: OrderItem;
  itemIndex: number;
  onReportItemProblem: (order: Order, item: OrderItem) => void;
  order: Order;
}

const ITEM_DROP_STATUSES: ProductionItemDropStatus[] = [
  "notStarted",
  "inProgress",
  "fulfilled",
  "pickedUp",
  "delivered",
];

type ProductionItemStatusColorPalette =
  | "blue"
  | "gray"
  | "orange"
  | "success"
  | "teal";

type ProductionItemStatusIcon =
  | "circle"
  | "local_shipping"
  | "manufacturing"
  | "shopping_bag"
  | "task_alt";

function getProductionItemStatusColorPalette(
  status: ProductionItemDropStatus,
): ProductionItemStatusColorPalette {
  switch (status) {
    case "inProgress":
      return "blue";
    case "fulfilled":
      return "success";
    case "pickedUp":
      return "orange";
    case "delivered":
      return "teal";
    case "notStarted":
    default:
      return "gray";
  }
}

function getProductionItemStatusIcon(
  status: ProductionItemDropStatus,
): ProductionItemStatusIcon {
  switch (status) {
    case "inProgress":
      return "manufacturing";
    case "fulfilled":
      return "task_alt";
    case "pickedUp":
      return "shopping_bag";
    case "delivered":
      return "local_shipping";
    case "notStarted":
    default:
      return "circle";
  }
}

function getProductionItemStatusDefaultLabel(status: ProductionItemDropStatus) {
  switch (status) {
    case "inProgress":
      return "In progress";
    case "fulfilled":
      return "Fulfilled";
    case "pickedUp":
      return "Picked up";
    case "delivered":
      return "Delivered";
    case "notStarted":
    default:
      return "Not started";
  }
}

function setProductionDragPreview(
  dataTransfer: DataTransfer,
  {
    badge,
    meta,
    title,
  }: {
    badge?: string;
    meta?: string;
    title: string;
  },
) {
  if (typeof document === "undefined") {
    return;
  }

  const previewBackground = "var(--chakra-colors-bg-panel)";
  const subtleBackground = "var(--chakra-colors-bg-muted)";
  const borderColor = "var(--chakra-colors-border)";
  const foregroundColor = "var(--chakra-colors-fg)";
  const mutedColor = "var(--chakra-colors-fg-muted)";

  const preview = document.createElement("div");
  preview.style.alignItems = "center";
  preview.style.background = previewBackground;
  preview.style.border = `1px solid ${borderColor}`;
  preview.style.borderRadius = "18px";
  preview.style.boxShadow = "var(--chakra-shadows-2xl)";
  preview.style.display = "flex";
  preview.style.gap = "10px";
  preview.style.left = "16px";
  preview.style.maxWidth = "360px";
  preview.style.minWidth = "220px";
  preview.style.padding = "10px 12px";
  preview.style.pointerEvents = "none";
  preview.style.position = "fixed";
  preview.style.top = "16px";
  preview.style.transform = "translate3d(0, 0, 0)";
  preview.style.zIndex = "2147483647";

  const markerElement = document.createElement("div");
  markerElement.style.alignItems = "center";
  markerElement.style.background = subtleBackground;
  markerElement.style.borderRadius = "999px";
  markerElement.style.display = "grid";
  markerElement.style.flex = "0 0 auto";
  markerElement.style.gap = "3px";
  markerElement.style.gridTemplateColumns = "repeat(2, 4px)";
  markerElement.style.height = "34px";
  markerElement.style.justifyContent = "center";
  markerElement.style.placeContent = "center";
  markerElement.style.width = "34px";

  for (let index = 0; index < 6; index += 1) {
    const dot = document.createElement("span");
    dot.style.background = mutedColor;
    dot.style.borderRadius = "999px";
    dot.style.display = "block";
    dot.style.height = "4px";
    dot.style.width = "4px";
    markerElement.append(dot);
  }

  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gap = "2px";
  content.style.minWidth = "0";

  const titleElement = document.createElement("div");
  titleElement.textContent = title;
  titleElement.style.color = foregroundColor;
  titleElement.style.fontSize = "13px";
  titleElement.style.fontWeight = "700";
  titleElement.style.lineHeight = "1.25";
  titleElement.style.overflow = "hidden";
  titleElement.style.textOverflow = "ellipsis";
  titleElement.style.whiteSpace = "nowrap";

  content.append(titleElement);

  if (meta) {
    const metaElement = document.createElement("div");
    metaElement.textContent = meta;
    metaElement.style.color = mutedColor;
    metaElement.style.fontSize = "12px";
    metaElement.style.lineHeight = "1.25";
    metaElement.style.overflow = "hidden";
    metaElement.style.textOverflow = "ellipsis";
    metaElement.style.whiteSpace = "nowrap";
    content.append(metaElement);
  }

  preview.append(markerElement, content);

  if (badge) {
    const badgeElement = document.createElement("div");
    badgeElement.textContent = badge;
    badgeElement.style.background = subtleBackground;
    badgeElement.style.border = `1px solid ${borderColor}`;
    badgeElement.style.borderRadius = "999px";
    badgeElement.style.color = mutedColor;
    badgeElement.style.flex = "0 0 auto";
    badgeElement.style.fontSize = "11px";
    badgeElement.style.fontWeight = "600";
    badgeElement.style.lineHeight = "1";
    badgeElement.style.maxWidth = "120px";
    badgeElement.style.overflow = "hidden";
    badgeElement.style.padding = "5px 8px";
    badgeElement.style.textOverflow = "ellipsis";
    badgeElement.style.whiteSpace = "nowrap";
    preview.append(badgeElement);
  }

  document.body.append(preview);
  dataTransfer.setDragImage(preview, 24, 18);
  window.setTimeout(() => {
    preview.remove();
  }, 0);
}

function ProductionOrderItemDetailsCell({
  getWarehouseName,
  item,
  itemIndex,
  onReportItemProblem,
  order,
}: ProductionOrderItemDetailsCellProps) {
  const { t, i18n } = useT(["orders", "order", "translation"]);
  const locale = i18n.resolvedLanguage ?? "pl";
  const productName = getProductionOrderItemDisplayName(item);
  const originalProductName = getProductionOrderItemOriginalProductName(item);
  const unitLabel = t(`Unit.${item.unit}`, {
    defaultValue: item.unit,
  });
  const displayQuantity = getProductionOrderItemDisplayQuantity(item);
  const totalVolume = getProductionOrderItemTotalVolume(item);
  const warehouseLabel = item.warehouseId
    ? getWarehouseName(item.warehouseId)
    : null;
  const configurationParts = useMemo(
    () => getProductionOrderItemConfigurationParts(item.description),
    [item.description],
  );
  const visibleConfigurationParts = configurationParts;
  const hasVolume =
    typeof item.volume === "number" &&
    Number.isFinite(item.volume) &&
    item.volume > 0;
  const hasFormat = item.customFormat && item.width && item.height;
  const itemProblem = order.problemItems?.find(
    (problem) => problem.itemId === item.id,
  );
  const hasUnresolvedProblem = Boolean(itemProblem && !itemProblem.resolved);
  const itemProblemActionLabel = itemProblem
    ? t("order.editItemProblem", {
        defaultValue: "Edit Problem with Position",
      })
    : t("order.reportItemProblem", {
        defaultValue: "Report Problem with Position",
      });
  const thumbnailUrl = buildProductCdnThumbnail({
    channelId: item.product?.channelId,
    choose: "first",
    fallback: "",
    imageFiles: item.product?.spec?.images ?? [],
    productId: item.product?.id,
  });

  return (
    <Box
      bg="bg"
      borderColor="border.subtle"
      borderRadius={PRODUCTION_VIEW_ROW_RADIUS}
      borderWidth="1px"
      gridColumn={{ lg: "2" }}
      gridRow={{ lg: String(itemIndex + 1) }}
      overflow="hidden"
      position="relative"
      px={2.5}
      py={1.5}
      _groupHover={{ bg: { base: "bg.muted", _dark: "whiteAlpha.100" } }}
    >
      {thumbnailUrl ? (
        <Box
          aria-hidden="true"
          borderRadius="inherit"
          bottom={0}
          left={0}
          maskImage="linear-gradient(to right, rgb(0 0 0) 0%, rgb(0 0 0 / 0.5) 55%, transparent 100%)"
          overflow="hidden"
          pointerEvents="none"
          position="absolute"
          top={0}
          w="240px"
          zIndex={0}
        >
          <img
            alt=""
            decoding="async"
            loading="lazy"
            src={`${thumbnailUrl}?auto=format,compress&fit=crop&w=400`}
            style={{
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              opacity: 0.14,
              width: "100%",
            }}
          />
        </Box>
      ) : null}
      <VStack align="stretch" gap={1} minW={0} position="relative" zIndex={1}>
        <HStack gap={1} minW={0} wrap="wrap">
          <Tooltip
            content={originalProductName}
            disabled={!originalProductName}
            positioning={{
              offset: { crossAxis: 0, mainAxis: 4 },
              placement: "top-start",
            }}
          >
            <Text
              color="fg"
              fontSize={{
                base: "sm",
                md: "md",
              }}
              fontWeight="semibold"
              lineHeight="1.2"
              overflowWrap="anywhere"
            >
              {productName}
            </Text>
          </Tooltip>
          {warehouseLabel ? (
            <Badge size="xs" variant="surface" colorPalette="gray">
              <MaterialSymbol>warehouse</MaterialSymbol>
              <Text as="span" maxW="150px" truncate>
                {warehouseLabel}
              </Text>
            </Badge>
          ) : null}
          <Badge size="xs" variant="surface">
            <MaterialSymbol>inventory_2</MaterialSymbol>
            {t("orders.productionView.itemDetails.displayQuantity", {
              defaultValue: "Produced",
            })}
            {": "}
            {formatProductionNumber(displayQuantity, locale)} {unitLabel}
          </Badge>
          <Badge size="xs" variant="outline">
            {t("orders.productionView.itemDetails.quantity", {
              defaultValue: "Qty",
            })}
            {": "}
            {formatProductionNumber(item.quantity, locale)}
          </Badge>
          {itemProblem ? (
            <Badge
              as="button"
              aria-label={itemProblemActionLabel}
              colorPalette={hasUnresolvedProblem ? "red" : "gray"}
              cursor="pointer"
              data-production-row-action
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onReportItemProblem(order, item);
              }}
              size="xs"
              variant={hasUnresolvedProblem ? "surface" : "subtle"}
            >
              <MaterialSymbol>
                {hasUnresolvedProblem ? "error" : "check_circle"}
              </MaterialSymbol>
              <Text maxW="200px" truncate>
                {itemProblem.description ||
                  t("order.itemProblem", { defaultValue: "Problem" })}
              </Text>
            </Badge>
          ) : null}
          {hasVolume ? (
            <Badge size="xs" variant="outline">
              {t("orders.productionView.itemDetails.volume", {
                defaultValue: "Volume",
              })}
              {": "}
              {formatProductionNumber(item.volume ?? 0, locale)}
            </Badge>
          ) : null}
          {totalVolume ? (
            <Badge size="xs" variant="surface">
              {t("orders.productionView.itemDetails.total", {
                defaultValue: "Total",
              })}
              {": "}
              {formatProductionNumber(totalVolume, locale)} {unitLabel}
            </Badge>
          ) : null}
          {item.pageCount ? (
            <Badge size="xs" variant="surface">
              {t("orders.productionView.itemDetails.pages", {
                defaultValue: "Pages",
              })}
              {": "}
              {formatProductionNumber(item.pageCount, locale)}
            </Badge>
          ) : null}
          {hasFormat ? (
            <Badge size="xs" variant="surface">
              <MaterialSymbol>straighten</MaterialSymbol>
              {formatProductionNumber(item.width ?? 0, locale)}
              {" x "}
              {formatProductionNumber(item.height ?? 0, locale)}
              {" mm"}
            </Badge>
          ) : null}
          {item.customSizes && item.customSizes.length > 0 ? (
            <Badge size="xs" variant="surface">
              {t("orders.productionView.itemDetails.customSizes", {
                count: item.customSizes.length,
                defaultValue: "{{count}} sizes",
              })}
            </Badge>
          ) : null}
        </HStack>
        {visibleConfigurationParts.length > 0 ? (
          <Flex gap={1.5} minW={0} wrap="wrap">
            {visibleConfigurationParts.map((part, index) => (
              <Box
                key={`${part.name ?? "value"}-${part.value}-${index}`}
                bg="bg.subtle"
                borderColor="border.subtle"
                borderRadius="lg"
                borderWidth="1px"
                maxW={{
                  base: "100%",
                  md: "360px",
                }}
                px={2}
                py={1}
              >
                <HStack align="flex-start" gap={1.5} minW={0}>
                  {part.name ? (
                    <>
                      <Text
                        as="span"
                        color="fg.muted"
                        flexShrink={0}
                        fontSize="xs"
                        fontWeight="medium"
                        lineHeight="1.25"
                      >
                        {part.name}
                      </Text>
                      <Text
                        as="span"
                        color="fg.muted"
                        flexShrink={0}
                        fontSize="xs"
                        lineHeight="1.25"
                      >
                        /
                      </Text>
                    </>
                  ) : null}
                  <Text
                    as="span"
                    fontSize="xs"
                    fontWeight="semibold"
                    lineHeight="1.25"
                    minW={0}
                    overflowWrap="anywhere"
                  >
                    {part.value}
                  </Text>
                </HStack>
              </Box>
            ))}
          </Flex>
        ) : null}
      </VStack>
    </Box>
  );
}

function ProductionOrderItemStatusCell({
  draggedItem,
  item,
  itemIndex,
  onDragItem,
  onItemDropStatus,
  onReportItemProblem,
  order,
}: ProductionOrderItemRowProps) {
  const { t } = useT(["orders", "order", "translation"]);
  const currentStatus = getOrderItemProductionStatus(order, item.id);
  const currentStatusColorPalette =
    getProductionItemStatusColorPalette(currentStatus);
  const currentStatusLabel = t(
    `orders.productionView.itemStatus.${currentStatus}`,
    {
      defaultValue: getProductionItemStatusDefaultLabel(currentStatus),
    },
  );
  const canDrop =
    draggedItem?.order.id === order.id && draggedItem.itemId === item.id;
  const itemProblem = order.problemItems?.find(
    (problem) => problem.itemId === item.id,
  );
  const hasUnresolvedProblem = Boolean(itemProblem && !itemProblem.resolved);
  const itemProblemActionLabel = itemProblem
    ? t("order.editItemProblem", {
        defaultValue: "Edit Problem with Position",
      })
    : t("order.reportItemProblem", {
        defaultValue: "Report Problem with Position",
      });
  const statusDropTarget =
    currentStatus === "notStarted" ? "inProgress" : currentStatus;
  const changeStatusLabel = t("orders.productionView.itemStatus.change", {
    defaultValue: "Change item status",
  });
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);

  return (
    <Box
      alignSelf="start"
      gridColumn={{ lg: "3" }}
      gridRow={{ lg: String(itemIndex + 1) }}
      maxW="100%"
      minH="34px"
      minW={0}
      py={1.5}
    >
      <HStack
        align="flex-start"
        data-production-row-action
        gap={1}
        maxW="100%"
        minW={0}
        position="relative"
        wrap="nowrap"
        w="full"
        zIndex={1}
      >
        <Tooltip content={itemProblemActionLabel}>
          <IconButton
            aria-label={itemProblemActionLabel}
            colorPalette={hasUnresolvedProblem ? "red" : "gray"}
            onClick={() => onReportItemProblem(order, item)}
            size="2xs"
            variant="ghost"
          >
            <MaterialSymbol>error</MaterialSymbol>
          </IconButton>
        </Tooltip>
        <Popover.Root
          open={statusPopoverOpen}
          positioning={{
            flip: false,
            gutter: 4,
            hideWhenDetached: true,
            placement: "bottom-end",
            strategy: "fixed",
          }}
          onOpenChange={({ open }) => setStatusPopoverOpen(open)}
        >
          <Popover.Trigger asChild>
            <Button
              aria-label={changeStatusLabel}
              colorPalette={currentStatusColorPalette}
              flex="1"
              justifyContent="space-between"
              maxW="100%"
              minW={0}
              outline={canDrop ? "1px dashed" : undefined}
              outlineColor={canDrop ? "colorPalette.solid" : undefined}
              size="xs"
              variant="subtle"
              onClick={(event) => event.stopPropagation()}
              onDragOver={(event) => {
                if (canDrop) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (canDrop) {
                  onItemDropStatus(order, item.id, statusDropTarget);
                }
                onDragItem(null);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <HStack as="span" gap={1} minW={0}>
                <MaterialSymbol>
                  {getProductionItemStatusIcon(currentStatus)}
                </MaterialSymbol>
                <Text as="span" minW={0} truncate>
                  {currentStatusLabel}
                </Text>
              </HStack>
              <MaterialSymbol>expand_more</MaterialSymbol>
            </Button>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content
                data-production-row-action
                bg="bg.panel"
                borderColor="border.subtle"
                borderWidth="1px"
                maxW="13rem"
                minW="13rem"
                overflow="hidden"
                p={1}
                rounded="xl"
                shadow="xl"
                zIndex="popover"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <VStack align="stretch" gap={1}>
                  {ITEM_DROP_STATUSES.map((status) => {
                    const statusLabel = t(
                      `orders.productionView.itemStatus.${status}`,
                      {
                        defaultValue:
                          getProductionItemStatusDefaultLabel(status),
                      },
                    );
                    const active = currentStatus === status;

                    return (
                      <Button
                        key={status}
                        aria-current={active ? "true" : undefined}
                        colorPalette={getProductionItemStatusColorPalette(
                          status,
                        )}
                        justifyContent="flex-start"
                        size="xs"
                        variant={active ? "subtle" : "ghost"}
                        onClick={() => {
                          if (status !== currentStatus) {
                            onItemDropStatus(order, item.id, status);
                          }
                          setStatusPopoverOpen(false);
                        }}
                      >
                        <Badge
                          colorPalette={getProductionItemStatusColorPalette(
                            status,
                          )}
                          size="xs"
                          variant="surface"
                        >
                          <MaterialSymbol>
                            {getProductionItemStatusIcon(status)}
                          </MaterialSymbol>
                        </Badge>
                        <Text as="span" minW={0} truncate>
                          {statusLabel}
                        </Text>
                      </Button>
                    );
                  })}
                </VStack>
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
      </HStack>
    </Box>
  );
}

export default ProductionOrdersView;
