"use server";

import type {
  BankingPayment,
  Category,
  Client,
  Department,
  Invoice,
  Invoice_buyer_company,
  Invoice_status,
  InvoiceKind,
  InvoicePosition,
  Issuer,
  NotFoundErrorResponse,
  PriceList,
  Product,
  RecipientOrIssuer,
  UnauthorizedErrorResponse,
  ValidationErrorResponse,
  Warehouse,
} from "@konfi/fakturownia/client/models";
import type { InvoicesPostRequestBody } from "@konfi/fakturownia/out/client/invoicesJson";
import { getFakturowniaPaymentTypeForOrder } from "@/lib/fakturownia/payment-type";
import {
  getFakturowniaClient,
  getFakturowniaConfig,
} from "@/lib/fakturownia/client";
import { getNormalizedCountryCode } from "@/lib/fakturownia/country";
import {
  FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
  buildFakturowniaInvoiceAdditionalData,
  getFakturowniaInvoiceRecipientFromAddress,
  getFakturowniaRoleDescription,
  isFakturowniaJstRecipientRole,
  normalizeFakturowniaBuyerCountry,
  normalizeFakturowniaRecipientCountry,
  normalizeFakturowniaRecipientRole,
  truncateFakturowniaInvoicePositionDescription,
} from "@/lib/fakturownia/invoice-payload";
import type { KsefReadinessIssue } from "@/lib/fakturownia/ksef-readiness";
import type {
  FakturowniaCostPackaging,
  FakturowniaCostRecipe,
  FakturowniaCostUnit,
  FakturowniaProductCostRollupBucket,
  Order,
} from "@konfi/types";
import { normalizeCurrencyCode } from "@konfi/utils";
import { DateOnly } from "@microsoft/kiota-abstractions";
import filter from "es-toolkit/compat/filter";
import { cacheLife, cacheTag } from "next/cache";
import {
  AdminAuthError,
  clearInvalidAdminAuthCookiesForError,
  getTenantAdminScopeTenantId,
  requireTenantAdminAuthContext,
} from "./auth-utils";
import { checkFakturowniaEnv, getAdminConfigFlags } from ".";

/**
 * Serialize Invoice to a plain object that can be passed to client components
 */
function serializeInvoice(invoice: Invoice | undefined): any {
  if (!invoice) {
    return undefined;
  }

  // Convert to plain object, handling DateOnly and other non-serializable types
  return JSON.parse(
    JSON.stringify(invoice, (key, value) => {
      // Handle DateOnly objects
      if (
        value &&
        typeof value === "object" &&
        "year" in value &&
        "month" in value &&
        "day" in value
      ) {
        return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
      }
      return value;
    }),
  );
}

export interface FakturowniaPriceListPosition {
  id?: string;
  productId?: string;
  productName?: string;
  priceNet?: number;
  priceGross?: number;
  tax?: string;
  usePercentage?: boolean;
  percentage?: number;
}

export interface FakturowniaPriceList {
  id: string;
  name?: string;
  description?: string;
  currency?: string;
  positions: FakturowniaPriceListPosition[];
}

export type CreateInvoiceParams = {
  kind?: InvoiceKind;
  number?: string;
  issueDate: string;
  sellDate: string;
  paymentTo: string;
  paymentType?: string;
  status?: Invoice_status;
  paidAmount?: string;
  currency?: string;
  lang?: string;
  buyerCompany?: "1" | "0";
  buyerName: string;
  buyerFirstName?: string;
  buyerLastName?: string;
  buyerEmail?: string;
  buyerTaxNo?: string;
  buyerStreet?: string;
  buyerPostCode?: string;
  buyerCity?: string;
  buyerCountry?: string;
  buyerPhone?: string;
  buyerPerson?: string;
  sellerName?: string;
  sellerTaxNo?: string;
  sellerStreet?: string;
  sellerPostCode?: string;
  sellerCity?: string;
  sellerCountry?: string;
  sellerPerson?: string;
  recipient_id?: string;
  recipient_name?: string;
  recipient_street?: string;
  recipient_post_code?: string;
  recipient_city?: string;
  recipient_country?: string;
  recipient_tax_no?: string;
  recipient_email?: string;
  recipient_phone?: string;
  recipient_note?: string;
  recipientRole?: string;
  recipientRoleDescription?: string;
  showDiscount?: string;
  positions: InvoicePosition[];
  description?: string;
  clientId?: string;
  departmentId?: number;
  warehouseId?: string;
  place?: string;
  issuerId?: number;
  oid?: string;
  splitPayment?: "1" | "0";
  priceListId?: string;
  usePricesFromPriceLists?: "1" | "0";
};

export type CreateFakturowniaInvoiceParams = CreateInvoiceParams;

export type CreateInvoiceResult =
  | {
      ok: true;
      invoice: Invoice;
    }
  | {
      ok: false;
      reason: "auth";
      message: string;
      statusCode: number;
    };

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
}

function parseNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, "").replace(",", ".");
    if (normalized === "") {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseCurrencyValue(value: unknown): number | undefined {
  const parsed = parseNumberValue(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.round(parsed * 100) / 100;
}

const KSEF_POSITION_NAME_MAX_LENGTH = 256;
const KSEF_DESCRIPTION_MAX_LENGTH = 3500;
const KSEF_PHONE_MAX_LENGTH = 16;
const FAKTUROWNIA_REFERENCE_DATA_TAG = "fakturownia-reference-data";
const FAKTUROWNIA_ERROR_BODY_PREVIEW_LIMIT = 1000;
const FAKTUROWNIA_ERROR_MESSAGE_PREVIEW_LIMIT = 300;
const FAKTUROWNIA_PDF_PENDING_STATUSES = new Set([
  202, 409, 422, 423, 425, 503,
]);
const FAKTUROWNIA_PDF_PENDING_BODY_PATTERNS = [
  "ksef",
  "export",
  "generat",
  "przygot",
  "oczek",
  "processing",
  "pending",
  "not ready",
  "try again",
];

class FakturowniaHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly endpoint: string;
  readonly contentType?: string;
  readonly bodySnippet?: string;

  constructor(params: {
    message: string;
    status: number;
    statusText: string;
    endpoint: string;
    contentType?: string;
    bodySnippet?: string;
  }) {
    super(params.message);
    this.name = "FakturowniaHttpError";
    this.status = params.status;
    this.statusText = params.statusText;
    this.endpoint = params.endpoint;
    this.contentType = params.contentType;
    this.bodySnippet = params.bodySnippet;
  }
}

export type FakturowniaIntegrationErrorKind =
  | "authentication"
  | "validation"
  | "not_found"
  | "upstream_unavailable"
  | "unexpected_response"
  | "unknown";

export interface FakturowniaIntegrationErrorDiagnostic {
  context: string;
  source: "fakturownia";
  errorName?: string;
  statusCode?: number;
  statusText?: string;
  endpoint?: string;
  contentType?: string;
  errorKeys?: string[];
}

export interface FakturowniaIntegrationActionError {
  kind: FakturowniaIntegrationErrorKind;
  message: string;
  operatorHint: string;
  retryable: boolean;
  diagnostic: FakturowniaIntegrationErrorDiagnostic;
  ksefReadiness?: {
    blockers: KsefReadinessIssue[];
    warnings: KsefReadinessIssue[];
  };
}

export type FakturowniaIntegrationActionResult<T> =
  | { ok: true; data: T; warnings?: KsefReadinessIssue[] }
  | { ok: false; error: FakturowniaIntegrationActionError };

export interface FakturowniaInvoiceReferenceDataResult {
  warehouses: Warehouse[];
  departments: Department[];
  issuers: Issuer[];
  errors: {
    warehouses?: FakturowniaIntegrationActionError;
    departments?: FakturowniaIntegrationActionError;
    issuers?: FakturowniaIntegrationActionError;
  };
}

class FakturowniaIntegrationError extends Error {
  readonly details: FakturowniaIntegrationActionError;

  constructor(details: FakturowniaIntegrationActionError) {
    super(details.message);
    this.name = "FakturowniaIntegrationError";
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorStringField(
  error: unknown,
  field: string,
): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const value = error[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const statusCode = error.statusCode ?? error.status;
  if (typeof statusCode === "number" && Number.isFinite(statusCode)) {
    return statusCode;
  }

  if (typeof statusCode === "string") {
    const parsed = Number.parseInt(statusCode, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const message = getErrorStringField(error, "message");
  const statusMatch = message?.match(
    /(?:status code|code|status)\s+([1-5]\d{2})\b/i,
  );
  if (statusMatch?.[1]) {
    const parsed = Number.parseInt(statusMatch[1], 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getFakturowniaErrorFallbackMessage(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  if (statusCode) {
    return `Fakturownia request failed (${statusCode}).`;
  }

  const errorName = getErrorStringField(error, "name");
  if (errorName && errorName !== "Error") {
    return `Fakturownia request failed (${errorName}).`;
  }

  return "Fakturownia returned an empty error response.";
}

function getSafeErrorKeys(error: unknown): string[] | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const keys = Object.keys(error).filter(
    (key) =>
      !key.toLowerCase().includes("token") &&
      !key.toLowerCase().includes("key") &&
      !key.toLowerCase().includes("secret") &&
      !key.toLowerCase().includes("password"),
  );

  return keys.length > 0 ? keys.slice(0, 10) : undefined;
}

function getSanitizedRawMessage(error: unknown): string | undefined {
  const message = getErrorStringField(error, "message");
  if (!message) {
    return undefined;
  }

  return message
    .replace(/api_token=[^&\s]+/gi, "api_token=[redacted]")
    .replace(/api[_-]?key[=:]\s*[^&\s]+/gi, "api_key=[redacted]")
    .slice(0, FAKTUROWNIA_ERROR_MESSAGE_PREVIEW_LIMIT);
}

function getIntegrationErrorKind(params: {
  statusCode?: number;
  rawMessage?: string;
  validation?: boolean;
  unauthorized?: boolean;
  notFound?: boolean;
}): FakturowniaIntegrationErrorKind {
  if (params.validation) {
    return "validation";
  }
  if (
    params.unauthorized ||
    params.statusCode === 401 ||
    params.statusCode === 403
  ) {
    return "authentication";
  }
  if (params.notFound || params.statusCode === 404) {
    return "not_found";
  }
  if (
    params.statusCode === 408 ||
    params.statusCode === 425 ||
    params.statusCode === 429 ||
    (params.statusCode !== undefined &&
      params.statusCode >= 500 &&
      params.statusCode <= 599)
  ) {
    return "upstream_unavailable";
  }

  const rawMessage = params.rawMessage?.toLowerCase() ?? "";
  if (
    rawMessage.includes("content type") ||
    rawMessage.includes("text/html") ||
    rawMessage.includes("factory registered") ||
    rawMessage.includes("application/pdf")
  ) {
    return "unexpected_response";
  }

  return "unknown";
}

function getIntegrationErrorCopy(params: {
  kind: FakturowniaIntegrationErrorKind;
  context: string;
  statusCode?: number;
  statusText?: string;
  detail?: string;
}): Pick<
  FakturowniaIntegrationActionError,
  "message" | "operatorHint" | "retryable"
> {
  const statusLabel = params.statusCode
    ? `${params.statusCode}${params.statusText ? ` ${params.statusText}` : ""}`
    : undefined;

  switch (params.kind) {
    case "authentication":
      return {
        message: `${params.context}: Fakturownia authentication failed.`,
        operatorHint:
          "Check the Fakturownia API key and subdomain, then retry the operation.",
        retryable: false,
      };
    case "validation":
      return {
        message: `${params.context}: Fakturownia rejected the submitted data${
          params.detail ? ` - ${params.detail}` : ""
        }.`,
        operatorHint:
          "Correct the invoice fields marked by Fakturownia and submit again.",
        retryable: false,
      };
    case "not_found":
      return {
        message: `${params.context}: the referenced Fakturownia resource was not found.`,
        operatorHint:
          "Refresh Fakturownia data and verify the selected product, department, client, or invoice still exists.",
        retryable: false,
      };
    case "upstream_unavailable":
      return {
        message: `${params.context}: Fakturownia is temporarily unavailable${
          statusLabel ? ` (${statusLabel})` : ""
        }.`,
        operatorHint:
          "Retry after a short wait. If it keeps failing, check Fakturownia service status and retry from the operator panel.",
        retryable: true,
      };
    case "unexpected_response":
      return {
        message: `${params.context}: Fakturownia returned an unexpected response${
          statusLabel ? ` (${statusLabel})` : ""
        }.`,
        operatorHint:
          "Retry once. If it repeats, verify the Fakturownia subdomain, API key, and selected resource in the operator panel.",
        retryable: true,
      };
    case "unknown":
      return {
        message: `${params.context}: Fakturownia returned an unclassified error${
          statusLabel ? ` (${statusLabel})` : ""
        }.`,
        operatorHint:
          "Retry once. If it repeats, contact an operator with the diagnostic context from server logs.",
        retryable: true,
      };
  }
}

function createFakturowniaIntegrationError(params: {
  error: unknown;
  context: string;
  kind?: FakturowniaIntegrationErrorKind;
  detail?: string;
  statusCode?: number;
  statusText?: string;
  endpoint?: string;
  contentType?: string;
}): FakturowniaIntegrationError {
  const statusCode = params.statusCode ?? getErrorStatusCode(params.error);
  const rawMessage = getSanitizedRawMessage(params.error);
  const kind =
    params.kind ??
    getIntegrationErrorKind({
      statusCode,
      rawMessage,
    });
  const copy = getIntegrationErrorCopy({
    kind,
    context: params.context,
    statusCode,
    statusText: params.statusText,
    detail: params.detail,
  });
  const diagnostic: FakturowniaIntegrationErrorDiagnostic = {
    context: params.context,
    source: "fakturownia",
    errorName: getErrorStringField(params.error, "name"),
    statusCode,
    statusText: params.statusText,
    endpoint: params.endpoint,
    contentType: params.contentType,
    errorKeys: getSafeErrorKeys(params.error),
  };

  console.error("[fakturownia] integration request failed", {
    ...diagnostic,
    kind,
    retryable: copy.retryable,
    rawMessage,
  });

  return new FakturowniaIntegrationError({
    kind,
    ...copy,
    diagnostic,
  });
}

function toFakturowniaIntegrationActionError(
  error: unknown,
  context: string,
): FakturowniaIntegrationActionError {
  if (error instanceof FakturowniaIntegrationError) {
    return error.details;
  }

  return createFakturowniaIntegrationError({
    error,
    context,
  }).details;
}

async function getPdfDownloadUrl(invoiceId: number) {
  const { apiKey, baseUrl } = await getFakturowniaConfig();
  const url = new URL(`/invoices/${invoiceId}.pdf`, baseUrl);
  url.searchParams.set("api_token", apiKey);
  return url;
}

function isPdfContentType(contentType: string | null) {
  return contentType?.toLowerCase().includes("application/pdf") ?? false;
}

function hasPdfSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function decodeBodySnippet(bytes: Uint8Array) {
  try {
    return new TextDecoder()
      .decode(bytes.slice(0, FAKTUROWNIA_ERROR_BODY_PREVIEW_LIMIT))
      .trim();
  } catch {
    return "";
  }
}

function isFakturowniaPdfPendingResponse(error: FakturowniaHttpError) {
  const bodySnippet = error.bodySnippet?.toLowerCase() ?? "";
  return (
    FAKTUROWNIA_PDF_PENDING_STATUSES.has(error.status) ||
    FAKTUROWNIA_PDF_PENDING_BODY_PATTERNS.some((pattern) =>
      bodySnippet.includes(pattern),
    )
  );
}

async function readResponseSnippet(response: Response) {
  try {
    return (await response.text())
      .slice(0, FAKTUROWNIA_ERROR_BODY_PREVIEW_LIMIT)
      .trim();
  } catch {
    return "";
  }
}

async function fetchInvoicePdfBytes(invoiceId: number): Promise<ArrayBuffer> {
  const url = await getPdfDownloadUrl(invoiceId);
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/pdf",
    },
  });
  const contentType = response.headers.get("content-type") ?? undefined;
  const endpoint = `${url.origin}${url.pathname}`;

  if (!response.ok) {
    throw new FakturowniaHttpError({
      message: `Fakturownia PDF request failed with ${response.status}`,
      status: response.status,
      statusText: response.statusText,
      endpoint,
      contentType,
      bodySnippet: await readResponseSnippet(response),
    });
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new FakturowniaHttpError({
      message: "Fakturownia PDF response was empty",
      status: response.status,
      statusText: response.statusText,
      endpoint,
      contentType,
    });
  }

  if (!isPdfContentType(contentType ?? null) && !hasPdfSignature(bytes)) {
    throw new FakturowniaHttpError({
      message: "Fakturownia PDF response was not a PDF",
      status: response.status,
      statusText: response.statusText,
      endpoint,
      contentType,
      bodySnippet: decodeBodySnippet(bytes),
    });
  }

  return bytes.buffer;
}

function validateKsefInvoicePayloadLimits(params: {
  positions: InvoicePosition[];
  description?: string;
  buyerPhone?: string;
  recipientPhone?: string;
}): void {
  for (const [index, position] of params.positions.entries()) {
    const positionName =
      typeof position.name === "string" ? position.name.trim() : "";
    if (positionName.length > KSEF_POSITION_NAME_MAX_LENGTH) {
      throw new Error(
        `Invalid invoice payload: position ${index + 1} name exceeds ${KSEF_POSITION_NAME_MAX_LENGTH} characters`,
      );
    }
  }

  const description =
    typeof params.description === "string" ? params.description : "";
  if (description.length > KSEF_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `Invalid invoice payload: description exceeds ${KSEF_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  const buyerPhone =
    typeof params.buyerPhone === "string" ? params.buyerPhone.trim() : "";
  if (buyerPhone.length > KSEF_PHONE_MAX_LENGTH) {
    throw new Error(
      `Invalid invoice payload: buyer phone exceeds ${KSEF_PHONE_MAX_LENGTH} characters`,
    );
  }

  const recipientPhone =
    typeof params.recipientPhone === "string"
      ? params.recipientPhone.trim()
      : "";
  if (recipientPhone.length > KSEF_PHONE_MAX_LENGTH) {
    throw new Error(
      `Invalid invoice payload: recipient phone exceeds ${KSEF_PHONE_MAX_LENGTH} characters`,
    );
  }
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    return value.trim() === "1" || value.trim().toLowerCase() === "true";
  }
  return false;
}

function normalizePriceList(
  priceList: PriceList | undefined,
): FakturowniaPriceList | undefined {
  if (!priceList) {
    return undefined;
  }

  const id = toOptionalString(priceList.id);
  if (!id) {
    return undefined;
  }

  const positions: FakturowniaPriceListPosition[] = [];

  // Handle array format (from GET /price_lists/{id}.json)
  const rawRecord = priceList as Record<string, unknown>;
  const positionsArray =
    rawRecord.price_list_positions ?? rawRecord.priceListPositions;

  if (Array.isArray(positionsArray)) {
    for (const entry of positionsArray) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const additionalData = record.additionalData as
        | Record<string, unknown>
        | undefined;

      const productId = toOptionalString(
        record.priceableId ??
          record.priceable_id ??
          record.product_id ??
          record.priceableId ??
          record.productId ??
          additionalData?.priceable_id ??
          additionalData?.priceableId ??
          additionalData?.product_id ??
          additionalData?.productId,
      );

      if (!productId) {
        continue;
      }
      const productType = toOptionalString(
        record.priceable_type ?? record.priceableType,
      );
      if (productType && productType.toLowerCase() !== "product") {
        continue;
      }
      const priceNet = parseCurrencyValue(record.price_net ?? record.priceNet);
      const priceGross = parseCurrencyValue(
        record.price_gross ?? record.priceGross,
      );
      const taxValue = record.tax;
      const taxString =
        typeof taxValue === "string" ? taxValue : toOptionalString(taxValue);
      const percentage = parseNumberValue(record.percentage);
      positions.push({
        id: toOptionalString(record.id),
        productId,
        productName: toOptionalString(
          record.priceable_name ?? record.product_name ?? record.name,
        ),
        priceNet,
        priceGross,
        tax: taxString,
        usePercentage: isTruthyFlag(
          record.use_percentage ?? record.usePercentage,
        ),
        percentage,
      });
    }
  } else {
    // Handle object format (from GET /price_lists.json)
    const rawPositions =
      priceList.priceListPositionsAttributes?.additionalData ?? {};
    for (const entry of Object.values(rawPositions)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const candidate =
        (entry as { additionalData?: Record<string, unknown> })
          .additionalData ?? entry;
      if (!candidate || typeof candidate !== "object") {
        continue;
      }
      const record = candidate as Record<string, unknown>;
      const productId = toOptionalString(
        record.priceable_id ??
          record.product_id ??
          record.priceableId ??
          record.productId,
      );
      if (!productId) {
        continue;
      }
      const productType = toOptionalString(
        record.priceable_type ?? record.priceableType,
      );
      if (productType && productType.toLowerCase() !== "product") {
        continue;
      }
      const priceNet = parseCurrencyValue(record.price_net ?? record.priceNet);
      const priceGross = parseCurrencyValue(
        record.price_gross ?? record.priceGross,
      );
      const taxValue = record.tax;
      const taxString =
        typeof taxValue === "string" ? taxValue : toOptionalString(taxValue);
      const percentage = parseNumberValue(record.percentage);
      positions.push({
        id: toOptionalString(record.id),
        productId,
        productName: toOptionalString(
          record.priceable_name ?? record.product_name ?? record.name,
        ),
        priceNet,
        priceGross,
        tax: taxString,
        usePercentage: isTruthyFlag(
          record.use_percentage ?? record.usePercentage,
        ),
        percentage,
      });
    }
  }

  return {
    id,
    name: toOptionalString(priceList.name),
    description: toOptionalString(priceList.description),
    currency: toOptionalString(priceList.currency),
    positions,
  };
}

/**
 * Type guard functions for error checking
 */
function isValidationError(error: unknown): error is ValidationErrorResponse {
  return getErrorStatusCode(error) === 422;
}

function isUnauthorizedError(
  error: unknown,
): error is UnauthorizedErrorResponse {
  return getErrorStatusCode(error) === 401;
}

function isNotFoundError(error: unknown): error is NotFoundErrorResponse {
  return getErrorStatusCode(error) === 404;
}

function formatValidationErrorMessages(
  fieldErrors: ValidationErrorResponse["messageEscaped"],
): string {
  return Object.entries((fieldErrors ?? {}) as Record<string, unknown>)
    .map(([field, messages]) => {
      const normalizedMessages = Array.isArray(messages)
        ? messages.map((message) =>
            typeof message === "string" ? message : JSON.stringify(message),
          )
        : typeof messages === "string"
          ? [messages]
          : messages && typeof messages === "object"
            ? [JSON.stringify(messages)]
            : [];

      if (normalizedMessages.length === 0) {
        return field;
      }

      return `${field}: ${normalizedMessages.join(", ")}`;
    })
    .join("; ");
}

/**
 * Handle Fakturownia API errors and throw user-friendly messages
 */
function handleFakturowniaError(error: unknown, context: string): never {
  if (!error || typeof error !== "object") {
    throw createFakturowniaIntegrationError({
      error,
      context,
      kind: "unknown",
    });
  }

  if (error instanceof FakturowniaHttpError) {
    throw createFakturowniaIntegrationError({
      error,
      context,
      statusCode: error.status,
      statusText: error.statusText,
      endpoint: error.endpoint,
      contentType: error.contentType,
    });
  }

  const statusCode = getErrorStatusCode(error);

  if (isValidationError(error)) {
    const errorMessages = formatValidationErrorMessages(error.messageEscaped);
    throw createFakturowniaIntegrationError({
      error,
      context,
      kind: "validation",
      detail: errorMessages,
      statusCode,
    });
  }

  if (isUnauthorizedError(error)) {
    throw createFakturowniaIntegrationError({
      error,
      context,
      kind: "authentication",
      statusCode,
    });
  }

  if (isNotFoundError(error)) {
    throw createFakturowniaIntegrationError({
      error,
      context,
      kind: "not_found",
      statusCode,
    });
  }

  if (statusCode === 500) {
    throw createFakturowniaIntegrationError({
      error,
      context,
      kind: "upstream_unavailable",
      detail: getErrorStringField(error, "messageEscaped"),
      statusCode,
    });
  }

  // Kiota throws a plain Error (not a structured API error) when the response
  // body cannot be parsed — e.g. Fakturownia returns an HTML error page instead
  // of JSON. Detect this and surface a clearer message.
  const rawMessage = getErrorStringField(error, "message") ?? "";
  if (
    rawMessage.includes("application/pdf") &&
    rawMessage.includes("factory")
  ) {
    throw createFakturowniaIntegrationError({
      error,
      context,
      kind: "unexpected_response",
      statusCode,
    });
  }

  if (
    rawMessage.includes("Content type") ||
    rawMessage.includes("text/html") ||
    rawMessage.includes("factory registered")
  ) {
    throw createFakturowniaIntegrationError({
      error,
      context,
      kind: "unexpected_response",
      statusCode,
    });
  }

  throw createFakturowniaIntegrationError({
    error,
    context,
    detail: rawMessage || getFakturowniaErrorFallbackMessage(error),
    statusCode,
  });
}

export async function isFakturowniaApiKeyProvided() {
  const flags = await getAdminConfigFlags();
  return flags.fakturowniaApiKeyProvided;
}

/**
 * Plain, serializable shape of a product cost rollup bucket suitable for passing
 * to client components (no Firestore Timestamps, numbers/strings only).
 */
export interface SerializedProductCostBucket {
  attributeId?: string;
  averageUnitCostNetBase?: number;
  costUnit?: FakturowniaCostUnit;
  latestIssueDate?: string;
  latestUnitCostNetBase?: number;
  optionValue?: string;
  packaging?: FakturowniaCostPackaging;
  previousUnitCostNetBase?: number;
  sampleCount: number;
  sheetHeightMm?: number;
  sheetWidthMm?: number;
}

export interface SerializedProductCostRollup {
  baseCurrency: string;
  byAttributeOption?: Record<string, SerializedProductCostBucket>;
  overall: SerializedProductCostBucket;
  productId: string;
  productName?: string;
}

function serializeProductCostBucket(
  bucket: FakturowniaProductCostRollupBucket,
): SerializedProductCostBucket {
  return {
    ...(bucket.attributeId ? { attributeId: bucket.attributeId } : {}),
    ...(bucket.averageUnitCostNetBase !== undefined
      ? { averageUnitCostNetBase: bucket.averageUnitCostNetBase }
      : {}),
    ...(bucket.costUnit ? { costUnit: bucket.costUnit } : {}),
    ...(bucket.latestIssueDate
      ? { latestIssueDate: bucket.latestIssueDate }
      : {}),
    ...(bucket.latestUnitCostNetBase !== undefined
      ? { latestUnitCostNetBase: bucket.latestUnitCostNetBase }
      : {}),
    ...(bucket.optionValue ? { optionValue: bucket.optionValue } : {}),
    ...(bucket.previousUnitCostNetBase !== undefined
      ? { previousUnitCostNetBase: bucket.previousUnitCostNetBase }
      : {}),
    sampleCount: bucket.sampleCount,
    ...(bucket.packaging !== undefined ? { packaging: bucket.packaging } : {}),
    ...(bucket.sheetWidthMm !== undefined
      ? { sheetWidthMm: bucket.sheetWidthMm }
      : {}),
    ...(bucket.sheetHeightMm !== undefined
      ? { sheetHeightMm: bucket.sheetHeightMm }
      : {}),
  };
}

/**
 * Read-only supplier cost rollup for a single product, serialized as a plain
 * object for client components. Returns null when the Fakturownia cost feature
 * is unavailable or no rollup exists for the product.
 */
export async function getProductCostInsights(input: {
  productId: string;
}): Promise<SerializedProductCostRollup | null> {
  const productId = input.productId?.trim();
  if (!productId) {
    return null;
  }

  const authContext = await requireTenantAdminAuthContext();
  const tenantId = getTenantAdminScopeTenantId(authContext.tenantContext);
  const { ensureProductCostRollup } =
    await import("@/lib/fakturownia/cost-intelligence");
  // Self-healing read: rebuilds the rollup from approved entries when the stored
  // doc is empty/stale (the approval-time refresh swallows errors), so an
  // approved cost never silently reads as zero.
  const rollup = await ensureProductCostRollup({
    productId,
    member: { id: authContext.uid, name: "Cost rollup auto-heal" },
    ...(tenantId ? { tenantId } : {}),
  });
  if (!rollup) {
    return null;
  }

  return {
    baseCurrency: rollup.baseCurrency,
    ...(rollup.byAttributeOption
      ? {
          byAttributeOption: Object.fromEntries(
            Object.entries(rollup.byAttributeOption).map(([key, bucket]) => [
              key,
              serializeProductCostBucket(bucket),
            ]),
          ),
        }
      : {}),
    overall: serializeProductCostBucket(rollup.overall),
    productId: rollup.productId,
    ...(rollup.productName ? { productName: rollup.productName } : {}),
  };
}

export interface SerializedMaterialCostInsights {
  baseCurrency: string;
  byOption: Record<string, SerializedMaterialCostOption>;
}

export interface SerializedMaterialCostComponent {
  attributeId: string;
  optionValue: string;
  factor: number;
  bucket?: SerializedProductCostBucket;
}

export interface SerializedMaterialCostOption extends SerializedProductCostBucket {
  source: "direct" | "recipe";
  recipeId?: string;
  recipeName?: string;
  components?: SerializedMaterialCostComponent[];
  incomplete?: boolean;
}

/**
 * Read-only live cost lookup for product-less material mappings (approved by
 * attribute+option only, no product candidate). Returns null when the
 * Fakturownia cost feature is unavailable or none of the requested options have
 * approved entries.
 */
export async function getMaterialCostInsights(input: {
  options: Array<{ attributeId: string; optionValue: string }>;
}): Promise<SerializedMaterialCostInsights | null> {
  const unique = Array.from(
    new Map(
      input.options
        .map((o) => ({
          attributeId: o.attributeId?.trim(),
          optionValue: o.optionValue?.trim(),
        }))
        .filter((o) => o.attributeId && o.optionValue)
        .map((o) => [`${o.attributeId}:${o.optionValue}`, o] as const),
    ).values(),
  );

  if (unique.length === 0) {
    return null;
  }

  const authContext = await requireTenantAdminAuthContext();
  const tenantId = getTenantAdminScopeTenantId(authContext.tenantContext);
  const { computeProductCostRollup } =
    await import("@/lib/fakturownia/cost-intelligence");
  const {
    listFakturowniaMaterialGroups,
    resolveMaterialGroupScope,
    getApprovedMaterialGroupCosts,
  } = await import("@/lib/fakturownia/material-groups");
  const { listFakturowniaCostRecipes } =
    await import("@/lib/fakturownia/cost-recipes");

  // Load groups once; used to expand every requested (attributeId, optionValue)
  // into the full cross-product of attributes + canonical/alias option values.
  const [groups, recipes] = await Promise.all([
    listFakturowniaMaterialGroups(tenantId ? { tenantId } : {}),
    listFakturowniaCostRecipes({
      targetKeys: unique.map(
        ({ attributeId, optionValue }) => `${attributeId}:${optionValue}`,
      ),
      ...(tenantId ? { tenantId } : {}),
    }),
  ]);

  const recipeByTarget = new Map<string, FakturowniaCostRecipe>();
  for (const recipe of recipes) {
    recipeByTarget.set(
      `${recipe.targetAttributeId}:${recipe.targetOptionValue}`,
      recipe,
    );
  }

  async function resolveDirectMaterialBucket(
    attributeId: string,
    optionValue: string,
  ): Promise<SerializedProductCostBucket | undefined> {
    const scope = resolveMaterialGroupScope(groups, attributeId, optionValue);
    const entries = await getApprovedMaterialGroupCosts({
      attributeIds: scope.attributeIds,
      optionValues: scope.optionValues,
      ...(tenantId ? { tenantId } : {}),
    });
    if (entries.length === 0) {
      return undefined;
    }
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries,
      productId: "material",
    });
    if (rollup.overall.sampleCount === 0) {
      return undefined;
    }
    return serializeProductCostBucket(rollup.overall);
  }

  const byOption: Record<string, SerializedMaterialCostOption> = {};
  await Promise.all(
    unique.map(async ({ attributeId, optionValue }) => {
      const key = `${attributeId}:${optionValue}`;
      const recipe = recipeByTarget.get(key);
      if (recipe) {
        const components = await Promise.all(
          recipe.components.map(async (component) => ({
            attributeId: component.attributeId,
            optionValue: component.optionValue,
            factor: component.factor ?? 1,
            bucket: await resolveDirectMaterialBucket(
              component.attributeId,
              component.optionValue,
            ),
          })),
        );
        const sampleCount = components.reduce(
          (sum, component) => sum + (component.bucket?.sampleCount ?? 0),
          0,
        );
        byOption[key] = {
          sampleCount,
          source: "recipe",
          recipeId: recipe.id,
          recipeName: recipe.name,
          components,
          incomplete: components.some((component) => !component.bucket),
        };
        return;
      }

      const bucket = await resolveDirectMaterialBucket(
        attributeId,
        optionValue,
      );
      if (bucket) {
        // Key stays as the REQUESTED (attributeId:optionValue) — callers look
        // up by the original pair, not by the canonical/expanded scope.
        byOption[key] = { ...bucket, source: "direct" };
      }
    }),
  );

  if (Object.keys(byOption).length === 0) {
    return null;
  }

  return { baseCurrency: "PLN", byOption };
}

/**
 * Payments: list and create helpers
 */
export async function getPayments(params?: {
  page?: number;
  perPage?: number;
  amountFrom?: string;
  amountTo?: string;
  bankAccountId?: number;
  clientId?: number;
  constantSymbol?: string;
  specificSymbol?: string;
  variableSymbol?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BankingPayment[]> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const payments = await client.banking.paymentsJson.get({
      queryParameters: {
        page: params?.page || 1,
        perPage: params?.perPage || 25,
        amountFrom: params?.amountFrom,
        amountTo: params?.amountTo,
        bankAccountId: params?.bankAccountId,
        clientId: params?.clientId,
        constantSymbol: params?.constantSymbol,
        specificSymbol: params?.specificSymbol,
        variableSymbol: params?.variableSymbol,
        dateFrom: params?.dateFrom
          ? DateOnly.parse(params.dateFrom)
          : undefined,
        dateTo: params?.dateTo ? DateOnly.parse(params.dateTo) : undefined,
      },
    });

    return payments ?? [];
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch payments");
  }
}

export async function createPayment(params: {
  invoiceId?: string;
  invoiceIds?: string[];
  name?: string;
  kind?: string;
  price?: string; // string per API
  paid?: boolean | "1" | "0";
}): Promise<BankingPayment> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();
  try {
    const payload: BankingPayment = {
      invoiceId: params.invoiceId,
      name: params.name,
      kind: params.kind,
      price: params.price,
      paid:
        typeof params.paid === "boolean" ? params.paid : params.paid === "1",
    };

    const created = await client.banking.paymentsJson.post({
      bankingPayment: payload,
    });
    return created!;
  } catch (error) {
    handleFakturowniaError(error, "Failed to create payment");
  }
}

export async function listFakturowniaPriceLists(): Promise<
  FakturowniaPriceList[]
> {
  await checkFakturowniaEnv();

  return listFakturowniaPriceListsCached();
}

async function listFakturowniaPriceListsCached(): Promise<
  FakturowniaPriceList[]
> {
  "use cache";
  cacheLife("hours");
  cacheTag(FAKTUROWNIA_REFERENCE_DATA_TAG);

  const client = await getFakturowniaClient();

  try {
    const priceLists = await client.price_listsJson.get();
    return (priceLists ?? [])
      .map((item) => normalizePriceList(item))
      .filter((item): item is FakturowniaPriceList => Boolean(item));
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch price lists");
  }
}

export async function getFakturowniaPriceListById(
  priceListId: string,
): Promise<FakturowniaPriceList | undefined> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const priceList = await client.price_lists.byIdJson(priceListId).get();
    return normalizePriceList(priceList);
  } catch (error) {
    console.error("[getFakturowniaPriceListById] Error:", error);
    handleFakturowniaError(error, `Failed to fetch price list ${priceListId}`);
  }
}

/**
 * Create an invoice in Fakturownia
 */
export async function createInvoice(
  params: CreateInvoiceParams,
): Promise<CreateInvoiceResult> {
  try {
    const invoice = await createInvoiceOrThrow(params);
    return { ok: true, invoice };
  } catch (error) {
    if (error instanceof AdminAuthError) {
      await clearInvalidAdminAuthCookiesForError(error);
      return {
        ok: false,
        reason: "auth",
        message: error.message,
        statusCode: error.statusCode,
      };
    }

    throw error;
  }
}

async function createInvoiceOrThrow(
  params: CreateInvoiceParams,
): Promise<Invoice> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();
  const invoiceKind = params.kind || "vat";
  const shouldSendStructuredIssuer = params.departmentId === undefined;

  // departmentId still controls department-level seller settings; issuerId is
  // only sent when no department is available. With departmentId, Fakturownia
  // renders explicit issuers as additional visible parties instead of replacing
  // the department seller.
  let issuerData: Issuer | null = null;
  if (params.issuerId && shouldSendStructuredIssuer) {
    try {
      issuerData =
        (await client.issuers.byIdJson(params.issuerId.toString()).get()) ??
        null;
    } catch (error) {
      console.error("Failed to fetch issuer data:", error);
      // Don't fail the invoice creation if issuer fetch fails
    }
  }

  const positions: InvoicePosition[] = params.positions.map((pos) =>
    truncateFakturowniaInvoicePositionDescription({
      productId: pos.productId,
      name: pos.name,
      quantity: pos.quantity,
      tax: pos.tax,
      totalPriceGross: pos.totalPriceGross,
      priceNet: pos.priceNet,
      priceGross: pos.priceGross,
      totalPriceNet: pos.totalPriceNet,
      quantityUnit: pos.quantityUnit,
      description: pos.description,
      code: pos.code,
      discountPercent: pos.discountPercent,
      discount: pos.discount,
    }),
  );

  validateKsefInvoicePayloadLimits({
    positions,
    description: params.description,
    buyerPhone: params.buyerPhone,
    recipientPhone: params.recipient_phone,
  });

  const recipientRole = normalizeFakturowniaRecipientRole(params.recipientRole);
  const recipientRoleDescription = getFakturowniaRoleDescription({
    role: recipientRole,
    roleDescription: params.recipientRoleDescription,
  });
  const normalizedRecipientCountry = normalizeFakturowniaRecipientCountry(
    params.recipient_country,
    {
      fallback: isFakturowniaJstRecipientRole(recipientRole) ? "PL" : undefined,
    },
  );
  const additionalData = buildFakturowniaInvoiceAdditionalData({
    clientId: params.clientId,
    recipientRole,
  });
  const structuredRecipient: RecipientOrIssuer | undefined = recipientRole
    ? {
        ...(params.recipient_name?.trim()
          ? { name: params.recipient_name.trim() }
          : {}),
        ...(params.recipient_street?.trim()
          ? { street: params.recipient_street.trim() }
          : {}),
        ...(params.recipient_post_code?.trim()
          ? { postCode: params.recipient_post_code.trim() }
          : {}),
        ...(params.recipient_city?.trim()
          ? { city: params.recipient_city.trim() }
          : {}),
        ...(normalizedRecipientCountry
          ? { country: normalizedRecipientCountry }
          : {}),
        ...(params.recipient_tax_no?.trim()
          ? { taxNo: params.recipient_tax_no.trim() }
          : {}),
        ...(params.recipient_email?.trim()
          ? { email: params.recipient_email.trim() }
          : {}),
        ...(params.recipient_phone?.trim()
          ? { phone: params.recipient_phone.trim() }
          : {}),
        ...(params.recipient_note?.trim()
          ? { note: params.recipient_note.trim() }
          : {}),
        role: recipientRole,
        ...(recipientRoleDescription
          ? // role_description is not in the generated Kiota model; additionalData
            // entries are serialized as top-level fields of the recipient object.
            { additionalData: { role_description: recipientRoleDescription } }
          : {}),
      }
    : undefined;

  const invoicePayload: Invoice = {
    kind: invoiceKind,
    number: params.number,
    issueDate: DateOnly.parse(params.issueDate),
    sellDate: params.sellDate,
    paymentTo: params.paymentTo,
    paymentType: params.paymentType || "transfer",
    status: params.status,
    paid: params.paidAmount,
    currency: normalizeCurrencyCode(params.currency) ?? "PLN",
    lang: params.lang || "pl",
    showDiscount: params.showDiscount,
    buyerCompany: params.buyerCompany as Invoice_buyer_company,
    buyerName: params.buyerName,
    buyerFirstName: params.buyerFirstName,
    buyerLastName: params.buyerLastName,
    buyerEmail: params.buyerEmail,
    buyerTaxNo: params.buyerTaxNo,
    buyerStreet: params.buyerStreet,
    buyerPostCode: params.buyerPostCode,
    buyerCity: params.buyerCity,
    buyerCountry: normalizeFakturowniaBuyerCountry(params.buyerCountry),
    buyerPhone: params.buyerPhone,
    recipientId: structuredRecipient ? undefined : params.recipient_id,
    recipientName: structuredRecipient ? undefined : params.recipient_name,
    recipientStreet: structuredRecipient ? undefined : params.recipient_street,
    recipientPostCode: structuredRecipient
      ? undefined
      : params.recipient_post_code,
    recipientCity: structuredRecipient ? undefined : params.recipient_city,
    recipientCountry: structuredRecipient
      ? undefined
      : normalizedRecipientCountry,
    recipientTaxNo: structuredRecipient ? undefined : params.recipient_tax_no,
    recipientEmail: structuredRecipient ? undefined : params.recipient_email,
    recipientPhone: structuredRecipient ? undefined : params.recipient_phone,
    recipientNote: structuredRecipient ? undefined : params.recipient_note,
    recipients: structuredRecipient ? [structuredRecipient] : undefined,
    // NOTE: Intentionally omit seller company fields (sellerName, sellerTaxNo, etc.) — we rely on departmentId to supply seller data in Fakturownia.
    // Exception: sellerPerson identifies the issuing person and is independent of department data.
    sellerPerson: params.sellerPerson,
    positions,
    description: params.description,
    clientId: params.clientId,
    departmentId: params.departmentId,
    warehouseId: params.warehouseId,
    place: params.place,
    issuers: issuerData
      ? [
          {
            id: issuerData.id,
            name: issuerData.name,
            taxNo: issuerData.taxNo,
            company: true,
            street: issuerData.street,
            postCode: issuerData.postCode,
            city: issuerData.city,
            country: issuerData.country,
            email: issuerData.email,
            phone: issuerData.phone,
            // Without an explicit role Fakturownia stores null instead of its
            // default, which later fails KSeF validation on KSeF-bound kinds.
            role: FAKTUROWNIA_DEFAULT_ISSUER_ROLE,
          },
        ]
      : undefined,
    oid: params.oid,
    oidUnique: params.oid ? "yes" : undefined,
    splitPayment: params.splitPayment,
    additionalData,
  };

  const requestBody: InvoicesPostRequestBody = {
    invoice: invoicePayload as Invoice,
  };

  const trimmedPriceListId = params.priceListId?.trim?.();
  if (trimmedPriceListId) {
    const parsedPriceListId = Number.parseInt(trimmedPriceListId, 10);
    if (Number.isFinite(parsedPriceListId)) {
      requestBody.priceListId = parsedPriceListId;
      const priceListFlag = params.usePricesFromPriceLists ?? "1";
      requestBody.usePricesFromPriceLists = priceListFlag === "1" ? "1" : "0";
    }
  } else if (params.usePricesFromPriceLists) {
    requestBody.usePricesFromPriceLists =
      params.usePricesFromPriceLists === "1" ? "1" : "0";
  }

  try {
    const invoice = await client.invoicesJson.post(requestBody);

    return serializeInvoice(invoice);
  } catch (error) {
    handleFakturowniaError(error, "Failed to create invoice");
  }
}

export async function createInvoiceAction(
  params: CreateFakturowniaInvoiceParams,
): Promise<FakturowniaIntegrationActionResult<Invoice>> {
  try {
    const result = await createInvoice(params);
    if (!result.ok) {
      return {
        ok: false,
        error: {
          kind: "authentication",
          message: result.message,
          operatorHint: "Sign in again and retry.",
          retryable: false,
          diagnostic: {
            context: "Failed to create invoice",
            source: "fakturownia",
            errorName: "AdminAuthError",
            statusCode: result.statusCode,
          },
        },
      };
    }

    return {
      ok: true,
      data: result.invoice,
    };
  } catch (error) {
    return {
      ok: false,
      error: toFakturowniaIntegrationActionError(
        error,
        "Failed to create invoice",
      ),
    };
  }
}

/**
 * Create an invoice from a Konfi Order
 */
export async function createInvoiceFromOrder(order: Order): Promise<Invoice> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  // Extract customer information
  const customer = typeof order.customer === "string" ? null : order.customer;
  const billing = order.billing || order.shipping;

  if (!billing) {
    throw new Error("Order must have billing or shipping address");
  }

  // Map order items to invoice positions (preserving Fakturownia product links)
  const { mapOrderItemToInvoicePosition, minorToMajor } =
    await import("./fakturownia-helpers");
  const positions: InvoicePosition[] = order.items.map((item) =>
    mapOrderItemToInvoicePosition(item, order.taxSummary),
  );
  const shippingTaxRate =
    order.taxSummary?.enabled === true
      ? (order.taxSummary.lines.find((line) => line.sourceType === "shipping")
          ?.taxRatePercent ?? 23)
      : 23;

  // Add shipping as a position if applicable
  if (order.shippingPrice > 0) {
    positions.push({
      name: "Wysyłka",
      quantity: 1,
      tax: shippingTaxRate,
      // Convert minor units to major units
      totalPriceGross: minorToMajor(order.shippingPrice || 0),
    });
  }
  const invoiceRecipient = getFakturowniaInvoiceRecipientFromAddress(
    order.billing,
  );
  const invoiceRecipientRole = normalizeFakturowniaRecipientRole(
    invoiceRecipient?.role,
  );
  const structuredInvoiceRecipient: RecipientOrIssuer | undefined =
    invoiceRecipient && invoiceRecipientRole
      ? {
          ...(invoiceRecipient.name ? { name: invoiceRecipient.name } : {}),
          ...(invoiceRecipient.street
            ? { street: invoiceRecipient.street }
            : {}),
          ...(invoiceRecipient.postCode
            ? { postCode: invoiceRecipient.postCode }
            : {}),
          ...(invoiceRecipient.city ? { city: invoiceRecipient.city } : {}),
          ...(invoiceRecipient.country
            ? { country: invoiceRecipient.country }
            : {}),
          ...(invoiceRecipient.taxNo ? { taxNo: invoiceRecipient.taxNo } : {}),
          role: invoiceRecipientRole,
        }
      : undefined;
  const plainInvoiceRecipient =
    invoiceRecipient && !structuredInvoiceRecipient
      ? invoiceRecipient
      : undefined;

  try {
    const invoiceKind = order.invoice ? "vat" : "receipt";

    const invoice = await client.invoicesJson.post({
      invoice: {
        kind: invoiceKind,
        issueDate: DateOnly.parse(new Date().toISOString().split("T")[0]),
        sellDate: new Date().toISOString().split("T")[0],
        paymentTo: order.deadlineString,
        buyerName: customer?.name || billing.companyName || billing.name,
        buyerEmail: customer?.email || order.email,
        buyerTaxNo: billing.nip || customer?.nip,
        buyerCountry: getNormalizedCountryCode(billing.country, "PL"),
        recipientName: plainInvoiceRecipient?.name,
        recipientStreet: plainInvoiceRecipient?.street,
        recipientPostCode: plainInvoiceRecipient?.postCode,
        recipientCity: plainInvoiceRecipient?.city,
        recipientCountry: plainInvoiceRecipient?.country,
        recipientTaxNo: plainInvoiceRecipient?.taxNo,
        recipients: structuredInvoiceRecipient
          ? [structuredInvoiceRecipient]
          : undefined,
        additionalData: buildFakturowniaInvoiceAdditionalData({
          recipientRole: invoiceRecipientRole,
        }),
        positions: positions.map(truncateFakturowniaInvoicePositionDescription),
        paymentType: getFakturowniaPaymentTypeForOrder({
          invoiceKind,
          orderPaymentType: order.paymentType,
        }),
        currency: normalizeCurrencyCode(order.currency) ?? "PLN",
        description:
          order.invoiceNotes?.trim() || order.specialNotes || undefined,
        lang: "pl",
      },
    });

    return serializeInvoice(invoice);
  } catch (error) {
    handleFakturowniaError(error, "Failed to create invoice from order");
  }
}

/**
 * Get a list of invoices with optional filters
 */
export async function getInvoices(params?: {
  page?: number;
  perPage?: number;
  clientId?: number;
  kind?: InvoiceKind;
  dateFrom?: string;
  dateTo?: string;
  period?: "this_month" | "last_month" | "this_year" | "last_year" | "more";
  number?: string;
  includePositions?: boolean;
}): Promise<any[]> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const invoices = await client.invoicesJson.get({
      queryParameters: {
        page: params?.page || 1,
        perPage: params?.perPage || 25,
        clientId: params?.clientId,
        kind: params?.kind,
        dateFrom: params?.dateFrom
          ? DateOnly.parse(params.dateFrom)
          : undefined,
        dateTo: params?.dateTo ? DateOnly.parse(params.dateTo) : undefined,
        period: params?.period,
        includePositions: params?.includePositions,
        number: params?.number,
      },
    });

    return invoices?.map(serializeInvoice) || [];
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch invoices");
  }
}

export async function getOverdueInvoicesForClient(
  clientId: string,
): Promise<FakturowniaOverdueCheckResult> {
  await checkFakturowniaEnv();

  const trimmedClientId = clientId?.trim?.();
  if (!trimmedClientId) {
    throw new Error("Fakturownia client ID is required");
  }

  const numericClientId = Number.parseInt(trimmedClientId, 10);
  if (!Number.isFinite(numericClientId)) {
    throw new Error(`Invalid Fakturownia client ID: ${clientId}`);
  }

  const client = await getFakturowniaClient();
  const overdueInvoices: FakturowniaOverdueInvoiceSummary[] = [];
  const today = normalizeDate(new Date());

  for (let page = 1; page <= MAX_INVOICE_PAGES; page++) {
    let invoices: Invoice[] | undefined;
    try {
      invoices = await client.invoicesJson.get({
        queryParameters: {
          clientId: numericClientId,
          page,
          perPage: INVOICE_PAGE_SIZE,
        },
      });
    } catch (error) {
      handleFakturowniaError(
        error,
        "Failed to fetch invoices for overdue check",
      );
    }

    if (!invoices || invoices.length === 0) {
      break;
    }

    for (const invoice of invoices) {
      if (isInvoiceOverdue(invoice, today)) {
        overdueInvoices.push({
          id: invoice.id ?? undefined,
          number: invoice.number ?? undefined,
          status: invoice.status ?? undefined,
          paymentTo: invoice.paymentTo ?? undefined,
          paymentType: invoice.paymentType ?? undefined,
          currency: invoice.currency ?? undefined,
        });
      }

      if (overdueInvoices.length >= MAX_TRACKED_OVERDUE_INVOICES) {
        break;
      }
    }

    if (overdueInvoices.length >= MAX_TRACKED_OVERDUE_INVOICES) {
      break;
    }

    if (invoices.length < INVOICE_PAGE_SIZE) {
      break;
    }
  }

  return {
    hasOverdueInvoices: overdueInvoices.length > 0,
    overdueInvoices,
  };
}

/**
 * Get a specific invoice by ID
 */
export async function getInvoiceById(invoiceId: string): Promise<any> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();
  try {
    const invoice = await client.invoices.byId(invoiceId).get();
    return serializeInvoice(invoice);
  } catch (error) {
    handleFakturowniaError(error, `Failed to fetch invoice ${invoiceId}`);
  }
}

/**
 * Update an existing invoice
 */
export async function updateInvoice(
  invoiceId: string,
  updates: Partial<Invoice>,
): Promise<any> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();
  try {
    const invoice = await client.invoices.byId(invoiceId).put({
      invoice: updates,
    });
    return serializeInvoice(invoice);
  } catch (error) {
    handleFakturowniaError(error, `Failed to update invoice ${invoiceId}`);
  }
}

/**
 * Change invoice status using Fakturownia's dedicated status endpoint
 */
export async function changeInvoiceStatus(
  invoiceId: string,
  status: Invoice_status,
): Promise<any> {
  await checkFakturowniaEnv();

  const { apiKey, baseUrl } = await getFakturowniaConfig();

  try {
    const url = new URL(
      `/invoices/${encodeURIComponent(invoiceId)}/change_status.json`,
      baseUrl,
    );
    url.searchParams.set("api_token", apiKey);
    url.searchParams.set("status", status);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      const responsePayload = tryParseJson<{
        error?: string;
        message?: string;
        messageEscaped?: string;
      }>(responseText);

      throw new Error(
        responsePayload?.error ??
          responsePayload?.messageEscaped ??
          responsePayload?.message ??
          `Request failed with status ${response.status}`,
      );
    }

    const invoice = tryParseJson<Invoice>(responseText);

    return serializeInvoice(invoice);
  } catch (error) {
    handleFakturowniaError(
      error,
      `Failed to change invoice ${invoiceId} status to ${status}`,
    );
  }
}

/**
 * Send invoice by email
 */
export async function sendInvoiceByEmail(params: {
  invoiceId: string;
  recipientEmail?: string;
}): Promise<boolean> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();
  try {
    await client.invoices.byId(params.invoiceId).send_by_emailJson.post({
      queryParameters: {
        emailTo: params.recipientEmail,
      },
    });
    return true;
  } catch (error) {
    handleFakturowniaError(
      error,
      `Failed to send invoice ${params.invoiceId} by email`,
    );
  }
}

/**
 * Download invoice PDF and return as base64
 */
export async function downloadInvoicePdf(params: {
  invoiceId: string;
  invoiceNumber?: string;
  invoiceKind?: InvoiceKind | string;
}): Promise<{ base64: string; filename: string } | undefined> {
  await checkFakturowniaEnv();

  try {
    const invoiceIdNum = parseInt(params.invoiceId, 10);
    if (Number.isNaN(invoiceIdNum)) {
      throw new Error(`Invalid invoice ID: ${params.invoiceId}`);
    }

    const pdfData = await fetchInvoicePdfBytes(invoiceIdNum);

    if (!pdfData) {
      throw new Error("No PDF data received");
    }

    // Convert ArrayBuffer to base64
    const buffer = Buffer.from(pdfData);
    const base64 = buffer.toString("base64");

    // Generate filename using invoice number if available
    const filename = params.invoiceNumber
      ? `faktura_${params.invoiceNumber.replace(/\//g, "_")}.pdf`
      : `faktura_${params.invoiceId}.pdf`;

    return { base64, filename };
  } catch (error) {
    if (
      error instanceof FakturowniaHttpError &&
      params.invoiceKind === "vat" &&
      isFakturowniaPdfPendingResponse(error)
    ) {
      console.warn("[fakturownia] VAT invoice PDF is not ready yet", {
        invoiceId: params.invoiceId,
        status: error.status,
        statusText: error.statusText,
        contentType: error.contentType,
        bodySnippet: error.bodySnippet,
      });
      return undefined;
    }

    if (isValidationError(error)) {
      const errorMessages = formatValidationErrorMessages(error.messageEscaped);
      console.warn(
        `PDF download skipped for invoice ${params.invoiceId}: ${errorMessages || "Validation failed"}`,
      );
      return undefined;
    }

    handleFakturowniaError(
      error,
      `Failed to download PDF for invoice ${params.invoiceId}`,
    );
  }
}

/**
 * Create or update a client in Fakturownia
 */
export async function createClient(params: {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  taxNo?: string;
  street?: string;
  city?: string;
  postCode?: string;
  country?: string;
  company?: "1" | "0";
  defaultPaymentType?: string;
}): Promise<Client | undefined> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const fakturowniaClient = await client.clientsJson.post({
      client: {
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        taxNo: params.taxNo,
        street: params.street,
        city: params.city,
        postCode: params.postCode,
        country: getNormalizedCountryCode(params.country, "PL"),
        company: params.company,
        defaultPaymentType: params.defaultPaymentType,
      },
    });

    return fakturowniaClient;
  } catch (error) {
    handleFakturowniaError(error, "Failed to create client");
  }
}

/**
 * Get a list of clients
 */
export async function getClients(params?: {
  buyerId?: string;
  query?: string;
}): Promise<Client[] | undefined> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const clients = await client.clientsJson.get({
      queryParameters: {
        buyerId: params?.buyerId,
        query: params?.query,
      },
    });

    return clients;
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch clients");
  }
}

/**
 * Get a specific client by ID
 */
export async function getClientById(
  clientId: string,
): Promise<Client | undefined> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const fakturowniaClient = await client.clients.byIdJson(clientId).get();
    return fakturowniaClient;
  } catch (error) {
    handleFakturowniaError(error, `Failed to fetch client ${clientId}`);
  }
}

