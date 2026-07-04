import "server-only";

import {
  getAuthenticatedAdminMember,
  requireAdminAuth,
} from "@/actions/auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { publishCreatedAppNotification } from "@/lib/notifications/app-notifications";
import type {
  ProductionCooperationAppApiRequestEnvelope,
  ProductionCooperationParticipant,
  ProductionCooperationRequestRecord,
  ProductionCooperationRequestStatus,
  ProductionCooperationStatusCallbackEnvelope,
  ProductionCooperationTokenAction,
  ProductionCooperationTokenPayload,
} from "@sblyvwx/cloud-contracts";
import {
  isProductionCooperationAppApiRequestEnvelope,
  productionCooperationAppApiPayloadVersion,
} from "@sblyvwx/cloud-contracts";
import { NotificationType, type Notification } from "@konfi/types";
import { lookup } from "dns/promises";
import { Timestamp } from "firebase-admin/firestore";
import { isIP } from "net";
import { validateProductionCooperationToken } from "./tokens";
import {
  ProductionCooperationError,
  type ProductionCooperationActionRequest,
  type ProductionCooperationActionResult,
  type ProductionCooperationActionResultCode,
  type ProductionCooperationAppApiReceiveResult,
  type ProductionCooperationHistoryEvent,
  type ProductionCooperationHistoryEventView,
  type ProductionCooperationInboxResult,
  type ProductionCooperationParticipantView,
  type ProductionCooperationRequestView,
  type ProductionCooperationReviewState,
  type StoredProductionCooperationRequest,
} from "./types";

const requestsCollection = "productionCooperationRequests";
const participantsCollection = "productionCooperationParticipants";
const tokenUsagesCollection = "productionCooperationTokenUsages";
const historyCollection = "history";
const notificationsCollection = "notifications";
const appApiStaleWindowMs = 1000 * 60 * 10;
const callbackAllowedOriginsEnv =
  "PRODUCTION_COOPERATION_CALLBACK_ALLOWED_ORIGINS";

const terminalRequestStatuses = new Set<ProductionCooperationRequestStatus>([
  "ACCEPTED",
  "DECLINED",
  "FULFILLED",
  "CANCELLED",
  "EXPIRED",
]);

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object" && "toDate" in value) {
    const toDateValue = value.toDate;
    if (typeof toDateValue === "function") {
      const date = toDateValue.call(value) as unknown;
      return date instanceof Date ? date : null;
    }
  }

  return null;
}

function toIsoString(value: unknown): string | undefined {
  return toDate(value)?.toISOString();
}

function isExpired(value: unknown): boolean {
  const date = toDate(value);
  return date ? date.getTime() <= Date.now() : false;
}

function getRequestRef(requestId: string) {
  return getAdminDb().collection(requestsCollection).doc(requestId);
}

function getParticipantRef(participantId: string) {
  return getAdminDb().collection(participantsCollection).doc(participantId);
}

function getTokenUsageRef(jti: string) {
  return getAdminDb().collection(tokenUsagesCollection).doc(jti);
}

function getHistoryRef(requestId: string, eventId?: string) {
  const collectionRef = getRequestRef(requestId).collection(historyCollection);
  return eventId ? collectionRef.doc(eventId) : collectionRef.doc();
}

function getNotificationRef(requestId: string) {
  return getAdminDb()
    .collection(notificationsCollection)
    .doc(`production-cooperation-${requestId}`);
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeUrlOrigin(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return;
    }

    return parsed.origin;
  } catch {
    return;
  }
}

function getCallbackAllowedOrigins(): Set<string> {
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- direct cooperation callbacks must be pinned to deployment-controlled Cloud origins.
  const rawValue = process.env[callbackAllowedOriginsEnv]?.trim();
  if (!rawValue) {
    return new Set();
  }

  return new Set(
    rawValue
      .split(",")
      .map((entry) => normalizeUrlOrigin(entry.trim()))
      .filter((origin): origin is string => Boolean(origin)),
  );
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [first = 0, second = 0] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

function isPrivateNetworkAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

function isInternalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    !normalized.includes(".")
  );
}

async function assertCloudCallbackUrlAllowed(
  callbackUrl: string | undefined,
): Promise<void> {
  if (!callbackUrl) {
    return;
  }

  const parsed = new URL(callbackUrl);
  const allowedOrigins = getCallbackAllowedOrigins();

  if (!allowedOrigins.has(parsed.origin)) {
    throw new Error(
      "Production cooperation callback URL origin is not configured.",
    );
  }

  if (
    isInternalHostname(parsed.hostname) ||
    (isIP(parsed.hostname) !== 0 && isPrivateNetworkAddress(parsed.hostname))
  ) {
    throw new Error("Production cooperation callback URL host is not allowed.");
  }

  const addresses = await lookup(parsed.hostname, {
    all: true,
    verbatim: true,
  });
  if (
    addresses.length === 0 ||
    addresses.some((address) => isPrivateNetworkAddress(address.address))
  ) {
    throw new Error(
      "Production cooperation callback URL resolves to a private network.",
    );
  }
}

