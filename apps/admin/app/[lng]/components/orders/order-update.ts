import { firestore } from "@/lib/firebase/clientApp";
import { db, update } from "@konfi/firebase";
import {
  isNestedCustomer,
  NestedMember,
  Order,
  type OrderChangeOperation,
  OrderChangeOperationType,
  type OrderChangeRequest,
  OrderChangeRequestSource,
  OrderChangeRequestStatus,
  type OrderChangeValue,
  OrderItem,
  type OrderRevision,
  OrderUpdate,
  PaymentStatus,
  type OrderFileStatusId,
  type OrderWorkflowStatusId,
  type PaymentMethodId,
  type PrintingMethodId,
  Settings,
  type ShippingMethodId,
  ShippingOptions,
  TenantContext,
} from "@konfi/types";
import {
  formatMailLink,
  generateKeywords,
  getSubtotalPrice,
  getTotalPrice,
  createOrderChangeIdempotencyKey,
  isShippingFree,
  isNoopOrderChangeOperation,
  normalizeAnonymousPackageLabelAddress,
  normalizeInvoiceRecipientAddress,
  normalizeOrderChangeOperations,
  summarizeOrderChangeRequest,
} from "@konfi/utils";
import { isNull } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import {
  collection as firestoreCollection,
  doc as firestoreDoc,
  getDoc,
  setDoc,
  Timestamp,
  UpdateData,
} from "firebase/firestore";

export function parseOrderDeadlineString(value: string | undefined) {
  if (!value) {
    return new Date();
  }

  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return new Date(value);
  }

  if (!timePart) {
    return new Date(year, month - 1, day);
  }

  const [hours = "0", minutes = "0"] = timePart.split(":");

  return new Date(year, month - 1, day, Number(hours), Number(minutes));
}

function sanitizeOrderItemsForPersistence(
  items: OrderItem[],
): OrderUpdate["items"] {
  return items.map((item) => {
    const id = item.product?.id;
    const name = item.product?.name;

    if (!id || !name) {
      throw new Error(
        `Order item "${item.id}" is missing required product identity (id: "${id ?? ""}", name: "${name ?? ""}"). Correct the order before resubmitting.`,
      );
    }

    return {
      ...item,
      product: {
        id,
        name,
        channelId: item.product?.channelId ?? "",
        spec: {
          images: item.product?.spec?.images ?? [],
        },
      },
    };
  });
}

function resolveShippingOption(
  shippingOption: ShippingMethodId | null | undefined,
): ShippingMethodId {
  return shippingOption ?? ShippingOptions.PERSONAL_COLLECTION;
}

function calculateAdminOrderPricing(
  items: OrderItem[],
  shippingOption: ShippingMethodId | null | undefined,
  storeSettings: Settings | null,
) {
  if (isNull(storeSettings)) {
    throw new Error("storeSettings is undefined");
  }

  const resolvedShippingOption = resolveShippingOption(shippingOption);
  const shippingPrice = isShippingFree(
    getSubtotalPrice(items),
    storeSettings.freeShipping.enabled,
    storeSettings.freeShipping.min,
  )
    ? 0
    : (storeSettings.shippingOptionsPrices[
        resolvedShippingOption as ShippingOptions
      ] ?? 0);

  return {
    resolvedShippingOption,
    shippingPrice,
    totalPrice: getTotalPrice(items, shippingPrice),
  };
}

export interface AdminOrderUpdateSource {
  customer: Order["customer"];
  contact: Order["contact"];
  email: string;
  anonymousPackageShipping?: boolean;
  anonymousPackageLabelAddress?: Order["anonymousPackageLabelAddress"];
  invoice: boolean;
  items: OrderItem[];
  shippingOption: ShippingMethodId;
  shipping: Order["shipping"];
  designatedPickupAreaId?: string;
  billing: Order["billing"];
  exactTime: boolean;
  deadlineString: string;
  specialNotes: string;
  invoiceNotes: string;
  status: OrderWorkflowStatusId;
  paymentType: PaymentMethodId;
  paymentStatus: PaymentStatus;
  filesStatus: OrderFileStatusId;
  difficulty: number;
  priority: number;
  updatedBy: NestedMember;
  isTest: boolean;
  appliedPromotionCodes: string[];
  paymentDocumentId: string;
  printingMethods: PrintingMethodId[];
  carriedOutBy: string[];
  mailLink?: string;
  sendStatusChangeEmail?: boolean;
  active?: boolean;
}

