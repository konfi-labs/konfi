export const productionCooperationParticipantTypes = [
  "SAAS_TENANT",
  "DEDICATED_INSTANCE",
] as const;

export type ProductionCooperationParticipantType =
  (typeof productionCooperationParticipantTypes)[number];

export const productionCooperationParticipantStatuses = [
  "PENDING",
  "ACTIVE",
  "DISABLED",
] as const;

export type ProductionCooperationParticipantStatus =
  (typeof productionCooperationParticipantStatuses)[number];

export const productionCooperationRequestTransports = [
  "SAME_DATABASE",
  "DEDICATED_EMAIL",
  "DEDICATED_APP_API",
] as const;

export type ProductionCooperationRequestTransport =
  (typeof productionCooperationRequestTransports)[number];

export interface ProductionCooperationProductSharingAccess {
  enabled: boolean;
  productIds: string[];
}

export interface ProductionCooperationAttributeOptionPayload {
  color?: string;
  customFormat?: boolean;
  formatHeight?: number | null;
  formatWidth?: number | null;
  label?: string;
  pages?: number | null;
  value: string;
}

export interface ProductionCooperationProductAttributePayload {
  id: string;
  name?: string;
  options?: ProductionCooperationAttributeOptionPayload[];
  required?: boolean;
  type?: string;
}

export interface ProductionCooperationProductSnapshotPayload {
  attributeIds?: string[];
  attributes?: ProductionCooperationProductAttributePayload[];
  channelId?: string;
  id?: string;
  name?: string;
  requiredAttributeIds?: string[];
}

export interface ProductionCooperationSelectedAttributePayload {
  attributeId: string;
  attributeName?: string;
  optionLabel?: string;
  optionValue: string;
  required?: boolean;
}

export interface ProductionCooperationCustomSizePayload {
  height: number;
  quantity?: number;
  width: number;
}

export interface ProductionCooperationPreviewPayload {
  height?: number;
  pages?: number;
  width?: number;
}

export interface ProductionCooperationAdvancedGrommetsPayload {
  offsetEnd?: number;
  offsetStart?: number;
  sides: string[];
  spacing: number;
}

export interface ProductionCooperationAdvancedAttributeSelectionPayload {
  cutToSize?: boolean;
  grommets?: ProductionCooperationAdvancedGrommetsPayload;
  notes?: string;
  preset?: string;
  reinforcementSides?: string[];
  tunnelSides?: string[];
}

export interface ProductionCooperationOrderItemConfigurationPayload {
  advancedAttributeSelections?: Record<
    string,
    ProductionCooperationAdvancedAttributeSelectionPayload
  >;
  calculatedCombination?: string | null;
  combination?: string | null;
  customFormat?: boolean;
  customSizes?: ProductionCooperationCustomSizePayload[];
  pageCount?: number | null;
  preview?: ProductionCooperationPreviewPayload;
  selectedAttributes?: ProductionCooperationSelectedAttributePayload[];
  volume?: number;
}

export const productionCooperationRequestStatuses = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "FULFILLED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type ProductionCooperationRequestStatus =
  (typeof productionCooperationRequestStatuses)[number];

export const productionCooperationDeliveryStatuses = [
  "PENDING",
  "DELIVERED",
  "RETRYING",
  "DELIVERY_FAILED",
] as const;

export type ProductionCooperationDeliveryStatus =
  (typeof productionCooperationDeliveryStatuses)[number];

export const productionCooperationEmailNotificationStatuses = [
  "NOT_REQUESTED",
  "EMAIL_NOTIFICATION_SENT",
  "EMAIL_NOTIFICATION_FAILED",
] as const;

export type ProductionCooperationEmailNotificationStatus =
  (typeof productionCooperationEmailNotificationStatuses)[number];

export const productionCooperationCallbackSyncStatuses = [
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
] as const;

export type ProductionCooperationCallbackSyncStatus =
  (typeof productionCooperationCallbackSyncStatuses)[number];