/**
 * Create a product in Fakturownia
 */
export async function createProduct(params: {
  name: string;
  code?: string;
  description?: string;
  priceNet?: string;
  priceGross?: string;
  tax?: string;
  quantityUnit?: string;
}): Promise<Product | undefined> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const product = await client.productsJson.post({
      product: {
        name: params.name,
        code: params.code,
        description: params.description,
        priceNet: params.priceNet,
        priceGross: params.priceGross,
        tax: params.tax || "23",
        quantityUnit: params.quantityUnit || "szt",
      },
    });

    return product;
  } catch (error) {
    handleFakturowniaError(error, "Failed to create product");
  }
}

/**
 * Get a list of products (paginated - fetches all pages)
 */
export async function getProducts(params?: {
  query?: string;
}): Promise<Product[] | undefined> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const allProducts: Product[] = [];
    let page = 1;
    const maxPages = 100; // Safety limit to prevent infinite loops

    while (page <= maxPages) {
      const products = await client.productsJson.get({
        queryParameters: {
          query: params?.query,
          page,
        },
      });

      if (!products || products.length === 0) {
        break;
      }

      allProducts.push(...products);

      // Fakturownia returns 25 products per page by default
      // If we get fewer than 25, we've reached the last page
      if (products.length < 25) {
        break;
      }

      page++;
    }

    return allProducts;
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch products");
  }
}

