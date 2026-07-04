"use client";

import { getAdminConfigFlags } from "@/actions";
import { getInvoices } from "@/actions/fakturownia";
import { sendOrderStatusEmail } from "@/actions/order-status-email";
import { updateOrderStatusField } from "@/actions/order-updates";
import Drawer from "@/components/Drawer";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import NoteForm from "@/components/notes/NoteForm";
import { CarriedOutByCell } from "@/components/orders/CarriedOutBy";
import ComplaintForm from "@/components/orders/ComplaintForm";
import { ItemProblemDialog } from "@/components/orders/ItemProblemDialog";
import { OrderActions } from "@/components/orders/OrderActions";
import OrderItemsFilesSection from "@/components/orders/OrderItemsFilesSection";
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
import { StatusSelect } from "@/components/orders/status-select";
import { StatusActorSelectionDialog } from "@/components/orders/StatusActorSelectionDialog";
import { useOrderFolderSettings } from "@/hooks/useOrderFolderSettings";
import { useT } from "@/i18n/client";
import { useTenantContext } from "@/context/tenant";
import { firestore, storage } from "@/lib/firebase/clientApp";
import { list as listStorage } from "@/lib/firebase/storage";
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
  getOrderItemStatusChangeForDrop,
  getProductionPrintTypeCompletionGroups,
  type ProductionPrintTypeCompletionGroup,
} from "@/lib/orders/production-view";
import { PrintTypeCompletionBadges } from "@/components/orders/PrintTypeCompletionBadges";
import {
  ActionBar,
  Badge,
  Box,
  Button,
  chakra,
  Circle,
  Dialog,
  Flex,
  Float,
  HStack,
  IconButton,
  Input,
  Portal,
  Show,
  Skeleton,
  Spacer,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { AlertDialog } from "@konfi/components/shared/AlertDialog";
import { ButtonLink } from "@konfi/components/shared/ButtonLink";
import { CustomHeading } from "@konfi/components/shared/CustomHeading";
import { Empty } from "@konfi/components/shared/Empty";
import { FromToDateInput } from "@konfi/components/shared/FromToDateInput";
import { IconButtonLink } from "@konfi/components/shared/IconButtonLink";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { PrintingMethodsGroup } from "@konfi/components/shared/PrintingMethodsGroup";
import { RefreshButton } from "@konfi/components/shared/RefreshButton";
import { DataTable, Rules } from "@konfi/components/shared/Table";
import { Checkbox } from "@konfi/components/ui/checkbox";
import {
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@konfi/components/ui/menu";
import { SearchInput } from "@konfi/components/shared/SearchInput";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@konfi/components/ui/select";
import { Switch } from "@konfi/components/ui/switch";
import { toaster } from "@konfi/components/ui/toaster";
import { Tooltip } from "@konfi/components/ui/tooltip";
import {
  db,
  fetchOrderItemFiles,
  getComplaints,
  getNotes,
  tenantStoragePaths,
  type TenantContext,
  update,
} from "@konfi/firebase";
import type { OrdersSearchField } from "@konfi/meilisearch";
import {
  ActivityStatus,
  type Channel,
  type Customer,
  isAllegroExternalOrder,
  isNestedCustomer,
  ItemProblem,
  ListResults,
  NestedMember,
  NoteEntityType,
  Order,
  OrderFilesStatus,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  PaymentStatusAsOptions,
  Rule,
  RulePreset,
  type SearchSelectOption,
  SelectOption,
  ShippingOptions,
} from "@konfi/types";
import {
  ADMIN_CONFIG_WAREHOUSE_FULFILLMENT_REQUESTS,
  ADMIN_ORDERS_COMPLAINTS,
  ADMIN_ORDERS_CREATE,
} from "@konfi/utils/routes";
import { formatPrice, getDeadlineColorPalette } from "@konfi/utils/formatters";
import { compileOrderRulePresets } from "@konfi/utils/order-rule-presets";
import { applyOrderItemStatusChange } from "@konfi/utils/order-item-status";
import {
  getOrderFileStatusColorPalette,
  getOrderFileStatusLabel,
  getOrderWorkflowStatusColorPalette,
  getOrderWorkflowStatusLabel,
} from "@konfi/utils/order-workflow-statuses";
import {
  getPaymentMethodColorPalette,
  getPaymentMethodLabel,
} from "@konfi/utils/payment-methods";
import { getOrderPaymentStatusColorPalette } from "@konfi/utils/getters";
import { getStatusColor } from "@konfi/utils/status-color";
import {
  getEnabledPrintingMethodDefinitions,
  getPrintingMethodLabel,
} from "@konfi/utils/printing-methods";
import { initialRulesQueries, initialValues } from "@konfi/utils/reducers";
import { isElectron } from "@konfi/utils/browser-platform";
import {
  ColumnDef,
  createColumnHelper,
  Row,
  RowSelectionState,
} from "@tanstack/react-table";
import { useChannels } from "context/channels";
import {
  useConfigurationMembers,
  useConfigurationSettings,
  useConfigurationWarehouses,
} from "context/configuration";
import { useCustomers } from "context/customers";
import { useFulfillmentRequests } from "context/fulfillment-requests";
import { ORDERS_PAGE_SIZE, useOrders } from "context/orders";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { arrayUnion, FieldPath, Timestamp, where } from "firebase/firestore";
import { getMetadata } from "firebase/storage";
import { useAsyncSearchSelect } from "hooks/useAsyncSearchSelect";
import type { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReactToPrint } from "react-to-print";
import useSWRImmutable from "swr/immutable";
import { useComplaints } from "../complaints/complaints-page";
import { getFakturowniaDocumentId } from "./[id]/get-fakturownia-document-id";

const columnHelper = createColumnHelper<Order>();

type OrderColumnDef = ColumnDef<Order, unknown>;

// TanStack's ColumnDef is effectively invariant in TValue due to callbacks typing.
// We store mixed-value columns in one array by erasing the TValue with a narrow, explicit cast.
function asOrderColumnDef<TValue>(
  column: ColumnDef<Order, TValue>,
): OrderColumnDef {
  return column as unknown as OrderColumnDef;
}

function stopOrderSelectionCellEvent(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

function getOrderQuickFilterCacheKey(order: Order) {
  return `${order.channelId}:${order.id}`;
}

function getOrderStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getOrderArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const ORDER_STATUS_SORT_RANK: Record<string, number> = {
  [OrderStatus.DRAFT]: 0,
  [OrderStatus.NEW]: 10,
  [OrderStatus.UNDER_REVIEW]: 20,
  [OrderStatus.WAITING_FOR_MATERIALS]: 30,
  [OrderStatus.IN_PROGRESS]: 40,
  [OrderStatus.DELAYED]: 50,
  [OrderStatus.READY]: 60,
  [OrderStatus.FULFILLED]: 70,
  [OrderStatus.CANCELED]: 80,
};

const ORDER_FILES_STATUS_SORT_RANK: Record<string, number> = {
  [OrderFilesStatus.WAITING_FOR_FILES]: 0,
  [OrderFilesStatus.WAITING_FOR_FILES_APPROVAL]: 10,
  [OrderFilesStatus.UNDER_DESIGN]: 20,
  [OrderFilesStatus.FOR_VERIFICATION]: 30,
  [OrderFilesStatus.FOR_PREPARATION]: 40,
  [OrderFilesStatus.FILES_ARE_READY]: 50,
};

const PAYMENT_STATUS_SORT_RANK = {
  [PaymentStatus.DRAFT]: 0,
  [PaymentStatus.NEW]: 10,
  [PaymentStatus.PENDING]: 20,
  [PaymentStatus.PARTIALLY_PAID]: 30,
  [PaymentStatus.COMPLETED]: 40,
  [PaymentStatus.REFUNDED]: 50,
  [PaymentStatus.CANCELED]: 60,
} satisfies Record<PaymentStatus, number>;

type PreparedOrderPrintJob = {
  channel: Pick<Channel, "id" | "warehouses"> | null;
  data: PreparedOrderPrintData;
  mode: OrderPrintMode;
};

async function fetchOrderPrintAttachments(
  tenantContext: TenantContext,
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
  if (isUndefined(data)) {
    return [];
  }

  const attachments = await Promise.all(
    data.map(async (result) => {
      const metadata = await getMetadata(result);
      return { storageReference: result, metadata };
    }),
  );

  return attachments;
}

function isOrderPrintInvoice(value: unknown): value is OrderPrintInvoice {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const viewUrl = record.viewUrl;
  const kind = record.kind;

  return (
    (isUndefined(viewUrl) || typeof viewUrl === "string") &&
    (isUndefined(kind) || typeof kind === "string" || kind === null)
  );
}

type OrderTableRowMeta = {
  customerLabel: string;
  itemsLabel: string;
  unresolvedProblemCount: number;
  complaintsCount: number;
  receivedLabel: string;
  deadlineLabel: string;
  deadlineColorPalette: string | undefined;
  paymentTypeLabel: string;
  paymentStatusColorPalette: string | undefined;
};

type OrderTableRowDerived = {
  meta: OrderTableRowMeta;
  quickFilterText: string;
};

type OptimisticStatusField = "status" | "paymentStatus" | "filesStatus";
const OPTIMISTIC_STATUS_FIELDS = new Set<string>([
  "status",
  "paymentStatus",
  "filesStatus",
]);
const STORE_UPDATE_FORM_IDLE_TIMEOUT_MS = 500;
const ORDER_PRINT_MIN_SETTLE_DELAY_MS = 600;
const ORDER_PRINT_ASSET_TIMEOUT_MS = 2500;

type PendingStatusChange = {
  name: "status";
  order: Order;
  updatedBy?: NestedMember;
  value: string;
};

function isOptimisticStatusField(name: string): name is OptimisticStatusField {
  return OPTIMISTIC_STATUS_FIELDS.has(name);
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

    image.addEventListener("load", cleanup, { once: true });
    image.addEventListener("error", cleanup, { once: true });
  });
}

async function decodeLoadedImage(image: HTMLImageElement): Promise<void> {
  if (!image.complete || typeof image.decode !== "function") {
    return;
  }

  try {
    await image.decode();
  } catch {
    // A loaded image can still reject decode in some browsers; printing can continue.
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

const OrderForm = dynamic(() => import("@/components/orders/OrderForm"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const StoreOrderUpdateForm = dynamic(
  () => import("@/components/orders/StoreOrderUpdateForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);
const TrackingForm = dynamic(() => import("@/components/orders/TrackingForm"), {
  loading: () => <Skeleton />,
  ssr: false,
});

type PreloadableComponent = {
  preload?: () => void;
};

function preloadDynamicComponent(component: unknown) {
  (component as PreloadableComponent).preload?.();
}

function DeferredStoreOrderUpdateForm({
  order,
  setOptimisticOrder,
}: {
  order: Order;
  setOptimisticOrder: (action: Partial<Order>) => void;
}) {
  const [shouldMountForm, setShouldMountForm] = useState(false);

  useEffect(() => {
    setShouldMountForm(false);

    if (typeof window.requestIdleCallback === "function") {
      const idleCallbackId = window.requestIdleCallback(
        () => {
          setShouldMountForm(true);
        },
        { timeout: STORE_UPDATE_FORM_IDLE_TIMEOUT_MS },
      );

      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = window.setTimeout(() => {
      setShouldMountForm(true);
    }, STORE_UPDATE_FORM_IDLE_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [order.channelId, order.id]);

  return shouldMountForm ? (
    <StoreOrderUpdateForm
      order={order}
      setOptimisticOrder={setOptimisticOrder}
    />
  ) : (
    <Skeleton />
  );
}

function OrdersCustomerFilter({
  customerFilterId,
  loading,
  setCustomerFilterId,
  t,
}: {
  customerFilterId: string | null;
  loading: boolean;
  setCustomerFilterId: (customerId: string | null) => void;
  t: TFunction;
}) {
  const { searchCustomersInput } = useCustomers();
  const [expanded, setExpanded] = useState(false);
  const [selectedCustomerValue, setSelectedCustomerValue] = useState<string[]>(
    customerFilterId ? [customerFilterId] : [],
  );
  const [searchTerm, setSearchTerm] = useState("");

  const searchers = useMemo<
    Record<
      string,
      (searchKey: string) => Promise<Customer[] | undefined | void>
    >
  >(
    () => ({
      customers: searchCustomersInput,
    }),
    [searchCustomersInput],
  );

  const {
    collection,
    handleSearch,
    loading: optionsLoading,
    reset,
  } = useAsyncSearchSelect({
    autoLoad: false,
    isOpen: expanded,
    resourceKey: "customers",
    searchers,
  });

  useEffect(() => {
    if (!customerFilterId) {
      setSelectedCustomerValue([]);
      setSearchTerm("");
      reset();
    }
  }, [customerFilterId, reset]);

  const handleClear = useCallback(() => {
    setSelectedCustomerValue([]);
    setSearchTerm("");
    setCustomerFilterId(null);
    reset();
    setExpanded(false);
  }, [reset, setCustomerFilterId]);

  const handleValueChange = useCallback(
    (details: { value: string[] }) => {
      const selectedCustomerId = details.value[0] ?? null;

      if (!selectedCustomerId) {
        handleClear();
        return;
      }

      setSelectedCustomerValue([selectedCustomerId]);
      setCustomerFilterId(selectedCustomerId);
      setExpanded(true);
    },
    [handleClear, setCustomerFilterId],
  );

  if (!expanded && !customerFilterId) {
    return (
      <Tooltip
        content={t("orders.customerFilter.open", {
          defaultValue: "Filter by customer",
        })}
      >
        <IconButton
          aria-label={t("orders.customerFilter.open", {
            defaultValue: "Filter by customer",
          })}
          colorPalette="gray"
          disabled={loading}
          onClick={() => setExpanded(true)}
          variant="outline"
        >
          <MaterialSymbol>person_search</MaterialSymbol>
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Box
      maxW={{ base: "full", md: "20rem" }}
      minW={{ base: "full", md: "16rem" }}
      transition="width 160ms ease"
      w={{ base: "full", md: "20rem" }}
    >
      <SelectRoot
        collection={collection}
        disabled={loading || optionsLoading}
        onOpenChange={(details) => {
          if (details.open) {
            setExpanded(true);
          } else if (!customerFilterId && searchTerm.trim().length === 0) {
            setExpanded(false);
          }
        }}
        onValueChange={handleValueChange}
        positioning={{ strategy: "fixed", hideWhenDetached: true }}
        value={selectedCustomerValue}
      >
        <SelectTrigger clearable>
          <HStack flex="1" minW="0" gap="2" pe="2.5rem">
            <MaterialSymbol>person_search</MaterialSymbol>
            <SelectValueText
              truncate
              placeholder={t("orders.customerFilter.placeholder", {
                defaultValue: "Exact customer",
              })}
            />
          </HStack>
        </SelectTrigger>
        <SelectContent minW="20rem">
          <Box p="2">
            <Input
              autoComplete="off"
              placeholder={t("orders.customerFilter.searchPlaceholder", {
                defaultValue: "Search customers",
              })}
              size="sm"
              value={searchTerm}
              onChange={(event) => {
                const value = event.target.value;
                setSearchTerm(value);
                handleSearch(value);
              }}
            />
          </Box>
          {optionsLoading ? (
            <HStack
              alignItems="center"
              gap="2"
              justifyContent="center"
              px="3"
              py="2"
            >
              <Spinner size="xs" />
              <Text fontSize="sm">
                {t("common.loading", { defaultValue: "Loading" })}
              </Text>
            </HStack>
          ) : collection.items.length === 0 ? (
            <Text
              color={{ base: "gray.600", _dark: "gray.300" }}
              fontSize="sm"
              px="3"
              py="2"
            >
              {t("common.noOptions", { defaultValue: "No options" })}
            </Text>
          ) : (
            collection.items.map(
              (option: SearchSelectOption<{ id: string }>) => (
                <SelectItem key={option.value} item={option}>
                  {option.label}
                </SelectItem>
              ),
            )
          )}
        </SelectContent>
      </SelectRoot>
    </Box>
  );
}

const OrdersPage = () => {
  const { t, i18n } = useT(["order", "orders", "allegro", "translation"]);
  const activeLocale = i18n.resolvedLanguage ?? i18n.language;
  const router = useRouter();
  const pathname = usePathname();
  const { data: configFlags } = useSWRImmutable("admin-config-flags", () =>
    getAdminConfigFlags(),
  );
  const hasFakturowniaKey = configFlags?.fakturowniaApiKeyProvided === true;
  const hasPolkurierKey = configFlags?.polkurierApiKeyProvided === true;
  const {
    loadingOrders,
    pageIndex,
    setPageIndex,
    includeStoreOrders,
    setIncludeStoreOrders,
    selectedSearchFields,
    setSelectedSearchFields,
    customerFilterId,
    setCustomerFilterId,
    orders,
    ordersCount,
    showOrders,
    showSearchOrders,
    searchOrders,
    ordersSearchResults,
    ordersSearchTotalCount,
    cleanOrdersSearchResults,
    deactivateOrder,
    queryConstraints,
    setQueries,
    rulesState,
    dispatchRulesState,
    setStartDate,
    setEndDate,
    refreshOrders,
    patchOrder,
    updateCarriedOutBy,
    updateItemFulfillment,
    updateItemInProgress,
    updateItemPriority,
    updateItemProblem,
  } = useOrders();
  const { channel, channels } = useChannels();
  const tenantContext = useTenantContext();
  const storeChannelId = process.env.NEXT_PUBLIC_STORE_CHANNEL_ID;
  const canIncludeStoreOrders =
    Boolean(storeChannelId) &&
    Boolean(channel?.id) &&
    channel?.id !== storeChannelId;
  const isIncludeStoreOrdersEnabled =
    canIncludeStoreOrders && includeStoreOrders;
  const { filteredMembers } = useConfigurationMembers();
  const { warehouses } = useConfigurationWarehouses();
  const {
    paymentMethodsSettings,
    printingMethodsSettings,
    shippingMethodsSettings,
    orderWorkflowStatusesSettings,
    orderRulePresetsSettings,
  } = useConfigurationSettings();
  const { getFolderPath } = useOrderFolderSettings();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isBulkInvoiceMode, setIsBulkInvoiceMode] = useState(false);
  const isElectronRuntime = useMemo(() => isElectron(), []);
  const updateOrderLabel = useMemo(
    () =>
      `${t("FormTypes.UPDATE", { defaultValue: "Update" })} ${t("orders.order", { defaultValue: "Order" })}`,
    [t],
  );
  const compactToolbarExpandAt = "1820px";
  const compactToolbarExpandQuery = `@media screen and (min-width: ${compactToolbarExpandAt})`;

  const searchFieldOptions = useMemo(
    (): { value: OrdersSearchField; label: string }[] => [
      {
        value: "contactName",
        label: t("orders.searchField.contactName", {
          defaultValue: "Contact name",
        }),
      },
      {
        value: "contactPhone",
        label: t("orders.searchField.contactPhone", {
          defaultValue: "Contact phone",
        }),
      },
      {
        value: "customerName",
        label: t("orders.searchField.customerName", {
          defaultValue: "Customer name",
        }),
      },
      {
        value: "shippingName",
        label: t("orders.searchField.shippingName", {
          defaultValue: "Shipping name",
        }),
      },
      {
        value: "shippingCompany",
        label: t("orders.searchField.shippingCompany", {
          defaultValue: "Shipping company",
        }),
      },
      {
        value: "billingCompany",
        label: t("orders.searchField.billingCompany", {
          defaultValue: "Billing company",
        }),
      },
      {
        value: "billingName",
        label: t("orders.searchField.billingName", {
          defaultValue: "Billing name",
        }),
      },
      {
        value: "billingNip",
        label: t("orders.searchField.billingNip", {
          defaultValue: "Tax ID (NIP)",
        }),
      },
      {
        value: "orderNumber",
        label: t("orders.searchField.orderNumber", {
          defaultValue: "Order number",
        }),
      },
      {
        value: "email",
        label: t("orders.searchField.email", {
          defaultValue: "Email",
        }),
      },
      {
        value: "paymentDocumentId",
        label: t("orders.searchField.paymentDocumentId", {
          defaultValue: "Payment document ID",
        }),
      },
      {
        value: "proformaDocumentId",
        label: t("orders.searchField.proformaDocumentId", {
          defaultValue: "Proforma document ID",
        }),
      },
      {
        value: "externalOrderId",
        label: t("orders.searchField.externalOrderId", {
          defaultValue: "External order ID",
        }),
      },
      {
        value: "externalBuyerLogin",
        label: t("orders.searchField.externalBuyerLogin", {
          defaultValue: "External buyer login",
        }),
      },
      {
        value: "specialNotes",
        label: t("orders.searchField.specialNotes", {
          defaultValue: "Special notes",
        }),
      },
      {
        value: "totalPrice",
        label: t("orders.searchField.totalPrice", {
          defaultValue: "Total price",
        }),
      },
    ],
    [t],
  );

  const handleSearchFieldCheckedChange = useCallback(
    (field: OrdersSearchField, checked: boolean) => {
      setPageIndex(0);
      setSelectedSearchFields((previousFields) => {
        if (checked) {
          return searchFieldOptions
            .filter(
              (option) =>
                option.value === field || previousFields.includes(option.value),
            )
            .map((option) => option.value);
        }

        return previousFields.filter((value) => value !== field);
      });
    },
    [searchFieldOptions, setPageIndex, setSelectedSearchFields],
  );

  const data: Order[] | undefined = ordersSearchResults ?? orders ?? undefined;
  const preloadOrderForms = useCallback(() => {
    preloadDynamicComponent(OrderForm);
    preloadDynamicComponent(StoreOrderUpdateForm);
    preloadDynamicComponent(TrackingForm);
  }, []);
  const preloadUpdateForm = useCallback((order: Order) => {
    preloadDynamicComponent(
      order.isFromStore ? StoreOrderUpdateForm : OrderForm,
    );
  }, []);
  useEffect(() => {
    if (!data?.length) {
      return;
    }

    let idleCallbackId: number | undefined;
    let timeoutId: number | undefined;

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(preloadOrderForms, {
        timeout: 3_000,
      });
    } else {
      timeoutId = window.setTimeout(preloadOrderForms, 0);
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (
        idleCallbackId !== undefined &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, [data?.length, preloadOrderForms]);

  const orderPrintRef = useRef<HTMLDivElement>(null);
  const activeOrderPrintRef = useRef<PreparedOrderPrintJob | null>(null);
  const orderPrintBusyRef = useRef(false);
  const orderPrintAttemptKeyRef = useRef<string | null>(null);
  const previousDocumentTitleRef = useRef<string | null>(null);
  const [preparedOrderPrint, setPreparedOrderPrint] =
    useState<PreparedOrderPrintJob | null>(null);
  const [isPreparingOrderPrint, setIsPreparingOrderPrint] = useState(false);

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
          ? getInvoices({ number: fakturowniaDocumentId }).then((invoices) => {
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
    pageStyle: getOrderPrintPageStyle(preparedOrderPrint?.mode ?? "full"),
    onBeforePrint: () => {
      const activePrint = activeOrderPrintRef.current;
      previousDocumentTitleRef.current = document.title;
      if (activePrint) {
        document.title = `${t("ROUTES.order", { defaultValue: "Order" })} ${activePrint.data.channelName}#${activePrint.data.order.number}`;
      }
      return Promise.resolve();
    },
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
              type: ActivityStatus.ORDER_PRINTED,
              value: "ORDER_PRINTED",
              timestamp: Timestamp.now(),
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
    onPrintError: (errorLocation, error) => {
      console.error("Failed to print order from orders page", {
        error,
        errorLocation,
      });
      if (previousDocumentTitleRef.current) {
        document.title = previousDocumentTitleRef.current;
      }
      previousDocumentTitleRef.current = null;
      toaster.error({
        title: t("orders.print.prepareFailedTitle", {
          defaultValue: "Print failed",
        }),
        description: t("orders.print.prepareFailedDescription", {
          defaultValue:
            "The order could not be prepared for printing. Try again.",
        }),
      });
      clearPreparedOrderPrint();
    },
  });

  const handlePrintOrder = useCallback<OrderPrintHandler>(
    async (order, mode) => {
      if (orderPrintBusyRef.current) {
        toaster.warning({
          title: t("orders.print.busyTitle", {
            defaultValue: "Print is already being prepared",
          }),
          description: t("orders.print.busyDescription", {
            defaultValue:
              "Wait for the current print dialog before starting another print.",
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
          title: t("orders.print.prepareFailedTitle", {
            defaultValue: "Print failed",
          }),
          description: t("orders.print.prepareFailedDescription", {
            defaultValue:
              "The order could not be prepared for printing. Try again.",
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

  const [pendingStatusConfirmation, setPendingStatusConfirmation] = useState<
    | (PendingStatusChange & {
        kind: "status-email" | "incomplete-order";
      })
    | null
  >(null);
  const [pendingStatusActorSelection, setPendingStatusActorSelection] =
    useState<PendingStatusChange | null>(null);
  const statusOptions = useMemo(
    () =>
      orderWorkflowStatusesSettings.orderStatuses
        .filter((status) => status.enabled && !status.archived)
        .map(
          (status) =>
            ({
              label: getOrderWorkflowStatusLabel(
                status.id,
                orderWorkflowStatusesSettings,
                t,
                activeLocale,
              ),
              value: status.id,
              color: getOrderWorkflowStatusColorPalette(
                status.id,
                orderWorkflowStatusesSettings,
              ),
            }) as SelectOption,
        ),
    [activeLocale, orderWorkflowStatusesSettings, t],
  );
  const paymentStatusOptions = useMemo(
    () =>
      PaymentStatusAsOptions.map(
        (paymentStatus) =>
          ({
            label: t(`PaymentStatus.${paymentStatus.label}`),
            value: paymentStatus.value,
            color: getStatusColor(paymentStatus.value),
          }) as SelectOption,
      ),
    [t],
  );
  const paymentTypesOptions = useMemo(
    () =>
      paymentMethodsSettings.methods
        .filter((method) => method.enabled && !method.archived)
        .map(
          (method) =>
            ({
              label: getPaymentMethodLabel(
                method.id,
                paymentMethodsSettings,
                t,
                activeLocale,
              ),
              value: method.id,
              color: getPaymentMethodColorPalette(
                method.id,
                paymentMethodsSettings,
              ),
            }) as SelectOption,
        ),
    [activeLocale, paymentMethodsSettings, t],
  );
  const orderFilesStatusOptions = useMemo(
    () =>
      orderWorkflowStatusesSettings.fileStatuses
        .filter((status) => status.enabled && !status.archived)
        .map(
          (status) =>
            ({
              label: getOrderFileStatusLabel(
                status.id,
                orderWorkflowStatusesSettings,
                t,
                activeLocale,
              ),
              value: status.id,
              color: getOrderFileStatusColorPalette(
                status.id,
                orderWorkflowStatusesSettings,
              ),
            }) as SelectOption,
        ),
    [activeLocale, orderWorkflowStatusesSettings, t],
  );
  const buildOrderTableRowDerived = useCallback(
    (order: Order): OrderTableRowDerived => {
      const customerValue = isNestedCustomer(order.customer)
        ? order.customer.name
        : order.customer;
      const customerLabel = customerValue || "-";
      const customerFilterValue = customerValue || "";
      const customerMeta =
        order.email ||
        order.contact?.email ||
        order.contact?.phone ||
        order.contact?.name ||
        "";
      const itemNames: string[] = [];
      const orderItems = getOrderArray(order.items);

      for (const item of orderItems) {
        if (typeof item.product?.name === "string") {
          itemNames.push(item.product.name);
        }
      }

      let unresolvedProblemCount = 0;

      for (const problem of getOrderArray(order.problemItems)) {
        if (!problem.resolved) {
          unresolvedProblemCount += 1;
        }
      }

      const itemsLabel = itemNames.join(", ");
      const printingMethodsLabel = getOrderStringList(order.printingMethods)
        .map((method) =>
          getPrintingMethodLabel(
            method,
            printingMethodsSettings,
            t,
            activeLocale,
          ),
        )
        .join(" ");
      const carriedOutByLabel = getOrderStringList(order.carriedOutBy).join(
        " ",
      );
      const deadlineDate = new Date(order.deadlineString);

      return {
        meta: {
          customerLabel,
          itemsLabel,
          unresolvedProblemCount,
          complaintsCount: getOrderArray(order.complaints).length,
          receivedLabel: order.createdAt
            .toDate()
            .toLocaleDateString(i18n.resolvedLanguage, {
              month: "2-digit",
              day: "2-digit",
            }),
          deadlineLabel: deadlineDate.toLocaleDateString(
            i18n.resolvedLanguage,
            {
              month: "2-digit",
              day: "2-digit",
              hour: order.exactTime ? "2-digit" : undefined,
              minute: order.exactTime ? "2-digit" : undefined,
            },
          ),
          deadlineColorPalette: getDeadlineColorPalette(deadlineDate),
          paymentTypeLabel: getPaymentMethodLabel(
            order.paymentType,
            paymentMethodsSettings,
            t,
            activeLocale,
          ),
          paymentStatusColorPalette: getOrderPaymentStatusColorPalette(
            order.paymentStatus,
            order.paymentDocumentId,
          ),
        },
        quickFilterText: [
          order.number,
          customerFilterValue,
          customerMeta,
          itemNames.join(" "),
          printingMethodsLabel,
          carriedOutByLabel,
          order.paymentDocumentId,
          order.proformaDocumentId,
          order.externalSource?.externalBuyerLogin,
          order.externalSource?.externalOrderId,
          order.specialNotes,
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(" ")
          .toLowerCase(),
      };
    },
    [
      activeLocale,
      i18n.resolvedLanguage,
      paymentMethodsSettings,
      printingMethodsSettings,
      t,
    ],
  );
  const orderTableRowDerivedById = useMemo(() => {
    const derivedById = new Map<string, OrderTableRowDerived>();

    for (const order of data ?? []) {
      derivedById.set(
        getOrderQuickFilterCacheKey(order),
        buildOrderTableRowDerived(order),
      );
    }

    return derivedById;
  }, [buildOrderTableRowDerived, data]);
  const getOrderTableRowMeta = useCallback(
    (order: Order) =>
      orderTableRowDerivedById.get(getOrderQuickFilterCacheKey(order))?.meta ??
      buildOrderTableRowDerived(order).meta,
    [buildOrderTableRowDerived, orderTableRowDerivedById],
  );
  const membersOptions = useMemo(
    () =>
      filteredMembers
        ? filteredMembers.map((member) => ({
            label: member.name,
            value: member.id,
          }))
        : [],
    [filteredMembers],
  );
  const warehouseOptions = useMemo(
    () =>
      warehouses
        ? warehouses.map((warehouse) => ({
            label: warehouse.name,
            value: warehouse.address?.street ?? "",
          }))
        : [],
    [warehouses],
  );
  const handleUpdateStatus = useCallback(
    (
      name: "status" | "filesStatus" | "paymentStatus",
      value: string | undefined,
      order: Order,
      updatedBy?: NestedMember,
    ) => {
      const orderChannelId = order.channelId ?? channel?.id;

      if (isUndefined(name)) {
        console.error("handleUpdateStatus: missing field name", {
          value,
          orderId: order.id,
        });
        return;
      }
      if (!orderChannelId) {
        console.error("handleUpdateStatus: missing order channel", {
          name,
          value,
          orderId: order.id,
        });
        toaster.error({
          title: t("orders.error", { defaultValue: "Error" }),
          description: t("orders.bulkInvoice.channelMissing", {
            defaultValue: "Channel is required",
          }),
        });
        return;
      }
      if (!value) {
        return;
      }

      setPendingStatusConfirmation(null);
      const shouldPatchOptimistically = isOptimisticStatusField(name);
      const previousValue = shouldPatchOptimistically ? order[name] : undefined;
      const shouldAttachStatusActor =
        name === "status" && value !== undefined && !!updatedBy;
      const updatedAt = shouldAttachStatusActor ? Timestamp.now() : undefined;
      const updatePayload = {
        [name]: value,
        ...(shouldAttachStatusActor
          ? {
              createdBy: updatedBy,
              updatedAt,
              updatedBy,
            }
          : {}),
      } as Partial<Order>;
      const rollbackPayload = {
        [name]: previousValue,
        ...(shouldAttachStatusActor
          ? {
              createdBy: order.createdBy,
              updatedAt: order.updatedAt,
              updatedBy: order.updatedBy,
            }
          : {}),
      } as Partial<Order>;

      if (shouldPatchOptimistically) {
        patchOrder(order.id, orderChannelId, updatePayload);
      }

      void updateOrderStatusField({
        channelId: orderChannelId,
        field: name,
        orderId: order.id,
        source: "admin-orders-list",
        updatedBy,
        value,
      })
        .then(async () => {
          // Send status-change email via server action (fire-and-forget)
          if (name === "status" && value) {
            void sendOrderStatusEmail(
              orderChannelId,
              order.id,
              value as OrderStatus,
            )
              .then((result) => {
                if (!result.sent && result.error) {
                  toaster.warning({
                    title: t("orders.warning", { defaultValue: "Warning!" }),
                    description: t("orders.statusEmailSendFailed", {
                      defaultValue:
                        "Order status was updated, but notification email was not sent: {{reason}}",
                      reason: result.error,
                    }),
                  });
                }
              })
              .catch((error: unknown) => {
                console.error("Failed to send status email:", error);
                const reason =
                  error instanceof Error
                    ? error.message
                    : t("orders.unknownError", {
                        defaultValue: "Unknown error",
                      });
                toaster.warning({
                  title: t("orders.warning", { defaultValue: "Warning!" }),
                  description: t("orders.statusEmailSendFailed", {
                    defaultValue:
                      "Order status was updated, but notification email was not sent: {{reason}}",
                    reason,
                  }),
                });
              });
          }
        })
        .catch((error: unknown) => {
          if (shouldPatchOptimistically) {
            patchOrder(order.id, orderChannelId, rollbackPayload);
          }

          console.error("Failed to update order", {
            name,
            value,
            orderId: order.id,
            channelId: orderChannelId,
            error,
          });
          toaster.error({
            title: t("orders.error", { defaultValue: "Error" }),
            description: t("orders.updateFailed", {
              defaultValue: "Failed to update order. Please try again.",
            }),
          });
        });
    },
    [channel?.id, patchOrder, t],
  );
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showAttachmentsForm, setShowAttachmentsForm] = useState(false);
  const [showPaymentDocumentForm, setShowPaymentDocumentForm] = useState(false);
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [showNoteCreateForm, setShowNoteCreateForm] = useState(false);
  const [showItemProblemDialog, setShowItemProblemDialog] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [selectedProblemOrder, setSelectedProblemOrder] =
    useState<Order | null>(null);
  const [selectedProblemItem, setSelectedProblemItem] =
    useState<OrderItem | null>(null);
  const [existingProblem, setExistingProblem] = useState<ItemProblem>();
  const patchCurrentOrderOptimistically = useCallback(
    (action: Partial<Order>) => {
      setCurrentOrder((previousOrder) =>
        previousOrder
          ? {
              ...previousOrder,
              ...action,
            }
          : previousOrder,
      );
    },
    [],
  );
  const { activeComplaintsCount } = useComplaints();
  const { activeFulfillmentRequestsCount, channelWarehouseIds } =
    useFulfillmentRequests();

  useEffect(() => {
    if (
      showUpdateForm ||
      showDuplicateForm ||
      showDeactivateDialog ||
      showAttachmentsForm ||
      showPaymentDocumentForm ||
      showTrackingForm ||
      showComplaintForm ||
      showNoteCreateForm
    ) {
      return;
    }

    setCurrentOrder(null);
  }, [
    showAttachmentsForm,
    showComplaintForm,
    showDeactivateDialog,
    showDuplicateForm,
    showNoteCreateForm,
    showPaymentDocumentForm,
    showTrackingForm,
    showUpdateForm,
  ]);

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

  const getOrderTableRowId = useCallback((order: Order) => order.id, []);
  const visibleOrderIds = useMemo(
    () => data?.map((order) => order.id) ?? [],
    [data],
  );

  const selectedTableOrderIds = useMemo(() => {
    if (visibleOrderIds.length === 0) {
      return [];
    }

    const visibleOrderIdSet = new Set(visibleOrderIds);
    return Object.keys(rowSelection).filter((id) => visibleOrderIdSet.has(id));
  }, [rowSelection, visibleOrderIds]);
  const selectedOrderIds = selectedTableOrderIds;
  const bulkSelectionCount = selectedOrderIds.length;
  const allVisibleOrdersSelected =
    visibleOrderIds.length > 0 &&
    visibleOrderIds.every((orderId) => rowSelection[orderId]);
  const someVisibleOrdersSelected =
    !allVisibleOrdersSelected &&
    visibleOrderIds.some((orderId) => rowSelection[orderId]);
  const setVisibleOrdersSelected = useCallback(
    (selected: boolean) => {
      setRowSelection((current) => {
        const next = { ...current };
        for (const orderId of visibleOrderIds) {
          if (selected) {
            next[orderId] = true;
          } else {
            delete next[orderId];
          }
        }
        return next;
      });
    },
    [visibleOrderIds],
  );
  const setOrderSelected = useCallback((orderId: string, selected: boolean) => {
    setRowSelection((current) => {
      const next = { ...current };
      if (selected) {
        next[orderId] = true;
      } else {
        delete next[orderId];
      }
      return next;
    });
  }, []);

  // Create stable modal handlers to prevent columns from re-creating
  const modalHandlers = useMemo(
    () => ({
      showAttachments: (order: Order) => {
        setCurrentOrder(order);
        setShowAttachmentsForm(true);
      },
      showPaymentDocument: (order: Order) => {
        setCurrentOrder(order);
        setShowPaymentDocumentForm(true);
      },
      showTracking: (order: Order) => {
        preloadOrderForms();
        setCurrentOrder(order);
        setShowTrackingForm(true);
      },
      showUpdateForm: (order: Order) => {
        preloadUpdateForm(order);
        setCurrentOrder(order);
        setShowUpdateForm(true);
      },
      showDuplicateForm: (order: Order) => {
        preloadOrderForms();
        setCurrentOrder(order);
        setShowDuplicateForm(true);
      },
      showDeactivateDialog: (order: Order) => {
        setCurrentOrder(order);
        setShowDeactivateDialog(true);
      },
      showComplaintForm: (order: Order) => {
        setCurrentOrder(order);
        setShowComplaintForm(true);
      },
      showNoteCreateForm: (order: Order) => {
        setCurrentOrder(order);
        setShowNoteCreateForm(true);
      },
      openFolder: async (order: Order) => {
        const orderChannelId = order.channelId || channel?.id;
        if (!orderChannelId) return;
        const basePath = getFolderPath(orderChannelId);
        if (!basePath) {
          toaster.error({
            title: t("orders.error", { defaultValue: "Error" }),
            description: t("orders.noFolderConfigured", {
              defaultValue: "No folder path configured for this channel",
            }),
          });
          return;
        }
        const folderPath = getOrderFolderPath(basePath, order.number);
        const success = await openOrderFolder(folderPath);
        if (!success) {
          toaster.error({
            title: t("orders.error", { defaultValue: "Error" }),
            description: t("orders.folderOpenError", {
              defaultValue:
                "Failed to open folder. Please check if the folder exists.",
            }),
          });
        }
      },
    }),
    [channel, getFolderPath, preloadOrderForms, preloadUpdateForm, t],
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

  // Memoized status change handlers
  const handleStatusChange = useCallback(
    (value: string | undefined, order: Order) => {
      if (!value) {
        return;
      }

      const statusChange: PendingStatusChange = {
        name: "status",
        order,
        value,
      };

      if (statusChange.value === order.status) {
        return;
      }

      if (shouldRequireStatusActorSelection(order)) {
        setPendingStatusActorSelection(statusChange);
        return;
      }

      queueOrApplyStatusChange(statusChange);
    },
    [queueOrApplyStatusChange],
  );

  const pendingStatusAgeMinutes = useMemo(() => {
    if (!pendingStatusConfirmation) {
      return null;
    }

    if (pendingStatusConfirmation.kind !== "incomplete-order") {
      return null;
    }

    return getOrderAgeInMinutes(pendingStatusConfirmation.order);
  }, [pendingStatusConfirmation]);

  const handlePaymentStatusChange = useCallback(
    (value: string | undefined, order: Order) => {
      handleUpdateStatus("paymentStatus", value, order);
    },
    [handleUpdateStatus],
  );

  const handleFilesStatusChange = useCallback(
    (value: string | undefined, order: Order) => {
      handleUpdateStatus("filesStatus", value, order);
    },
    [handleUpdateStatus],
  );

  const activePrintingMethodDefinitions = useMemo(
    () => getEnabledPrintingMethodDefinitions(printingMethodsSettings),
    [printingMethodsSettings],
  );
  const activePrintingMethodIds = useMemo(
    () => activePrintingMethodDefinitions.map((method) => method.id),
    [activePrintingMethodDefinitions],
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

        patchOrder(order.id, order.channelId, nextCollections);
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
    [patchOrder, t, tenantContext],
  );

  const columns = useMemo<OrderColumnDef[]>(() => {
    const baseColumns: OrderColumnDef[] = [
      asOrderColumnDef(
        columnHelper.accessor("number", {
          cell: (info) => (
            <HStack gap={2}>
              <Text>#{info.getValue()}</Text>
              {isAllegroExternalOrder(info.row.original) && (
                <Badge size="xs" colorPalette="orange">
                  {t("allegro.badge", { defaultValue: "Allegro" })}
                </Badge>
              )}
            </HStack>
          ),
          header: "#",
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("customer", {
          cell: (props) => {
            const rowMeta = getOrderTableRowMeta(props.row.original);
            return (
              <Tooltip content={rowMeta.customerLabel} lazyMount={true}>
                <Box position={"relative"}>
                  <Text
                    width={"100px"}
                    overflow={"hidden"}
                    whiteSpace={"nowrap"}
                    textOverflow={"ellipsis"}
                  >
                    {rowMeta.customerLabel}
                  </Text>
                  {props.row.original.priority > 1 && (
                    <Badge
                      position={"absolute"}
                      top={"-5"}
                      left={"-5"}
                      colorPalette={
                        props.row.original.priority === 1 ? "purple" : "red"
                      }
                      hidden={props.row.original.priority === 2}
                      variant={
                        props.row.original.priority === 1
                          ? "outline"
                          : props.row.original.priority === 2
                            ? undefined
                            : "subtle"
                      }
                      size={"xs"}
                      pl={2}
                      pr={3}
                    >
                      <MaterialSymbol p={0}>priority_high</MaterialSymbol>
                      {props.row.original.priority === 1
                        ? t("order.later", { defaultValue: "LATER" })
                        : t("order.urgent", { defaultValue: "URGENT" })}
                    </Badge>
                  )}
                </Box>
              </Tooltip>
            );
          },
          header: t("orders.customer", { defaultValue: "Customer" }),
          meta: {
            cellOverflow: "visible",
          },
        }),
      ),
      asOrderColumnDef(
        columnHelper.display({
          id: "items",
          cell: (props) => {
            const rowMeta = getOrderTableRowMeta(props.row.original);
            const hasUnresolvedProblems = rowMeta.unresolvedProblemCount > 0;
            const hasComplaints = rowMeta.complaintsCount > 0;
            return (
              <Tooltip content={rowMeta.itemsLabel} lazyMount={true}>
                <Box position={"relative"}>
                  <Text
                    width={"100px"}
                    overflow={"hidden"}
                    whiteSpace={"nowrap"}
                    textOverflow={"ellipsis"}
                  >
                    {rowMeta.itemsLabel}
                  </Text>
                  {hasUnresolvedProblems && (
                    <Badge
                      position={"absolute"}
                      top={"-5"}
                      left={"0"}
                      colorPalette={"red"}
                      size={"xs"}
                      pl={2}
                      pr={3}
                    >
                      <MaterialSymbol>error</MaterialSymbol>
                      {t("orders.itemProblems", {
                        defaultValue: "Problems",
                      })}{" "}
                      [{rowMeta.unresolvedProblemCount}]
                    </Badge>
                  )}
                  {hasComplaints && (
                    <Badge
                      position={"absolute"}
                      top={"-5"}
                      right={"0"}
                      colorPalette={"red"}
                      size={"xs"}
                      pl={2}
                      pr={3}
                    >
                      <MaterialSymbol>warning</MaterialSymbol>
                      {t("orders.complaints", {
                        defaultValue: "Complaints",
                      })}{" "}
                      [{rowMeta.complaintsCount}]
                    </Badge>
                  )}
                </Box>
              </Tooltip>
            );
          },
          header: t("orders.order", { defaultValue: "Order" }),
          meta: {
            cellOverflow: "visible",
          },
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("createdAt", {
          cell: (info) => (
            <Badge opacity={0.67}>
              {getOrderTableRowMeta(info.row.original).receivedLabel}
            </Badge>
          ),
          header: t("orders.received", { defaultValue: "Received" }),
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("deadlineString", {
          cell: (props) => {
            const rowMeta = getOrderTableRowMeta(props.row.original);
            return (
              <Badge
                colorPalette={
                  (
                    [OrderStatus.FULFILLED, OrderStatus.READY] as string[]
                  ).includes(props.row.original.status)
                    ? undefined
                    : rowMeta.deadlineColorPalette
                }
              >
                {rowMeta.deadlineLabel}
              </Badge>
            );
          },
          header: t("orders.deadline", { defaultValue: "Deadline" }),
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("printingMethods", {
          cell: (info) => {
            const value: Order["printingMethods"] = info.getValue();
            const printTypeCompletionGroups =
              getProductionPrintTypeCompletionGroups(
                info.row.original,
                activePrintingMethodIds,
              );

            if (printTypeCompletionGroups.length > 0) {
              return (
                <PrintTypeCompletionBadges
                  groups={printTypeCompletionGroups}
                  maxLabelWidth="7rem"
                  onMarkFulfilled={(group) =>
                    handlePrintTypeGroupFulfilled(info.row.original, group)
                  }
                  printingMethodsSettings={printingMethodsSettings}
                />
              );
            }

            return value ? (
              <PrintingMethodsGroup
                values={value}
                settings={printingMethodsSettings}
                t={t}
                locale={activeLocale}
              />
            ) : null;
          },
          header: t("orders.department", { defaultValue: "Department" }),
          meta: {
            cellOverflow: "visible",
          },
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("status", {
          cell: (props) => (
            <Box position={"relative"} onClick={(e) => e.stopPropagation()}>
              <StatusSelect
                name={"status"}
                value={props.cell.getValue()}
                options={statusOptions}
                onChange={(value) =>
                  handleStatusChange(value, props.row.original)
                }
                orderId={props.row.original.id}
              />
              {props.row.original.tracking && (
                <Show
                  when={
                    props.row.original.tracking.lastScan &&
                    !props.row.original.isFromStore &&
                    (
                      [
                        ShippingOptions.COMPANY_COURIER,
                        ShippingOptions.PERSONAL_COLLECTION,
                      ] as string[]
                    ).includes(props.row.original.shippingOption!) &&
                    props.row.original.tracking.lastScan?.stage === "PICKUP"
                  }
                >
                  <Tooltip
                    content={t("TrackingScanStage.PICKUP", {
                      defaultValue: "Picked up by courier",
                    })}
                  >
                    <Badge position="absolute" top={-4} left={-4}>
                      <MaterialSymbol>delivery_truck_speed</MaterialSymbol>
                    </Badge>
                  </Tooltip>
                </Show>
              )}
            </Box>
          ),
          header: t("orders.status", { defaultValue: "Status" }),
          meta: {
            cellOverflow: "visible",
          },
          sortingFn: (left, right) =>
            (ORDER_STATUS_SORT_RANK[left.original.status] ?? 0) -
            (ORDER_STATUS_SORT_RANK[right.original.status] ?? 0),
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("paymentStatus", {
          cell: (props) => {
            const rowMeta = getOrderTableRowMeta(props.row.original);
            return (
              <Box position={"relative"} onClick={(e) => e.stopPropagation()}>
                <StatusSelect
                  name={"paymentStatus"}
                  value={props.cell.getValue()}
                  colorPalette={rowMeta.paymentStatusColorPalette}
                  options={paymentStatusOptions}
                  onChange={(value) =>
                    handlePaymentStatusChange(value, props.row.original)
                  }
                  orderId={props.row.original.id}
                />
                <Badge
                  size="sm"
                  position={"absolute"}
                  top={"-4"}
                  right={"-4"}
                  maxW="120px"
                >
                  <Text truncate={true}>{rowMeta.paymentTypeLabel}</Text>
                </Badge>
              </Box>
            );
          },
          header: t("orders.payment", { defaultValue: "Payment" }),
          meta: {
            cellOverflow: "visible",
          },
          sortingFn: (left, right) =>
            PAYMENT_STATUS_SORT_RANK[left.original.paymentStatus] -
            PAYMENT_STATUS_SORT_RANK[right.original.paymentStatus],
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("filesStatus", {
          cell: (props) => (
            <Box onClick={(e) => e.stopPropagation()} maxW={"150px"}>
              <StatusSelect
                name={"filesStatus"}
                value={props.cell.getValue()}
                options={orderFilesStatusOptions}
                onChange={(value) =>
                  handleFilesStatusChange(value, props.row.original)
                }
                orderId={props.row.original.id}
              />
            </Box>
          ),
          header: t("orders.files", { defaultValue: "Files" }),
          sortingFn: (left, right) =>
            (ORDER_FILES_STATUS_SORT_RANK[left.original.filesStatus] ?? 0) -
            (ORDER_FILES_STATUS_SORT_RANK[right.original.filesStatus] ?? 0),
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("carriedOutBy", {
          cell: (info) => {
            const value = info.getValue();
            function updateRowCarriedOutBy(carriedOutBy: string[]) {
              updateCarriedOutBy(
                info.row.original.id,
                info.row.original.channelId,
                carriedOutBy,
              );
            }
            return (
              <CarriedOutByCell
                value={value}
                updateCarriedOutBy={updateRowCarriedOutBy}
                createdBy={info.row.original.createdBy.name}
                updatedBy={info.row.original.updatedBy.name}
              />
            );
          },
          header: t("orders.executor", { defaultValue: "Executor" }),
        }),
      ),
      asOrderColumnDef(
        columnHelper.accessor("totalPrice", {
          cell: (info) =>
            typeof info.getValue() === "number"
              ? formatPrice(
                  info.getValue(),
                  info.row.original.currency,
                  undefined,
                  undefined,
                  i18n.resolvedLanguage,
                )
              : "-",
          header: t("orders.price", { defaultValue: "Price" }),
          meta: {
            isNumeric: true,
          },
        }),
      ),
      asOrderColumnDef(
        columnHelper.display({
          id: "actions",
          cell: ({ row }) => (
            <OrderActions
              hasFakturowniaKey={hasFakturowniaKey}
              hasPolkurierKey={hasPolkurierKey}
              order={row.original}
              onShowAttachments={modalHandlers.showAttachments}
              onShowPaymentDocument={modalHandlers.showPaymentDocument}
              onShowTracking={modalHandlers.showTracking}
              onPreloadUpdateForm={preloadUpdateForm}
              onUpdateForm={modalHandlers.showUpdateForm}
              onDuplicateForm={modalHandlers.showDuplicateForm}
              onDeactivate={modalHandlers.showDeactivateDialog}
              onShowComplaint={modalHandlers.showComplaintForm}
              onShowNoteCreate={modalHandlers.showNoteCreateForm}
              onPrintOrder={handlePrintOrder}
              onOpenFolder={
                isElectronRuntime ? modalHandlers.openFolder : undefined
              }
            />
          ),
          meta: {
            isNumeric: true,
          },
          header: t("orders.actions.heading", { defaultValue: "Actions" }),
        }),
      ),
    ];

    if (!isBulkInvoiceMode) {
      return baseColumns;
    }

    const selectionColumn = asOrderColumnDef(
      columnHelper.display({
        id: "select",
        enableSorting: false,
        header: () => (
          <Box
            alignItems={"center"}
            data-row-toggle-ignore="true"
            display={"flex"}
            justifyContent={"center"}
            onClick={stopOrderSelectionCellEvent}
            onKeyDown={stopOrderSelectionCellEvent}
            onPointerDown={stopOrderSelectionCellEvent}
          >
            <Checkbox
              id="select-all-orders"
              size={"sm"}
              colorPalette={"primary"}
              data-row-toggle-ignore="true"
              checked={
                allVisibleOrdersSelected
                  ? true
                  : someVisibleOrdersSelected
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={({ checked }) =>
                setVisibleOrdersSelected(checked === true)
              }
              aria-label={t("orders.bulkInvoice.selectAll", {
                defaultValue: "Select all orders",
              })}
            />
          </Box>
        ),
        cell: ({ row }) => {
          const orderId = row.original.id;
          const isSelected = Boolean(rowSelection[orderId]);

          return (
            <Box
              key={`select-order-${orderId}`}
              alignItems={"center"}
              data-row-toggle-ignore="true"
              display={"flex"}
              justifyContent={"center"}
              onClick={stopOrderSelectionCellEvent}
              onKeyDown={stopOrderSelectionCellEvent}
              onPointerDown={stopOrderSelectionCellEvent}
            >
              <Checkbox
                id={`select-order-${orderId}`}
                size={"sm"}
                colorPalette={"primary"}
                data-row-toggle-ignore="true"
                checked={isSelected}
                disabled={!row.getCanSelect()}
                onCheckedChange={({ checked }) =>
                  setOrderSelected(orderId, checked === true)
                }
                aria-label={t("orders.bulkInvoice.selectSingle", {
                  defaultValue: "Select order",
                })}
              />
            </Box>
          );
        },
        meta: {
          width: "56px",
          minWidth: "56px",
          textAlign: "center",
          hideSortIndicator: true,
          disableRowToggle: true,
        },
      }),
    );

    return [selectionColumn, ...baseColumns];
  }, [
    activePrintingMethodIds,
    allVisibleOrdersSelected,
    handleFilesStatusChange,
    handlePaymentStatusChange,
    handlePrintOrder,
    handlePrintTypeGroupFulfilled,
    handleStatusChange,
    hasFakturowniaKey,
    hasPolkurierKey,
    getOrderTableRowMeta,
    activeLocale,
    i18n.resolvedLanguage,
    isBulkInvoiceMode,
    isElectronRuntime,
    modalHandlers,
    orderFilesStatusOptions,
    paymentStatusOptions,
    preloadUpdateForm,
    printingMethodsSettings,
    rowSelection,
    setOrderSelected,
    setVisibleOrdersSelected,
    someVisibleOrdersSelected,
    statusOptions,
    t,
    updateCarriedOutBy,
  ]);

  const handleToggleBulkInvoiceMode = useCallback(() => {
    if (!hasFakturowniaKey) {
      return;
    }
    setIsBulkInvoiceMode((previous) => !previous);
  }, [hasFakturowniaKey]);

  useEffect(() => {
    // Keep row selection state scoped to bulk mode only.
    if (!isBulkInvoiceMode) {
      setRowSelection({});
    }
  }, [isBulkInvoiceMode]);

  useEffect(() => {
    if (!hasFakturowniaKey || isIncludeStoreOrdersEnabled) {
      setIsBulkInvoiceMode(false);
    }
  }, [hasFakturowniaKey, isIncludeStoreOrdersEnabled]);

  const handleBulkInvoiceCancel = useCallback(() => {
    setIsBulkInvoiceMode(false);
    setRowSelection({});
  }, []);

  const handleBulkInvoiceCreate = useCallback(() => {
    if (!hasFakturowniaKey) {
      return;
    }
    if (bulkSelectionCount === 0) {
      toaster.error({
        title: t("orders.bulkInvoice.missingSelection", {
          defaultValue: "Select at least one order",
        }),
      });
      return;
    }
    if (!channel?.id) {
      toaster.error({
        title: t("orders.bulkInvoice.channelMissing", {
          defaultValue: "Channel is required",
        }),
      });
      return;
    }
    const orderIdsParam = selectedOrderIds
      .map((id) => encodeURIComponent(id))
      .join(",");
    router.push(
      `/${i18n.resolvedLanguage}/fakturownia/invoices/new?orderIds=${orderIdsParam}&channelId=${channel.id}`,
    );
    setIsBulkInvoiceMode(false);
    setRowSelection({});
  }, [
    bulkSelectionCount,
    channel?.id,
    hasFakturowniaKey,
    i18n.resolvedLanguage,
    router,
    selectedOrderIds,
    t,
  ]);

  const bulkInvoiceActionBarContent = useMemo(
    () => (
      <Flex
        alignItems={"center"}
        justifyContent={"space-between"}
        flexWrap={"wrap"}
        gap={4}
      >
        <ActionBar.SelectionTrigger>
          {t("orders.bulkInvoice.selected", {
            defaultValue: "{{count}} selected",
            count: bulkSelectionCount,
          })}
        </ActionBar.SelectionTrigger>
        <ActionBar.Separator />
        <HStack gap={3}>
          <Button variant={"outline"} onClick={handleBulkInvoiceCancel}>
            {t("orders.bulkInvoice.cancel", {
              defaultValue: "Cancel",
            })}
          </Button>
          <Button colorPalette={"primary"} onClick={handleBulkInvoiceCreate}>
            <MaterialSymbol>receipt_long</MaterialSymbol>
            {t("orders.bulkInvoice.create", {
              defaultValue: "Create",
            })}
          </Button>
        </HStack>
      </Flex>
    ),
    [bulkSelectionCount, handleBulkInvoiceCancel, handleBulkInvoiceCreate, t],
  );
  const bulkInvoiceActionBar = useMemo(
    () => ({
      open: isBulkInvoiceMode && bulkSelectionCount > 0,
      content: bulkInvoiceActionBarContent,
    }),
    [bulkInvoiceActionBarContent, bulkSelectionCount, isBulkInvoiceMode],
  );
  const tableRowSelection = useMemo(
    () =>
      isBulkInvoiceMode
        ? {
            rowSelection,
            setRowSelection,
          }
        : undefined,
    [isBulkInvoiceMode, rowSelection],
  );

  const handleReportItemProblem = useCallback(
    (order: Order, orderItem: OrderItem, problem?: ItemProblem) => {
      setSelectedProblemOrder(order);
      setSelectedProblemItem(orderItem);
      setExistingProblem(problem);
      setShowItemProblemDialog(true);
    },
    [],
  );

  const handleSubmitItemProblem = useCallback(
    async (problem: ItemProblem | null) => {
      if (!selectedProblemOrder || !selectedProblemItem) return;
      await updateItemProblem(
        selectedProblemOrder.id,
        selectedProblemOrder.channelId,
        selectedProblemItem.id,
        problem,
      );
    },
    [selectedProblemItem, selectedProblemOrder, updateItemProblem],
  );

  const renderOrderItemsSectionForPreview = useCallback(
    (
      order: Order,
      {
        dirtyFlag,
        files,
        onUploadComplete,
        setDirtyFlag,
      }: {
        dirtyFlag: boolean;
        files: ListResults[] | undefined;
        onUploadComplete: () => void;
        setDirtyFlag: Dispatch<SetStateAction<boolean>>;
      },
    ) => (
      <OrderItemsFilesSection
        storage={storage}
        order={order}
        orderItems={order.items}
        listResults={files ?? []}
        baseFolderPath={getFolderPath(order.channelId || channel?.id || "")}
        channelId={order.channelId || channel?.id}
        handleFulfillItem={(orderId, itemId, fulfilled) => {
          void updateItemFulfillment?.(
            orderId,
            order.channelId,
            itemId,
            fulfilled,
          );
        }}
        handleSetItemInProgress={(orderId, itemId, inProgress) => {
          void updateItemInProgress?.(
            orderId,
            order.channelId,
            itemId,
            inProgress,
          );
        }}
        handleSetItemPriority={(orderId, itemId, priority) => {
          void updateItemPriority?.(orderId, order.channelId, itemId, priority);
        }}
        onReportItemProblem={(orderItem, itemProblem) =>
          handleReportItemProblem(order, orderItem, itemProblem)
        }
        onFileDownload={onFileDownload}
        onFileDelete={onFileDelete}
        setDirtyFlag={setDirtyFlag}
        dirtyFlag={dirtyFlag}
        showFiles
        orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
        shippingMethodsSettings={shippingMethodsSettings}
        onFilesChanged={onUploadComplete}
        tenantContext={tenantContext}
        t={t}
        i18n={i18n}
      />
    ),
    [
      channel?.id,
      getFolderPath,
      handleReportItemProblem,
      i18n,
      orderWorkflowStatusesSettings,
      shippingMethodsSettings,
      tenantContext,
      t,
      updateItemFulfillment,
      updateItemInProgress,
      updateItemPriority,
    ],
  );

  const getOrderRowColors = useCallback((row: Row<Order>) => {
    const hasUnresolvedProblems =
      row.original.problemItems?.some((problem) => !problem.resolved) ?? false;

    if (!hasUnresolvedProblems) {
      return undefined;
    }

    return {
      bgColor: { base: "red.50", _dark: "rgba(229, 62, 62, 0.14)" },
      hoverBgColor: { base: "red.100", _dark: "rgba(229, 62, 62, 0.2)" },
    };
  }, []);

  const getOrderQuickFilterText = useCallback(
    (row: Row<Order>) => {
      return (
        orderTableRowDerivedById.get(getOrderQuickFilterCacheKey(row.original))
          ?.quickFilterText ??
        buildOrderTableRowDerived(row.original).quickFilterText
      );
    },
    [buildOrderTableRowDerived, orderTableRowDerivedById],
  );

  const activePrintingMethodOptions = useMemo<SelectOption[]>(
    () =>
      activePrintingMethodDefinitions.map((method) => ({
        color: method.colorPalette,
        label: getPrintingMethodLabel(
          method.id,
          printingMethodsSettings,
          t,
          activeLocale,
        ),
        value: method.id,
      })),
    [activeLocale, activePrintingMethodDefinitions, printingMethodsSettings, t],
  );

  const rules: Rule[] = useMemo(() => {
    return [
      {
        label: t("orders.orderStatus", { defaultValue: "Order status" }),
        fieldPath: new FieldPath("status"),
        options: statusOptions,
        opStr: "in",
      },
      {
        label: t("orders.paymentStatus", { defaultValue: "Payment status" }),
        fieldPath: new FieldPath("paymentStatus"),
        options: paymentStatusOptions,
        opStr: "in",
      },
      {
        label: t("orders.paymentType", { defaultValue: "Payment type" }),
        fieldPath: new FieldPath("paymentType"),
        options: paymentTypesOptions,
        opStr: "in",
      },
      {
        label: t("orders.filesStatus", { defaultValue: "Files status" }),
        fieldPath: new FieldPath("filesStatus"),
        options: orderFilesStatusOptions,
        opStr: "in",
      },
      {
        label: t("orders.productionView.printingMethods.heading", {
          defaultValue: "Print type",
        }),
        fieldPath: new FieldPath("printingMethods"),
        options: activePrintingMethodOptions,
        opStr: "array-contains-any",
      },
      {
        label: t("orders.noPaymentDocument", {
          defaultValue: "Without payment document",
        }),
        fieldPath: new FieldPath("paymentDocumentId"),
        options: [
          {
            label: t("orders.noPaymentDocument", {
              defaultValue: "Without payment document",
            }),
            value: "",
          },
        ],
        opStr: "==",
      },
      {
        label: t("orders.createdBy", { defaultValue: "Created by" }),
        fieldPath: new FieldPath("createdBy", "id"),
        options: membersOptions,
        opStr: "in",
      },
      {
        label: t("orders.pickupAt", { defaultValue: "Pickup at" }),
        fieldPath: new FieldPath("shipping", "street"),
        options: warehouseOptions,
        opStr: "in",
      },
    ];
  }, [
    orderFilesStatusOptions,
    paymentTypesOptions,
    paymentStatusOptions,
    activePrintingMethodOptions,
    statusOptions,
    membersOptions,
    warehouseOptions,
    t,
  ]);
  const configurableRulePresets = useMemo(
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
  const rulePresets: RulePreset[] = [
    ...configurableRulePresets,
    {
      label: t("orders.pending", { defaultValue: "Pending" }),
      icon: "pending",
      values: [
        where("status", "in", [
          OrderStatus.DELAYED,
          OrderStatus.UNDER_REVIEW,
          OrderStatus.WAITING_FOR_MATERIALS,
        ]),
        where("paymentStatus", "in", [
          PaymentStatus.NEW,
          PaymentStatus.PARTIALLY_PAID,
          PaymentStatus.PENDING,
        ]),
      ],
    },
    {
      label: t("orders.noPaymentDocument", {
        defaultValue: "Without payment document",
      }),
      icon: "receipt",
      values: [where("paymentDocumentId", "==", "")],
    },
    {
      label: t("orders.proformaWithoutPayment", {
        defaultValue: "Proforma without payment document",
      }),
      icon: "receipt_long",
      values: [
        where("proformaDocumentId", "!=", ""),
        where("paymentDocumentId", "==", ""),
      ],
    },
    {
      label: t("allegro.badge", { defaultValue: "Allegro" }),
      icon: "storefront",
      values: [where("externalSource.provider", "==", "ALLEGRO")],
    },
  ];

  useEffect(() => {
    if (!isEmpty(rulesState.rulesQueries)) {
      return;
    }
    dispatchRulesState({
      rulesQueries: initialRulesQueries(rules),
      values: initialValues(rules),
      presetEnabled: false,
      enabledPresetIndex: null,
      enabledPresetId: null,
      type: "INIT",
    });
  }, [dispatchRulesState, rules, rulesState.rulesQueries]);

  function handleSetDate(startDate: string, endDate: string) {
    if (startDate === "" || endDate === "") {
      setStartDate(undefined);
      setEndDate(undefined);
    }
    if (startDate) setStartDate(startDate);
    if (endDate) setEndDate(endDate);
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
      <CustomHeading
        heading={t("orders.title", { defaultValue: "Orders" })}
        mb={"8"}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <Flex flexDir={["column", "row"]} gap={2} mb={6}>
        <SearchInput
          placeholder={t("orders.searchPlaceholder", {
            defaultValue: "Search orders...",
          })}
          maxW={{ base: "full", md: "sm" }}
          searchFn={searchOrders}
          searchMode={"manual"}
          cleanFn={cleanOrdersSearchResults}
          searchResults={ordersSearchResults}
          // enableVectorSearch
          loading={loadingOrders}
          t={t}
        />
        <OrdersCustomerFilter
          customerFilterId={customerFilterId}
          loading={loadingOrders}
          setCustomerFilterId={setCustomerFilterId}
          t={t}
        />
        <MenuRoot
          closeOnSelect={false}
          positioning={{ placement: "bottom-end" }}
        >
          <MenuTrigger asChild>
            <IconButton
              aria-label={t("orders.searchField.triggerAriaLabel", {
                defaultValue: "Filter search fields",
              })}
              variant={selectedSearchFields.length > 0 ? "solid" : "outline"}
              colorPalette={
                selectedSearchFields.length > 0 ? "primary" : "gray"
              }
            >
              <MaterialSymbol>filter_alt</MaterialSymbol>
              {selectedSearchFields.length > 0 && (
                <Float placement="top-end" offsetX="1" offsetY="1">
                  <Circle
                    size="4"
                    bg="primary.solid"
                    color="white"
                    fontSize="2xs"
                  >
                    {selectedSearchFields.length}
                  </Circle>
                </Float>
              )}
            </IconButton>
          </MenuTrigger>
          <MenuContent minW="14rem">
            <MenuItemGroup
              title={t("orders.searchField.label", {
                defaultValue: "Search fields",
              })}
            >
              <MenuItem
                value="all-fields"
                disabled={selectedSearchFields.length === 0}
                onClick={() => {
                  setPageIndex(0);
                  setSelectedSearchFields([]);
                }}
              >
                <MaterialSymbol>filter_alt_off</MaterialSymbol>
                {t("orders.searchField.allFields", {
                  defaultValue: "All fields",
                })}
              </MenuItem>
              <MenuSeparator />
              {searchFieldOptions.map((option) => (
                <MenuCheckboxItem
                  key={option.value}
                  value={option.value}
                  checked={selectedSearchFields.includes(option.value)}
                  onCheckedChange={(checked) =>
                    handleSearchFieldCheckedChange(option.value, checked)
                  }
                >
                  {option.label}
                </MenuCheckboxItem>
              ))}
            </MenuItemGroup>
          </MenuContent>
        </MenuRoot>
        {!isEmpty(rulesState.rulesQueries) && (
          <Rules
            rules={rules}
            queries={queryConstraints}
            setQueries={setQueries}
            rulePresets={rulePresets}
            belowPresets={
              canIncludeStoreOrders ? (
                <Switch
                  checked={includeStoreOrders}
                  justifyContent="space-between"
                  onCheckedChange={(details) =>
                    setIncludeStoreOrders(details.checked)
                  }
                  size="sm"
                  w="full"
                >
                  {t("orders.includeStoreOrders.label", {
                    defaultValue: "Include store channel orders",
                  })}
                </Switch>
              ) : undefined
            }
            compactOnDesktop
            compactExpandAt={compactToolbarExpandAt}
            disabled={!!ordersSearchResults && ordersSearchResults.length > 0}
            savedRulesQueries={rulesState}
            dispatchRulesState={dispatchRulesState}
            refreshFn={refreshOrders}
            t={t}
          />
        )}
        <HStack alignItems={"stretch"} gap={2} flexWrap={"wrap"}>
          <FromToDateInput
            handleSetDate={handleSetDate}
            compactOnDesktop
            compactExpandAt={compactToolbarExpandAt}
            disabled={!!ordersSearchResults && ordersSearchResults.length > 0}
            i18n={i18n}
          />
          {hasFakturowniaKey && (
            <Tooltip
              content={
                isIncludeStoreOrdersEnabled
                  ? t("orders.bulkInvoice.selectedChannelOnly", {
                      defaultValue:
                        "Collective invoice is available only when viewing orders from the selected channel.",
                    })
                  : t("orders.bulkInvoice.label", {
                      defaultValue: "Collective invoice",
                    })
              }
            >
              <Button
                disabled={isIncludeStoreOrdersEnabled}
                variant={isBulkInvoiceMode ? "solid" : "outline"}
                onClick={handleToggleBulkInvoiceMode}
                aria-pressed={isBulkInvoiceMode}
                aria-label={t("orders.bulkInvoice.label", {
                  defaultValue: "Collective invoice",
                })}
                px="2.5"
                css={{
                  [compactToolbarExpandQuery]: {
                    paddingInline: "var(--chakra-spacing-4)",
                  },
                }}
              >
                <MaterialSymbol>receipt_long</MaterialSymbol>
                <chakra.span
                  display="none"
                  css={{
                    [compactToolbarExpandQuery]: {
                      display: "inline",
                    },
                  }}
                >
                  {t("orders.bulkInvoice.label", {
                    defaultValue: "Collective invoice",
                  })}
                </chakra.span>
              </Button>
            </Tooltip>
          )}
        </HStack>
        <Spacer />
        <>
          <Tooltip
            content={t("admin.fulfillmentRequests", {
              defaultValue: "Fulfillment Requests",
            })}
          >
            <chakra.span position={"relative"}>
              <IconButtonLink
                lng={i18n.resolvedLanguage}
                icon={"assignment_add"}
                href={
                  channelWarehouseIds.length > 0
                    ? ADMIN_CONFIG_WAREHOUSE_FULFILLMENT_REQUESTS(
                        channelWarehouseIds[0],
                      )
                    : "#"
                }
                variant={"outline"}
                aria-label={t("admin.fulfillmentRequests", {
                  defaultValue: "Fulfillment Requests",
                })}
                onClick={() => {}}
                prefetch={false}
                disabled={channelWarehouseIds.length === 0}
                colorPalette="gray"
              ></IconButtonLink>
              <Show when={activeFulfillmentRequestsCount > 0}>
                <Float offset={1}>
                  <Circle
                    fontSize={"sm"}
                    fontWeight={"bold"}
                    size={"5"}
                    bg={{ base: "red.500", _dark: "red.400" }}
                    color={{ base: "white", _dark: "gray.900" }}
                  >
                    {activeFulfillmentRequestsCount}
                  </Circle>
                </Float>
              </Show>
            </chakra.span>
          </Tooltip>
        </>
        <>
          <Tooltip
            content={t("orders.complaints", { defaultValue: "Complaints" })}
          >
            <chakra.span position={"relative"}>
              <IconButtonLink
                lng={i18n.resolvedLanguage}
                icon={"warning"}
                href={ADMIN_ORDERS_COMPLAINTS}
                variant={"outline"}
                aria-label={t("orders.complaints", {
                  defaultValue: "Complaints",
                })}
                onClick={() => {}}
                prefetch={false}
                colorPalette="gray"
              ></IconButtonLink>
              <Show when={activeComplaintsCount > 0}>
                <Float offset={1}>
                  <Circle
                    fontSize={"sm"}
                    fontWeight={"bold"}
                    size={"5"}
                    bg={{ base: "red.500", _dark: "red.400" }}
                    color={{ base: "white", _dark: "gray.900" }}
                  >
                    {activeComplaintsCount}
                  </Circle>
                </Float>
              </Show>
            </chakra.span>
          </Tooltip>
        </>
        <RefreshButton
          label={t("orders.refreshOrders", { defaultValue: "Refresh orders" })}
          refreshFunction={refreshOrders}
        />
        <Tooltip content={t("orders.newOrder", { defaultValue: "New Order" })}>
          <ButtonLink
            lng={i18n.resolvedLanguage}
            href={ADMIN_ORDERS_CREATE}
            variant="solid"
            colorPalette={"primary"}
            ariaLabel={t("orders.newOrder", { defaultValue: "New Order" })}
            px="2.5"
            css={{
              [compactToolbarExpandQuery]: {
                paddingInline: "var(--chakra-spacing-4)",
              },
            }}
          >
            <MaterialSymbol>create</MaterialSymbol>
            <chakra.span
              display="none"
              css={{
                [compactToolbarExpandQuery]: {
                  display: "inline",
                },
              }}
            >
              {t("orders.newOrder", { defaultValue: "New Order" })}
            </chakra.span>
          </ButtonLink>
        </Tooltip>
      </Flex>
      {loadingOrders && (!data || data.length === 0) ? (
        <DataTable
          columns={columns}
          data={[]}
          loading={true}
          defaultPageSize={ORDERS_PAGE_SIZE}
          t={t}
          i18n={i18n}
        />
      ) : data && data.length > 0 ? (
        <DataTable
          key={isBulkInvoiceMode ? "orders-bulk" : "orders-default"}
          columns={columns}
          data={data}
          getRowId={getOrderTableRowId}
          getQuickFilterText={getOrderQuickFilterText}
          paginationType={"controlled"}
          show={ordersSearchResults ? showSearchOrders : showOrders}
          itemsCount={
            ordersSearchResults ? ordersSearchTotalCount : ordersCount
          }
          loading={loadingOrders}
          defaultPageIndex={pageIndex}
          defaultPageSize={ORDERS_PAGE_SIZE}
          setPageIndex={setPageIndex}
          showManagesPageIndex={true}
          isRowCollapsable={true}
          enableSorting
          t={t}
          i18n={i18n}
          storage={storage}
          updateItemFulfillment={updateItemFulfillment}
          updateItemInProgress={updateItemInProgress}
          updateItemPriority={updateItemPriority}
          onReportItemProblem={handleReportItemProblem}
          onFileDownload={onFileDownload}
          onFileDelete={onFileDelete}
          showFiles={true}
          getRowColors={getOrderRowColors}
          renderItemsSection={renderOrderItemsSectionForPreview}
          tenantContext={tenantContext}
          enableRowSelection={tableRowSelection}
          actionBar={bulkInvoiceActionBar}
        />
      ) : (
        <Empty
          title={t("orders.noOrders", { defaultValue: "No orders" })}
          description={t("orders.noOrdersDescription", {
            defaultValue: "No orders found.",
          })}
          icon={"orders"}
        />
      )}

      {currentOrder && showUpdateForm ? (
        currentOrder.isFromStore ? (
          <Drawer
            header={updateOrderLabel}
            size={"xl"}
            closeOnOverlayClick={false}
            open={showUpdateForm}
            setOpen={setShowUpdateForm}
            restoreFocus={false}
            lazyMount
            unmountOnExit
          >
            <DeferredStoreOrderUpdateForm
              order={currentOrder}
              setOptimisticOrder={patchCurrentOrderOptimistically}
            />
          </Drawer>
        ) : (
          <OrderForm
            order={currentOrder}
            asDrawer
            type={"UPDATE"}
            open={showUpdateForm}
            setOpen={setShowUpdateForm}
            setOptimisticOrder={patchCurrentOrderOptimistically}
          />
        )
      ) : null}
      {currentOrder && showDuplicateForm && (
        <OrderForm
          order={currentOrder}
          asDrawer
          type={"DUPLICATE"}
          open={showDuplicateForm}
          setOpen={setShowDuplicateForm}
          onCreateSuccess={() => {
            setShowDuplicateForm(false);
            setCurrentOrder(null);
          }}
        />
      )}

      <Dialog.Root
        role={"alertdialog"}
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
                    : t("orders.warning", { defaultValue: "Warning!" })}
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
                      <Text fontWeight="medium">
                        {t("orders.incompleteStatusChangeConfirm", {
                          defaultValue:
                            "Do you still want to move it to {{status}}?",
                          status: t("OrderStatus.IN_PROGRESS", {
                            defaultValue: "In progress",
                          }),
                        })}
                      </Text>
                    </>
                  ) : pendingStatusConfirmation ? (
                    <>
                      <Text>
                        {t("orders.changeStatusConfirm", {
                          defaultValue:
                            "Are you sure you want to change the order status to {{status}}?",
                          status: t(
                            `OrderStatus.${pendingStatusConfirmation.value}`,
                            {
                              defaultValue: getOrderWorkflowStatusLabel(
                                pendingStatusConfirmation.value,
                                orderWorkflowStatusesSettings,
                                t,
                                activeLocale,
                              ),
                            },
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
                    variant={"outline"}
                    onClick={() => {
                      setPendingStatusConfirmation(null);
                    }}
                  >
                    {t("orders.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </Dialog.ActionTrigger>
                <Dialog.ActionTrigger asChild>
                  <Button
                    colorPalette={"primary"}
                    onClick={() => {
                      if (pendingStatusConfirmation) {
                        handleUpdateStatus(
                          pendingStatusConfirmation.name,
                          pendingStatusConfirmation.value,
                          pendingStatusConfirmation.order,
                          pendingStatusConfirmation.updatedBy,
                        );
                        setPendingStatusConfirmation(null);
                      }
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
        onOpenChange={(open) => {
          if (!open) {
            setPendingStatusActorSelection(null);
          }
        }}
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
      />

      {currentOrder && showDeactivateDialog && (
        <AlertDialog
          header={t("orders.confirmDeactivateOrder", {
            defaultValue: "Are you sure you want to deactivate the order?",
          })}
          handle={() =>
            deactivateOrder(currentOrder.id, currentOrder.channelId)
          }
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
          order={currentOrder}
          open={showAttachmentsForm}
          setOpen={setShowAttachmentsForm}
          setOptimisticOrder={(action) => {
            setCurrentOrder((prev) =>
              prev
                ? {
                    ...prev,
                    ...action,
                  }
                : prev,
            );
          }}
        />
      )}
      {currentOrder && showTrackingForm && (
        <TrackingForm
          order={currentOrder}
          open={showTrackingForm}
          setOpen={setShowTrackingForm}
        />
      )}
      {currentOrder && showComplaintForm && (
        <ComplaintForm
          order={currentOrder}
          type={"CREATE"}
          open={showComplaintForm}
          setOpen={setShowComplaintForm}
        />
      )}
      {currentOrder && showNoteCreateForm && (
        <NoteForm
          type={"CREATE"}
          asDrawer
          open={showNoteCreateForm}
          setOpen={setShowNoteCreateForm}
          entityId={`${currentOrder.id}?channelId=${currentOrder.channelId}`}
          entityType={NoteEntityType.ORDER}
        />
      )}
      {currentOrder && showPaymentDocumentForm && (
        <PaymentDocumentForm
          orderId={currentOrder.id}
          channelId={currentOrder.channelId ?? channel?.id}
          paymentDocumentId={currentOrder.paymentDocumentId}
          proformaDocumentId={currentOrder.proformaDocumentId}
          paymentStatus={currentOrder.paymentStatus}
          open={showPaymentDocumentForm}
          setOpen={setShowPaymentDocumentForm}
          setOptimisticOrder={(action) => {
            setCurrentOrder((prev) =>
              prev
                ? {
                    ...prev,
                    ...action,
                  }
                : prev,
            );
            patchOrder(
              currentOrder.id,
              currentOrder.channelId ?? channel?.id,
              action,
            );
          }}
        />
      )}
      <ItemProblemDialog
        open={showItemProblemDialog}
        onOpenChange={(open) => {
          setShowItemProblemDialog(open);
          if (!open) {
            setSelectedProblemItem(null);
            setSelectedProblemOrder(null);
            setExistingProblem(undefined);
          }
        }}
        orderItem={selectedProblemItem}
        existingProblem={existingProblem}
        onSubmit={handleSubmitItemProblem}
      />
    </>
  );
};

export default OrdersPage;