function directReviewUrl(requestId: string) {
  const searchParams = new URLSearchParams({ requestId });
  return `/cooperation/review?${searchParams.toString()}`;
}

function createHistoryEvent(
  event: Omit<ProductionCooperationHistoryEvent, "createdAt">,
): ProductionCooperationHistoryEvent {
  return {
    ...event,
    createdAt: Timestamp.now(),
  };
}

function asStoredRequest(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): StoredProductionCooperationRequest | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as
    | ProductionCooperationRequestRecord
    | undefined;
  return data ? { ...data, id: snapshot.id } : null;
}

function asHistoryEvent(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): ProductionCooperationHistoryEventView | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as ProductionCooperationHistoryEvent | undefined;
  return data
    ? {
        actor: data.actor,
        createdAt: toIsoString(data.createdAt),
        id: snapshot.id,
        message: data.message,
        metadata: data.metadata,
        type: data.type,
      }
    : null;
}

function asParticipant(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): ProductionCooperationParticipant | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as ProductionCooperationParticipant | undefined;
  return data ? { ...data, id: snapshot.id } : null;
}

function participantFromTokenPayload(
  tokenPayload: ProductionCooperationTokenPayload,
): ProductionCooperationParticipant {
  return {
    id: tokenPayload.targetParticipantId,
    status: "ACTIVE",
    type: "DEDICATED_INSTANCE",
  };
}

function requestFromTokenPayload(
  tokenPayload: ProductionCooperationTokenPayload,
): StoredProductionCooperationRequest | null {
  if (!tokenPayload.request) {
    return null;
  }

  return {
    id: tokenPayload.requestId,
    createdAt: tokenPayload.issuedAt,
    expiresAt: tokenPayload.expiresAt,
    payload: tokenPayload.request,
    sourceParticipantId: tokenPayload.request.sourceParticipantId,
    sourceTenantId: tokenPayload.request.sourceTenantId,
    status: "PENDING",
    targetParticipantId: tokenPayload.targetParticipantId,
    targetTenantId: tokenPayload.request.targetTenantId,
    transport: "DEDICATED_EMAIL",
    updatedAt: tokenPayload.issuedAt,
  };
}

function toParticipantView(
  participant: ProductionCooperationParticipant,
): ProductionCooperationParticipantView {
  return {
    id: participant.id,
    contactEmail: participant.contactEmail,
    hostUrl: participant.hostUrl,
    notes: participant.notes,
    status: participant.status,
    tenantId: participant.tenantId,
    type: participant.type,
  };
}

function toRequestView(
  request: StoredProductionCooperationRequest,
  history: ProductionCooperationHistoryEventView[] = [],
): ProductionCooperationRequestView {
  return {
    id: request.id,
    status: request.status,
    sourceParticipantId: request.sourceParticipantId,
    sourceTenantId: request.sourceTenantId,
    targetParticipantId: request.targetParticipantId,
    targetTenantId: request.targetTenantId,
    transport: request.transport,
    order: request.payload.order,
    item: request.payload.item,
    createdAt: toIsoString(request.createdAt),
    updatedAt: toIsoString(request.updatedAt),
    expiresAt: toIsoString(request.expiresAt),
    acceptedAt: toIsoString(request.acceptedAt),
    acceptedBy: request.acceptedBy,
    declinedAt: toIsoString(request.declinedAt),
    declinedBy: request.declinedBy,
    declineReason: request.declineReason,
    callbackError: request.callbackError,
    callbackLastAttemptAt: toIsoString(request.callbackLastAttemptAt),
    callbackStatus: request.callbackStatus,
    history,
    targetWarehouseId: request.targetWarehouseId,
  };
}

function expectedActionStatus(
  action: ProductionCooperationTokenAction,
): ProductionCooperationRequestStatus {
  return action === "decline" ? "DECLINED" : "ACCEPTED";
}

function callbackStatusHistoryType(
  status: NonNullable<ProductionCooperationRequestRecord["callbackStatus"]>,
): ProductionCooperationHistoryEvent["type"] {
  switch (status) {
    case "SENT":
      return "CALLBACK_SENT";
    case "FAILED":
      return "CALLBACK_FAILED";
    case "SKIPPED":
      return "CALLBACK_SKIPPED";
    case "PENDING":
      return "CALLBACK_SKIPPED";
  }
}

function getCloudCallbackSecret(): string | undefined {
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- direct cooperation status callback secret is configured per dedicated deployment.
  return process.env.PRODUCTION_COOPERATION_CLOUD_CALLBACK_SECRET?.trim();
}