export interface AdminOrderItemsUpdateSource {
  items: OrderItem[];
  printingMethods?: PrintingMethodId[];
  shippingOption: ShippingMethodId | null | undefined;
  updatedBy: NestedMember;
}

export interface AdminOrderItemsUpdatePatchResult {
  optimistic: Pick<
    Order,
    | "items"
    | "printingMethods"
    | "shippingPrice"
    | "totalPrice"
    | "updatedBy"
    | "updatedAt"
  >;
  firestore: UpdateData<Order>;
}

export function createAdminOrderUpdatePayload(
  source: AdminOrderUpdateSource,
  storeSettings: Settings | null,
): OrderUpdate {
  const { resolvedShippingOption, shippingPrice, totalPrice } =
    calculateAdminOrderPricing(
      source.items,
      source.shippingOption,
      storeSettings,
    );

  const order: OrderUpdate = {
    contact: source.contact,
    email: source.email,
    customer: source.customer,
    anonymousPackageShipping: source.anonymousPackageShipping ?? false,
    anonymousPackageLabelAddress: source.anonymousPackageShipping
      ? normalizeAnonymousPackageLabelAddress(
          source.anonymousPackageLabelAddress,
        )
      : null,
    shippingOption: resolvedShippingOption,
    shippingPrice,
    shipping: source.shipping,
    invoice: source.invoice,
    billing: source.billing
      ? normalizeInvoiceRecipientAddress(source.billing)
      : source.billing,
    exactTime: source.exactTime,
    deadlineString: source.deadlineString,
    deadline: Timestamp.fromDate(
      parseOrderDeadlineString(source.deadlineString),
    ),
    totalPrice,
    specialNotes: source.specialNotes,
    invoiceNotes: source.invoiceNotes ?? "",
    items: sanitizeOrderItemsForPersistence(source.items),
    difficulty: source.difficulty,
    priority: source.priority,
    status: source.status,
    paymentType: source.paymentType,
    paymentStatus: source.paymentStatus,
    filesStatus: source.filesStatus,
    paymentDocumentId: source.paymentDocumentId,
    messages: [],
    updatedBy: source.updatedBy,
    updatedAt: Timestamp.now(),
    keywords: generateKeywords(
      typeof source.customer === "object"
        ? source.customer.name
        : source.customer,
    ),
    isTest: source.isTest,
    appliedPromotionCodes: source.appliedPromotionCodes,
    printingMethods: source.printingMethods,
    carriedOutBy: source.carriedOutBy,
    designatedPickupAreaId: source.designatedPickupAreaId ?? "",
    mailLink: formatMailLink(source.mailLink ?? ""),
    sendStatusChangeEmail: source.sendStatusChangeEmail ?? false,
    active: source.active ?? true,
  };

  if (
    isNestedCustomer(source.customer) &&
    source.customer.b2b &&
    !isEmpty(source.customer.linkedProductsIds)
  ) {
    order.customer = {
      ...source.customer,
      b2b: source.customer.b2b,
      linkedProductsIds: source.customer.linkedProductsIds,
    };
  }

  return order;
}

export function createAdminOrderItemsUpdatePatch(
  source: AdminOrderItemsUpdateSource,
  storeSettings: Settings | null,
): AdminOrderItemsUpdatePatchResult {
  const { shippingPrice, totalPrice } = calculateAdminOrderPricing(
    source.items,
    source.shippingOption,
    storeSettings,
  );

  const updatedAt = Timestamp.now();
  const printingMethods = source.printingMethods ?? [];
  const updatedBy = source.updatedBy;
  const sanitizedItems = sanitizeOrderItemsForPersistence(source.items);

  return {
    optimistic: {
      items: source.items,
      printingMethods,
      shippingPrice,
      totalPrice,
      updatedBy,
      updatedAt,
    },
    firestore: {
      items: sanitizedItems,
      printingMethods,
      shippingPrice,
      totalPrice,
      updatedBy,
      updatedAt,
    } as unknown as UpdateData<Order>,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function toOrderChangeValue(value: unknown): OrderChangeValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toOrderChangeValue(entry));
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : String(date);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        toOrderChangeValue(entry),
      ]),
    );
  }

  return String(value);
}