export async function getProductsPage(params?: {
  query?: string;
  page?: number;
  categoryId?: number | string;
}): Promise<Product[]> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const normalizedCategoryId =
      typeof params?.categoryId === "string"
        ? Number(params.categoryId)
        : params?.categoryId;

    const products = await client.productsJson.get({
      queryParameters: {
        query: params?.query,
        page: params?.page,
        categoryId: Number.isFinite(normalizedCategoryId)
          ? normalizedCategoryId
          : undefined,
      },
    });

    return products ?? [];
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch products");
    return [];
  }
}

export async function getProductsPageAction(params?: {
  query?: string;
  page?: number;
  categoryId?: number | string;
}): Promise<FakturowniaIntegrationActionResult<Product[]>> {
  try {
    return {
      ok: true,
      data: await getProductsPage(params),
    };
  } catch (error) {
    return {
      ok: false,
      error: toFakturowniaIntegrationActionError(
        error,
        "Failed to fetch products",
      ),
    };
  }
}

/**
 * Get a specific product by ID
 */
export async function getProductById(
  productId: string,
): Promise<Product | undefined> {
  await checkFakturowniaEnv();

  const client = await getFakturowniaClient();

  try {
    const product = await client.products.byIdJson(productId).get();
    return product;
  } catch (error) {
    handleFakturowniaError(error, `Failed to fetch product ${productId}`);
  }
}

