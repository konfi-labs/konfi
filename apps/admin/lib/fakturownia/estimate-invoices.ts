import "server-only";

import {
  type FakturowniaClient,
  type Invoice,
  type InvoicePosition,
} from "@konfi/fakturownia";
import type {
  Department,
  RecipientOrIssuer,
} from "@konfi/fakturownia/out/client/models";
import {
  type CustomerInvoiceAutomation,
  type Order,
  OrderStatus,
  PaymentStatus,
  PaymentType,
} from "@konfi/types";
import {
  FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS,
  normalizeCurrencyCode,
} from "@konfi/utils";
import { DateOnly } from "@microsoft/kiota-abstractions";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { formatFakturowniaError, getFakturowniaClient } from "./client";
import { mapOrderItemToInvoicePosition } from "./helpers";
import {
  buildFakturowniaInvoiceAdditionalData,
  getFakturowniaInvoiceRecipientFromAddress,
  getFakturowniaRoleDescription,
  type FakturowniaInvoiceRecipientData,
  normalizeFakturowniaRecipientRole,
  truncateFakturowniaInvoicePositionDescription,
} from "./invoice-payload";

const FAKTUROWNIA_AUTOMATION_SUBCOLLECTION = "fakturowniaAutomation";

export interface FakturowniaEstimateInvoicesResult {
  skippedBySchedule: boolean;
  processedCount: number;
  skippedNoAutomation: number;
  skippedMissingCustomer: number;
  skippedMissingInvoiceNumber: number;
  errorCount: number;
}

interface ChannelDoc {
  name?: string;
  warehouses?: string[];
}

interface WarehouseDoc {
  name?: string;
  address?: {
    city?: string;
  };
}

function isSundayOrLastDayOfMonth(now: Date): boolean {
  const isSunday = now.getUTCDay() === 0;
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const isLastDayOfMonth = tomorrow.getUTCMonth() !== now.getUTCMonth();
  return isSunday || isLastDayOfMonth;
}

function getLastDayOfMonthIso(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.toISOString().split("T")[0] ?? "";
}

function getInvoiceNumber(invoice: Invoice | undefined): string | undefined {
  if (!invoice) return undefined;
  if (invoice.number && invoice.number.trim().length > 0) {
    return invoice.number.trim();
  }
  if (typeof invoice.id === "number") return invoice.id.toString();
  return undefined;
}

function resolveOrderChannelId(
  order: Order,
  documentPath: string,
): string | undefined {
  if (typeof order.channelId === "string" && order.channelId.trim() !== "") {
    return order.channelId.trim();
  }

  const segments = documentPath.split("/").filter(Boolean);
  const channelIndex = segments.indexOf("channels");
  if (channelIndex >= 0 && segments.length > channelIndex + 1) {
    return segments[channelIndex + 1];
  }

  return undefined;
}

function buildOid(
  order: Order,
  channelName?: string | null,
): string | undefined {
  const rawNumber = order.number ?? order.id;
  const orderNumber =
    rawNumber !== undefined && rawNumber !== null ? String(rawNumber) : "";
  const trimmedOrderNumber = orderNumber.trim();

  if (!trimmedOrderNumber) {
    return undefined;
  }

  const trimmedChannelName =
    typeof channelName === "string" ? channelName.trim() : "";
  if (trimmedChannelName) {
    return `${trimmedChannelName}#${trimmedOrderNumber}`;
  }

  return trimmedOrderNumber;
}

function findMatchingDepartment(
  warehouseText: string,
  departments: Department[],
): Department | undefined {
  if (!warehouseText || departments.length === 0) {
    return undefined;
  }

  const normalizedText = warehouseText.toLowerCase().trim();

  for (const department of departments) {
    const shortcut = department.shortcut?.toLowerCase().trim();
    if (shortcut && normalizedText.includes(shortcut)) {
      return department;
    }
  }

  for (const department of departments) {
    const departmentName = department.name?.toLowerCase().trim();
    if (departmentName && normalizedText.includes(departmentName)) {
      return department;
    }
  }

  return undefined;
}

async function loadEnabledAutomationSettings(): Promise<
  Map<string, CustomerInvoiceAutomation>