function getAdminBaseUrl(): string | undefined {
  return (
    process.env.ADMIN_URL?.trim() || process.env.NEXT_PUBLIC_ADMIN_URL?.trim()
  );
}

function absoluteReceiverRequestUrl(requestId: string): string | undefined {
  const baseUrl = getAdminBaseUrl();

  if (!baseUrl) {
    return;
  }

  return new URL(directReviewUrl(requestId), baseUrl).toString();
}

function resultMessage(code: ProductionCooperationActionResultCode): string {
  switch (code) {
    case "accepted":
      return "Production cooperation request accepted.";
    case "declined":
      return "Production cooperation request declined.";
    case "disabled":
      return "Production cooperation participant is disabled.";
    case "expired":
      return "Production cooperation request has expired.";
    case "not_found":
      return "Production cooperation request was not found.";
    case "replayed":
      return "Production cooperation action was already used.";
    case "tampered":
      return "Production cooperation action link is invalid.";
    case "unauthorized":
      return "Production cooperation action is not authorized.";
    case "unavailable":
      return "Production cooperation is unavailable.";
  }
}

function isStatusCodeError(
  error: unknown,
): error is { message?: string; statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

function isParticipantActive(
  participant: ProductionCooperationParticipant | null,
): participant is ProductionCooperationParticipant {
  return participant?.status === "ACTIVE";
}

function productIdFromEnvelope(
  envelope: ProductionCooperationAppApiRequestEnvelope,
) {
  return (
    normalizeOptionalString(envelope.payload.item.productId) ??
    normalizeOptionalString(envelope.payload.item.product?.id)
  );
}

function assertEnvelopeMetadata(
  envelope: ProductionCooperationAppApiRequestEnvelope,
) {
  const issuedAt = parseDate(envelope.issuedAt);

  if (!issuedAt || Date.now() - issuedAt.getTime() > appApiStaleWindowMs) {
    throw new ProductionCooperationError(
      "expired",
      "Production cooperation app API request is stale.",
      400,
    );
  }

  if (envelope.payloadVersion !== productionCooperationAppApiPayloadVersion) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation app API payload version is not supported.",
      400,
    );
  }

  if (
    envelope.payload.sourceParticipantId !== envelope.sourceParticipantId ||
    envelope.payload.targetParticipantId !== envelope.targetParticipantId
  ) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation app API participant metadata does not match.",
      400,
    );
  }

  if (
    envelope.sourceTenantId &&
    envelope.payload.sourceTenantId &&
    envelope.sourceTenantId !== envelope.payload.sourceTenantId
  ) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation app API source tenant metadata does not match.",
      400,
    );
  }

  if (
    envelope.targetTenantId &&
    envelope.payload.targetTenantId &&
    envelope.targetTenantId !== envelope.payload.targetTenantId
  ) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation app API target tenant metadata does not match.",
      400,
    );
  }

  if (
    (envelope.callbackUrl && !isHttpUrl(envelope.callbackUrl)) ||
    (envelope.receiverRequestUrl && !isHttpUrl(envelope.receiverRequestUrl))
  ) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation app API callback URL is invalid.",
      400,
    );
  }
}

function assertParticipantAllowsEnvelope(
  participant: ProductionCooperationParticipant | null,
  envelope: ProductionCooperationAppApiRequestEnvelope,
) {
  if (!participant) {
    throw new ProductionCooperationError(
      "not_found",
      "Production cooperation target participant was not found.",
      404,
    );
  }

  if (!isParticipantActive(participant)) {
    throw new ProductionCooperationError(
      "disabled",
      resultMessage("disabled"),
      403,
    );
  }

  if (
    participant.type !== "DEDICATED_INSTANCE" ||
    participant.appApiEnabled === false
  ) {
    throw new ProductionCooperationError(
      "unauthorized",
      "Production cooperation participant is not enabled for direct app API transfer.",
      403,
    );
  }

  if (
    participant.tenantId &&
    envelope.targetTenantId &&
    participant.tenantId !== envelope.targetTenantId
  ) {
    throw new ProductionCooperationError(
      "unauthorized",
      "Production cooperation request target tenant does not match the participant.",
      403,
    );
  }

  const productId = productIdFromEnvelope(envelope);
  if (
    !productId ||
    participant.productSharing?.enabled !== true ||
    !participant.productSharing.productIds.includes(productId)
  ) {
    throw new ProductionCooperationError(
      "unauthorized",
      "Production cooperation participant does not allow this product.",
      403,
    );
  }

  if (
    !envelope.targetWarehouseId ||
    !participant.allowedWarehouseIds?.length ||
    !participant.allowedWarehouseIds.includes(envelope.targetWarehouseId)
  ) {
    throw new ProductionCooperationError(
      "unauthorized",
      "Production cooperation participant does not allow this warehouse.",
      403,
    );
  }
}