/**
 * Search for clients by name or tax number
 */
export async function searchFakturowniaClients(
  query: string,
): Promise<Client[]> {
  await checkFakturowniaEnv();

  const clients = await getClients({ query });

  if (!clients) {
    return [];
  }

  return clients;
}

export async function searchFakturowniaClientsByBuyerId(
  buyerId: string,
): Promise<Client[]> {
  await checkFakturowniaEnv();

  const clients = await getClients({ buyerId });

  if (!clients) {
    return [];
  }

  return clients;
}

/**
 * Search for products by name or code
 */
export async function searchFakturowniaProducts(
  query: string,
): Promise<Product[]> {
  await checkFakturowniaEnv();

  const products = await getProducts({ query });

  if (!products) {
    return [];
  }

  return products;
}

export async function searchFakturowniaProductsAction(
  query: string,
): Promise<FakturowniaIntegrationActionResult<Product[]>> {
  try {
    return {
      ok: true,
      data: await searchFakturowniaProducts(query),
    };
  } catch (error) {
    return {
      ok: false,
      error: toFakturowniaIntegrationActionError(
        error,
        "Failed to fetch products",
      ),
    };
  }
}

/**
 * List all warehouses
 */
export async function listFakturowniaWarehouses(): Promise<Warehouse[]> {
  await checkFakturowniaEnv();

  return listFakturowniaWarehousesCached();
}

