import { createHash } from "node:crypto";
import type {
  FakturowniaCostCurrencyConversion,
  FakturowniaCostEvidence,
  FakturowniaCostMapping,
  FakturowniaCostPackaging,
} from "@konfi/types";
import type {
  Invoice,
  InvoicePosition,
} from "@konfi/fakturownia/out/client/models";

/** Base currency cost accounting normalizes every invoice amount into. */
export const FAKTUROWNIA_COST_BASE_CURRENCY = "PLN";

export interface NormalizedFakturowniaCostEvidenceInput {
  createdBy: {
    id: string;
    name: string;
  };
  invoice: Invoice;
  position: InvoicePosition;
  positionIndex: number;
  tenantId?: string;
}

export interface FakturowniaCostMappingSuggestionInput {
  aliases?: string[];
  attributeId?: string;
  attributeName?: string;
  combinationId?: string;
  confidence: number;
  createdBy: {
    id: string;
    name: string;
  };
  evidence: FakturowniaCostEvidence;
  optionLabel?: string;
  optionValue?: string;
  packaging?: FakturowniaCostPackaging;
  productId?: string;
  productName?: string;
  reasoning?: string;
  sourceSignals: string[];
  supplierId?: string;
  supplierName?: string;
  tenantId?: string;
}

function readDateOnly(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    const date = value as {
      day?: unknown;
      month?: unknown;
      toString?: () => string;
      year?: unknown;
    };

    if (
      typeof date.year === "number" &&
      typeof date.month === "number" &&
      typeof date.day === "number"
    ) {
      return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    }

    const stringValue = date.toString?.();
    if (stringValue && stringValue !== "[object Object]") {
      return stringValue;
    }
  }

  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(
      value.replace(/\s+/g, "").replace(",", "."),
    );
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function roundedCurrency(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 100) / 100;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

/**
 * Derive the PLN-per-1-unit rate for a non-PLN invoice from the invoice itself.
 * Prefer the official `exchangeRate`/`exchangeRateDen` (the den may be "1" or
 * "100", e.g. a per-100 quote), falling back to the "own" rate pair. Returns
 * undefined when no usable rate is present so callers never fabricate one.
 */
function ratePerUnitFromInvoice(invoice: Invoice): number | undefined {
  const exchangeRate = finiteNumber(invoice.exchangeRate);
  if (exchangeRate !== undefined) {
    const den = finiteNumber(invoice.exchangeRateDen) ?? 1;
    if (den !== 0) {
      return exchangeRate / den;
    }
  }

  const ownRate = finiteNumber(invoice.exchangeCurrencyRate);
  if (ownRate !== undefined) {
    const ownDen = finiteNumber(invoice.exchangeCurrencyRateDen) ?? 1;
    if (ownDen !== 0) {
      return ownRate / ownDen;
    }
  }

  return undefined;
}

/**
 * Build the optional currency conversion for an evidence row. Signs are
 * preserved throughout so correction (negative) amounts net out downstream.
 * - PLN invoices get an explicit identity conversion (rate 1).
 * - Non-PLN invoices with a usable invoice rate get converted base amounts.
 * - Non-PLN invoices without a usable rate record source "unavailable" and omit
 *   the `*Base` amounts; we never invent a rate.
 */
function buildCostCurrencyConversion(input: {
  currency: string;
  invoice: Invoice;
  totalPriceGross: number | undefined;
  totalPriceNet: number | undefined;
  unitCostGross: number | undefined;
  unitCostNet: number | undefined;
}): FakturowniaCostCurrencyConversion | undefined {
  if (input.currency === FAKTUROWNIA_COST_BASE_CURRENCY) {
    return {
      baseCurrency: FAKTUROWNIA_COST_BASE_CURRENCY,
      exchangeRate: 1,
      source: "identity",
      ...(input.totalPriceGross !== undefined
        ? { totalPriceGrossBase: input.totalPriceGross }
        : {}),
      ...(input.totalPriceNet !== undefined
        ? { totalPriceNetBase: input.totalPriceNet }
        : {}),
      ...(input.unitCostGross !== undefined
        ? { unitCostGrossBase: input.unitCostGross }
        : {}),
      ...(input.unitCostNet !== undefined
        ? { unitCostNetBase: input.unitCostNet }
        : {}),
    };
  }

  const ratePerUnit = ratePerUnitFromInvoice(input.invoice);
  if (ratePerUnit === undefined) {
    // No usable rate on the invoice: record that conversion was attempted and
    // failed (so downstream knows base amounts are intentionally absent) but
    // never fabricate a rate. `exchangeRate` is required by the type, so 0 is
    // used purely as a sentinel paired with source "unavailable".
    return {
      baseCurrency: FAKTUROWNIA_COST_BASE_CURRENCY,
      exchangeRate: 0,
      source: "unavailable",
    };
  }

  const rateDate = readDateOnly(input.invoice.exchangeDate);

  return {
    baseCurrency: FAKTUROWNIA_COST_BASE_CURRENCY,
    exchangeRate: ratePerUnit,
    ...(rateDate ? { rateDate } : {}),
    source: "fakturownia_invoice",
    ...(input.totalPriceGross !== undefined
      ? {
          totalPriceGrossBase: roundedCurrency(
            input.totalPriceGross * ratePerUnit,
          ),
        }
      : {}),
    ...(input.totalPriceNet !== undefined
      ? {
          totalPriceNetBase: roundedCurrency(input.totalPriceNet * ratePerUnit),
        }
      : {}),
    ...(input.unitCostGross !== undefined
      ? {
          unitCostGrossBase: roundedCurrency(input.unitCostGross * ratePerUnit),
        }
      : {}),
    ...(input.unitCostNet !== undefined
      ? { unitCostNetBase: roundedCurrency(input.unitCostNet * ratePerUnit) }
      : {}),
  };
}

