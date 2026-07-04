"use client";

import { Notes } from "@/components/notes/Notes";
import OrderItemsFilesSection from "@/components/orders/OrderItemsFilesSection";
import { OrderShippingMapPreview } from "@/components/orders/OrderShippingMapPreview";
import {
  Alert,
  Badge,
  Box,
  Grid,
  GridItem,
  Heading,
  HStack,
  QrCode,
  Separator,
  Show,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  Customer,
  CustomerInfo,
  FakturowniaInvoice,
  FileList,
  Payment,
  PrintingMethodsGroup,
  SpecialNotes,
} from "@konfi/components";
import {
  type Channel,
  type Complaint,
  CurrencyEnum,
  DEFAULT_LOCALE,
  isAllegroExternalOrder,
  isAllegroFulfillmentManagedOrder,
  type ListResults,
  type Note,
  type Order,
  type OrderWorkflowStatusesSettings,
  type PrintingMethodsSettings,
  type ScanPayload,
  ShippingOptions,
  type ShippingMethodsSettings,
  type Warehouse,
} from "@konfi/types";
import { formatPrice, getStatusColor } from "@konfi/utils";
import type { FirebaseStorage } from "firebase/storage";
import type { i18n as I18n, TFunction } from "i18next";
import { formatOrderPrintDate } from "./order-print-date";
import type { OrderPrintMode } from "./order-print-types";

export type OrderPrintInvoice = {
  kind?: string | null;
  viewUrl?: string;
};

export type PreparedOrderPrintData = {
  attachments: ListResults[];
  channelName: string;
  complaints: Complaint[];
  fakturowniaDocumentId?: string;
  fakturowniaInvoice?: OrderPrintInvoice | null;
  files: ListResults[];
  notes: Note[];
  order: Order;
};

type DateLike = Date | { toDate: () => Date } | null | undefined;

interface OrderPrintDocumentProps {
  channel?: Pick<Channel, "id" | "warehouses"> | null;
  data: PreparedOrderPrintData;
  getFolderPath: (channelId: string) => string | undefined;
  i18n: I18n;
  onFileDownload: (url?: string) => Promise<void>;
  orderWorkflowStatusesSettings?: OrderWorkflowStatusesSettings | null;
  printingMethodsSettings?: PrintingMethodsSettings | null;
  shippingMethodsSettings?: ShippingMethodsSettings | null;
  storage: FirebaseStorage;
  t: TFunction;
  warehouses?: Warehouse[] | null;
}

function toDate(value: DateLike): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return value.toDate();
}

function formatDate(
  value: DateLike,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = toDate(value);

  return date ? date.toLocaleDateString(locale, options) : "-";
}

function getTotalPriceWithoutDiscount(order: Order): number {
  const itemsDiscount = order.items.reduce(
    (sum, item) => sum + (item.discount?.discountedAmount ?? 0),
    0,
  );
  const shippingDiscount = order.shippingPriceDiscount?.discountedAmount ?? 0;
  const orderLevelDiscount = order.totalPriceDiscount?.discountedAmount ?? 0;
  const storeCreditAmount = order.storeCreditRedemption?.amount ?? 0;

  return Math.max(
    0,
    Math.floor(
      order.totalPrice +
        itemsDiscount +
        shippingDiscount +
        orderLevelDiscount +
        storeCreditAmount,
    ),
  );
}

function getWarehouseName(warehouses: Warehouse[] | null | undefined) {
  return (warehouseId: string): string =>
    warehouses?.find((warehouse) => warehouse.id === warehouseId)?.address
      ?.name ?? warehouseId;
}

function shouldShowOrderQrCode(
  order: Order,
  channel: Pick<Channel, "id" | "warehouses"> | null,
  warehouses: Warehouse[] | null | undefined,
) {
  if (order.shippingOption === ShippingOptions.COMPANY_COURIER) {
    return true;
  }

  if (
    order.isFromStore &&
    order.shippingOption === ShippingOptions.PERSONAL_COLLECTION
  ) {
    return true;
  }

  if (!warehouses || !channel || channel.warehouses.length === 0) {
    return false;
  }

  return Boolean(
    warehouses.find(
      (warehouse) =>
        warehouse.address?.name === order.shipping?.name &&
        !channel.warehouses.includes(warehouse.id),
    ),
  );
}