async function listFakturowniaWarehousesCached(): Promise<Warehouse[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(FAKTUROWNIA_REFERENCE_DATA_TAG);

  const client = await getFakturowniaClient();

  try {
    const warehouses = await client.warehousesJson.get();
    return warehouses || [];
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch warehouses");
  }
}

/**
 * List all departments
 */
export async function listFakturowniaDepartments(): Promise<Department[]> {
  await checkFakturowniaEnv();

  return listFakturowniaDepartmentsCached();
}

async function listFakturowniaDepartmentsCached(): Promise<Department[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(FAKTUROWNIA_REFERENCE_DATA_TAG);

  const client = await getFakturowniaClient();

  try {
    const departments = await client.departmentsJson.get();
    if (!departments) {
      return [];
    }
    // Return only departments configured with a fiscal printer
    return filter(
      departments,
      (dept) => dept.additionalFields?.mainFiscalPrinter !== "",
    );
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch departments");
  }
}

export async function loadFakturowniaInvoiceReferenceDataAction(): Promise<FakturowniaInvoiceReferenceDataResult> {
  const [warehousesResult, departmentsResult, issuersResult] =
    await Promise.all([
      toReferenceDataResult(
        listFakturowniaWarehouses,
        "Failed to fetch warehouses",
      ),
      toReferenceDataResult(
        listFakturowniaDepartments,
        "Failed to fetch departments",
      ),
      toReferenceDataResult(listFakturowniaIssuers, "Failed to fetch issuers"),
    ]);

  return {
    warehouses: warehousesResult.data,
    departments: departmentsResult.data,
    issuers: issuersResult.data,
    errors: {
      warehouses: warehousesResult.error,
      departments: departmentsResult.error,
      issuers: issuersResult.error,
    },
  };
}

