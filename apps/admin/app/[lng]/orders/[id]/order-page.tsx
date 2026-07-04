"use client";

import { classifyOrderPrintingMethodsAdmin } from "@/actions/ai";
import {
  createVatInvoiceFromProforma,
  getInvoices,
  isFakturowniaApiKeyProvided,
} from "@/actions/fakturownia";
import {
  formatFakturowniaIntegrationActionError,
  formatKsefReadinessIssues,
} from "@/components/fakturownia/FakturowniaErrors";
import type {
  SerializedOrderRiskAnalysis,
  StartOrderRiskAnalysisResponse,
} from "@/actions/order-risk-workflow";
import { sendOrderStatusEmail } from "@/actions/order-status-email";
import {
  createAdminStripePaymentLink,
  markOrderArrivedAtPickup,
  updateOrderStatusField,
} from "@/actions/order-updates";
import { isPolkurierApiKeyProvided } from "@/actions/polkurier";
import { Notes } from "@/components/notes/Notes";
import { EmailConversation } from "@/components/orders/EmailConversation";
import { ItemProblemDialog } from "@/components/orders/ItemProblemDialog";
import { ManualFulfillmentRequestDialog } from "@/components/orders/ManualFulfillmentRequestDialog";
import {
  OrderCustomerInlineEditor,
  type OrderCustomerInlineEditorValue,
} from "@/components/orders/OrderCustomerInlineEditor";
import {
  OrderDeadlineInlineEditor,
  type OrderDeadlineInlineEditorValue,
} from "@/components/orders/OrderDeadlineInlineEditor";
import {
  OrderExecutionInlineEditor,
  type OrderExecutionInlineEditorValue,
} from "@/components/orders/OrderExecutionInlineEditor";
import OrderItemImageGenerationDialog from "@/components/orders/OrderItemImageGenerationDialog";
import { OrderItemWarehouseAssignmentDialog } from "@/components/orders/OrderItemWarehouseAssignmentDialog";
import { OrderImpositionTemplatesSection } from "@/components/orders/OrderImpositionTemplatesSection";
import {
  createAdminOrderUpdatePayload,
  createAdminOrderItemsUpdatePatch,
  parseOrderDeadlineString,
  persistAdminOrderUpdate,
} from "@/components/orders/order-update";
import OrderItemsFilesSection from "@/components/orders/OrderItemsFilesSection";
import OrderPageItemEditor from "@/components/orders/OrderPageItemEditor";
import { OrderRiskAnalysisCard } from "@/components/orders/OrderRiskAnalysisCard";
import { OrderShippingMapPreview } from "@/components/orders/OrderShippingMapPreview";
import PaymentDocumentForm from "@/components/orders/PaymentDocumentForm";
import PaymentProofUploader from "@/components/orders/PaymentProofUploader";
import { SendParcelDialog } from "@/components/orders/SendParcelDialog";
import { StatusSelect } from "@/components/orders/status-select";
import { StatusActorSelectionDialog } from "@/components/orders/StatusActorSelectionDialog";
import TrackingForm from "@/components/orders/TrackingForm";
import {
  useConfigurationMembers,
  useConfigurationSettings,
  useConfigurationWarehouses,
} from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useOrderFolderSettings } from "@/hooks/useOrderFolderSettings";
import { useT } from "@/i18n/client";
import { firestore, storage } from "@/lib/firebase/clientApp";
import { updateItemStatus } from "@/lib/fulfillment/client";
import type { FulfillmentMutationResponse } from "@/lib/fulfillment/types";
import { list } from "@/lib/firebase/storage";
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
import { buildAdminOrderTaxSummary } from "@/lib/orders/tax-summary.client";
import {
  Alert,
  Badge,
  Box,
  Button,
  Circle,
  createListCollection,
  Dialog,
  For,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Portal,
  Presence,
  QrCode,
  Separator,
  Select,
  Show,
  Skeleton,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  Activity,
  CustomerInfo,
  CustomHeading,
  FakturowniaInvoice,
  FileList,
  IconButtonLink,
  MaterialSymbol,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
  Payment,
  SpecialNotesBackgroundPattern,
  SpecialNotes,
  toaster,
  Tooltip,
} from "@konfi/components";
import {
  db,
  fetchOrderItemFiles,
  getComplaints,
  getNotes,
  tenantStoragePaths,
  type TenantContext,
  update,
} from "@konfi/firebase";
import {
  ActivityStatus,
  CurrencyEnum,
  DEFAULT_LOCALE,
  isAllegroExternalOrder,
  isAllegroFulfillmentManagedOrder,
  isNestedCustomer,
  isStoreOrder,
  ItemProblem,
  ListResults,
  NestedMember,
  Order,
  OrderRiskAnalysisSource,
  OrderRiskAnalysisStatus,
  OrderItem,
  OrderStatus,
  type PaymentMethodId,
  PaymentStatus,
  PaymentStatusAsOptions,
  PaymentType,
  ScanPayload,
  SelectOption,
  ShippingOptions,
  Tracking,
} from "@konfi/types";
import {
  applyOrderItemStatusChange,
  applyOrderItemPrintingMethodAssignments,
  formatPrice,
  getOrderFileStatusColorPalette,
  getOrderFileStatusLabel,
  getOrderPaymentStatusColorPalette,
  getOrderWorkflowStatusColorPalette,
  getOrderWorkflowStatusLabel,
  getKnownPrintingMethodIds,
  getPaymentDocumentInvoiceCreateKind,
  getPaymentDocumentMeta,
  isElectron,
  isShippingWithCourier,
  toSerializableOrderPrintingMethodItems,
} from "@konfi/utils";
import { useAuth } from "context/auth";
import { useChannels } from "context/channels";
import { useOrders } from "context/orders";
import { isNull, isUndefined, merge } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import {
  arrayUnion,
  doc,
  onSnapshot,
  Timestamp,
  type UpdateData,
} from "firebase/firestore";
import { getMetadata } from "firebase/storage";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { InternalTransitPanel } from "@/components/orders/InternalTransitPanel";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { useReactToPrint } from "react-to-print";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import { getFakturowniaDocumentId } from "./get-fakturownia-document-id";

const OrderForm = dynamic(() => import("@/components/orders/OrderForm"), {
  loading: () => <Skeleton />,
  ssr: false,
});

type PendingStatusChange = {
  field: "status";
  order: Order;
  updatedBy?: NestedMember;
  value: string;
};

type RunOrderRiskAnalysisOptions = {
  showErrors?: boolean;
  showSpinner?: boolean;
};