function notificationForRequest(
  request: StoredProductionCooperationRequest,
  notificationId: string,
) {
  const orderNumber = request.payload.order.number;
  const itemName = request.payload.item.name;

  return {
    id: notificationId,
    title: "Production cooperation request",
    options: {
      body: `New request for order ${orderNumber}: ${itemName}`,
      data: {
        requestId: request.id,
        type: NotificationType.PRODUCTION_COOPERATION_REQUEST,
      },
    },
    archived: false,
    channelId: request.payload.order.channelId,
    url: directReviewUrl(request.id),
    createdAt: Timestamp.now(),
  };
}

function buildUnavailableReview(
  error: ProductionCooperationError,
): ProductionCooperationReviewState {
  return {
    kind: "unavailable",
    code: error.code,
    message: error.message,
  };
}

async function loadRequestForToken(
  tokenPayload: ProductionCooperationTokenPayload,
): Promise<{
  participant: ProductionCooperationParticipant;
  request: StoredProductionCooperationRequest;
}> {
  const [requestSnapshot, participantSnapshot] = await Promise.all([
    getRequestRef(tokenPayload.requestId).get(),
    getParticipantRef(tokenPayload.targetParticipantId).get(),
  ]);
  const request = asStoredRequest(requestSnapshot);
  const participant =
    asParticipant(participantSnapshot) ??
    participantFromTokenPayload(tokenPayload);
  const resolvedRequest = request ?? requestFromTokenPayload(tokenPayload);

  if (!resolvedRequest) {
    throw new ProductionCooperationError(
      "not_found",
      resultMessage("not_found"),
      404,
    );
  }

  if (
    resolvedRequest.targetParticipantId !== tokenPayload.targetParticipantId
  ) {
    throw new ProductionCooperationError(
      "tampered",
      resultMessage("tampered"),
      400,
    );
  }

  if (!isParticipantActive(participant)) {
    throw new ProductionCooperationError(
      "disabled",
      resultMessage("disabled"),
      403,
    );
  }

  if (
    resolvedRequest.status === "PENDING" &&
    isExpired(resolvedRequest.expiresAt)
  ) {
    await getRequestRef(resolvedRequest.id).set(
      {
        status: "EXPIRED",
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    throw new ProductionCooperationError(
      "expired",
      resultMessage("expired"),
      410,
    );
  }

  if (terminalRequestStatuses.has(resolvedRequest.status)) {
    throw new ProductionCooperationError(
      "replayed",
      resultMessage("replayed"),
      409,
    );
  }

  return { participant, request: resolvedRequest };
}

async function loadRequestHistory(
  requestId: string,
): Promise<ProductionCooperationHistoryEventView[]> {
  const snapshot = await getRequestRef(requestId)
    .collection(historyCollection)
    .orderBy("createdAt", "asc")
    .limit(100)
    .get();

  return snapshot.docs
    .map((documentSnapshot) => asHistoryEvent(documentSnapshot))
    .filter((event): event is ProductionCooperationHistoryEventView =>
      Boolean(event),
    );
}

async function loadPersistedRequestForReview(requestId: string): Promise<{
  participant: ProductionCooperationParticipant;
  request: StoredProductionCooperationRequest;
}> {
  await requireAdminAuth();

  const requestSnapshot = await getRequestRef(requestId).get();
  const request = asStoredRequest(requestSnapshot);

  if (!request) {
    throw new ProductionCooperationError(
      "not_found",
      resultMessage("not_found"),
      404,
    );
  }

  const participantSnapshot = await getParticipantRef(
    request.targetParticipantId,
  ).get();
  const participant =
    asParticipant(participantSnapshot) ??
    ({
      id: request.targetParticipantId,
      status: "ACTIVE",
      type:
        request.transport === "DEDICATED_APP_API"
          ? "DEDICATED_INSTANCE"
          : "DEDICATED_INSTANCE",
    } satisfies ProductionCooperationParticipant);

  if (!isParticipantActive(participant)) {
    throw new ProductionCooperationError(
      "disabled",
      resultMessage("disabled"),
      403,
    );
  }

  if (request.status === "PENDING" && isExpired(request.expiresAt)) {
    await getRequestRef(request.id).set(
      {
        status: "EXPIRED",
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    await getHistoryRef(request.id, "expired").set(
      createHistoryEvent({
        requestId: request.id,
        type: "REQUEST_EXPIRED",
      }),
      { merge: true },
    );
    throw new ProductionCooperationError(
      "expired",
      resultMessage("expired"),
      410,
    );
  }

  return { participant, request };
}

export async function listProductionCooperationRequests(): Promise<ProductionCooperationInboxResult> {
  await requireAdminAuth();

  const snapshot = await getAdminDb()
    .collection(requestsCollection)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return {
    requests: snapshot.docs
      .map((documentSnapshot) => asStoredRequest(documentSnapshot))
      .filter((request): request is StoredProductionCooperationRequest =>
        Boolean(request),
      )
      .map((request) => toRequestView(request)),
  };
}

export async function getProductionCooperationReview(
  input: { requestId?: string; token?: string } | string,
): Promise<ProductionCooperationReviewState> {
  try {
    if (typeof input !== "string" && input.requestId) {
      const { participant, request } = await loadPersistedRequestForReview(
        input.requestId,
      );
      const history = await loadRequestHistory(request.id);

      return {
        kind: "ready",
        request: toRequestView(request, history),
        participant: toParticipantView(participant),
      };
    }

    const validation = await validateProductionCooperationToken(
      typeof input === "string" ? input : (input.token ?? ""),
      "review",
    );
    const { participant, request } = await loadRequestForToken(
      validation.payload,
    );
    const history =
      request.transport === "DEDICATED_APP_API"
        ? await loadRequestHistory(request.id)
        : [];

    return {
      kind: "ready",
      request: toRequestView(request, history),
      participant: toParticipantView(participant),
      token: validation.payload,
    };
  } catch (error) {
    if (error instanceof ProductionCooperationError) {
      return buildUnavailableReview(error);
    }

    console.error("Production cooperation review error", error);
    return buildUnavailableReview(
      new ProductionCooperationError(
        "unavailable",
        resultMessage("unavailable"),
        500,
      ),
    );
  }
}

export async function receiveProductionCooperationAppApiRequest(
  envelope: unknown,
): Promise<ProductionCooperationAppApiReceiveResult> {
  if (!isProductionCooperationAppApiRequestEnvelope(envelope)) {
    throw new ProductionCooperationError(
      "tampered",
      "Production cooperation app API request payload is invalid.",
      400,
    );
  }

  assertEnvelopeMetadata(envelope);
  try {
    await assertCloudCallbackUrlAllowed(envelope.callbackUrl);
  } catch (error) {
    throw new ProductionCooperationError(
      "tampered",
      error instanceof Error
        ? error.message
        : "Production cooperation app API callback URL is not allowed.",
      400,
    );
  }

  const db = getAdminDb();
  const requestRef = getRequestRef(envelope.requestId);
  const participantRef = getParticipantRef(envelope.targetParticipantId);
  const notificationRef = getNotificationRef(envelope.requestId);
  const historyRef = getHistoryRef(
    envelope.requestId,
    `received_${envelope.idempotencyKey}`,
  );
  const now = Timestamp.now();

  const result = await db.runTransaction(async (transaction) => {
    const [requestSnapshot, participantSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(participantRef),
    ]);
    const existingRequest = asStoredRequest(requestSnapshot);
    const participant = asParticipant(participantSnapshot);

    assertParticipantAllowsEnvelope(participant, envelope);

    if (existingRequest) {
      if (
        existingRequest.transport !== "DEDICATED_APP_API" ||
        existingRequest.idempotencyKey !== envelope.idempotencyKey
      ) {
        throw new ProductionCooperationError(
          "replayed",
          "Production cooperation request id already exists with different app API metadata.",
          409,
        );
      }

      transaction.set(
        getHistoryRef(
          envelope.requestId,
          `duplicate_${envelope.idempotencyKey}`,
        ),
        createHistoryEvent({
          metadata: {
            idempotencyKey: envelope.idempotencyKey,
            transport: envelope.transport,
          },
          requestId: existingRequest.id,
          type: "APP_API_DUPLICATE",
        }),
        { merge: true },
      );

      return {
        created: false,
        request: toRequestView(existingRequest),
      };
    }

    const expiresAt = parseDate(envelope.expiresAt);
    const requestRecord: StoredProductionCooperationRequest = {
      id: envelope.requestId,
      callbackStatus: envelope.callbackUrl ? "PENDING" : "SKIPPED",
      callbackUrl: envelope.callbackUrl,
      createdAt: now,
      expiresAt: expiresAt ?? undefined,
      idempotencyKey: envelope.idempotencyKey,
      issuedAt: envelope.issuedAt,
      payload: envelope.payload,
      payloadVersion: envelope.payloadVersion,
      receiverRequestUrl: envelope.receiverRequestUrl,
      sourceParticipantId: envelope.sourceParticipantId,
      sourceTenantId:
        envelope.sourceTenantId ?? envelope.payload.sourceTenantId,
      status: "PENDING",
      targetParticipantId: envelope.targetParticipantId,
      targetTenantId:
        envelope.targetTenantId ?? envelope.payload.targetTenantId,
      targetWarehouseId: envelope.targetWarehouseId,
      transport: "DEDICATED_APP_API",
      updatedAt: now,
    };
    const notification = notificationForRequest(
      requestRecord,
      notificationRef.id,
    );

    transaction.set(requestRef, withoutUndefined({ ...requestRecord }));
    transaction.set(
      historyRef,
      createHistoryEvent({
        metadata: {
          idempotencyKey: envelope.idempotencyKey,
          payloadVersion: envelope.payloadVersion,
          targetWarehouseId: envelope.targetWarehouseId,
          transport: envelope.transport,
        },
        requestId: envelope.requestId,
        type: "APP_API_RECEIVED",
      }),
    );
    transaction.set(notificationRef, notification);

    return {
      created: true,
      historyEventId: historyRef.id,
      notificationId: notificationRef.id,
      request: toRequestView(requestRecord, [
        {
          createdAt: toIsoString(now),
          id: historyRef.id,
          metadata: {
            idempotencyKey: envelope.idempotencyKey,
            payloadVersion: envelope.payloadVersion,
            targetWarehouseId: envelope.targetWarehouseId,
            transport: envelope.transport,
          },
          type: "APP_API_RECEIVED",
        },
      ]),
    };
  });

  if (result.created) {
    const notificationSnapshot = await notificationRef.get();
    const notification = notificationSnapshot.data() as
      | Notification
      | undefined;

    if (notification) {
      await publishCreatedAppNotification(notification);
    }
  }

  return result;
}

async function applyProductionCooperationAction(
  action: Exclude<ProductionCooperationTokenAction, "review">,
  validation: {
    payload: ProductionCooperationTokenPayload;
  },
  request: ProductionCooperationActionRequest,
): Promise<ProductionCooperationActionResult> {
  const db = getAdminDb();
  const requestRef = getRequestRef(validation.payload.requestId);
  const participantRef = getParticipantRef(
    validation.payload.targetParticipantId,
  );
  const tokenUsageRef = getTokenUsageRef(validation.payload.jti);
  const now = Timestamp.now();

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, participantSnapshot, tokenUsageSnapshot] =
      await Promise.all([
        transaction.get(requestRef),
        transaction.get(participantRef),
        transaction.get(tokenUsageRef),
      ]);
    const storedRequest = asStoredRequest(requestSnapshot);
    const participant =
      asParticipant(participantSnapshot) ??
      participantFromTokenPayload(validation.payload);
    const resolvedRequest =
      storedRequest ?? requestFromTokenPayload(validation.payload);

    if (tokenUsageSnapshot.exists) {
      return {
        code: "replayed",
        message: resultMessage("replayed"),
        requestId: validation.payload.requestId,
      };
    }

    if (!resolvedRequest) {
      return {
        code: "not_found",
        message: resultMessage("not_found"),
        requestId: validation.payload.requestId,
      };
    }

    if (
      resolvedRequest.targetParticipantId !==
      validation.payload.targetParticipantId
    ) {
      return {
        code: "tampered",
        message: resultMessage("tampered"),
        requestId: validation.payload.requestId,
      };
    }

    if (!isParticipantActive(participant)) {
      return {
        code: "disabled",
        message: resultMessage("disabled"),
        requestId: validation.payload.requestId,
        status: resolvedRequest.status,
      };
    }

    if (
      resolvedRequest.status === "PENDING" &&
      isExpired(resolvedRequest.expiresAt)
    ) {
      transaction.set(
        requestRef,
        {
          status: "EXPIRED",
          updatedAt: now,
        },
        { merge: true },
      );

      return {
        code: "expired",
        message: resultMessage("expired"),
        requestId: resolvedRequest.id,
        status: "EXPIRED",
      };
    }

    if (resolvedRequest.status !== "PENDING") {
      return {
        code: "replayed",
        message: resultMessage("replayed"),
        requestId: resolvedRequest.id,
        status: resolvedRequest.status,
      };
    }

    const status = expectedActionStatus(action);
    const mutation =
      action === "decline"
        ? {
            status,
            declinedAt: now,
            declinedBy: "production-cooperation-action-url",
            declineReason: request.declineReason?.trim() || undefined,
            updatedAt: now,
          }
        : {
            status,
            acceptedAt: now,
            acceptedBy: "production-cooperation-action-url",
            updatedAt: now,
          };

    transaction.set(tokenUsageRef, {
      action,
      createdAt: now,
      requestId: resolvedRequest.id,
      targetParticipantId: validation.payload.targetParticipantId,
    });
    if (requestSnapshot.exists) {
      transaction.update(requestRef, mutation);
    } else {
      transaction.set(requestRef, {
        ...resolvedRequest,
        ...mutation,
      });
    }
    transaction.set(
      getHistoryRef(resolvedRequest.id),
      createHistoryEvent({
        metadata: {
          action,
          tokenJti: validation.payload.jti,
        },
        requestId: resolvedRequest.id,
        type: "LEGACY_EMAIL_ACTION",
      }),
    );

    return {
      code: action === "decline" ? "declined" : "accepted",
      message: resultMessage(action === "decline" ? "declined" : "accepted"),
      requestId: resolvedRequest.id,
      status,
    };
  });
}