export const productionCooperationAppApiPayloadVersion = "2026-05-18";

export const productionCooperationTokenActions = [
  "review",
  "accept",
  "decline",
] as const;

export type ProductionCooperationTokenAction =
  (typeof productionCooperationTokenActions)[number];

export interface ProductionCooperationParticipant {
  allowedWarehouseIds?: string[];
  appApiEnabled?: boolean;
  contactEmail?: string;
  createdAt?: unknown;
  createdByUid?: string;
  disabledAt?: unknown;
  disabledByUid?: string;
  hostUrl?: string;
  id: string;
  lastEmailSentAt?: unknown;
  notes?: string;
  productSharing?: ProductionCooperationProductSharingAccess;
  status: ProductionCooperationParticipantStatus;
  tenantId?: string;
  type: ProductionCooperationParticipantType;
  updatedAt?: unknown;
  updatedByUid?: string;
}

export interface ProductionCooperationOrderSnapshot {
  channelId: string;
  customerEmail?: string;
  customerName?: string;
  id: string;
  number: string;
  sourceTenantId?: string;
  specialNotes?: string;
}

export interface ProductionCooperationOrderItemPayload {
  configuration?: ProductionCooperationOrderItemConfigurationPayload;
  description?: string;
  height?: number;
  id: string;
  name: string;
  product?: ProductionCooperationProductSnapshotPayload;
  productId?: string;
  productName?: string;
  quantity: number;
  unit?: string;
  width?: number;
}

export interface ProductionCooperationRequestPayload {
  item: ProductionCooperationOrderItemPayload;
  order: ProductionCooperationOrderSnapshot;
  sourceParticipantId: string;
  sourceTenantId?: string;
  targetParticipantId: string;
  targetTenantId?: string;
}

export interface ProductionCooperationRequestRecord {
  acceptedAt?: unknown;
  acceptedBy?: string;
  callbackError?: string;
  callbackLastAttemptAt?: unknown;
  callbackStatus?: ProductionCooperationCallbackSyncStatus;
  callbackUrl?: string;
  createdAt?: unknown;
  declinedAt?: unknown;
  declinedBy?: string;
  declineReason?: string;
  emailError?: string;
  emailMessageId?: string;
  emailSentAt?: unknown;
  expiresAt?: unknown;
  id: string;
  idempotencyKey?: string;
  issuedAt?: unknown;
  payload: ProductionCooperationRequestPayload;
  payloadVersion?: string;
  receiverRequestUrl?: string;
  sourceParticipantId: string;
  sourceTenantId?: string;
  status: ProductionCooperationRequestStatus;
  targetParticipantId: string;
  targetTenantId?: string;
  targetWarehouseId?: string;
  transport: ProductionCooperationRequestTransport;
  updatedAt?: unknown;
}

export interface ProductionCooperationTokenPayload {
  action: ProductionCooperationTokenAction;
  audience: "konfi-production-cooperation";
  expiresAt: string;
  issuedAt: string;
  jti: string;
  request?: ProductionCooperationRequestPayload;
  requestId: string;
  targetParticipantId: string;
}

export interface ProductionCooperationAppApiRequestEnvelope {
  callbackUrl?: string;
  expiresAt?: string;
  idempotencyKey: string;
  issuedAt: string;
  payload: ProductionCooperationRequestPayload;
  payloadVersion: typeof productionCooperationAppApiPayloadVersion;
  receiverRequestUrl?: string;
  requestId: string;
  sourceParticipantId: string;
  sourceTenantId?: string;
  targetParticipantId: string;
  targetTenantId?: string;
  targetWarehouseId?: string;
  transport: Extract<
    ProductionCooperationRequestTransport,
    "DEDICATED_APP_API"
  >;
}