export function getOrderPrintPageStyle(mode: OrderPrintMode): string {
  const withCustomerFooter = mode === "withCustomer";

  return `
    @page { size: a2 landscape; }
    @media print {
      html, body { width:100% !important; height:100% !important; overflow:visible !important; background:#ffffff !important; print-color-adjust:exact !important; -webkit-print-color-adjust:exact !important; zoom:80%; }
      .noprint { display:none !important; }
      .print-wrapper { min-height:100vh; display:flex; flex-direction:column; }
      .print-content { flex:1 1 auto; ${withCustomerFooter ? "padding-bottom:160px;" : ""} }
      .print-footer {
        display:${withCustomerFooter ? "block" : "none"} !important;
        ${withCustomerFooter ? "position:fixed; left:0; right:0; bottom:0;" : ""}
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
}

export function OrderPrintDocument({
  channel,
  data,
  getFolderPath,
  i18n,
  onFileDownload,
  orderWorkflowStatusesSettings,
  printingMethodsSettings,
  shippingMethodsSettings,
  storage,
  t,
  warehouses,
}: OrderPrintDocumentProps) {
  const { order } = data;
  const locale = i18n.resolvedLanguage ?? DEFAULT_LOCALE;
  const showQRCode = shouldShowOrderQrCode(order, channel ?? null, warehouses);
  const qrPayload: ScanPayload = {
    v: 1,
    t: "ORDER_SCAN",
    cid: order.channelId,
    oid: order.id,
    stage: "AUTO",
  };
  const qrValue = `konfi://${JSON.stringify(qrPayload)}`;
  const isAllegroOrder = isAllegroExternalOrder(order);
  const isExternallyFulfilled = isAllegroFulfillmentManagedOrder(order);
  const totalPriceWithoutDiscount = getTotalPriceWithoutDiscount(order);

  return (
    <Box className="print-wrapper" bg="bg" color="fg" w="full">
      <Box className="print-content">
        <Grid
          className="print-grid-template-columns"
          templateColumns={["repeat(1, 1fr)", "repeat(5, 1fr)"]}
          columnGap={["0", "8"]}
          rowGap={["6", "8"]}
        >
          <GridItem className="print-grid-column-3" colSpan={[1, 3]} minW="0">
            <VStack align="stretch" gap={8}>
              <Box>
                <Heading as="h1" size="4xl" mb={8}>
                  {data.channelName}#{order.number}
                  {order.isTest ? " (test)" : ""}
                </Heading>
                <HStack align="center" gap={2} flexWrap="wrap">
                  <Badge pl={3} pr={4} size="lg">
                    {t("order.createdOn", { defaultValue: "Created on" })}:{" "}
                    {formatDate(order.createdAt, locale)}
                  </Badge>
                  <Badge pl={3} pr={4} size="lg">
                    {t("order.deadline", { defaultValue: "Deadline" })}:{" "}
                    {formatOrderPrintDate(order.deadline, {
                      exactTime: order.exactTime,
                      fallbackDateString: order.deadlineString,
                      locale,
                    })}
                  </Badge>
                  <Badge
                    colorPalette={getStatusColor(order.status)}
                    pl={3}
                    pr={4}
                    size="lg"
                  >
                    {t(`OrderStatus.${order.status}`, {
                      defaultValue: order.status,
                    })}
                  </Badge>
                  <Badge
                    colorPalette={getStatusColor(order.filesStatus)}
                    pl={3}
                    pr={4}
                    size="lg"
                  >
                    {t(`OrderFilesStatus.${order.filesStatus}`, {
                      defaultValue: order.filesStatus,
                    })}
                  </Badge>
                  {isAllegroOrder && (
                    <Badge colorPalette="orange" size="lg">
                      {t("allegro.badge", { defaultValue: "Allegro" })}
                    </Badge>
                  )}
                </HStack>
              </Box>
              <Box
                border="1px solid"
                borderColor="gray.muted"
                borderRadius="3xl"
                p={8}
              >
                <HStack justify="space-between" align="center" mb={6}>
                  <Text as="h2" fontSize="lg" fontWeight="bold">
                    {t("order.items", { defaultValue: "Items" })}
                  </Text>
                  <PrintingMethodsGroup
                    values={order.printingMethods ?? []}
                    settings={printingMethodsSettings}
                    t={t}
                    locale={locale}
                  />
                </HStack>
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
                <OrderItemsFilesSection
                  storage={storage}
                  order={order}
                  orderItems={order.items}
                  listResults={data.files}
                  baseFolderPath={getFolderPath(order.channelId)}
                  channelId={order.channelId}
                  onFileDownload={onFileDownload}
                  showFiles
                  warehouses={warehouses}
                  getWarehouseName={getWarehouseName(warehouses)}
                  orderWorkflowStatusesSettings={orderWorkflowStatusesSettings}
                  shippingMethodsSettings={shippingMethodsSettings}
                  eagerImages
                  t={t}
                  i18n={i18n}
                />
              </Box>
              {data.fakturowniaDocumentId &&
                data.fakturowniaInvoice?.viewUrl && (
                  <Box
                    border="1px solid"
                    borderColor="gray.muted"
                    borderRadius="3xl"
                    p={8}
                  >
                    <FakturowniaInvoice
                      paymentDocumentId={data.fakturowniaDocumentId}
                      viewUrl={data.fakturowniaInvoice.viewUrl}
                      kind={data.fakturowniaInvoice.kind ?? undefined}
                      lng={locale}
                      t={t}
                    />
                  </Box>
                )}
              <Box
                className="noprint-production"
                border="1px solid"
                borderColor="gray.muted"
                borderRadius="3xl"
                p={8}
              >
                <Payment
                  order={order}
                  checkoutSessionUrl={order.checkoutSession?.url}
                  paymentStatus={order.paymentStatus}
                  paymentType={order.paymentType}
                  paymentDocumentId={order.paymentDocumentId}
                  items={order.items}
                  shippingPrice={order.shippingPrice ?? 0}
                  totalPrice={order.totalPrice}
                  totalPriceWithoutDiscount={totalPriceWithoutDiscount}
                  taxSummary={order.taxSummary}
                  currency={order.currency}
                  t={t}
                  i18n={i18n}
                />
              </Box>
            </VStack>
          </GridItem>
          <GridItem
            className="print-grid-column-2"
            colSpan={[1, 2]}
            minW="0"
            mt={8}
          >
            <VStack align="stretch" gap={8}>
              <Notes notes={data.notes} />
              <Box
                border="1px solid"
                borderColor="gray.muted"
                borderRadius="3xl"
                p={8}
              >
                <SpecialNotes specialNotes={order.specialNotes} t={t} />
              </Box>
              {data.complaints.length > 0 && (
                <Box
                  border="1px solid"
                  borderColor="gray.muted"
                  borderRadius="3xl"
                  p={8}
                >
                  <Text as="h2" fontSize="lg" fontWeight="bold" mb={4}>
                    {t("orders.complaints", { defaultValue: "Complaints" })}
                  </Text>
                  <VStack align="stretch" gap={3}>
                    {data.complaints.map((complaint) => (
                      <Box
                        key={complaint.id}
                        border="1px solid"
                        borderColor="gray.muted"
                        borderRadius="2xl"
                        p={4}
                      >
                        <Text fontSize="sm">{complaint.description}</Text>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              )}
              <Box
                border="1px solid"
                borderColor="gray.muted"
                borderRadius="3xl"
                p={8}
              >
                <Customer
                  customer={order.customer}
                  contact={order.contact}
                  invoice={order.invoice}
                  shipping={order.shipping}
                  tracking={order.tracking}
                  shippingOption={order.shippingOption}
                  anonymousPackageShipping={order.anonymousPackageShipping}
                  billing={order.billing}
                  invoiceNotes={order.invoiceNotes}
                  paymentType={order.paymentType}
                  paymentDocumentId={order.paymentDocumentId}
                  status={order.status}
                  channelId={order.channelId}
                  shippingMethodsSettings={shippingMethodsSettings}
                  shippingExtra={
                    order.shippingOption !==
                    ShippingOptions.PERSONAL_COLLECTION ? (
                      <OrderShippingMapPreview shipping={order.shipping} />
                    ) : undefined
                  }
                  t={t}
                  i18n={i18n}
                />
              </Box>
              {data.attachments.length > 0 && (
                <Box
                  className="noprint-production"
                  border="1px solid"
                  borderColor="gray.muted"
                  borderRadius="3xl"
                  p={8}
                >
                  <Text as="h2" fontSize="lg" fontWeight="bold">
                    {t("admin.attachments", { defaultValue: "Attachments" })}
                  </Text>
                  <Separator my={6} />
                  <FileList
                    listResults={data.attachments}
                    onFileDownload={onFileDownload}
                    t={t}
                    i18n={i18n}
                  />
                </Box>
              )}
              <Show when={showQRCode}>
                <QrCode.Root
                  value={qrValue}
                  justifySelf="flex-end"
                  size="full"
                  encoding={{ ecc: "Q", boostEcc: true }}
                >
                  <QrCode.Frame>
                    <QrCode.Pattern />
                  </QrCode.Frame>
                </QrCode.Root>
              </Show>
            </VStack>
          </GridItem>
        </Grid>
        <CustomerInfo
          id={order.id}
          updatedAt={order.updatedAt}
          updatedBy={order.updatedBy}
          createdAt={order.createdAt}
          createdBy={order.createdBy}
          t={t}
          lng={locale}
        />
      </Box>
      <Box className="print-footer noprint-production" mb={8} display="none">
        <Separator my={8} variant="dashed" />
        <HStack justify="space-between">
          <VStack gap={4} alignItems="flex-start">
            <Heading>
              {`${t("admin.orderNumber", { defaultValue: "Order number" })} ${order.number}${order.isTest ? " (test)" : ""}`}
            </Heading>
            <Badge pl={3} pr={4}>
              {t("order.createdOn", { defaultValue: "Created on" })}:{" "}
              {formatDate(order.createdAt, locale)}
            </Badge>
            <Badge pl={3} pr={4}>
              {t("order.deadline", { defaultValue: "Deadline" })}:{" "}
              {formatOrderPrintDate(order.deadline, {
                exactTime: order.exactTime,
                fallbackDateString: order.deadlineString,
                locale,
              })}
            </Badge>
          </VStack>
          <VStack gap={4} alignSelf="end">
            <Text color="primary.solid" fontSize="lg" fontWeight="bold">
              {t("orders.price", { defaultValue: "Total" })}:{" "}
              {formatPrice(
                order.totalPrice,
                order.currency ?? CurrencyEnum.PLN,
                undefined,
                undefined,
                locale,
              )}
            </Text>
          </VStack>
        </HStack>
      </Box>
    </Box>
  );
}