> {
  const snapshot = await getAdminDb()
    .collectionGroup(FAKTUROWNIA_AUTOMATION_SUBCOLLECTION)
    .where("enabled", "==", true)
    .get();

  const map = new Map<string, CustomerInvoiceAutomation>();

  for (const doc of snapshot.docs) {
    const data = doc.data() as CustomerInvoiceAutomation;
    if (
      !data.fakturowniaClientId ||
      data.fakturowniaClientId.trim().length === 0
    ) {
      continue;
    }

    const customerRef = doc.ref.parent.parent;
    if (!customerRef) {
      continue;
    }

    map.set(customerRef.id, {
      ...data,
      id: doc.id,
    });
  }

  return map;
}

async function getChannelAndMainWarehouse(
  channelId: string,
  channelCache: Map<string, ChannelDoc | null>,
  warehouseCache: Map<string, WarehouseDoc | null>,
): Promise<{ channel: ChannelDoc | null; warehouse: WarehouseDoc | null }> {
  let channel: ChannelDoc | null = channelCache.get(channelId) ?? null;

  if (!channelCache.has(channelId)) {
    try {
      const channelSnap = await getAdminDb().doc(`channels/${channelId}`).get();
      channel = channelSnap.exists ? (channelSnap.data() as ChannelDoc) : null;
      if (!channel) {
        console.warn(
          "Channel not found while resolving department for estimate invoice",
          { channelId },
        );
      }
    } catch (error) {
      console.error(
        "Failed to load channel while resolving department for estimate invoice",
        { channelId, error: formatFakturowniaError(error) },
      );
      channel = null;
    }

    channelCache.set(channelId, channel);
  }

  if (
    !channel ||
    !Array.isArray(channel.warehouses) ||
    channel.warehouses.length === 0
  ) {
    return { channel, warehouse: null };
  }

  const mainWarehouseId = channel.warehouses[0];
  let warehouse: WarehouseDoc | null =
    warehouseCache.get(mainWarehouseId) ?? null;

  if (!warehouseCache.has(mainWarehouseId)) {
    try {
      const warehouseSnap = await getAdminDb()
        .doc(`warehouses/${mainWarehouseId}`)
        .get();
      warehouse = warehouseSnap.exists
        ? (warehouseSnap.data() as WarehouseDoc)
        : null;
      if (!warehouse) {
        console.warn(
          "Warehouse not found while resolving department for estimate invoice",
          { channelId, warehouseId: mainWarehouseId },
        );
      }
    } catch (error) {
      console.error(
        "Failed to load warehouse while resolving department for estimate invoice",
        {
          channelId,
          warehouseId: mainWarehouseId,
          error: formatFakturowniaError(error),
        },
      );
      warehouse = null;
    }

    warehouseCache.set(mainWarehouseId, warehouse);
  }

  return { channel, warehouse };
}

function resolveCustomerId(order: Order): string | undefined {
  if (typeof order.customer === "string") {
    return order.customer;
  }
  return order.customer?.id;
}

function buildInvoicePositions(order: Order): InvoicePosition[] {
  return order.items.map((item) =>
    mapOrderItemToInvoicePosition(item, order.taxSummary),
  );
}

function getEstimateInvoicePaymentType(
  orderPaymentType: Order["paymentType"],
): string {
  switch (orderPaymentType) {
    case PaymentType.STRIPE:
      return FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS.STRIPE;
    case PaymentType.PRZELEWY24:
      return FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS.PRZELEWY24;
    default:
      return "transfer";
  }
}