export function normalizeFakturowniaCostNip(
  value: string | undefined,
): string | undefined {
  const normalized = value?.replace(/\D/g, "");
  return normalized || undefined;
}

export function normalizeFakturowniaCostText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildFakturowniaCostEvidenceId(input: {
  invoiceId: string | number;
  positionIndex: number;
}): string {
  return `${input.invoiceId}-${input.positionIndex}`;
}

export function buildFakturowniaCostMappingId(evidenceId: string): string {
  return `${evidenceId}-suggestion`;
}

const MAX_FIRESTORE_ID_BYTES = 1500;

export function buildFakturowniaCostDecisionKey(input: {
  normalizedText: string;
  supplierNip?: string;
  supplierName?: string;
  tenantId?: string;
}): string {
  const supplierSegment =
    normalizeFakturowniaCostNip(input.supplierNip) ||
    (input.supplierName
      ? normalizeFakturowniaCostText(input.supplierName)
      : "") ||
    "nosupplier";
  const rawKey = `${input.tenantId ? `${input.tenantId}::` : ""}${supplierSegment}::${input.normalizedText}`;
  // Firestore document ids cannot contain "/" nor be "." / ".." / "__*__".
  // Normalized text and nips only produce a-z0-9 and spaces, so swapping "/"
  // for "_" and guarding the reserved prefix keeps the key valid and readable.
  const safeKey = rawKey
    .replace(/\//g, "_")
    .replace(/^(\.+|__)/, (match) => "_".repeat(match.length));

  if (Buffer.byteLength(safeKey, "utf8") <= MAX_FIRESTORE_ID_BYTES) {
    return safeKey;
  }

  const hash = createHash("sha1").update(safeKey, "utf8").digest("hex");
  const prefixBudget = MAX_FIRESTORE_ID_BYTES - hash.length - 1;
  const prefix = Buffer.from(safeKey, "utf8")
    .subarray(0, prefixBudget)
    .toString("utf8");

  return `${prefix}-${hash}`;
}

export function normalizeFakturowniaCostEvidence(
  input: NormalizedFakturowniaCostEvidenceInput,
): FakturowniaCostEvidence | null {
  const invoiceId = optionalString(input.invoice.id);
  if (!invoiceId) {
    return null;
  }

  const positionName = optionalString(input.position.name);
  const positionDescription = optionalString(input.position.description);
  const positionCode = optionalString(input.position.code);
  const fakturowniaProductId = optionalString(input.position.productId);
  const sourcePositionId = optionalString(
    (input.position as { id?: unknown }).id,
  );
  const invoiceKind: FakturowniaCostEvidence["invoiceKind"] =
    input.invoice.kind === "correction" || input.invoice.correction === true
      ? "correction"
      : "regular";
  const quantity = finiteNumber(input.position.quantity) ?? 1;
  // Corrections carry negative positions (negative quantity and negative
  // amounts). Divide totals by the quantity MAGNITUDE so the per-unit cost has
  // the right size; the sign already lives in the (negative) total/price and is
  // therefore preserved on the resulting unit cost. The previous
  // `quantity > 0 ? quantity : 1` collapsed negative quantities to 1, which
  // distorted the per-unit cost (e.g. -1250 / 1 instead of -1250 / 2.5). A zero
  // quantity still falls back to 1 to avoid dividing by zero.
  const safeQuantity = quantity !== 0 ? Math.abs(quantity) : 1;
  const priceNet = roundedCurrency(finiteNumber(input.position.priceNet));
  const priceGross = roundedCurrency(finiteNumber(input.position.priceGross));
  const totalPriceNet = roundedCurrency(
    finiteNumber(input.position.totalPriceNet) ??
      (priceNet !== undefined ? priceNet * safeQuantity : undefined),
  );
  const totalPriceGross = roundedCurrency(
    finiteNumber(input.position.totalPriceGross) ??
      (priceGross !== undefined ? priceGross * safeQuantity : undefined),
  );
  const unitCostGross =
    totalPriceGross !== undefined
      ? roundedCurrency(totalPriceGross / safeQuantity)
      : undefined;
  const unitCostNet =
    totalPriceNet !== undefined
      ? roundedCurrency(totalPriceNet / safeQuantity)
      : undefined;
  const currency =
    optionalString(input.invoice.currency)?.toUpperCase() ??
    FAKTUROWNIA_COST_BASE_CURRENCY;
  const conversion = buildCostCurrencyConversion({
    currency,
    invoice: input.invoice,
    totalPriceGross,
    totalPriceNet,
    unitCostGross,
    unitCostNet,
  });
  const textParts = [
    positionName,
    positionCode,
    positionDescription,
    fakturowniaProductId,
  ].filter((part): part is string => Boolean(part));

  const id = buildFakturowniaCostEvidenceId({
    invoiceId,
    positionIndex: input.positionIndex,
  });
  const timestamp =
    new Date() as unknown as FakturowniaCostEvidence["createdAt"];

  return {
    active: true,
    ...(conversion ? { conversion } : {}),
    createdAt: timestamp,
    createdBy: input.createdBy,
    currency,
    id,
    invoice: {
      id: invoiceId,
      ...(readDateOnly(input.invoice.issueDate)
        ? { issueDate: readDateOnly(input.invoice.issueDate) }
        : {}),
      ...(optionalString(input.invoice.number)
        ? { number: optionalString(input.invoice.number) }
        : {}),
      ...(readDateOnly(input.invoice.sellDate)
        ? { sellDate: readDateOnly(input.invoice.sellDate) }
        : {}),
    },
    invoiceKind,
    name: positionName ?? positionCode ?? id,
    normalizedText: normalizeFakturowniaCostText(textParts.join(" ")),
    position: {
      ...(positionCode ? { code: positionCode } : {}),
      ...(positionDescription ? { description: positionDescription } : {}),
      ...(fakturowniaProductId ? { fakturowniaProductId } : {}),
      index: input.positionIndex,
      ...(positionName ? { name: positionName } : {}),
    },
    quantity: safeQuantity,
    ...(optionalString(input.position.quantityUnit)
      ? { quantityUnit: optionalString(input.position.quantityUnit) }
      : {}),
    ...(priceGross !== undefined ? { priceGross } : {}),
    ...(priceNet !== undefined ? { priceNet } : {}),
    source: "fakturownia",
    ...(sourcePositionId ? { sourcePositionId } : {}),
    supplier: {
      ...(optionalString(input.invoice.clientId)
        ? { clientId: optionalString(input.invoice.clientId) }
        : {}),
      ...((optionalString(input.invoice.buyerName) ?? optionalString(input.invoice.sellerName))
        ? { name: optionalString(input.invoice.buyerName) ?? optionalString(input.invoice.sellerName) }
        : {}),
      ...((optionalString(input.invoice.buyerTaxNo) ?? optionalString(input.invoice.sellerTaxNo))
        ? { nip: optionalString(input.invoice.buyerTaxNo) ?? optionalString(input.invoice.sellerTaxNo) }
        : {}),
    },
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(totalPriceGross !== undefined ? { totalPriceGross } : {}),
    ...(totalPriceNet !== undefined ? { totalPriceNet } : {}),
    ...(unitCostGross !== undefined ? { unitCostGross } : {}),
    ...(unitCostNet !== undefined ? { unitCostNet } : {}),
    updatedAt: timestamp,
    updatedBy: input.createdBy,
  };
}

export function buildFakturowniaCostMappingSuggestion(
  input: FakturowniaCostMappingSuggestionInput,
): FakturowniaCostMapping {
  const aliases = [
    ...(input.aliases ?? []),
    input.evidence.position.name,
    input.evidence.position.code,
    input.evidence.position.fakturowniaProductId,
  ].filter((value): value is string => Boolean(value?.trim()));
  const supplierNip = normalizeFakturowniaCostNip(input.evidence.supplier.nip);

  return {
    active: true,
    aliases: Array.from(new Set(aliases)),
    ...(input.attributeId ? { attributeId: input.attributeId } : {}),
    ...(input.attributeName ? { attributeName: input.attributeName } : {}),
    ...(input.combinationId ? { combinationId: input.combinationId } : {}),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    createdAt: new Date() as unknown as FakturowniaCostMapping["createdAt"],
    createdBy: input.createdBy,
    evidenceId: input.evidence.id,
    id: buildFakturowniaCostMappingId(input.evidence.id),
    ...(input.evidence.invoice.issueDate
      ? { issueDate: input.evidence.invoice.issueDate }
      : {}),
    name: `${input.evidence.name} cost mapping`,
    ...(input.evidence.normalizedText
      ? { normalizedText: input.evidence.normalizedText }
      : {}),
    ...(input.optionLabel ? { optionLabel: input.optionLabel } : {}),
    ...(input.optionValue ? { optionValue: input.optionValue } : {}),
    ...(input.packaging ? { packaging: input.packaging } : {}),
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.productName ? { productName: input.productName } : {}),
    ...(input.reasoning ? { reasoning: input.reasoning } : {}),
    sourceSignals: Array.from(new Set(input.sourceSignals)),
    status: "pending",
    ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    ...(input.supplierName ? { supplierName: input.supplierName } : {}),
    ...(supplierNip ? { supplierNip } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    updatedAt: new Date() as unknown as FakturowniaCostMapping["updatedAt"],
    updatedBy: input.createdBy,
  };
}
