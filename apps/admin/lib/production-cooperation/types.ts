import type {
  ProductionCooperationOrderItemPayload,
  ProductionCooperationOrderSnapshot,
  ProductionCooperationParticipant,
  ProductionCooperationRequestPayload,
  ProductionCooperationRequestRecord,
  ProductionCooperationRequestStatus,
  ProductionCooperationTokenAction,
  ProductionCooperationTokenPayload,
} from "@sblyvwx/cloud-contracts";

export const productionCooperationActionResultCodes = [
  "accepted",
  "declined",
  "disabled",
  "expired",
  "not_found",
  "replayed",
  "tampered",
  "unauthorized",
  "unavailable",
] as const;

export type ProductionCooperationActionResultCode =
  (typeof productionCooperationActionResultCodes)[number];

export class ProductionCooperationError extends Error {
  code: ProductionCooperationActionResultCode;
  statusCode: number;

  constructor(
    code: ProductionCooperationActionResultCode,
    message: string,
    statusCode = 400,
  ) {
    super(message);
    this.name = "ProductionCooperationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ProductionCooperationRequestView {
  id: string;
  status: ProductionCooperationRequestStatus;
  sourceParticipantId: string;
  sourceTenantId?: string;
  targetParticipantId: string;
  targetTenantId?: string;
  transport: ProductionCooperationRequestRecord["transport"];
  order: ProductionCooperationOrderSnapshot;
  item: ProductionCooperationOrderItemPayload;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
  declineReason?: string;
  callbackError?: string;
  callbackStatus?: ProductionCooperationRequestRecord["callbackStatus"];
  callbackLastAttemptAt?: string;
  history?: ProductionCooperationHistoryEventView[];
  targetWarehouseId?: string;
}

export interface ProductionCooperationParticipantView {
  id: string;
  contactEmail?: string;
  hostUrl?: string;
  notes?: string;
  status: string;
  tenantId?: string;
  type: string;
}

export interface ProductionCooperationReviewReady {
  kind: "ready";
  request: ProductionCooperationRequestView;
  participant: ProductionCooperationParticipantView;
  token?: ProductionCooperationTokenPayload;
}

export interface ProductionCooperationReviewUnavailable {
  kind: "unavailable";
  code: ProductionCooperationActionResultCode;
  message: string;
}

export type ProductionCooperationReviewState =
  | ProductionCooperationReviewReady
  | ProductionCooperationReviewUnavailable;

export interface ProductionCooperationActionResult {
  code: ProductionCooperationActionResultCode;
  message: string;
  callbackStatus?: ProductionCooperationRequestRecord["callbackStatus"];
  requestId?: string;
  status?: ProductionCooperationRequestStatus;
}

export interface ProductionCooperationInboxResult {
  requests: ProductionCooperationRequestView[];
}

export type ProductionCooperationActionRequest = {
  declineReason?: string;
  requestId?: string;
  token?: string;
};

export type StoredProductionCooperationRequest =
  ProductionCooperationRequestRecord & {
    payload: ProductionCooperationRequestPayload;
  };

export type ProductionCooperationTokenValidation = {
  action: ProductionCooperationTokenAction;
  payload: ProductionCooperationTokenPayload;
};

export type ProductionCooperationHistoryEventType =
  | "APP_API_RECEIVED"
  | "APP_API_DUPLICATE"
  | "LEGACY_EMAIL_ACTION"
  | "REQUEST_ACCEPTED"
  | "REQUEST_DECLINED"
  | "CALLBACK_SENT"
  | "CALLBACK_FAILED"
  | "CALLBACK_SKIPPED"
  | "REQUEST_EXPIRED";

export interface ProductionCooperationHistoryEvent {
  actor?: {
    id?: string;
    name?: string;
  };
  createdAt?: unknown;
  id?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  requestId: string;
  type: ProductionCooperationHistoryEventType;
}

export interface ProductionCooperationHistoryEventView {
  actor?: ProductionCooperationHistoryEvent["actor"];
  createdAt?: string;
  id: string;
  message?: string;
  metadata?: Record<string, unknown>;
  type: ProductionCooperationHistoryEventType;
}

export interface ProductionCooperationAppApiReceiveResult {
  created: boolean;
  historyEventId?: string;
  notificationId?: string;
  request: ProductionCooperationRequestView;
}

export type StoredProductionCooperationParticipant =
  ProductionCooperationParticipant;