async function recordCallbackSync(params: {
  error?: string;
  requestId: string;
  status: NonNullable<ProductionCooperationRequestRecord["callbackStatus"]>;
}) {
  const now = Timestamp.now();

  await Promise.all([
    getRequestRef(params.requestId).set(
      withoutUndefined({
        callbackError: params.error,
        callbackLastAttemptAt: now,
        callbackStatus: params.status,
        updatedAt: now,
      }),
      { merge: true },
    ),
    getHistoryRef(params.requestId).set(
      createHistoryEvent({
        message: params.error,
        metadata: {
          callbackStatus: params.status,
        },
        requestId: params.requestId,
        type: callbackStatusHistoryType(params.status),
      }),
    ),
  ]);
}

async function synchronizeCloudStatusCallback(params: {
  actor: { id?: string; name?: string };
  declineReason?: string;
  request: StoredProductionCooperationRequest;
  status: Extract<ProductionCooperationRequestStatus, "ACCEPTED" | "DECLINED">;
}): Promise<NonNullable<ProductionCooperationRequestRecord["callbackStatus"]>> {
  if (params.request.transport !== "DEDICATED_APP_API") {
    return "SKIPPED";
  }

  if (!params.request.callbackUrl) {
    await recordCallbackSync({
      requestId: params.request.id,
      status: "SKIPPED",
    });
    return "SKIPPED";
  }

  try {
    await assertCloudCallbackUrlAllowed(params.request.callbackUrl);
  } catch (error) {
    await recordCallbackSync({
      error:
        error instanceof Error
          ? error.message
          : "Production cooperation cloud callback URL is not allowed.",
      requestId: params.request.id,
      status: "FAILED",
    });
    return "FAILED";
  }

  const secret = getCloudCallbackSecret();

  if (!secret) {
    await recordCallbackSync({
      error: "Production cooperation cloud callback secret is not configured.",
      requestId: params.request.id,
      status: "FAILED",
    });
    return "FAILED";
  }

  const envelope: ProductionCooperationStatusCallbackEnvelope = {
    actor: params.actor,
    declineReason: params.declineReason,
    idempotencyKey: `${params.request.id}:${params.status}`,
    occurredAt: new Date().toISOString(),
    receiverRequestUrl:
      params.request.receiverRequestUrl ??
      absoluteReceiverRequestUrl(params.request.id),
    requestId: params.request.id,
    sourceParticipantId: params.request.sourceParticipantId,
    status: params.status,
    targetParticipantId: params.request.targetParticipantId,
    targetTenantId: params.request.targetTenantId,
  };

  try {
    const response = await fetch(params.request.callbackUrl, {
      body: JSON.stringify(envelope),
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      await recordCallbackSync({
        error: "Cloud callback redirect was blocked.",
        requestId: params.request.id,
        status: "FAILED",
      });
      return "FAILED";
    }

    if (!response.ok) {
      const message = await response.text();
      await recordCallbackSync({
        error:
          message.trim() ||
          `Cloud callback failed with HTTP ${response.status}.`,
        requestId: params.request.id,
        status: "FAILED",
      });
      return "FAILED";
    }

    await recordCallbackSync({
      requestId: params.request.id,
      status: "SENT",
    });
    return "SENT";
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Cloud callback could not be sent.";

    await recordCallbackSync({
      error: message,
      requestId: params.request.id,
      status: "FAILED",
    });
    return "FAILED";
  }
}

async function applyDirectProductionCooperationAction(
  action: Exclude<ProductionCooperationTokenAction, "review">,
  requestId: string,
  request: ProductionCooperationActionRequest,
): Promise<ProductionCooperationActionResult> {
  const actor = await getAuthenticatedAdminMember();
  const db = getAdminDb();
  const requestRef = getRequestRef(requestId);
  const now = Timestamp.now();
  const status = expectedActionStatus(action);

  const result = await db.runTransaction(
    async (
      transaction,
    ): Promise<
      ProductionCooperationActionResult & {
        request?: StoredProductionCooperationRequest;
      }
    > => {
      const requestSnapshot = await transaction.get(requestRef);
      const storedRequest = asStoredRequest(requestSnapshot);

      if (!storedRequest) {
        return {
          code: "not_found",
          message: resultMessage("not_found"),
          requestId,
        };
      }

      if (
        storedRequest.status === "PENDING" &&
        isExpired(storedRequest.expiresAt)
      ) {
        transaction.set(
          requestRef,
          {
            status: "EXPIRED",
            updatedAt: now,
          },
          { merge: true },
        );
        transaction.set(
          getHistoryRef(storedRequest.id, "expired"),
          createHistoryEvent({
            requestId: storedRequest.id,
            type: "REQUEST_EXPIRED",
          }),
          { merge: true },
        );

        return {
          code: "expired",
          message: resultMessage("expired"),
          requestId: storedRequest.id,
          status: "EXPIRED",
        };
      }

      if (storedRequest.status !== "PENDING") {
        return {
          code: "replayed",
          message: resultMessage("replayed"),
          requestId: storedRequest.id,
          status: storedRequest.status,
        };
      }

      const mutation =
        action === "decline"
          ? {
              callbackStatus:
                storedRequest.transport === "DEDICATED_APP_API"
                  ? "PENDING"
                  : storedRequest.callbackStatus,
              declinedAt: now,
              declinedBy: actor.id,
              declineReason: request.declineReason?.trim() || undefined,
              status,
              updatedAt: now,
            }
          : {
              acceptedAt: now,
              acceptedBy: actor.id,
              callbackStatus:
                storedRequest.transport === "DEDICATED_APP_API"
                  ? "PENDING"
                  : storedRequest.callbackStatus,
              status,
              updatedAt: now,
            };

      transaction.set(requestRef, withoutUndefined(mutation), {
        merge: true,
      });
      transaction.set(
        getHistoryRef(storedRequest.id),
        createHistoryEvent({
          actor,
          message: request.declineReason?.trim() || undefined,
          requestId: storedRequest.id,
          type: action === "decline" ? "REQUEST_DECLINED" : "REQUEST_ACCEPTED",
        }),
      );

      return {
        code: action === "decline" ? "declined" : "accepted",
        message: resultMessage(action === "decline" ? "declined" : "accepted"),
        request: {
          ...storedRequest,
          ...mutation,
        },
        requestId: storedRequest.id,
        status,
      };
    },
  );

  if (!result.request || !result.status || result.status === "PENDING") {
    return result;
  }

  const callbackStatus = await synchronizeCloudStatusCallback({
    actor,
    declineReason: request.declineReason?.trim() || undefined,
    request: result.request,
    status: result.status as Extract<
      ProductionCooperationRequestStatus,
      "ACCEPTED" | "DECLINED"
    >,
  });
  return {
    callbackStatus,
    code: result.code,
    message: result.message,
    requestId: result.requestId,
    status: result.status,
  };
}

export async function handleProductionCooperationAction(
  action: Exclude<ProductionCooperationTokenAction, "review">,
  request: ProductionCooperationActionRequest,
): Promise<ProductionCooperationActionResult> {
  try {
    if (request.requestId && !request.token) {
      return applyDirectProductionCooperationAction(
        action,
        request.requestId,
        request,
      );
    }

    const validation = await validateProductionCooperationToken(
      request.token ?? "",
      action,
    );

    return applyProductionCooperationAction(action, validation, request);
  } catch (error) {
    if (error instanceof ProductionCooperationError) {
      return {
        code: error.code,
        message: error.message,
      };
    }

    if (isStatusCodeError(error) && error.statusCode === 401) {
      return {
        code: "unauthorized",
        message: error.message ?? resultMessage("unauthorized"),
      };
    }

    if (isStatusCodeError(error) && error.statusCode === 403) {
      return {
        code: "unauthorized",
        message: error.message ?? resultMessage("unauthorized"),
      };
    }

    console.error("Production cooperation action error", error);
    return {
      code: "unavailable",
      message: resultMessage("unavailable"),
    };
  }
}

export async function retryProductionCooperationCallback(
  requestId: string,
): Promise<ProductionCooperationActionResult> {
  try {
    const actor = await getAuthenticatedAdminMember();
    const snapshot = await getRequestRef(requestId).get();
    const request = asStoredRequest(snapshot);

    if (!request) {
      return {
        code: "not_found",
        message: resultMessage("not_found"),
        requestId,
      };
    }

    if (!(request.status === "ACCEPTED" || request.status === "DECLINED")) {
      return {
        code: "replayed",
        message: "Only accepted or declined requests can sync a callback.",
        requestId: request.id,
        status: request.status,
      };
    }

    const callbackStatus = await synchronizeCloudStatusCallback({
      actor,
      declineReason: request.declineReason,
      request,
      status: request.status,
    });

    return {
      callbackStatus,
      code: request.status === "DECLINED" ? "declined" : "accepted",
      message: resultMessage(
        request.status === "DECLINED" ? "declined" : "accepted",
      ),
      requestId: request.id,
      status: request.status,
    };
  } catch (error) {
    if (
      isStatusCodeError(error) &&
      (error.statusCode === 401 || error.statusCode === 403)
    ) {
      return {
        code: "unauthorized",
        message: error.message ?? resultMessage("unauthorized"),
      };
    }

    console.error("Production cooperation callback retry error", error);
    return {
      code: "unavailable",
      message: resultMessage("unavailable"),
    };
  }
}