async function toReferenceDataResult<T>(
  loader: () => Promise<T[]>,
  context: string,
): Promise<{ data: T[]; error?: FakturowniaIntegrationActionError }> {
  try {
    return { data: await loader() };
  } catch (error) {
    return {
      data: [],
      error: toFakturowniaIntegrationActionError(error, context),
    };
  }
}

/**
 * Get all issuers from Fakturownia (for auto-populating invoice issuer based on department)
 */
export async function listFakturowniaIssuers(): Promise<Issuer[]> {
  await checkFakturowniaEnv();

  return listFakturowniaIssuersCached();
}

async function listFakturowniaIssuersCached(): Promise<Issuer[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(FAKTUROWNIA_REFERENCE_DATA_TAG);

  const client = await getFakturowniaClient();

  try {
    const issuers = await client.issuersJson.get();
    return issuers || [];
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch issuers");
  }
}

/**
 * Create a VAT invoice from a proforma invoice ID
 */
export async function createVatInvoiceFromProforma(
  proformaId: number,
  sellerPerson?: string,
): Promise<FakturowniaIntegrationActionResult<Invoice>> {
  // Returns a structured result instead of throwing: thrown server-action
  // errors are masked by Next.js in production, hiding Fakturownia's
  // validation messages from the operator.
  try {
    await checkFakturowniaEnv();
    const client = await getFakturowniaClient();
    const context = "Failed to create VAT invoice from Proforma";
    const trimmedSellerPerson = sellerPerson?.trim();

    const invoicePayload: Invoice = {
      copyInvoiceFrom: proformaId,
      kind: "vat",
      ...(trimmedSellerPerson ? { sellerPerson: trimmedSellerPerson } : {}),
    };

    const requestBody: InvoicesPostRequestBody = {
      invoice: invoicePayload,
    };

    try {
      const invoice = await client.invoicesJson.post(requestBody);
      return {
        ok: true,
        data: serializeInvoice(invoice),
      };
    } catch (error) {
      // Classifies the error (incl. parsing 422 validation messages) and
      // rethrows as FakturowniaIntegrationError for the outer catch.
      handleFakturowniaError(error, context);
    }
  } catch (error) {
    return {
      ok: false,
      error: toFakturowniaIntegrationActionError(
        error,
        "Failed to create VAT invoice from Proforma",
      ),
    };
  }
}