async function createInvoice(
  client: FakturowniaClient,
  params: {
    kind: "estimate";
    issueDate: string;
    sellDate: string;
    paymentTo?: string;
    positions: InvoicePosition[];
    paymentType?: string;
    currency?: string;
    description?: string;
    clientId: string;
    departmentId?: number;
    place?: string;
    oid?: string;
    recipient?: FakturowniaInvoiceRecipientData;
  },
): Promise<Invoice | undefined> {
  const trimmedClientId = params.clientId.trim();
  if (!trimmedClientId) {
    console.warn(
      "Skipping invoice creation due to invalid Fakturownia clientId",
      { rawClientId: params.clientId },
    );
    return undefined;
  }

  const recipientRole = normalizeFakturowniaRecipientRole(
    params.recipient?.role,
  );
  const recipientRoleDescription = getFakturowniaRoleDescription({
    role: recipientRole,
    roleDescription: params.recipient?.roleDescription,
  });
  const structuredRecipient: RecipientOrIssuer | undefined =
    params.recipient && recipientRole
      ? {
          ...(params.recipient.name ? { name: params.recipient.name } : {}),
          ...(params.recipient.street
            ? { street: params.recipient.street }
            : {}),
          ...(params.recipient.postCode
            ? { postCode: params.recipient.postCode }
            : {}),
          ...(params.recipient.city ? { city: params.recipient.city } : {}),
          ...(params.recipient.country
            ? { country: params.recipient.country }
            : {}),
          ...(params.recipient.taxNo ? { taxNo: params.recipient.taxNo } : {}),
          role: recipientRole,
          ...(recipientRoleDescription
            ? // role_description is absent from the generated Kiota model;
              // additionalData entries serialize as top-level recipient fields.
              { additionalData: { role_description: recipientRoleDescription } }
            : {}),
        }
      : undefined;
  const plainRecipient =
    params.recipient && !structuredRecipient ? params.recipient : undefined;

  const invoicePayload: Invoice = {
    kind: params.kind,
    issueDate: DateOnly.parse(params.issueDate),
    sellDate: params.sellDate,
    paymentTo: params.paymentTo,
    paymentType: params.paymentType || "transfer",
    currency: normalizeCurrencyCode(params.currency) ?? "PLN",
    lang: "pl",
    positions: params.positions.map(
      truncateFakturowniaInvoicePositionDescription,
    ),
    description: params.description,
    clientId: trimmedClientId,
    departmentId: Number(params.departmentId),
    place: params.place,
    oid: params.oid,
    oidUnique: params.oid ? "yes" : undefined,
    recipientName: plainRecipient?.name,
    recipientStreet: plainRecipient?.street,
    recipientPostCode: plainRecipient?.postCode,
    recipientCity: plainRecipient?.city,
    recipientCountry: plainRecipient?.country,
    recipientTaxNo: plainRecipient?.taxNo,
    recipients: structuredRecipient ? [structuredRecipient] : undefined,
    additionalData: buildFakturowniaInvoiceAdditionalData({
      recipientRole,
    }),
  };

  const invoice = await client.invoicesJson.post({
    invoice: invoicePayload,
  });

  return invoice as Invoice | undefined;
}

async function createEstimateInvoiceForOrder(
  client: FakturowniaClient,
  order: Order,
  clientId: string,
  options?: {
    departmentId?: string;
    place?: string;
    oid?: string;
  },
): Promise<string | undefined> {
  const billingOrShipping = order.billing || order.shipping;

  if (!billingOrShipping) {
    console.warn("Skipping order without billing or shipping address", {
      orderId: order.id,
      orderNumber: order.number,
    });
    return undefined;
  }

  const positions = buildInvoicePositions(order);
  if (positions.length === 0) {
    console.warn("Skipping order without any invoice positions", {
      orderId: order.id,
      orderNumber: order.number,
    });
    return undefined;
  }

  const now = new Date();
  const todayIso = now.toISOString().split("T")[0] ?? "";
  const paymentToIso = getLastDayOfMonthIso(now);

  try {
    const invoice = await createInvoice(client, {
      kind: "estimate",
      issueDate: todayIso,
      sellDate: todayIso,
      paymentTo: paymentToIso,
      positions,
      paymentType: getEstimateInvoicePaymentType(order.paymentType),
      currency: order.currency,
      description:
        order.invoiceNotes?.trim() || order.specialNotes || undefined,
      clientId,
      departmentId: Number(options?.departmentId),
      place: options?.place,
      oid: options?.oid,
      recipient: getFakturowniaInvoiceRecipientFromAddress(order.billing),
    });

    const invoiceNumber = getInvoiceNumber(invoice);
    if (!invoiceNumber) {
      console.warn("Created estimate invoice without visible number", {
        orderId: order.id,
        orderNumber: order.number,
      });
    }
    return invoiceNumber;
  } catch (error) {
    console.error("Failed to create estimate invoice", {
      orderId: order.id,
      orderNumber: order.number,
      error: formatFakturowniaError(error),
    });
    return undefined;
  }
}