function getUpdateActor(
  payload: OrderUpdate | UpdateData<Order>,
  previousOrder?: Order,
): NestedMember {
  const candidate =
    "updatedBy" in payload ? payload.updatedBy : previousOrder?.updatedBy;

  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "id" in candidate &&
    "name" in candidate &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string"
  ) {
    return {
      id: candidate.id,
      name: candidate.name,
    };
  }

  return {
    id: "system",
    name: "System",
  };
}

function createOrderChangeOperations(
  payload: OrderUpdate | UpdateData<Order>,
  previousOrder?: Order,
): OrderChangeOperation[] {
  const previousRecord = (previousOrder ?? {}) as Record<string, unknown>;
  const operations = Object.entries(payload as Record<string, unknown>).map(
    ([key, value]) => {
      const beforeValue = previousRecord[key];
      const operation: OrderChangeOperation = {
        ...(value !== undefined ? { after: toOrderChangeValue(value) } : {}),
        ...(beforeValue !== undefined
          ? { before: toOrderChangeValue(beforeValue) }
          : {}),
        operationType:
          beforeValue === undefined
            ? OrderChangeOperationType.ADD
            : OrderChangeOperationType.SET,
        path: [key],
      };

      return operation;
    },
  );

  return normalizeOrderChangeOperations(
    operations.filter((operation) => !isNoopOrderChangeOperation(operation)),
  );
}

async function persistAdminOrderChangeAudit({
  channelId,
  orderId,
  payload,
  previousOrder,
  tenantContext,
}: {
  channelId: string;
  orderId: string;
  payload: OrderUpdate | UpdateData<Order>;
  previousOrder?: Order;
  tenantContext?: TenantContext;
}) {
  const operations = createOrderChangeOperations(payload, previousOrder);

  if (operations.length === 0) {
    return;
  }

  const now = Timestamp.now();
  const actor = getUpdateActor(payload, previousOrder);
  const summary = summarizeOrderChangeRequest(operations);
  const idempotencyKey = createOrderChangeIdempotencyKey({
    operations,
    orderId,
    source: OrderChangeRequestSource.ADMIN,
  });
  const orderPath = `channels/${channelId}/orders/${orderId}`;
  const tenantFields = tenantContext?.tenantId
    ? { tenantId: tenantContext.tenantId }
    : {};
  const changeRequestRef = firestoreDoc(
    firestoreCollection(firestore, `${orderPath}/orderChangeRequests`),
  );
  const revisionRef = firestoreDoc(
    firestoreCollection(firestore, `${orderPath}/orderRevisions`),
  );
  const baseFields = {
    active: true,
    createdAt: now,
    createdBy: actor,
    name: `Order ${orderId} admin update`,
    updatedAt: now,
    updatedBy: actor,
    ...tenantFields,
  };
  const changeRequest: OrderChangeRequest = {
    ...baseFields,
    appliedAt: now,
    appliedBy: actor,
    baseOrderUpdatedAt: previousOrder?.updatedAt,
    channelId,
    id: changeRequestRef.id,
    idempotencyKey,
    impactAreas: summary.impactAreas,
    operations,
    orderId,
    orderNumber: previousOrder?.number,
    requestedBy: actor,
    source: OrderChangeRequestSource.ADMIN,
    status: OrderChangeRequestStatus.APPLIED,
  };
  const revision: OrderRevision = {
    ...baseFields,
    appliedChangeRequestId: changeRequestRef.id,
    channelId,
    id: revisionRef.id,
    orderId,
    orderNumber: previousOrder?.number,
    revisionNumber: now.toMillis(),
    snapshot: toOrderChangeValue(previousOrder ?? payload),
  };

  await Promise.all([
    setDoc(changeRequestRef, changeRequest),
    setDoc(revisionRef, revision),
  ]);
}

export async function persistAdminOrderUpdate(
  channelId: string,
  orderId: string,
  payload: OrderUpdate | UpdateData<Order>,
  tenantContext?: TenantContext,
) {
  const orderRef = db.doc(firestore, `/channels/${channelId}/orders`, orderId);
  const previousSnapshot = await getDoc(orderRef);
  const previousOrder = previousSnapshot.exists()
    ? (previousSnapshot.data() as Order)
    : undefined;
  await update(payload, orderRef, tenantContext);

  try {
    await persistAdminOrderChangeAudit({
      channelId,
      orderId,
      payload,
      previousOrder,
      tenantContext,
    });
  } catch (error) {
    console.error("Failed to persist admin order change audit", error);
  }
}