const UNPAID_INVOICE_STATUSES: ReadonlySet<Invoice_status> =
  new Set<Invoice_status>(["issued", "sent", "partial"]);
const INVOICE_PAGE_SIZE = 100;
const MAX_INVOICE_PAGES = 5;
const MAX_TRACKED_OVERDUE_INVOICES = 25;

function tryParseJson<T = unknown>(text: string): T | undefined {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.warn("[tryParseJson] Failed to parse JSON payload", error);
    return undefined;
  }
}

function normalizeDate(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function parseInvoiceDueDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
    );
    return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed);
  }

  const dotSeparatedMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotSeparatedMatch) {
    const [, day, month, year] = dotSeparatedMatch;
    const parsed = new Date(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
    );
    return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed);
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return null;
  return normalizeDate(new Date(timestamp));
}

function isInvoiceOverdue(
  invoice: Invoice | undefined,
  referenceDate: Date,
): boolean {
  if (!invoice) return false;
  // Only consider VAT invoices for overdue check
  if (invoice.kind !== "vat") return false;
  const status = invoice.status ?? undefined;
  if (!status || !UNPAID_INVOICE_STATUSES.has(status)) return false;
  const dueDate = parseInvoiceDueDate(invoice.paymentTo);
  if (!dueDate) return false;
  return dueDate.getTime() < referenceDate.getTime();
}

export interface FakturowniaOverdueInvoiceSummary {
  id?: number | null;
  number?: string | null;
  status?: Invoice_status | null;
  paymentTo?: string | null;
  paymentType?: string | null;
  currency?: string | null;
}

export interface FakturowniaOverdueCheckResult {
  hasOverdueInvoices: boolean;
  overdueInvoices: FakturowniaOverdueInvoiceSummary[];
}

export async function listFakturowniaCategories(): Promise<Category[]> {
  await checkFakturowniaEnv();

  return listFakturowniaCategoriesCached();
}

async function listFakturowniaCategoriesCached(): Promise<Category[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(FAKTUROWNIA_REFERENCE_DATA_TAG);

  const client = await getFakturowniaClient();

  try {
    const categories = await client.categoriesJson.get();
    return categories ?? [];
  } catch (error) {
    handleFakturowniaError(error, "Failed to fetch categories");
    return [];
  }
}