export async function runFakturowniaEstimateInvoices(): Promise<FakturowniaEstimateInvoicesResult> {
  const nowTimestamp = Timestamp.now();
  const nowDate = nowTimestamp.toDate();
  const initialResult: FakturowniaEstimateInvoicesResult = {
    skippedBySchedule: false,
    processedCount: 0,
    skippedNoAutomation: 0,
    skippedMissingCustomer: 0,
    skippedMissingInvoiceNumber: 0,
    errorCount: 0,
  };

  if (!isSundayOrLastDayOfMonth(nowDate)) {
    console.info(
      "fakturowniaEstimateInvoices: skipping run (not Sunday or last day of month)",
      { isoDate: nowDate.toISOString() },
    );
    return {
      ...initialResult,
      skippedBySchedule: true,
    };
  }

  const automationByCustomerId = await loadEnabledAutomationSettings();
  if (automationByCustomerId.size === 0) {
    console.info(
      "fakturowniaEstimateInvoices: no customers with automation enabled, exiting",
    );
    return initialResult;
  }

  const client = await getFakturowniaClient();
  let departments: Department[] = [];
  try {
    const fetchedDepartments = await client.departmentsJson.get();
    departments = Array.isArray(fetchedDepartments) ? fetchedDepartments : [];
  } catch (error) {
    console.error("fakturowniaEstimateInvoices: failed to load departments", {
      error: formatFakturowniaError(error),
    });
  }

  const channelCache = new Map<string, ChannelDoc | null>();
  const warehouseCache = new Map<string, WarehouseDoc | null>();
  const departmentByChannelId = new Map<string, string | undefined>();
  const channelNameById = new Map<string, string | undefined>();
  const placeByChannelId = new Map<string, string | undefined>();
  const ordersSnapshot = await getAdminDb()
    .collectionGroup("orders")
    .where("active", "==", true)
    .where("status", "in", [OrderStatus.FULFILLED, OrderStatus.READY])
    .where("paymentDocumentId", "==", "")
    .get();

  if (ordersSnapshot.empty) {
    console.info("fakturowniaEstimateInvoices: no eligible orders found");
    return initialResult;
  }

  const result = { ...initialResult };

  for (const doc of ordersSnapshot.docs) {
    const order = doc.data() as Order;
    if (order.isTest) {
      continue;
    }

    const customerId = resolveCustomerId(order);
    if (!customerId) {
      result.skippedMissingCustomer += 1;
      console.warn("Skipping order without resolvable customerId", {
        orderId: doc.id,
        orderNumber: order.number,
      });
      continue;
    }

    const automation = automationByCustomerId.get(customerId);
    if (!automation) {
      result.skippedNoAutomation += 1;
      continue;
    }

    try {
      const orderWithId: Order = { ...order, id: doc.id };
      const documentPath = doc.ref.path;
      let departmentId: string | undefined;
      let place: string | undefined;
      let oid: string | undefined;
      const channelId = resolveOrderChannelId(orderWithId, documentPath);

      if (channelId) {
        if (!departmentByChannelId.has(channelId)) {
          const { channel, warehouse } = await getChannelAndMainWarehouse(
            channelId,
            channelCache,
            warehouseCache,
          );
          const warehouseParts: string[] = [];
          if (warehouse?.name) {
            warehouseParts.push(warehouse.name);
          }
          if (warehouse?.address?.city) {
            warehouseParts.push(warehouse.address.city);
          }

          const warehouseText = warehouseParts.join(" ");
          let matchedDepartmentId: string | undefined;
          if (warehouseText && departments.length > 0) {
            const matchedDepartment = findMatchingDepartment(
              warehouseText,
              departments,
            );
            if (
              matchedDepartment?.id !== undefined &&
              matchedDepartment.id !== null
            ) {
              matchedDepartmentId = String(matchedDepartment.id);
            }
          }

          departmentByChannelId.set(channelId, matchedDepartmentId);
          channelNameById.set(channelId, channel?.name ?? undefined);
          placeByChannelId.set(
            channelId,
            warehouse?.address?.city ?? undefined,
          );
        }

        departmentId = departmentByChannelId.get(channelId);
        place = placeByChannelId.get(channelId);
        oid = buildOid(orderWithId, channelNameById.get(channelId) ?? null);
      } else {
        oid = buildOid(orderWithId, null);
      }

      const invoiceNumber = await createEstimateInvoiceForOrder(
        client,
        orderWithId,
        automation.fakturowniaClientId,
        { departmentId, place, oid },
      );
      if (!invoiceNumber) {
        result.skippedMissingInvoiceNumber += 1;
        continue;
      }

      await doc.ref.update({
        paymentDocumentId: invoiceNumber,
        paymentStatus: PaymentStatus.COMPLETED,
      });
      result.processedCount += 1;
    } catch (error) {
      result.errorCount += 1;
      console.error("Failed to process order for estimate invoice", {
        orderId: doc.id,
        orderNumber: order.number,
        error,
      });
    }
  }

  console.info("fakturowniaEstimateInvoices: run completed", result);
  return result;
}