export interface ProductionCooperationStatusCallbackEnvelope {
  actor?: {
    id?: string;
    name?: string;
  };
  declineReason?: string;
  idempotencyKey: string;
  occurredAt: string;
  receiverRequestUrl?: string;
  requestId: string;
  sourceParticipantId: string;
  status: Extract<
    ProductionCooperationRequestStatus,
    "ACCEPTED" | "DECLINED" | "FULFILLED" | "CANCELLED" | "EXPIRED"
  >;
  targetParticipantId: string;
  targetTenantId?: string;
}

export const productionCooperationRequestId = ({
  itemId,
  orderId,
  targetParticipantId,
}: {
  itemId: string;
  orderId: string;
  targetParticipantId: string;
}): string => `${orderId}_${itemId}_${targetParticipantId}`;

export const isProductionCooperationRequestStatus = (
  value: string,
): value is ProductionCooperationRequestStatus =>
  productionCooperationRequestStatuses.includes(
    value as ProductionCooperationRequestStatus,
  );

export const isProductionCooperationRequestTransport = (
  value: string,
): value is ProductionCooperationRequestTransport =>
  productionCooperationRequestTransports.includes(
    value as ProductionCooperationRequestTransport,
  );

export const isProductionCooperationDeliveryStatus = (
  value: string,
): value is ProductionCooperationDeliveryStatus =>
  productionCooperationDeliveryStatuses.includes(
    value as ProductionCooperationDeliveryStatus,
  );

export const isProductionCooperationEmailNotificationStatus = (
  value: string,
): value is ProductionCooperationEmailNotificationStatus =>
  productionCooperationEmailNotificationStatuses.includes(
    value as ProductionCooperationEmailNotificationStatus,
  );

export const isProductionCooperationCallbackSyncStatus = (
  value: string,
): value is ProductionCooperationCallbackSyncStatus =>
  productionCooperationCallbackSyncStatuses.includes(
    value as ProductionCooperationCallbackSyncStatus,
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasNonEmptyString = (
  record: Record<string, unknown>,
  key: string,
): boolean => typeof record[key] === "string" && Boolean(record[key]);

export const isProductionCooperationRequestPayload = (
  value: unknown,
): value is ProductionCooperationRequestPayload => {
  if (!isRecord(value)) {
    return false;
  }

  const item = value.item;
  const order = value.order;

  return (
    isRecord(item) &&
    isRecord(order) &&
    hasNonEmptyString(item, "id") &&
    hasNonEmptyString(item, "name") &&
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    hasNonEmptyString(order, "channelId") &&
    hasNonEmptyString(order, "id") &&
    hasNonEmptyString(order, "number") &&
    hasNonEmptyString(value, "sourceParticipantId") &&
    hasNonEmptyString(value, "targetParticipantId")
  );
};

export const isProductionCooperationAppApiRequestEnvelope = (
  value: unknown,
): value is ProductionCooperationAppApiRequestEnvelope => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.transport === "DEDICATED_APP_API" &&
    value.payloadVersion === productionCooperationAppApiPayloadVersion &&
    hasNonEmptyString(value, "requestId") &&
    hasNonEmptyString(value, "sourceParticipantId") &&
    hasNonEmptyString(value, "targetParticipantId") &&
    hasNonEmptyString(value, "idempotencyKey") &&
    hasNonEmptyString(value, "issuedAt") &&
    isProductionCooperationRequestPayload(value.payload)
  );
};

export const isProductionCooperationStatusCallbackEnvelope = (
  value: unknown,
): value is ProductionCooperationStatusCallbackEnvelope => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasNonEmptyString(value, "requestId") &&
    hasNonEmptyString(value, "sourceParticipantId") &&
    hasNonEmptyString(value, "targetParticipantId") &&
    hasNonEmptyString(value, "idempotencyKey") &&
    hasNonEmptyString(value, "occurredAt") &&
    typeof value.status === "string" &&
    isProductionCooperationRequestStatus(value.status) &&
    value.status !== "PENDING"
  );
};