async function fetchOrderRiskAnalysis(
  channelId: string,
  orderId: string,
): Promise<SerializedOrderRiskAnalysis | null> {
  const searchParams = new URLSearchParams({ channelId, orderId });
  const response = await fetch(`/api/order-risk-analysis?${searchParams}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load order risk analysis.");
  }

  return (await response.json()) as SerializedOrderRiskAnalysis | null;
}

async function startOrderRiskAnalysisRequest(input: {
  channelId: string;
  orderId: string;
  source: OrderRiskAnalysisSource;
}): Promise<StartOrderRiskAnalysisResponse> {
  const response = await fetch("/api/order-risk-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as StartOrderRiskAnalysisResponse;

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to start order risk analysis.");
  }

  return data;
}

const fetchAttachments = async (
  tenantContext: TenantContext,
  channelId: string,
  orderId: string,
  customerId: string,
) => {
  const data = await list(
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
      return isUndefined(metadata)
        ? null
        : { storageReference: result, metadata };
    }),
  );

  return attachments.filter(
    (attachment): attachment is ListResults => attachment !== null,
  );
};

const OrderPage = () => {
  const { t, i18n } = useT([
    "order",
    "orders",
    "fakturownia",
    "allegro",
    "translation",
  ]);
  const { user, userInfo } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const searchParamsChannelId = useSearchParams().get("channelId");
  const {
    updateItemFulfillment,
    updateItemInProgress,
    updateItemPickedUp,
    updateItemDelivered,
    updateItemPriority,
    updateItemProblem,
  } = useOrders();
  const { loadingChannels, channel, channels, setChannel } = useChannels();
  const { filteredMembers, loadingMembers } = useConfigurationMembers();
  const { warehouses } = useConfigurationWarehouses();
  const {
    storeSettings,
    printingMethodsSettings,
    shippingMethodsSettings,
    orderWorkflowStatusesSettings,
  } = useConfigurationSettings();
  const tenantContext = useTenantContext();
  const { getFolderPath } = useOrderFolderSettings();
  const channelId = searchParamsChannelId ?? channel?.id;

  useEffect(() => {
    if (!searchParamsChannelId || searchParamsChannelId === channel?.id) {
      return;
    }
    if (loadingChannels || !channels) {
      return;
    }

    const searchParamsChannel = channels.find(
      (channelItem) => channelItem.id === searchParamsChannelId,
    );
    if (!searchParamsChannel) {
      console.error(
        `Order details requested channel ${searchParamsChannelId}, but it was not found in the loaded channels list.`,
      );
      return;
    }

    setChannel({ value: searchParamsChannel.id });
  }, [
    channel?.id,
    channels,
    loadingChannels,
    searchParamsChannelId,
    setChannel,
  ]);
  const [order, setOrder] = useState<Order | undefined>(undefined);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [optimisticOrder, setOptimisticOrder] = useOptimistic<
    Order | undefined,
    Partial<Order>
  >(order, (state, newState) => {
    if (!state && newState) return newState as Order;
    if (!state) return undefined;
    if (!newState) return state;
    return merge(state, newState) as Order;
  });
  const { data: hasPolkurierKey } = useSWRImmutable("polkurier-api-key", () =>
    isPolkurierApiKeyProvided(),
  );
  const { data: hasFakturowniaKey } = useSWRImmutable(
    "fakturownia-api-key",
    () => isFakturowniaApiKeyProvided(),
  );
  const canUseFakturownia = hasFakturowniaKey === true;
  const canUsePolkurier = hasPolkurierKey === true;

  const fakturowniaDocumentId = getFakturowniaDocumentId(optimisticOrder);
  const hasPaymentDocument = Boolean(fakturowniaDocumentId?.trim());
  const { data: fakturowniaInvoice, mutate: mutateFakturowniaInvoice } = useSWR(
    canUseFakturownia && fakturowniaDocumentId && channel
      ? ["fakturownia-invoice", fakturowniaDocumentId]
      : null,
    async ([, documentId]) => {
      const _documentId = documentId ?? "";
      if (!_documentId) return null;
      const invoices = await getInvoices({ number: _documentId });
      if (!isEmpty(invoices)) {
        return invoices[0];
      }
      return null;
    },
  );
  const memberOptions = useMemo(
    () =>
      (filteredMembers ?? [])
        .map((member) => member.name?.trim())
        .filter((memberName): memberName is string => Boolean(memberName))
        .map((memberName) => ({ label: memberName, value: memberName })),
    [filteredMembers],
  );
  const knownPrintingMethodIds = useMemo(
    () => getKnownPrintingMethodIds(printingMethodsSettings),
    [printingMethodsSettings],
  );

  const vatInvoiceSellerPersonCollection = useMemo(
    () => createListCollection({ items: memberOptions }),
    [memberOptions],
  );

  const showQRCode = useMemo(() => {
    let show = false;
    if (!optimisticOrder) return show;
    if (optimisticOrder.shippingOption === ShippingOptions.COMPANY_COURIER) {
      show = true;
    }
    if (
      optimisticOrder.isFromStore &&
      optimisticOrder.shippingOption === ShippingOptions.PERSONAL_COLLECTION
    ) {
      show = true;
    }
    if (warehouses && channel && !isEmpty(channel.warehouses)) {
      if (
        warehouses.find(
          (w) =>
            w.address?.name === optimisticOrder.shipping?.name &&
            !channel.warehouses.includes(w.id),
        )
      ) {
        show = true;
      }
    }
    return show;
  }, [optimisticOrder, warehouses, channel]);

  useEffect(() => {
    if (!id || !channelId) return;
    setLoadingOrder(true);
    const unsub = onSnapshot(
      doc(firestore, `/channels/${channelId}/orders/${id}`),
      (snapshot) => {
        if (!snapshot.exists()) {
          // No document -> clear order
          setOrder(undefined);
          setLoadingOrder(false);
          return;
        }

        const newOrder = snapshot.data() as Order;

        setOrder(newOrder);
        setLoadingOrder(false);
      },
      () => setLoadingOrder(false),
    );

    return () => unsub();
  }, [id, channelId]);

  const [loadingOrderItems, setLoadingOrderItems] = useState<boolean>(true);
  const [orderItems, setOrderItems] = useState<OrderItem[] | null>(null);
  const componentRef = useRef(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showAttachmentsForm, setShowAttachmentsForm] = useState(false);
  const [showPaymentDocumentForm, setShowPaymentDocumentForm] = useState(false);
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [showCreateVatInvoiceDialog, setShowCreateVatInvoiceDialog] =
    useState(false);
  const [vatInvoiceSellerPerson, setVatInvoiceSellerPerson] = useState<
    string | undefined
  >(undefined);
  const [isCreatingVatInvoice, setIsCreatingVatInvoice] = useState(false);
  const [showSendParcelDialog, setShowSendParcelDialog] = useState(false);
  const [isStartingOrderRiskAnalysis, setIsStartingOrderRiskAnalysis] =
    useState(false);
  const autoStartedOrderRiskRef = useRef<string | null>(null);
  const [pendingStatusConfirmation, setPendingStatusConfirmation] = useState<
    | (PendingStatusChange & {
        kind: "status-email" | "incomplete-order";
      })
    | null
  >(null);
  const [pendingStatusActorSelection, setPendingStatusActorSelection] =
    useState<PendingStatusChange | null>(null);
  const {
    data: orderRiskAnalysis,
    isLoading: loadingOrderRiskAnalysis,
    mutate: mutateOrderRiskAnalysis,
  } = useSWR<SerializedOrderRiskAnalysis | null>(
    id && channelId ? ["order-risk-analysis", channelId, id] : null,
    ([, resolvedChannelId, orderId]: [string, string, string]) =>
      fetchOrderRiskAnalysis(resolvedChannelId, orderId),
    {
      revalidateOnFocus: false,
      refreshInterval: (currentData) =>
        isStartingOrderRiskAnalysis ||
        currentData?.status === OrderRiskAnalysisStatus.RUNNING ||
        currentData?.status === OrderRiskAnalysisStatus.PENDING
          ? 3000
          : 0,
    },
  );

  function handleUpdateFormOpen() {
    setShowUpdateForm(true);
  }

  function handleShowTrackingForm() {
    startTransition(() => {
      setShowTrackingForm(true);
    });
  }

  async function handleOpenFolder() {
    if (!optimisticOrder || !channel) return;
    const basePath = getFolderPath(channel.id);
    if (!basePath) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noFolderConfigured", {
          defaultValue: "No folder path configured for this channel",
        }),
      });
      return;
    }
    const folderPath = getOrderFolderPath(basePath, optimisticOrder.number);
    const success = await openOrderFolder(folderPath);
    if (!success) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.folderOpenError", {
          defaultValue:
            "Failed to open folder. Please check if the folder exists.",
        }),
      });
    }
  }

  const pageStyle = (
    type: "print-full" | "print-production" | "print-with-customer",
  ): string => `
    /* Footer hidden on screen via inline style; only show in print */
    @page { size: a2 landscape; }
    @media print {
      html, body { width:100% !important; height:100% !important; overflow:visible !important; background:#ffffff !important; print-color-adjust:exact !important; -webkit-print-color-adjust:exact !important; zoom:80%; }
      .noprint { display:none !important; }
      ${type === "print-production" ? ".noprint-production { display: none !important; }" : ""}
      .print-wrapper { min-height:100vh; display:flex; flex-direction:column; }
      /* Reserve space if footer is fixed */
      .print-content { flex:1 1 auto; ${type === "print-with-customer" ? "padding-bottom:160px;" : ""} }
      .print-footer {
        display:${type === "print-with-customer" ? "block" : "none"} !important;
        ${type === "print-with-customer" ? "position:fixed; left:0; right:0; bottom:0;" : ""}
        background:#ffffff !important;
        padding:20px 32px !important;
        box-sizing:border-box;
        page-break-inside:avoid;
        z-index:1000;
      }
      .print-grid-template-columns { display:grid !important; grid-template-columns:repeat(5,1fr) !important; column-gap:32px !important; row-gap:32px !important; }
      .print-grid-column-3 { grid-column: span 3 / span 3 !important; }
      .print-grid-column-2 { grid-column: span 2 / span 2 !important; }
    }
  `;

  const handlePrintFull = useReactToPrint({
    contentRef: componentRef,
    copyShadowRoots: true,
    pageStyle: pageStyle("print-full"),
    onBeforePrint: () => {
      if (optimisticOrder && channel) {
        document.title = `${t("ROUTES.order")} ${channel.name}#${optimisticOrder.number}`;
      }
      return Promise.resolve();
    },
    onAfterPrint: () => {
      document.title = t("ROUTES.order");
      if (channelId && id) {
        update(
          {
            activities: arrayUnion({
              type: ActivityStatus.ORDER_PRINTED,
              value: "ORDER_PRINTED",
              timestamp: Timestamp.now(),
            }),
          },
          doc(firestore, `/channels/${channelId}/orders/${id}`),
          tenantContext,
        ).catch(console.error);
      }
    },
  });

  const handlePrintWithCustomer = useReactToPrint({
    contentRef: componentRef,
    copyShadowRoots: true,
    pageStyle: pageStyle("print-with-customer"),
    onBeforePrint: () => {
      if (optimisticOrder && channel) {
        document.title = `${t("ROUTES.order")} ${channel.name}#${optimisticOrder.number}`;
      }
      return Promise.resolve();
    },
    onAfterPrint: () => {
      document.title = t("ROUTES.order");
      if (channelId && id) {
        update(
          {
            activities: arrayUnion({
              type: ActivityStatus.ORDER_PRINTED,
              value: "ORDER_PRINTED",
              timestamp: Timestamp.now(),
            }),
          },
          doc(firestore, `/channels/${channelId}/orders/${id}`),
          tenantContext,
        ).catch(console.error);
      }
    },
  });

  const [attachmentsDirtyFlag, setAttachmentsDirtyFlag] =
    useState<boolean>(false);
  const [showFiles, setShowFiles] = useState<boolean>(true);
  const [showWarehouseAssignmentDialog, setShowWarehouseAssignmentDialog] =
    useState(false);
  const [showManualFulfillmentDialog, setShowManualFulfillmentDialog] =
    useState(false);
  const [selectedOrderItem, setSelectedOrderItem] = useState<OrderItem | null>(
    null,
  );
  const [showItemProblemDialog, setShowItemProblemDialog] = useState(false);
  const [selectedProblemItem, setSelectedProblemItem] =
    useState<OrderItem | null>(null);
  const [existingProblem, setExistingProblem] = useState<
    ItemProblem | undefined
  >(undefined);
  const [selectedEditableItemId, setSelectedEditableItemId] = useState<
    string | null
  >(null);
  const [savingEditedItem, setSavingEditedItem] = useState(false);
  const [isChangingPaymentMethod, setIsChangingPaymentMethod] = useState(false);
  const [isCreatingStripePaymentLink, setIsCreatingStripePaymentLink] =
    useState(false);
  const borderColor = "gray.muted";
  const activeLocale = i18n.resolvedLanguage ?? i18n.language;
  const statusOptions = useMemo<SelectOption[]>(
    () =>
      orderWorkflowStatusesSettings.orderStatuses
        .filter((status) => status.enabled && !status.archived)
        .map((status) => ({
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
        })),
    [activeLocale, orderWorkflowStatusesSettings, t],
  );
  const paymentStatusOptions = useMemo<SelectOption[]>(
    () =>
      PaymentStatusAsOptions.map((paymentStatus) => ({
        label: t(`PaymentStatus.${paymentStatus.label}`),
        value: paymentStatus.value,
      })),
    [t],
  );
  const orderFilesStatusOptions = useMemo<SelectOption[]>(
    () =>
      orderWorkflowStatusesSettings.fileStatuses
        .filter((status) => status.enabled && !status.archived)
        .map((status) => ({
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
        })),
    [activeLocale, orderWorkflowStatusesSettings, t],
  );

  const handleRunOrderRiskAnalysis = useCallback(
    async (
      source: OrderRiskAnalysisSource = OrderRiskAnalysisSource.MANUAL_RERUN,
      options: RunOrderRiskAnalysisOptions = {},
    ) => {
      const showErrors = options.showErrors ?? true;
      const showSpinner = options.showSpinner ?? true;
      const resolvedChannelId = channelId ?? channel?.id;
      if (!resolvedChannelId || !optimisticOrder) {
        if (showErrors) {
          toaster.error({
            title: t("order.error", { defaultValue: "Error" }),
            description: t("order.noChannelSelected", {
              defaultValue: "No channel selected",
            }),
          });
        }
        return;
      }

      try {
        if (showSpinner) {
          setIsStartingOrderRiskAnalysis(true);
        }
        const result = await startOrderRiskAnalysisRequest({
          channelId: resolvedChannelId,
          orderId: optimisticOrder.id,
          source,
        });

        if (result.error) {
          throw new Error(result.error);
        }

        await mutateOrderRiskAnalysis();

        if (result.skipped) {
          return;
        }
      } catch (error) {
        console.error("Error starting order risk analysis:", error);
        if (showErrors) {
          toaster.error({
            title: t("order.error", { defaultValue: "Error" }),
            description:
              error instanceof Error
                ? error.message
                : t("order.orderRisk.startFailed", {
                    defaultValue: "Failed to start order risk analysis.",
                  }),
          });
        }
      } finally {
        if (showSpinner) {
          setIsStartingOrderRiskAnalysis(false);
        }
      }
    },
    [channelId, channel?.id, mutateOrderRiskAnalysis, optimisticOrder, t],
  );

  const triggerBackgroundOrderRiskAnalysis = useCallback(() => {
    void handleRunOrderRiskAnalysis(OrderRiskAnalysisSource.AUTO, {
      showErrors: false,
      showSpinner: false,
    });
  }, [handleRunOrderRiskAnalysis]);

  // Structured QR payload for scanning
  const qrValue = useMemo(() => {
    if (!showQRCode || !optimisticOrder) return undefined;
    const payload: ScanPayload = {
      v: 1,
      t: "ORDER_SCAN",
      cid: channelId ?? channel?.id,
      oid: optimisticOrder.id,
      stage: "AUTO",
    };
    return `konfi://${JSON.stringify(payload)}`;
  }, [showQRCode, optimisticOrder, channelId, channel?.id]);

  const {
    data: files,
    isValidating,
    mutate: mutateFiles,
  } = useSWRImmutable(
    !isEmpty(order) &&
      !isNull(order) &&
      !isUndefined(order) &&
      !isEmpty(orderItems) &&
      !isNull(orderItems) &&
      showFiles &&
      isNestedCustomer(order.customer)
      ? [order.id, order.customer.id, order.channelId, orderItems]
      : null,
    ([orderId, customerId, resolvedChannelId, _orderItems]) =>
      fetchOrderItemFiles(
        orderId,
        customerId,
        _orderItems,
        tenantContext,
        resolvedChannelId,
      ),
  );

  const { data: attachments } = useSWRImmutable(
    !isEmpty(order) &&
      !isNull(order) &&
      !isUndefined(order) &&
      isNestedCustomer(order.customer) &&
      order?.isFromStore
      ? [order.id, order.customer.id, order.channelId]
      : null,
    ([orderId, customerId, resolvedChannelId]) =>
      fetchAttachments(tenantContext, resolvedChannelId, orderId, customerId),
  );

  const { data: notes } = useSWRImmutable(
    !isEmpty(order) && !isNull(order) && !isUndefined(order)
      ? [order.id]
      : null,
    ([orderId]) => getNotes(firestore, orderId),
  );

  const { data: complaints } = useSWRImmutable(
    !isEmpty(order) &&
      !isNull(order) &&
      !isUndefined(order) &&
      !isUndefined(order.complaints) &&
      !isEmpty(order.complaints) &&
      !isUndefined(channelId)
      ? [order.complaints, channelId]
      : null,
    ([complaints, channelId]) =>
      getComplaints(firestore, complaints, channelId),
  );

  useEffect(() => {
    if (
      !optimisticOrder ||
      !channelId ||
      loadingOrderRiskAnalysis ||
      orderRiskAnalysis
    ) {
      return;
    }

    const autoStartKey = `${channelId}:${optimisticOrder.id}`;
    if (autoStartedOrderRiskRef.current === autoStartKey) {
      return;
    }

    autoStartedOrderRiskRef.current = autoStartKey;
    const timeoutId = window.setTimeout(() => {
      triggerBackgroundOrderRiskAnalysis();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    channelId,
    loadingOrderRiskAnalysis,
    optimisticOrder,
    orderRiskAnalysis,
    triggerBackgroundOrderRiskAnalysis,
  ]);

  // Prevent default hotkey printing behavior and instead use handlePrint
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "p") {
        event.preventDefault();
        handlePrintFull();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handlePrintFull]);

  // Set order items
  useEffect(() => {
    if (isUndefined(optimisticOrder)) return;
    setLoadingOrderItems(true);
    const _orderItems = [];
    if (optimisticOrder?.items && !(optimisticOrder.items.length <= 0))
      _orderItems.push(...optimisticOrder.items);
    setOrderItems(_orderItems);
    setLoadingOrderItems(false);
  }, [optimisticOrder]);

  // Calculate total price without any discounts applied (items + shipping + order level)
  const totalPriceWithoutDiscount = useMemo(() => {
    if (!optimisticOrder || !orderItems)
      return optimisticOrder?.totalPrice ?? 0;
    const itemsDiscount = orderItems.reduce(
      (sum, it) => sum + (it.discount?.discountedAmount ?? 0),
      0,
    );
    const shippingDiscount =
      optimisticOrder.shippingPriceDiscount?.discountedAmount ?? 0;
    const orderLevelDiscount =
      optimisticOrder.totalPriceDiscount?.discountedAmount ?? 0;
    const storeCreditAmount =
      optimisticOrder.storeCreditRedemption?.amount ?? 0;
    return Math.max(
      0,
      Math.floor(
        optimisticOrder.totalPrice +
          itemsDiscount +
          shippingDiscount +
          orderLevelDiscount +
          storeCreditAmount,
      ),
    );
  }, [optimisticOrder, orderItems]);

  // Helper to check if item has warehouse assignment (from fulfillment request)
  const hasWarehouseAssignment = (item: OrderItem): boolean => {
    return (
      !isUndefined(item.warehouseId) &&
      item.warehouseId !== null &&
      item.warehouseId !== ""
    );
  };

  // Get warehouse name by ID
  const getWarehouseName = (warehouseId: string): string => {
    const warehouse = warehouses?.find((w) => w.id === warehouseId);
    return warehouse?.address?.name || warehouseId;
  };

  function updateOptimisticItemCollections(change: {
    itemId: string;
    fulfilled?: boolean;
    inProgress?: boolean;
    pickedUp?: boolean;
    delivered?: boolean;
  }) {
    if (!optimisticOrder) {
      return;
    }

    try {
      const nextCollections = applyOrderItemStatusChange(
        optimisticOrder,
        change,
      );
      startTransition(() => {
        setOptimisticOrder(nextCollections);
      });
    } catch (error) {
      console.error("Error updating optimistic item collections", error);
    }
  }

  function handleFulfillItem(
    orderId: string,
    itemId: string,
    fulfilled: boolean,
  ) {
    if (isNull(channel)) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    // Find the item to check if it has warehouse assignment
    const item = optimisticOrder?.items.find((it) => it.id === itemId);

    if (item && hasWarehouseAssignment(item)) {
      // Use cloud function for items with warehouse assignment
      const promise = updateItemStatus({
        channelId: channel.id,
        orderId,
        itemId,
        fulfilled,
      });

      toaster.promise(promise, {
        loading: {
          title: t("order.updatingItemStatus", {
            defaultValue: "Updating item status...",
          }),
        },
        success: (result) => ({
          title: t("order.success", { defaultValue: "Success" }),
          description:
            result?.message ??
            t("order.updateSuccess", { defaultValue: "Item status updated" }),
        }),
        error: (error) => ({
          title: t("order.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("order.updateFailed", {
                  defaultValue: "Failed to update item status",
                }),
        }),
      });

      promise.catch((error) => {
        console.error("Error updating fulfillment status", error);
      });
    } else {
      // Use standard context method for regular items
      updateItemFulfillment(orderId, channel.id, itemId, fulfilled);
    }

    // Update local optimistic state to reflect changes immediately
    updateOptimisticItemCollections({ itemId, fulfilled });
  }
  function handleSetItemInProgress(
    orderId: string,
    itemId: string,
    inProgress: boolean,
  ) {
    if (isNull(channel)) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    // Find the item to check if it has warehouse assignment
    const item = optimisticOrder?.items.find((it) => it.id === itemId);

    if (item && hasWarehouseAssignment(item)) {
      // Use cloud function for items with warehouse assignment
      const promise = updateItemStatus({
        channelId: channel.id,
        orderId,
        itemId,
        inProgress,
      });

      toaster.promise(promise, {
        loading: {
          title: t("order.updatingItemStatus", {
            defaultValue: "Updating item status...",
          }),
        },
        success: (result) => ({
          title: t("order.success", { defaultValue: "Success" }),
          description:
            result?.message ??
            t("order.updateSuccess", { defaultValue: "Item status updated" }),
        }),
        error: (error) => ({
          title: t("order.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("order.updateFailed", {
                  defaultValue: "Failed to update item status",
                }),
        }),
      });

      promise.catch((error) => {
        console.error("Error updating in-progress status", error);
      });
    } else {
      // Use standard context method for regular items
      updateItemInProgress(orderId, channel.id, itemId, inProgress);
    }

    // Update local optimistic state to reflect changes immediately
    updateOptimisticItemCollections({ itemId, inProgress });
  }

  function handleMarkItemPickedUp(
    orderId: string,
    itemId: string,
    pickedUp: boolean,
  ) {
    if (isNull(channel)) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    const item = optimisticOrder?.items.find((it) => it.id === itemId);

    if (item && hasWarehouseAssignment(item)) {
      const promise = updateItemStatus({
        channelId: channel.id,
        orderId,
        itemId,
        pickedUp,
      });

      toaster.promise(promise, {
        loading: {
          title: t("order.updatingItemStatus", {
            defaultValue: "Updating item status…",
          }),
        },
        success: (result) => ({
          title: t("order.success", { defaultValue: "Success" }),
          description:
            result?.message ??
            t("order.itemPickedUpDescription", {
              defaultValue: "Updated picked up items.",
            }),
        }),
        error: (error) => ({
          title: t("order.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("order.itemPickedUpErrorDescription", {
                  defaultValue:
                    "An error occurred while updating picked up items.",
                }),
        }),
      });

      promise.catch((error) => {
        console.error("Error updating picked up status", error);
      });
    } else {
      void updateItemPickedUp(orderId, channel.id, itemId, pickedUp);
    }

    updateOptimisticItemCollections({ itemId, pickedUp });
  }

  function handleMarkItemDelivered(
    orderId: string,
    itemId: string,
    delivered: boolean,
  ) {
    if (isNull(channel)) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    const item = optimisticOrder?.items.find((it) => it.id === itemId);

    if (item && hasWarehouseAssignment(item)) {
      const promise = updateItemStatus({
        channelId: channel.id,
        orderId,
        itemId,
        delivered,
      });

      toaster.promise(promise, {
        loading: {
          title: t("order.updatingItemStatus", {
            defaultValue: "Updating item status…",
          }),
        },
        success: (result) => ({
          title: t("order.success", { defaultValue: "Success" }),
          description:
            result?.message ??
            t("order.itemDeliveredDescription", {
              defaultValue: "Updated delivered items.",
            }),
        }),
        error: (error) => ({
          title: t("order.error", { defaultValue: "Error" }),
          description:
            error instanceof Error
              ? error.message
              : t("order.itemDeliveredErrorDescription", {
                  defaultValue:
                    "An error occurred while updating delivered items.",
                }),
        }),
      });

      promise.catch((error) => {
        console.error("Error updating delivered status", error);
      });
    } else {
      void updateItemDelivered(orderId, channel.id, itemId, delivered);
    }

    updateOptimisticItemCollections({ itemId, delivered });
  }
  function handleSetItemPriority(
    orderId: string,
    itemId: string,
    priority: boolean,
  ) {
    if (isNull(channel)) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }
    updateItemPriority(orderId, channel.id, itemId, priority);
    // Update local optimistic state to reflect changes immediately
    if (optimisticOrder) {
      const updatedPriorityItems = [...(optimisticOrder.priorityItems || [])];
      if (!priority) {
        // Adding priority
        if (!updatedPriorityItems.includes(itemId)) {
          updatedPriorityItems.push(itemId);
        }
      } else {
        // Removing priority
        const index = updatedPriorityItems.indexOf(itemId);
        if (index > -1) {
          updatedPriorityItems.splice(index, 1);
        }
      }
      startTransition(() => {
        setOptimisticOrder({ priorityItems: updatedPriorityItems });
      });
    }
  }

  function handleManualFulfillmentRequest(orderItem: OrderItem) {
    setSelectedOrderItem(orderItem);
    setShowManualFulfillmentDialog(true);
  }

  function handleAssignWarehouse(orderItem: OrderItem) {
    setSelectedOrderItem(orderItem);
    setShowWarehouseAssignmentDialog(true);
  }

  function handleWarehouseAssignmentSuccess(
    warehouseId: string | undefined,
    result: FulfillmentMutationResponse,
  ) {
    if (!optimisticOrder || !selectedOrderItem) {
      return;
    }

    const items = optimisticOrder.items.map((item) => {
      if (item.id !== selectedOrderItem.id) {
        return item;
      }

      if (!warehouseId) {
        const {
          fulfillmentAssignment: _fulfillmentAssignment,
          warehouseId: _warehouseId,
          ...rest
        } = item;

        return rest;
      }

      return {
        ...item,
        warehouseId,
        fulfillmentAssignment: {
          requestId:
            result.requestId ??
            `${optimisticOrder.id}_${selectedOrderItem.id}_${warehouseId}`,
          warehouseId,
          assignmentSource: "DIRECT" as const,
        },
      };
    });

    startTransition(() => {
      setOptimisticOrder({ items });
    });
  }

  function handleReportItemProblem(
    orderItem: OrderItem,
    problem?: ItemProblem,
  ) {
    setSelectedProblemItem(orderItem);
    setExistingProblem(problem);
    setShowItemProblemDialog(true);
  }

  async function handleSubmitItemProblem(problem: ItemProblem | null) {
    if (!channel || !optimisticOrder || !selectedProblemItem) return;

    await updateItemProblem(
      optimisticOrder.id,
      channel.id,
      selectedProblemItem.id,
      problem,
    );

    // Update optimistic state
    const existingProblems = [...(optimisticOrder.problemItems || [])];
    const filteredProblems = existingProblems.filter(
      (p) => p.itemId !== selectedProblemItem.id,
    );

    startTransition(() => {
      setOptimisticOrder({
        problemItems: problem
          ? [...filteredProblems, problem]
          : filteredProblems,
      });
    });
  }

  function handleEditItem(orderItem: OrderItem) {
    setSelectedEditableItemId(orderItem.id);
  }

  const getEditorIdentity = useCallback(
    (currentOrder: Order) => ({
      id: user?.uid ?? currentOrder.updatedBy?.id ?? "",
      name:
        userInfo?.displayName ??
        user?.displayName ??
        currentOrder.updatedBy?.name ??
        user?.email ??
        "",
    }),
    [user?.displayName, user?.email, user?.uid, userInfo?.displayName],
  );

  function handleCloseItemEditor() {
    setSelectedEditableItemId(null);
  }

  async function handleSaveEditedItems(values: {
    items: OrderItem[];
    printingMethods: Order["printingMethods"];
  }) {
    if (!channel || !optimisticOrder) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    if (isNull(storeSettings)) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.updateFailed", {
          defaultValue: "Failed to update item status",
        }),
      });
      return;
    }

    const previousOrder = optimisticOrder;
    const editorIdentity = getEditorIdentity(optimisticOrder);
    const resolvedChannelId = channelId ?? channel.id;

    try {
      setSavingEditedItem(true);
      const { itemPrintingMethods, printingMethods } =
        await classifyOrderPrintingMethodsAdmin({
          items: toSerializableOrderPrintingMethodItems(
            values.items,
            knownPrintingMethodIds,
          ),
          currentPrintingMethods: values.printingMethods ?? [],
          channelId: resolvedChannelId,
          orderId: optimisticOrder.id,
        });
      const classifiedItems = applyOrderItemPrintingMethodAssignments(
        values.items,
        itemPrintingMethods,
      );

      const updateSource = {
        items: classifiedItems,
        printingMethods,
        shippingOption: optimisticOrder.shippingOption,
        updatedBy: editorIdentity,
      };
      const updateResult = createAdminOrderItemsUpdatePatch(
        updateSource,
        storeSettings,
      );
      const taxSummary = await buildAdminOrderTaxSummary({
        channelId: resolvedChannelId,
        country:
          optimisticOrder.billing?.country ?? optimisticOrder.shipping?.country,
        currency: optimisticOrder.currency,
        items: classifiedItems,
        shippingGrossAmount: updateResult.optimistic.shippingPrice,
      });
      const optimisticUpdate = taxSummary
        ? { ...updateResult.optimistic, taxSummary }
        : updateResult.optimistic;
      const firestoreUpdate = taxSummary
        ? { ...updateResult.firestore, taxSummary }
        : updateResult.firestore;

      startTransition(() => {
        setOptimisticOrder(optimisticUpdate);
      });

      await persistAdminOrderUpdate(
        resolvedChannelId,
        optimisticOrder.id,
        firestoreUpdate,
      );
      triggerBackgroundOrderRiskAnalysis();

      toaster.success({
        title: t("order.itemUpdated", {
          defaultValue: "Item updated",
        }),
      });
      setSelectedEditableItemId(null);
    } catch (error) {
      console.error("Error updating order item", error);
      startTransition(() => {
        setOptimisticOrder(previousOrder);
      });
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.itemUpdateFailed", {
          defaultValue: "Failed to update item",
        }),
      });
    } finally {
      setSavingEditedItem(false);
    }
  }

  async function handleSaveDeadline(values: OrderDeadlineInlineEditorValue) {
    if (!optimisticOrder) {
      return;
    }

    const resolvedChannelId =
      channelId ?? channel?.id ?? optimisticOrder.channelId;

    if (!resolvedChannelId) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    if (
      values.deadlineString === optimisticOrder.deadlineString &&
      values.exactTime === optimisticOrder.exactTime
    ) {
      return;
    }

    const previousOrder = optimisticOrder;
    const updatedBy = getEditorIdentity(optimisticOrder);
    const updatedAt = Timestamp.now();
    const deadline = Timestamp.fromDate(
      parseOrderDeadlineString(values.deadlineString),
    );
    const deadlineUpdate: UpdateData<Order> = {
      deadlineString: values.deadlineString,
      deadline,
      exactTime: values.exactTime,
      updatedBy,
      updatedAt,
    };

    try {
      startTransition(() => {
        setOptimisticOrder({
          deadlineString: values.deadlineString,
          deadline,
          exactTime: values.exactTime,
          updatedBy,
          updatedAt,
        });
      });

      await persistAdminOrderUpdate(
        resolvedChannelId,
        optimisticOrder.id,
        deadlineUpdate,
      );
      triggerBackgroundOrderRiskAnalysis();

      toaster.success({
        title: t("order.updated", { defaultValue: "Order updated" }),
        description: t("order.updatedDescription", {
          defaultValue: "Successfully updated order",
        }),
      });
    } catch (error) {
      console.error("Error updating deadline:", error);
      startTransition(() => {
        setOptimisticOrder(previousOrder);
      });
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.notUpdatedError", {
          defaultValue: "Order was not updated, error code: {error}",
          values: { error },
        }),
      });
      throw error;
    }
  }

  async function handleSaveCustomerDetails(
    values: OrderCustomerInlineEditorValue,
  ) {
    if (!optimisticOrder || optimisticOrder.isFromStore) {
      return;
    }

    const resolvedChannelId =
      channelId ?? channel?.id ?? optimisticOrder.channelId;

    if (!resolvedChannelId) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    if (isNull(storeSettings)) {
      const error = new Error("Store settings are undefined");
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("settings.storeUndefined", {
          defaultValue:
            "Store settings are undefined, you can edit them in Configuration > Store Settings",
        }),
      });
      throw error;
    }

    const previousOrder = optimisticOrder;
    const updatedBy = getEditorIdentity(optimisticOrder);
    const currentOrderEmail = optimisticOrder.email ?? "";
    const currentContactEmail = optimisticOrder.contact?.email ?? "";
    const nextContactEmail = values.contact.email ?? "";
    const nextOrderEmail =
      currentOrderEmail && currentOrderEmail !== currentContactEmail
        ? currentOrderEmail
        : nextContactEmail;

    try {
      const orderUpdate = createAdminOrderUpdatePayload(
        {
          customer: values.customer,
          contact: values.contact,
          email: nextOrderEmail,
          anonymousPackageShipping:
            optimisticOrder.anonymousPackageShipping ?? false,
          anonymousPackageLabelAddress:
            optimisticOrder.anonymousPackageLabelAddress,
          invoice: optimisticOrder.invoice,
          items: optimisticOrder.items,
          shippingOption:
            optimisticOrder.shippingOption ??
            ShippingOptions.PERSONAL_COLLECTION,
          shipping: values.shipping,
          designatedPickupAreaId: optimisticOrder.designatedPickupAreaId ?? "",
          billing: values.billing,
          exactTime: optimisticOrder.exactTime,
          deadlineString: optimisticOrder.deadlineString,
          specialNotes: optimisticOrder.specialNotes,
          invoiceNotes: optimisticOrder.invoiceNotes ?? "",
          status: optimisticOrder.status,
          paymentType: optimisticOrder.paymentType,
          paymentStatus: optimisticOrder.paymentStatus,
          filesStatus: optimisticOrder.filesStatus,
          difficulty: optimisticOrder.difficulty,
          priority: optimisticOrder.priority,
          updatedBy,
          isTest: optimisticOrder.isTest,
          appliedPromotionCodes: optimisticOrder.appliedPromotionCodes ?? [],
          paymentDocumentId: optimisticOrder.paymentDocumentId ?? "",
          printingMethods: optimisticOrder.printingMethods ?? [],
          carriedOutBy: optimisticOrder.carriedOutBy ?? [],
          mailLink: optimisticOrder.mailLink,
          sendStatusChangeEmail: optimisticOrder.sendStatusChangeEmail ?? false,
          active: optimisticOrder.active ?? true,
        },
        storeSettings,
      );

      startTransition(() => {
        setOptimisticOrder({
          customer: values.customer,
          contact: values.contact,
          shipping: values.shipping,
          billing: values.billing,
          email: nextOrderEmail,
          keywords: orderUpdate.keywords,
          updatedBy: orderUpdate.updatedBy,
          updatedAt: orderUpdate.updatedAt,
        });
      });

      await persistAdminOrderUpdate(
        resolvedChannelId,
        optimisticOrder.id,
        orderUpdate,
      );
      triggerBackgroundOrderRiskAnalysis();

      toaster.success({
        title: t("order.updated", { defaultValue: "Order updated" }),
        description: t("order.updatedDescription", {
          defaultValue: "Successfully updated order",
        }),
      });
    } catch (error) {
      console.error("Error updating customer details:", error);
      startTransition(() => {
        setOptimisticOrder(previousOrder);
      });
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.notUpdatedError", {
          defaultValue: "Order was not updated, error code: {error}",
          values: { error },
        }),
      });
      throw error;
    }
  }

  async function handleSaveExecution(values: OrderExecutionInlineEditorValue) {
    if (!optimisticOrder) return;

    const resolvedChannelId =
      channelId ?? channel?.id ?? optimisticOrder.channelId;

    if (!resolvedChannelId) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    const previousOrder = optimisticOrder;
    const updatedBy = getEditorIdentity(optimisticOrder);
    const updatedAt = Timestamp.now();

    try {
      startTransition(() => {
        setOptimisticOrder({
          printingMethods: values.printingMethods,
          carriedOutBy: optimisticOrder.carriedOutBy,
          updatedBy,
          updatedAt,
        });
      });

      await persistAdminOrderUpdate(resolvedChannelId, optimisticOrder.id, {
        printingMethods: values.printingMethods,
        carriedOutBy: optimisticOrder.carriedOutBy,
        updatedBy,
        updatedAt,
      });

      toaster.success({
        title: t("order.updated", { defaultValue: "Order updated" }),
        description: t("order.updatedDescription", {
          defaultValue: "Successfully updated order",
        }),
      });
    } catch (error) {
      console.error("Error updating execution:", error);
      startTransition(() => {
        setOptimisticOrder(previousOrder);
      });
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.notUpdatedError", {
          defaultValue: "Order was not updated, error code: {error}",
          values: { error },
        }),
      });
      throw error;
    }
  }

  const handlePaymentMethodChange = useCallback(
    async (paymentType: PaymentMethodId) => {
      if (!optimisticOrder) {
        return;
      }

      if (
        optimisticOrder.isFromStore ||
        paymentType === optimisticOrder.paymentType
      ) {
        return;
      }

      if (
        optimisticOrder.paymentStatus === PaymentStatus.COMPLETED ||
        optimisticOrder.paymentStatus === PaymentStatus.REFUNDED ||
        optimisticOrder.paymentStatus === PaymentStatus.PARTIALLY_PAID
      ) {
        toaster.error({
          title: t("orderPage.payment.changeBlockedTitle", {
            defaultValue: "Payment method not changed",
          }),
          description: t("orderPage.payment.changeBlockedPaid", {
            defaultValue:
              "Paid orders cannot be reset to a new payment from this control.",
          }),
        });
        return;
      }

      const resolvedChannelId =
        channelId ?? channel?.id ?? optimisticOrder.channelId;

      if (!resolvedChannelId) {
        toaster.error({
          title: t("order.error", { defaultValue: "Error" }),
          description: t("order.noChannelSelected", {
            defaultValue: "No channel selected",
          }),
        });
        return;
      }

      const previousOrder = optimisticOrder;
      const updatedBy = getEditorIdentity(optimisticOrder);
      const updatedAt = Timestamp.now();
      const paymentMethodChangedActivity = {
        type: ActivityStatus.PAYMENT_METHOD_CHANGED,
        value: ActivityStatus.PAYMENT_METHOD_CHANGED,
        timestamp: updatedAt,
        metadata: {
          before: optimisticOrder.paymentType,
          after: paymentType,
        },
      } satisfies Order["activities"][number];

      const optimisticUpdate: Partial<Order> = {
        paymentType,
        paymentStatus: PaymentStatus.NEW,
        updatedBy,
        updatedAt,
        activities: [
          ...(optimisticOrder.activities ?? []),
          paymentMethodChangedActivity,
        ],
      };

      const firestoreUpdate: UpdateData<Order> = {
        paymentType,
        paymentStatus: PaymentStatus.NEW,
        updatedBy,
        updatedAt,
        activities: arrayUnion(paymentMethodChangedActivity),
      };

      try {
        setIsChangingPaymentMethod(true);

        startTransition(() => {
          setOptimisticOrder(optimisticUpdate);
        });

        if (paymentType === PaymentType.STRIPE) {
          const result = await createAdminStripePaymentLink({
            channelId: resolvedChannelId,
            orderId: optimisticOrder.id,
            updatedBy,
          });

          startTransition(() => {
            setOptimisticOrder({
              ...optimisticUpdate,
              checkoutSession: result.checkoutSession,
              paymentStatus: result.paymentStatus,
              paymentType: result.paymentType,
            });
          });
        } else {
          await persistAdminOrderUpdate(
            resolvedChannelId,
            optimisticOrder.id,
            firestoreUpdate,
          );
        }
        triggerBackgroundOrderRiskAnalysis();

        toaster.success({
          title: t("orderPage.payment.changeSuccess", {
            defaultValue: "Payment method updated",
          }),
          description: t("orderPage.payment.methodUpdated", {
            defaultValue: "Payment method has been updated",
          }),
        });
      } catch (error) {
        console.error("Error changing payment method:", error);
        startTransition(() => {
          setOptimisticOrder(previousOrder);
        });
        toaster.error({
          title: t("orderPage.payment.changeError", {
            defaultValue: "Failed to change payment method",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("orders.unknownError", {
                  defaultValue: "Unknown error",
                }),
        });
      } finally {
        setIsChangingPaymentMethod(false);
      }
    },
    [
      channel?.id,
      channelId,
      getEditorIdentity,
      optimisticOrder,
      setOptimisticOrder,
      t,
      triggerBackgroundOrderRiskAnalysis,
    ],
  );

  const handleCreateStripePaymentLink = useCallback(async () => {
    if (!optimisticOrder) {
      return;
    }

    const resolvedChannelId =
      channelId ?? channel?.id ?? optimisticOrder.channelId;

    if (!resolvedChannelId) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    try {
      setIsCreatingStripePaymentLink(true);
      const result = await createAdminStripePaymentLink({
        channelId: resolvedChannelId,
        orderId: optimisticOrder.id,
        updatedBy: getEditorIdentity(optimisticOrder),
      });

      startTransition(() => {
        setOptimisticOrder({
          checkoutSession: result.checkoutSession,
          paymentStatus: result.paymentStatus,
          paymentType: result.paymentType,
        });
      });
      triggerBackgroundOrderRiskAnalysis();

      toaster.success({
        title: t("orderPage.payment.linkCreated", {
          defaultValue: "Stripe payment link created",
        }),
        description: t("orderPage.payment.linkCreatedDescription", {
          defaultValue:
            "Copy the payment link from this payment section and send it to the customer manually.",
        }),
      });
    } catch (error) {
      console.error("Error creating Stripe payment link:", error);
      toaster.error({
        title: t("orderPage.payment.linkCreateError", {
          defaultValue: "Failed to create Stripe payment link",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("orders.unknownError", {
                defaultValue: "Unknown error",
              }),
      });
    } finally {
      setIsCreatingStripePaymentLink(false);
    }
  }, [
    channel?.id,
    channelId,
    getEditorIdentity,
    optimisticOrder,
    setOptimisticOrder,
    t,
    triggerBackgroundOrderRiskAnalysis,
  ]);

  async function handleCreateVatInvoice() {
    if (!fakturowniaInvoice?.id || !channel || !optimisticOrder) return;
    if (!vatInvoiceSellerPerson) return;

    const proformaId = Number(fakturowniaInvoice.id);
    setIsCreatingVatInvoice(true);
    try {
      const result = await createVatInvoiceFromProforma(
        proformaId,
        vatInvoiceSellerPerson,
      );
      if (!result.ok) {
        const ksefBlockers = result.error.ksefReadiness?.blockers ?? [];
        toaster.error({
          title:
            ksefBlockers.length > 0
              ? t("fakturownia.ksefReadiness.blockedTitle", {
                  defaultValue: "Invoice would be rejected by KSeF",
                })
              : t("order.error", { defaultValue: "Error" }),
          description:
            ksefBlockers.length > 0
              ? formatKsefReadinessIssues(ksefBlockers, t).join(" ")
              : formatFakturowniaIntegrationActionError(result.error, t),
        });
        return;
      }
      if (result.warnings?.length) {
        toaster.create({
          type: "warning",
          title: t("fakturownia.ksefReadiness.warningTitle", {
            defaultValue: "Possible KSeF issues",
          }),
          description: formatKsefReadinessIssues(result.warnings, t).join(" "),
        });
      }

      const invoice = result.data;
      const nextPaymentDocumentId =
        invoice?.number ?? (invoice?.id ? String(invoice.id) : undefined);
      if (nextPaymentDocumentId) {
        const orderRef = doc(
          firestore,
          `/channels/${channel.id}/orders/${optimisticOrder.id}`,
        );
        update(
          { paymentDocumentId: nextPaymentDocumentId },
          orderRef,
          tenantContext,
        );
        startTransition(() => {
          setOptimisticOrder({
            paymentDocumentId: nextPaymentDocumentId,
          });
        });
        triggerBackgroundOrderRiskAnalysis();
        mutateFakturowniaInvoice(invoice ?? null, { revalidate: true });
      }
      setShowCreateVatInvoiceDialog(false);
      setVatInvoiceSellerPerson(undefined);
      toaster.success({
        title: t("order.invoiceCreated"),
      });
    } catch (error) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description:
          error instanceof Error
            ? error.message
            : t("order.invoiceCreationFailed"),
      });
    } finally {
      setIsCreatingVatInvoice(false);
    }
  }

  async function handleSaveSpecialNotes(value: string) {
    if (isNull(channel) || !optimisticOrder) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    try {
      const orderRef = db.doc(
        firestore,
        `/channels/${channel.id}/orders`,
        optimisticOrder.id,
      );
      await update({ specialNotes: value }, orderRef, tenantContext);
      triggerBackgroundOrderRiskAnalysis();

      // Update optimistic state
      startTransition(() => {
        setOptimisticOrder({ specialNotes: value });
      });

      toaster.success({
        title: t("order.success", { defaultValue: "Success" }),
        description: t("order.specialNotesUpdated", {
          defaultValue: "Special notes updated successfully",
        }),
      });
    } catch (error) {
      console.error("Error updating special notes:", error);
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.specialNotesUpdateFailed", {
          defaultValue: "Failed to update special notes",
        }),
      });
      throw error;
    }
  }

  type UpdatableStatusField = "status" | "paymentStatus" | "filesStatus";

  const applyStatusUpdate = useCallback(
    (field: UpdatableStatusField, value?: string, updatedBy?: NestedMember) => {
      if (isUndefined(value)) return;
      if (isUndefined(optimisticOrder) || isNull(optimisticOrder)) return;
      const resolvedChannelId = channelId ?? channel?.id;
      if (!resolvedChannelId) {
        toaster.error({
          title: t("order.error", { defaultValue: "Error" }),
          description: t("order.noChannelSelected", {
            defaultValue: "No channel selected",
          }),
        });
        return;
      }
      const previousValue = optimisticOrder[field];
      if (value === previousValue) return;
      const shouldAttachStatusActor = field === "status" && !!updatedBy;
      const updatedAt = shouldAttachStatusActor ? Timestamp.now() : undefined;
      const updatePayload = {
        [field]: value,
        ...(shouldAttachStatusActor
          ? {
              createdBy: updatedBy,
              updatedAt,
              updatedBy,
            }
          : {}),
      } as Partial<Order>;
      const rollbackPayload = {
        [field]: previousValue,
        ...(shouldAttachStatusActor
          ? {
              createdBy: optimisticOrder.createdBy,
              updatedAt: optimisticOrder.updatedAt,
              updatedBy: optimisticOrder.updatedBy,
            }
          : {}),
      } as Partial<Order>;
      startTransition(() => {
        setOptimisticOrder(updatePayload);
      });
      const promise = updateOrderStatusField({
        channelId: resolvedChannelId,
        field,
        orderId: optimisticOrder.id,
        source: "admin-order-detail",
        updatedBy,
        value,
      });
      promise
        .then(async () => {
          if (field !== "filesStatus") {
            triggerBackgroundOrderRiskAnalysis();
          }
          // Send status-change email via server action (fire-and-forget)
          if (field === "status") {
            void sendOrderStatusEmail(
              resolvedChannelId,
              optimisticOrder.id,
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
        .catch((error) => {
          console.error(`Error updating ${field}`, error);
          toaster.error({
            title: t("order.error", { defaultValue: "Error" }),
            description: t("order.statusUpdateFailed", {
              defaultValue: "Failed to update status. Please try again.",
            }),
          });
          startTransition(() => {
            setOptimisticOrder(rollbackPayload);
          });
        });
    },
    [
      channelId,
      channel?.id,
      optimisticOrder,
      setOptimisticOrder,
      t,
      triggerBackgroundOrderRiskAnalysis,
    ],
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

      applyStatusUpdate(
        statusChange.field,
        statusChange.value,
        statusChange.updatedBy,
      );
    },
    [applyStatusUpdate],
  );

  const handleStatusUpdate = useCallback(
    (field: UpdatableStatusField, value?: string) => {
      if (field !== "status" || isUndefined(value)) {
        applyStatusUpdate(field, value);
        return;
      }

      if (isUndefined(optimisticOrder) || isNull(optimisticOrder)) {
        return;
      }

      const statusChange: PendingStatusChange = {
        field,
        order: optimisticOrder,
        value,
      };

      if (statusChange.value === optimisticOrder.status) {
        return;
      }

      if (shouldRequireStatusActorSelection(optimisticOrder)) {
        setPendingStatusActorSelection(statusChange);
        return;
      }

      queueOrApplyStatusChange(statusChange);
    },
    [applyStatusUpdate, optimisticOrder, queueOrApplyStatusChange],
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

  const handleMarkArrivedAtPickup = useCallback(() => {
    if (isUndefined(optimisticOrder) || isNull(optimisticOrder)) return;

    const resolvedChannelId = channelId ?? channel?.id;
    if (!resolvedChannelId) {
      toaster.error({
        title: t("order.error", { defaultValue: "Error" }),
        description: t("order.noChannelSelected", {
          defaultValue: "No channel selected",
        }),
      });
      return;
    }

    const previousTracking = optimisticOrder.tracking;
    markOrderArrivedAtPickup(resolvedChannelId, optimisticOrder.id)
      .then((result) => {
        const deliveredAt = Timestamp.fromMillis(result.deliveredAtMillis);
        const updatedTracking: Tracking = previousTracking
          ? { ...previousTracking, deliveredAt }
          : {
              shippingOption:
                optimisticOrder.shippingOption ??
                ShippingOptions.PERSONAL_COLLECTION,
              number: "",
              link: "",
              deliveredAt,
            };

        startTransition(() => {
          setOptimisticOrder({ tracking: updatedTracking });
        });

        toaster.success({
          title: t("order.success", { defaultValue: "Success" }),
          description: t("order.markArrivedAtPickupSuccess", {
            defaultValue: "Order marked as arrived at pickup.",
          }),
        });

        if (result.emailError) {
          toaster.warning({
            title: t("orders.warning", { defaultValue: "Warning!" }),
            description: t("orders.statusEmailSendFailed", {
              defaultValue:
                "Order status was updated, but notification email was not sent: {{reason}}",
              reason: result.emailError,
            }),
          });
        }
      })
      .catch((error) => {
        console.error("Error marking order as arrived at pickup", error);
        toaster.error({
          title: t("order.error", { defaultValue: "Error" }),
          description: t("order.markArrivedAtPickupFailed", {
            defaultValue:
              "Failed to mark order as arrived at pickup. Please try again.",
          }),
        });
        startTransition(() => {
          setOptimisticOrder({ tracking: previousTracking });
        });
      });
  }, [channelId, channel?.id, optimisticOrder, setOptimisticOrder, t]);

  if (
    isUndefined(optimisticOrder) ||
    isNull(optimisticOrder) ||
    isNull(orderItems)
  )
    return null;

  const isPaymentCompleted =
    optimisticOrder.paymentStatus === PaymentStatus.COMPLETED;
  const paymentStatusColorPalette = getOrderPaymentStatusColorPalette(
    optimisticOrder.paymentStatus,
    optimisticOrder.paymentDocumentId,
  );
  const showPaymentConfirmationWarning = !isPaymentCompleted;
  const isAllegroOrder = isAllegroExternalOrder(optimisticOrder);
  const isExternallyFulfilled =
    isAllegroFulfillmentManagedOrder(optimisticOrder);
  const externalSource = optimisticOrder.externalSource;
  const canEditCustomerDetails = !optimisticOrder.isFromStore;
  const canQuickChangePaymentMethod =
    !optimisticOrder.isFromStore && isNestedCustomer(optimisticOrder.customer);
  const canCreateStripePaymentLink =
    optimisticOrder.paymentType === PaymentType.STRIPE &&
    !optimisticOrder.checkoutSession?.url &&
    optimisticOrder.paymentStatus !== PaymentStatus.COMPLETED &&
    optimisticOrder.paymentStatus !== PaymentStatus.REFUNDED &&
    optimisticOrder.paymentStatus !== PaymentStatus.PARTIALLY_PAID;

  const resolvedChannelId = channelId ?? channel?.id ?? "";
  const invoiceSearchParams = new URLSearchParams({
    orderId: optimisticOrder.id,
  });
  if (resolvedChannelId) {
    invoiceSearchParams.set("channelId", resolvedChannelId);
  }
  const paymentDocumentMeta = getPaymentDocumentMeta(
    optimisticOrder.paymentType,
    !!optimisticOrder.billing,
  );
  const invoiceCreateKind =
    getPaymentDocumentInvoiceCreateKind(paymentDocumentMeta);
  if (invoiceCreateKind) {
    invoiceSearchParams.set("kind", invoiceCreateKind);
  }
  const invoiceHref = `/fakturownia/invoices/new?${invoiceSearchParams.toString()}`;

  return (
    <Box ref={componentRef} className="print-wrapper">
      <Skeleton loading={loadingOrder || loadingOrderItems} h={"100%"}>
        <Box className="print-content">
          <Grid
            className={"print-grid-template-columns"}
            templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
            columnGap={["0", "8"]}
            rowGap={["6", "8"]}
          >
            <GridItem
              className={"print-grid-column-3"}
              minW={"100%"}
              colSpan={[1, 3]}
              overflowX={"auto"}
            >
              <Box>
                <CustomHeading
                  heading={`
              ${channel?.name}#${optimisticOrder?.number}${optimisticOrder?.isTest ? " (test)" : ""}`}
                  mb={8}
                  goBack={true}
                  t={t}
                />
                <HStack
                  align="center"
                  gap={2}
                  mb={7}
                  flexWrap="wrap"
                  justifyContent="space-between"
                >
                  <Badge pl={3} pr={4} size="lg">
                    {t("order.createdOn", { defaultValue: "Created on" })}:{" "}
                    {optimisticOrder?.createdAt
                      .toDate()
                      .toLocaleDateString(i18n.resolvedLanguage)}
                  </Badge>
                  {optimisticOrder.status !== OrderStatus.FULFILLED && (
                    <OrderDeadlineInlineEditor
                      deadline={optimisticOrder.deadline}
                      deadlineString={optimisticOrder.deadlineString}
                      exactTime={optimisticOrder.exactTime}
                      priority={optimisticOrder.priority}
                      onSave={handleSaveDeadline}
                      t={t}
                      i18n={i18n}
                    />
                  )}
                  {isAllegroOrder && (
                    <Badge colorPalette="orange" size="lg">
                      {t("allegro.badge", { defaultValue: "Allegro" })}
                    </Badge>
                  )}
                </HStack>
              </Box>
              {!isNull(orderItems) && (
                <Box
                  w={"100%"}
                  mb={["6", "0"]}
                  border={"1px solid"}
                  borderColor={borderColor}
                  borderRadius={"3xl"}
                  p={"8"}
                >
                  <VStack align="stretch" gap={4}>
                    <HStack
                      justify="space-between"
                      align="center"
                      flexWrap="wrap"
                      gap={4}
                    >
                      <HStack gap={3} align="center" flexWrap="wrap">
                        <Text as="h2" fontSize="lg" fontWeight="bold">
                          {t("order.items", { defaultValue: "Items" })}
                        </Text>
                        <OrderExecutionInlineEditor
                          printingMethods={
                            optimisticOrder.printingMethods ?? []
                          }
                          onSave={handleSaveExecution}
                          printingMethodsSettings={printingMethodsSettings}
                          locale={i18n.resolvedLanguage ?? i18n.language}
                          t={t}
                        />
                      </HStack>
                      <HStack
                        gap={3}
                        align="center"
                        flexWrap="wrap"
                        justify="flex-end"
                        className="noprint"
                      >
                        <HStack gap={2} align="center" minW="200px">
                          <Text fontSize="sm" fontWeight="semibold">
                            {t("orders.status", { defaultValue: "Status" })}
                          </Text>
                          <StatusSelect
                            name="status"
                            value={optimisticOrder.status}
                            options={statusOptions}
                            onChange={(value) =>
                              handleStatusUpdate("status", value)
                            }
                            orderId={optimisticOrder.id}
                            fullWidth
                          />
                        </HStack>
                        <HStack gap={2} align="center" minW="200px">
                          <Text fontSize="sm" fontWeight="semibold">
                            {t("orders.files", { defaultValue: "Files" })}
                          </Text>
                          <StatusSelect
                            name="filesStatus"
                            value={optimisticOrder.filesStatus}
                            options={orderFilesStatusOptions}
                            onChange={(value) =>
                              handleStatusUpdate("filesStatus", value)
                            }
                            orderId={optimisticOrder.id}
                            fullWidth
                          />
                        </HStack>
                        {optimisticOrder.status === OrderStatus.READY &&
                          optimisticOrder.shippingOption ===
                            ShippingOptions.PERSONAL_COLLECTION &&
                          optimisticOrder.sendStatusChangeEmail &&
                          !optimisticOrder.tracking?.deliveredAt && (
                            <Tooltip
                              content={t("order.markArrivedAtPickupTooltip", {
                                defaultValue:
                                  "Mark order as arrived at the designated pickup point. This will send a pickup-ready notification to the customer.",
                              })}
                            >
                              <Button
                                size="sm"
                                colorPalette="primary"
                                variant="outline"
                                onClick={handleMarkArrivedAtPickup}
                              >
                                <MaterialSymbol>local_shipping</MaterialSymbol>
                                {t("order.markArrivedAtPickup", {
                                  defaultValue: "Mark arrived at pickup",
                                })}
                              </Button>
                            </Tooltip>
                          )}
                      </HStack>
                    </HStack>
                    {(channelId ?? channel?.id) && (
                      <InternalTransitPanel
                        channelId={(channelId ?? channel?.id) as string}
                        orderId={optimisticOrder.id}
                        internalTransit={optimisticOrder.internalTransit}
                        language={i18n.resolvedLanguage}
                        onChanged={() => router.refresh()}
                      />
                    )}
                    <HStack justify="flex-end">
                      <Button
                        colorPalette={"primary"}
                        size={"xs"}
                        variant={"ghost"}
                        onClick={() => setShowFiles(!showFiles)}
                      >
                        <MaterialSymbol>
                          {showFiles ? "visibility_off" : "visibility"}
                        </MaterialSymbol>
                        {showFiles
                          ? t("admin.hideFiles", {
                              defaultValue: "Hide files",
                            })
                          : t("admin.showFiles", {
                              defaultValue: "Show files",
                            })}
                      </Button>
                    </HStack>
                  </VStack>
                  <Separator my={"6"} />
                  {isStoreOrder(optimisticOrder) &&
                    optimisticOrder.proofing && (
                      <Alert.Root
                        className={"noprint-production"}
                        status={"warning"}
                        mb={4}
                      >
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>
                            {t("order.fileVerificationOption", {
                              defaultValue:
                                "File verification option selected by client:",
                            })}
                          </Alert.Title>
                          <Alert.Description>
                            {t(`ProofingOptions.${optimisticOrder.proofing}`)}
                          </Alert.Description>
                        </Alert.Content>
                      </Alert.Root>
                    )}
                  {isExternallyFulfilled && (
                    <Alert.Root status="info" mb={4}>
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>
                          {t("allegro.fulfillmentManagedTitle", {
                            defaultValue: "Fulfillment managed in Allegro",
                          })}
                        </Alert.Title>
                        <Alert.Description>
                          {t("allegro.fulfillmentManagedDescription", {
                            defaultValue:
                              "This imported order keeps delivery data in Konfi, but parcel booking and shipment handling stay in Allegro.",
                          })}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}
                  <Skeleton loading={isValidating}>
                    <OrderItemsFilesSection
                      storage={storage}
                      order={optimisticOrder}
                      orderItems={orderItems}
                      listResults={files || []}
                      handleFulfillItem={handleFulfillItem}
                      handleSetItemInProgress={handleSetItemInProgress}
                      handleMarkItemPickedUp={handleMarkItemPickedUp}
                      handleMarkItemDelivered={handleMarkItemDelivered}
                      handleSetItemPriority={handleSetItemPriority}
                      onReportItemProblem={handleReportItemProblem}
                      onFileDownload={onFileDownload}
                      showFiles={showFiles}
                      baseFolderPath={getFolderPath(channel?.id || "")}
                      channelId={optimisticOrder.channelId ?? channel?.id}
                      warehouses={warehouses}
                      orderWorkflowStatusesSettings={
                        orderWorkflowStatusesSettings
                      }
                      shippingMethodsSettings={shippingMethodsSettings}
                      getWarehouseName={getWarehouseName}
                      onAssignWarehouse={handleAssignWarehouse}
                      onManualFulfillmentRequest={
                        tenantContext.deploymentMode === "saas"
                          ? handleManualFulfillmentRequest
                          : undefined
                      }
                      renderItemActions={(orderItem) => (
                        <OrderItemImageGenerationDialog
                          orderItem={orderItem}
                          customerId={
                            isNestedCustomer(optimisticOrder.customer)
                              ? optimisticOrder.customer.id
                              : ""
                          }
                          orderId={optimisticOrder.id}
                          onAttachmentAdded={async () => {
                            await mutateFiles();
                          }}
                          triggerSize="sm"
                        />
                      )}
                      onEditItem={
                        optimisticOrder.isFromStore ? undefined : handleEditItem
                      }
                      selectedItemId={selectedEditableItemId}
                      onFilesChanged={() => {
                        void mutateFiles();
                      }}
                      tenantContext={tenantContext}
                      t={t}
                      i18n={i18n}
                    />
                    {!optimisticOrder.isFromStore && selectedEditableItemId && (
                      <OrderPageItemEditor
                        order={optimisticOrder}
                        itemId={selectedEditableItemId}
                        saving={savingEditedItem}
                        onCancel={handleCloseItemEditor}
                        onSave={handleSaveEditedItems}
                        onAttachmentAdded={async () => {
                          await mutateFiles();
                        }}
                      />
                    )}
                  </Skeleton>
                </Box>
              )}
              {canUseFakturownia &&
                fakturowniaDocumentId &&
                fakturowniaInvoice?.viewUrl && (
                  <Box
                    mt={[6, 8]}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="3xl"
                    p={8}
                  >
                    <FakturowniaInvoice
                      paymentDocumentId={fakturowniaDocumentId}
                      invoiceId={fakturowniaInvoice.id}
                      viewUrl={fakturowniaInvoice.viewUrl}
                      kind={fakturowniaInvoice.kind ?? undefined}
                      lng={i18n.resolvedLanguage ?? DEFAULT_LOCALE}
                      t={t}
                    />
                    {fakturowniaInvoice.kind === "proforma" && (
                      <Button
                        mt={4}
                        colorPalette="primary"
                        variant="outline"
                        onClick={() => {
                          setVatInvoiceSellerPerson(undefined);
                          setShowCreateVatInvoiceDialog(true);
                        }}
                        loading={loadingMembers}
                        w="100%"
                      >
                        {t("order.createVatInvoice")}
                      </Button>
                    )}
                  </Box>
                )}
              <Box
                className={"noprint-production"}
                mb={["6", "0"]}
                mt={["6", "8"]}
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
              >
                <VStack align="stretch" gap={4}>
                  <Payment
                    order={
                      canQuickChangePaymentMethod ? optimisticOrder : undefined
                    }
                    checkoutSessionUrl={optimisticOrder?.checkoutSession?.url}
                    paymentStatus={optimisticOrder?.paymentStatus}
                    paymentType={optimisticOrder?.paymentType}
                    paymentDocumentId={optimisticOrder?.paymentDocumentId}
                    items={orderItems}
                    shippingPrice={optimisticOrder.shippingPrice ?? 0}
                    totalPrice={optimisticOrder.totalPrice}
                    totalPriceWithoutDiscount={totalPriceWithoutDiscount}
                    taxSummary={optimisticOrder.taxSummary}
                    currency={optimisticOrder.currency}
                    customer={
                      !optimisticOrder.isFromStore &&
                      isNestedCustomer(optimisticOrder.customer)
                        ? optimisticOrder.customer
                        : undefined
                    }
                    onPaymentMethodChange={
                      canQuickChangePaymentMethod
                        ? handlePaymentMethodChange
                        : undefined
                    }
                    isChangingPaymentMethod={isChangingPaymentMethod}
                    paymentStatusControl={
                      <HStack
                        align="center"
                        className="noprint"
                        gap={2}
                        flexWrap="wrap"
                      >
                        <Text fontSize="sm" fontWeight="semibold">
                          {t("orders.paymentStatus", {
                            defaultValue: "Payment status",
                          })}
                        </Text>
                        <Box minW="160px" maxW="220px">
                          <StatusSelect
                            name="paymentStatus"
                            value={optimisticOrder.paymentStatus}
                            colorPalette={paymentStatusColorPalette}
                            options={paymentStatusOptions}
                            onChange={(value) =>
                              handleStatusUpdate("paymentStatus", value)
                            }
                            orderId={optimisticOrder.id}
                          />
                        </Box>
                      </HStack>
                    }
                    t={t}
                    i18n={i18n}
                  />
                  <Show when={canCreateStripePaymentLink}>
                    <HStack className="noprint" gap={3} flexWrap="wrap">
                      <Button
                        colorPalette="primary"
                        loading={isCreatingStripePaymentLink}
                        onClick={handleCreateStripePaymentLink}
                        variant="outline"
                      >
                        <MaterialSymbol>add_link</MaterialSymbol>
                        {t("orderPage.payment.createStripeLink", {
                          defaultValue: "Create Stripe payment link",
                        })}
                      </Button>
                      <Text color="fg.muted" fontSize="sm">
                        {t("orderPage.payment.createStripeLinkDescription", {
                          defaultValue:
                            "Create a checkout link you can send to the customer manually.",
                        })}
                      </Text>
                    </HStack>
                  </Show>
                  <Show
                    when={
                      optimisticOrder.appliedPromotionCodes &&
                      optimisticOrder.appliedPromotionCodes.length > 0
                    }
                  >
                    <Box mt={2}>
                      <Text fontSize={"sm"} fontWeight={"semibold"}>
                        {t("order.usedDiscountCodes", {
                          defaultValue: "Used discount codes:",
                        })}
                      </Text>
                      <HStack>
                        <For each={optimisticOrder.appliedPromotionCodes}>
                          {(code) => (
                            <Badge key={code} colorPalette={"primary"} px={2}>
                              {code}
                            </Badge>
                          )}
                        </For>
                      </HStack>
                    </Box>
                  </Show>
                </VStack>
              </Box>
              <Box className="noprint" mt={["6", "8"]}>
                <OrderImpositionTemplatesSection
                  channelId={channelId}
                  orderId={id}
                  orderItems={orderItems}
                  t={t}
                />
              </Box>
              <Box className="noprint" mt={["6", "8"]}>
                <OrderRiskAnalysisCard
                  analysis={orderRiskAnalysis ?? undefined}
                  loading={loadingOrderRiskAnalysis}
                  running={
                    isStartingOrderRiskAnalysis ||
                    orderRiskAnalysis?.status ===
                      OrderRiskAnalysisStatus.RUNNING ||
                    orderRiskAnalysis?.status ===
                      OrderRiskAnalysisStatus.PENDING
                  }
                  onRun={() =>
                    handleRunOrderRiskAnalysis(
                      OrderRiskAnalysisSource.MANUAL_RERUN,
                    )
                  }
                  t={t}
                  i18n={i18n}
                />
              </Box>
              {optimisticOrder.mailLink && (
                <Box className="noprint" mt={["6", "8"]} mb={0}>
                  <EmailConversation mailLink={optimisticOrder.mailLink} />
                </Box>
              )}
              <Box
                className={"noprint"}
                mt={["6", "8"]}
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
              >
                <Activity
                  activities={optimisticOrder?.activities}
                  lng={i18n.resolvedLanguage}
                  t={t}
                />
              </Box>
            </GridItem>
            <GridItem
              className={"print-grid-column-2"}
              minW={"100%"}
              colSpan={[1, 2]}
              mt={8}
            >
              <Box className={"noprint"} pt={"8"} pb={"7"}>
                <Stack
                  justifyContent={"flex-end"}
                  direction={{ base: "row", xlDown: "column" }}
                >
                  {isNestedCustomer(optimisticOrder.customer) ? (
                    <Tooltip
                      content={t("admin.attachments", {
                        defaultValue: "Attachments",
                      })}
                    >
                      <span>
                        <IconButton
                          onClick={() => setShowAttachmentsForm(true)}
                          variant={hasPaymentDocument ? "solid" : "outline"}
                          colorPalette={
                            hasPaymentDocument ? "primary" : undefined
                          }
                        >
                          <MaterialSymbol>file_present</MaterialSymbol>
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip
                      content={
                        fakturowniaDocumentId
                          ? fakturowniaDocumentId
                          : t("order.noPaymentDocument", {
                              defaultValue: "No payment document",
                            })
                      }
                    >
                      <IconButton
                        colorPalette={
                          hasPaymentDocument ? "primary" : undefined
                        }
                        variant={"outline"}
                        onClick={() => setShowPaymentDocumentForm(true)}
                      >
                        <MaterialSymbol>file_present</MaterialSymbol>
                      </IconButton>
                    </Tooltip>
                  )}
                  {optimisticOrder.shippingOption &&
                    isShippingWithCourier(
                      optimisticOrder.shippingOption,
                      false,
                      shippingMethodsSettings,
                    ) &&
                    !optimisticOrder.tracking && (
                      <Tooltip
                        content={t("order.packageTracking", {
                          defaultValue: "Package Tracking",
                        })}
                      >
                        <span>
                          <IconButton
                            onClick={() => handleShowTrackingForm()}
                            variant={"outline"}
                            colorPalette={
                              optimisticOrder.tracking ? "primary" : undefined
                            }
                          >
                            <MaterialSymbol>package</MaterialSymbol>
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  {isElectron() && (
                    <IconButton onClick={handleOpenFolder} variant={"outline"}>
                      <MaterialSymbol>folder_open</MaterialSymbol>
                    </IconButton>
                  )}
                  <Button
                    colorPalette={"primary"}
                    onClick={handleUpdateFormOpen}
                    variant={"surface"}
                  >
                    <MaterialSymbol>edit</MaterialSymbol>
                    {t("order.editOrder", { defaultValue: "Edit order" })}
                  </Button>
                  <MenuRoot>
                    <MenuTrigger asChild>
                      <Button colorPalette={"primary"} variant={"solid"}>
                        <MaterialSymbol>print</MaterialSymbol>
                        {t("order.print", { defaultValue: "Print" })}
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem
                        value={"print-full"}
                        onClick={() => handlePrintFull()}
                      >
                        {t("order.entireOrder", {
                          defaultValue: "Entire order (no customer/footer)",
                        })}
                      </MenuItem>
                      <MenuItem
                        value={"print-with-customer"}
                        onClick={() => handlePrintWithCustomer()}
                      >
                        {t("order.withCustomerPart", {
                          defaultValue: "With customer part & footer",
                        })}
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </Stack>
              </Box>
              <Notes notes={notes ?? []} />
              <Box
                border={"1px solid"}
                borderColor={
                  optimisticOrder.specialNotes ? "orange.muted" : borderColor
                }
                borderRadius={"3xl"}
                bg={optimisticOrder.specialNotes ? "orange.subtle" : undefined}
                p={"8"}
                position="relative"
                overflow="hidden"
              >
                {optimisticOrder.specialNotes && (
                  <SpecialNotesBackgroundPattern />
                )}
                <SpecialNotes
                  specialNotes={optimisticOrder.specialNotes}
                  t={t}
                  isEditable={true}
                  onSave={handleSaveSpecialNotes}
                  variant="content"
                />
              </Box>
              {externalSource && (
                <Box
                  mt={["6", "8"]}
                  border={"1px solid"}
                  borderColor={borderColor}
                  borderRadius={"3xl"}
                  p={"8"}
                >
                  <VStack align="stretch" gap={3}>
                    <HStack justify="space-between" flexWrap="wrap" gap={3}>
                      <Text as="h2" fontSize="lg" fontWeight="bold">
                        {t("allegro.sourceDetailsTitle", {
                          defaultValue: "External source",
                        })}
                      </Text>
                      <Badge colorPalette="orange" size="sm">
                        {t("allegro.badge", { defaultValue: "Allegro" })}
                      </Badge>
                    </HStack>
                    <Box>
                      <Text fontSize="sm" color="fg.muted">
                        {t("allegro.sourceOrderIdLabel", {
                          defaultValue: "External order ID",
                        })}
                      </Text>
                      <Text fontWeight="medium">
                        {externalSource.externalOrderId}
                      </Text>
                    </Box>
                    {externalSource.externalOrderRevision && (
                      <Box>
                        <Text fontSize="sm" color="fg.muted">
                          {t("allegro.sourceRevisionLabel", {
                            defaultValue: "Revision",
                          })}
                        </Text>
                        <Text>{externalSource.externalOrderRevision}</Text>
                      </Box>
                    )}
                    {externalSource.externalBuyerLogin && (
                      <Box>
                        <Text fontSize="sm" color="fg.muted">
                          {t("allegro.sourceBuyerLabel", {
                            defaultValue: "Buyer login",
                          })}
                        </Text>
                        <Text>{externalSource.externalBuyerLogin}</Text>
                      </Box>
                    )}
                    {externalSource.externalDeliveryMethodName && (
                      <Box>
                        <Text fontSize="sm" color="fg.muted">
                          {t("allegro.sourceDeliveryMethodLabel", {
                            defaultValue: "Delivery method",
                          })}
                        </Text>
                        <Text>{externalSource.externalDeliveryMethodName}</Text>
                      </Box>
                    )}
                    {externalSource.externalPaymentId && (
                      <Box>
                        <Text fontSize="sm" color="fg.muted">
                          {t("allegro.sourcePaymentIdLabel", {
                            defaultValue: "External payment ID",
                          })}
                        </Text>
                        <Text>{externalSource.externalPaymentId}</Text>
                      </Box>
                    )}
                    {externalSource.pickupPointName && (
                      <Box>
                        <Text fontSize="sm" color="fg.muted">
                          {t("allegro.sourcePickupPointLabel", {
                            defaultValue: "Pickup point",
                          })}
                        </Text>
                        <Text>{externalSource.pickupPointName}</Text>
                      </Box>
                    )}
                    {externalSource.importedAt && (
                      <Box>
                        <Text fontSize="sm" color="fg.muted">
                          {t("allegro.sourceImportedAtLabel", {
                            defaultValue: "Imported at",
                          })}
                        </Text>
                        <Text>
                          {externalSource.importedAt
                            .toDate()
                            .toLocaleString(i18n.resolvedLanguage)}
                        </Text>
                      </Box>
                    )}
                  </VStack>
                </Box>
              )}
              {!isEmpty(complaints) && (
                <Box
                  mt={["6", "8"]}
                  // bgColor="red.subtle"
                  border={"1px solid"}
                  borderColor={borderColor}
                  borderRadius={"3xl"}
                  p={"8"}
                  position="relative"
                  overflow="hidden"
                >
                  <Circle
                    size="32"
                    bgColor="red"
                    filter="blur(50px)"
                    position="absolute"
                    top={0}
                    right={0}
                    animation="float"
                  />
                  <Text as="h2" fontSize="lg" fontWeight="bold" mb={4}>
                    {t("orders.complaints", { defaultValue: "Complaints" })}
                  </Text>
                  {complaints?.map((complaint) => (
                    <Box
                      key={complaint.id}
                      p={4}
                      bg={{ base: "white", _dark: "black" }}
                      rounded={"3xl"}
                      position={"relative"}
                    >
                      <IconButtonLink
                        lng={i18n.resolvedLanguage}
                        href={`/complaints/${complaint.id}`}
                        ariaLabel={t("admin.complaints", {
                          defaultValue: "Complaints",
                        })}
                        colorPalette={"primary"}
                        icon={"arrow_forward"}
                        position={"absolute"}
                        top={2}
                        right={2}
                      />
                      <Text fontSize="sm">{complaint.description}</Text>
                    </Box>
                  ))}
                </Box>
              )}
              <Box
                mt={["6", "8"]}
                border={"1px solid"}
                borderColor={borderColor}
                borderRadius={"3xl"}
                p={"8"}
              >
                <OrderCustomerInlineEditor
                  editable={canEditCustomerDetails}
                  onSave={handleSaveCustomerDetails}
                  customerCardProps={{
                    customer: optimisticOrder.customer,
                    contact: optimisticOrder.contact,
                    invoice: optimisticOrder.invoice,
                    shipping: optimisticOrder.shipping,
                    tracking: optimisticOrder.tracking,
                    shippingOption: optimisticOrder.shippingOption,
                    anonymousPackageShipping:
                      optimisticOrder.anonymousPackageShipping,
                    billing: optimisticOrder.billing,
                    invoiceNotes: optimisticOrder.invoiceNotes,
                    paymentType: optimisticOrder.paymentType,
                    hasFakturowniaKey: canUseFakturownia,
                    invoiceHref,
                    paymentDocumentId: optimisticOrder.paymentDocumentId,
                    hasPolkurierKey: canUsePolkurier,
                    status: optimisticOrder.status,
                    channelId,
                    setShowSendParcelDialog,
                    shippingExtra:
                      optimisticOrder.shippingOption !==
                      ShippingOptions.PERSONAL_COLLECTION ? (
                        <OrderShippingMapPreview
                          shipping={optimisticOrder.shipping}
                        />
                      ) : undefined,
                    t,
                    i18n,
                  }}
                />
              </Box>
              {!isNull(orderItems) &&
                !isUndefined(attachments) &&
                attachments.length > 0 && (
                  <Box
                    className={"noprint-production"}
                    mt={["6", "8"]}
                    border={"1px solid"}
                    borderColor={borderColor}
                    borderRadius={"3xl"}
                    p={"8"}
                  >
                    <Text as="h2" fontSize="lg" fontWeight="bold">
                      {t("admin.attachments", { defaultValue: "Attachments" })}
                    </Text>
                    <Separator my={"6"} />
                    <FileList
                      listResults={attachments}
                      onFileDownload={onFileDownload}
                      onFileDelete={onFileDelete}
                      setDirtyFlag={setAttachmentsDirtyFlag}
                      dirtyFlag={attachmentsDirtyFlag}
                      t={t}
                      i18n={i18n}
                    />
                  </Box>
                )}
              <Show when={showQRCode}>
                <QrCode.Root
                  value={qrValue ?? optimisticOrder.id}
                  mt={8}
                  justifySelf={"flex-end"}
                  size="full"
                  encoding={{ ecc: "Q", boostEcc: true }}
                >
                  <QrCode.Frame>
                    <QrCode.Pattern />
                  </QrCode.Frame>
                </QrCode.Root>
              </Show>
            </GridItem>
          </Grid>
          <CustomerInfo
            id={optimisticOrder.id}
            updatedAt={optimisticOrder.updatedAt}
            updatedBy={optimisticOrder.updatedBy}
            createdAt={optimisticOrder.createdAt}
            createdBy={optimisticOrder.createdBy}
            t={t}
            lng={i18n.resolvedLanguage}
          />
        </Box>
        <Box className="print-footer noprint-production" mb={8} display="none">
          <Separator my={8} variant="dashed" />
          <HStack justify="space-between">
            <VStack gap={4} alignItems="flex-start">
              <Heading>
                {`${t("admin.orderNumber")} ${optimisticOrder?.number}${optimisticOrder?.isTest ? " (test)" : ""}`}
              </Heading>
              <Badge pl={3} pr={4}>
                {t("order.createdOn", { defaultValue: "Created on" })}:{" "}
                {optimisticOrder?.createdAt
                  .toDate()
                  .toLocaleDateString(i18n.resolvedLanguage)}
              </Badge>
              <Badge pl={3} pr={4}>
                {t("order.deadline", { defaultValue: "Deadline" })}:{" "}
                {optimisticOrder.deadline
                  .toDate()
                  .toLocaleDateString(i18n.resolvedLanguage, {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    hour: optimisticOrder.exactTime ? "2-digit" : undefined,
                    minute: optimisticOrder.exactTime ? "2-digit" : undefined,
                  })}
              </Badge>
            </VStack>
            <VStack gap={4} alignSelf="end">
              <Text color="primary.solid" fontSize="lg" fontWeight="bold">
                {t("orders.price", { defaultValue: "Total" })}:{" "}
                {formatPrice(
                  optimisticOrder.totalPrice,
                  optimisticOrder.currency ?? CurrencyEnum.PLN,
                  undefined,
                  undefined,
                  i18n.resolvedLanguage,
                )}
              </Text>
            </VStack>
          </HStack>
        </Box>
      </Skeleton>
      <OrderForm
        asDrawer
        order={optimisticOrder}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
        setOptimisticOrder={setOptimisticOrder}
      />
      <PaymentProofUploader
        order={optimisticOrder!}
        open={showAttachmentsForm}
        setOpen={setShowAttachmentsForm}
        setOptimisticOrder={setOptimisticOrder}
      />
      <PaymentDocumentForm
        orderId={optimisticOrder?.id}
        channelId={optimisticOrder?.channelId ?? channelId ?? channel?.id}
        paymentDocumentId={optimisticOrder?.paymentDocumentId}
        proformaDocumentId={optimisticOrder?.proformaDocumentId}
        paymentStatus={optimisticOrder?.paymentStatus}
        open={showPaymentDocumentForm}
        setOpen={setShowPaymentDocumentForm}
        setOptimisticOrder={setOptimisticOrder}
      />
      <TrackingForm
        open={showTrackingForm}
        setOpen={setShowTrackingForm}
        order={optimisticOrder}
        setOptimisticOrder={setOptimisticOrder}
      />
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
                <Button
                  variant="outline"
                  onClick={() => setPendingStatusConfirmation(null)}
                >
                  {t("orders.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  colorPalette="primary"
                  onClick={() => {
                    if (!pendingStatusConfirmation) {
                      return;
                    }

                    applyStatusUpdate(
                      pendingStatusConfirmation.field,
                      pendingStatusConfirmation.value,
                      pendingStatusConfirmation.updatedBy,
                    );
                    setPendingStatusConfirmation(null);
                  }}
                >
                  {t("orders.changeStatus", {
                    defaultValue: "Change status",
                  })}
                </Button>
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
      <SendParcelDialog
        open={showSendParcelDialog}
        setOpen={setShowSendParcelDialog}
        order={optimisticOrder}
        channelId={channelId}
      />
      <Dialog.Root
        open={showCreateVatInvoiceDialog}
        onOpenChange={({ open }) => {
          if (isCreatingVatInvoice) {
            return;
          }

          setShowCreateVatInvoiceDialog(open);
          if (!open) {
            setVatInvoiceSellerPerson(undefined);
          }
        }}
        role="alertdialog"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t("order.confirmCreateVatInvoiceTitle", {
                    defaultValue: "Create VAT invoice?",
                  })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <VStack align="stretch" gap={4}>
                  <Text>
                    {t("order.confirmCreateVatInvoiceDescription", {
                      defaultValue:
                        "Generating a VAT invoice from this proforma cannot be undone. Continue?",
                    })}
                  </Text>
                  <Alert.Root status="info">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>
                        {t(
                          "order.createVatInvoiceSellerPersonRequiredDescription",
                          {
                            defaultValue:
                              "Select a team member as seller person before creating the VAT invoice.",
                          },
                        )}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                  <Box>
                    <Text fontWeight="medium" mb={2}>
                      {t("fakturownia.invoiceCreate.sellerPerson", {
                        defaultValue: "Seller person",
                      })}
                    </Text>
                    <Select.Root
                      collection={vatInvoiceSellerPersonCollection}
                      value={
                        vatInvoiceSellerPerson ? [vatInvoiceSellerPerson] : []
                      }
                      onValueChange={({ value }) =>
                        setVatInvoiceSellerPerson(value[0])
                      }
                      disabled={
                        loadingMembers ||
                        vatInvoiceSellerPersonCollection.items.length === 0 ||
                        isCreatingVatInvoice
                      }
                    >
                      <Select.HiddenSelect />
                      <Select.Control>
                        <Select.Trigger>
                          <Select.ValueText
                            placeholder={
                              loadingMembers
                                ? t("common.loading", {
                                    defaultValue: "Loading...",
                                  })
                                : t(
                                    "fakturownia.invoiceCreate.selectSellerPerson",
                                    { defaultValue: "Select seller" },
                                  )
                            }
                          />
                        </Select.Trigger>
                        <Select.IndicatorGroup>
                          <Select.Indicator />
                        </Select.IndicatorGroup>
                      </Select.Control>
                      <Portal>
                        <Select.Positioner>
                          <Select.Content>
                            {vatInvoiceSellerPersonCollection.items.map(
                              (item) => (
                                <Select.Item item={item} key={item.value}>
                                  {item.label}
                                  <Select.ItemIndicator />
                                </Select.Item>
                              ),
                            )}
                          </Select.Content>
                        </Select.Positioner>
                      </Portal>
                    </Select.Root>
                    {!loadingMembers &&
                      vatInvoiceSellerPersonCollection.items.length === 0 && (
                        <Text mt={2} fontSize="sm" color="fg.muted">
                          {t("admin.noTeamMembers", {
                            defaultValue: "No team members",
                          })}
                        </Text>
                      )}
                  </Box>
                  {showPaymentConfirmationWarning && (
                    <Alert.Root status="warning">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>
                          {t(
                            "order.confirmCreateVatInvoicePaymentWarningTitle",
                            {
                              defaultValue: "Payment not confirmed",
                            },
                          )}
                        </Alert.Title>
                        <Alert.Description>
                          {t(
                            "order.confirmCreateVatInvoicePaymentWarningDescription",
                            {
                              defaultValue:
                                "This order is not marked as paid. Confirm that payment was manually verified before creating the VAT invoice.",
                            },
                          )}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateVatInvoiceDialog(false);
                    setVatInvoiceSellerPerson(undefined);
                  }}
                  disabled={isCreatingVatInvoice}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  colorPalette="primary"
                  onClick={handleCreateVatInvoice}
                  loading={isCreatingVatInvoice}
                  disabled={
                    loadingMembers ||
                    !vatInvoiceSellerPerson ||
                    isCreatingVatInvoice
                  }
                >
                  {t("order.createVatInvoice", {
                    defaultValue: "Create VAT Invoice",
                  })}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      {selectedOrderItem && optimisticOrder && channelId && warehouses && (
        <OrderItemWarehouseAssignmentDialog
          open={showWarehouseAssignmentDialog}
          onOpenChange={setShowWarehouseAssignmentDialog}
          channelId={channelId}
          orderId={optimisticOrder.id}
          orderItem={selectedOrderItem}
          warehouses={warehouses}
          onSuccess={handleWarehouseAssignmentSuccess}
        />
      )}
      {selectedOrderItem && optimisticOrder && channelId && warehouses && (
        <ManualFulfillmentRequestDialog
          open={showManualFulfillmentDialog}
          onOpenChange={setShowManualFulfillmentDialog}
          channelId={channelId}
          orderId={optimisticOrder.id}
          orderItem={selectedOrderItem}
          warehouses={warehouses}
        />
      )}
      <ItemProblemDialog
        open={showItemProblemDialog}
        onOpenChange={setShowItemProblemDialog}
        orderItem={selectedProblemItem}
        existingProblem={existingProblem}
        onSubmit={handleSubmitItemProblem}
      />
    </Box>
  );
};

export default OrderPage;
