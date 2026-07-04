import type { TenantOwned } from "../tenant";
import type { Base } from "../base";

export type FakturowniaCostUnit = "piece" | "area_m2" | "sheet" | "metre";

/**
 * Packaging / purchase-unit metadata captured from an approved cost entry or
 * AI match, used to derive a canonical per-unit cost via `deriveCanonicalCost`.
 */
export interface FakturowniaCostPackaging {
  /** Raw purchase-unit string from the invoice (e.g. "ryza", "rolka", "m2"). */
  purchaseUnit?: string;
  /** Number of sheets per pack/ream, used to amortise the per-ream price. */
  sheetsPerPack?: number;
  /** Width of a single sheet in millimetres. */
  sheetWidthMm?: number;
  /** Height of a single sheet in millimetres. */
  sheetHeightMm?: number;
  /** Roll width in millimetres, used with rollLengthM to compute area. */
  rollWidthMm?: number;
  /** Roll length in metres, used with rollWidthMm to compute area. */
  rollLengthM?: number;
  /** Material thickness in microns (informational, not used in cost maths). */
  thicknessMicron?: number;
  /** True when the packaging was entered/edited by a human in the cost review UI (so a later AI re-extraction should not silently clobber it). */
  manual?: boolean;
}

export type FakturowniaCostMappingStatus = "pending" | "approved" | "rejected";

/**
 * Whether a Fakturownia expense invoice is a regular cost invoice or a
 * correction (faktura korygująca). Correction positions can be negative and
 * must net out against the original cost rather than adding new cost lines.
 */
export type FakturowniaCostInvoiceKind = "regular" | "correction";

export interface FakturowniaCostSupplierSummary {
  clientId?: string;
  name?: string;
  nip?: string;
  supplierId?: string;
}

export interface FakturowniaCostProductLink {
  attributeId?: string;
  attributeName?: string;
  combinationId?: string;
  optionLabel?: string;
  optionValue?: string;
  productId: string;
  productName?: string;
}

/**
 * Currency normalization applied to a cost figure so that amounts in different
 * invoice currencies can be aggregated and compared in a single base currency
 * (PLN by default). The exchange rate is captured at the invoice issue date.
 */
export interface FakturowniaCostCurrencyConversion {
  /** Base currency the amounts were converted into (e.g. "PLN"). */
  baseCurrency: string;
  /** Units of base currency per one unit of the invoice currency. */
  exchangeRate: number;
  /** Date (YYYY-MM-DD) the exchange rate was sourced for. */
  rateDate?: string;
  /** Provider/source of the exchange rate, for audit. */
  source?: string;
  /** Net unit cost expressed in the base currency. */
  unitCostNetBase?: number;
  /** Gross unit cost expressed in the base currency. */
  unitCostGrossBase?: number;
  /** Net total expressed in the base currency. */
  totalPriceNetBase?: number;
  /** Gross total expressed in the base currency. */
  totalPriceGrossBase?: number;
}

export interface FakturowniaCostSourceInvoice {
  id: string;
  issueDate?: string;
  number?: string;
  sellDate?: string;
}

export interface FakturowniaCostPositionSummary {
  code?: string;
  description?: string;
  fakturowniaProductId?: string;
  index: number;
  name?: string;
}

export interface FakturowniaCostEvidence extends Base, TenantOwned {
  /** Conversion of this evidence's amounts into the base currency. */
  conversion?: FakturowniaCostCurrencyConversion;
  currency: string;
  /** Regular cost invoice or a correction (faktura korygująca). */
  invoiceKind?: FakturowniaCostInvoiceKind;
  invoice: FakturowniaCostSourceInvoice;
  normalizedText: string;
  position: FakturowniaCostPositionSummary;
  priceGross?: number;
  priceNet?: number;
  quantity: number;
  quantityUnit?: string;
  source: "fakturownia" | "manual";
  /** Fakturownia position id, when available — a stable per-position key. */
  sourcePositionId?: string;
  supplier: FakturowniaCostSupplierSummary;
  totalPriceGross?: number;
  totalPriceNet?: number;
  unitCostGross?: number;
  unitCostNet?: number;
}

export interface FakturowniaCostMapping extends Base, TenantOwned {
  aliases: string[];
  attributeId?: string;
  attributeName?: string;
  combinationId?: string;
  confidence: number;
  evidenceId: string;
  /** Packaging metadata captured at match time, used to derive canonical cost. */
  packaging?: FakturowniaCostPackaging;
  /**
   * Issue date (YYYY-MM-DD) denormalized from the evidence invoice so cost
   * queries can filter by date inside Firestore instead of post-filtering a
   * truncated page.
   */
  issueDate?: string;
  /** Normalized matching text denormalized from evidence for the learning loop. */
  normalizedText?: string;
  optionLabel?: string;
  optionValue?: string;
  /** Product IDs denormalized from productLinks for product cost queries. */
  productIds?: string[];
  /**
   * Products this cost is attached to. Legacy productId/productName fields
   * mirror the first link for older readers and Firestore documents.
   */
  productLinks?: FakturowniaCostProductLink[];
  productId?: string;
  productName?: string;
  /**
   * When true the mapping has been confirmed as a reference cost — retained for
   * informational purposes only. Reference mappings have no productId and no
   * attributeId/optionValue; they are excluded from all cost rollups and the
   * shared-material cost reads.
   */
  reference?: boolean;
  /** Short human-readable reason from the AI matcher, surfaced during review. */
  reasoning?: string;
  sourceSignals: string[];
  status: FakturowniaCostMappingStatus;
  supplierId?: string;
  supplierName?: string;
  /** Normalized supplier NIP denormalized from evidence for the learning loop. */
  supplierNip?: string;
}

/**
 * A reusable decision learned from an approval or rejection, keyed by the
 * normalized invoice-line text + supplier, so identical lines on future
 * invoices can be auto-applied (approved) or suppressed (rejected) without a
 * fresh AI call.
 */
export interface FakturowniaCostDecisionMemory extends Base, TenantOwned {
  attributeId?: string;
  attributeName?: string;
  /** Key: `${tenantId::}${supplierNip|supplierText}::${normalizedText}`. */
  decisionKey: string;
  decision: "approved" | "rejected";
  normalizedText: string;
  optionLabel?: string;
  optionValue?: string;
  productIds?: string[];
  productLinks?: FakturowniaCostProductLink[];
  productId?: string;
  productName?: string;
  /** Mirrors FakturowniaCostMapping.reference — set when the approval was "save as reference". */
  reference?: boolean;
  supplierNip?: string;
  supplierName?: string;
}

/**
 * Maintained per product (and optionally per attribute option) on approval so
 * cost/margin reads don't recompute from raw entries every time.
 */
export interface FakturowniaProductCostRollupBucket {
  attributeId?: string;
  optionValue?: string;
  /** Number of approved cost entries in this bucket. */
  sampleCount: number;
  /** Latest approved net unit cost in base currency. */
  latestUnitCostNetBase?: number;
  /** Average approved net unit cost in base currency. */
  averageUnitCostNetBase?: number;
  /** Issue date (YYYY-MM-DD) of the latest entry. */
  latestIssueDate?: string;
  /** Net unit cost of the entry just before the latest, for trend display. */
  previousUnitCostNetBase?: number;
  /** Purchase-unit basis of this bucket's cost, derived from the latest contributing approved entry's quantityUnit. */
  costUnit?: FakturowniaCostUnit;
  /** Width of the purchase sheet in millimetres, denormalised from the latest approved entry's packaging. */
  sheetWidthMm?: number;
  /** Height of the purchase sheet in millimetres, denormalised from the latest approved entry's packaging. */
  sheetHeightMm?: number;
  /** Full packaging metadata from the latest contributing approved entry, used to derive a human-readable description. */
  packaging?: FakturowniaCostPackaging;
}

export interface FakturowniaProductCostRollup extends Base, TenantOwned {
  baseCurrency: string;
  productId: string;
  productName?: string;
  /** Whole-product rollup (no attribute/option breakdown). */
  overall: FakturowniaProductCostRollupBucket;
  /** Per attribute-option rollups, keyed by `${attributeId}:${optionValue}`. */
  byAttributeOption?: Record<string, FakturowniaProductCostRollupBucket>;
}

/**
 * Groups multiple attributes (and optionally aliases option values) so they are
 * treated as a single material dimension during cost aggregation. Read-only on
 * the approval side — only the live material cost read uses groups.
 */
export interface FakturowniaMaterialGroup extends Base, TenantOwned {
  name: string;
  /** IDs of the attributes that share this material dimension. */
  attributeIds: string[];
  /**
   * Maps variant option values to a canonical option value so costs for
   * e.g. "rilam70" (under Laminowanie) can unify with "rilam70" (under Materiał).
   * Key: variantOptionValue, value: canonicalOptionValue.
   */
  valueAliases?: Record<string, string>;
}

export interface FakturowniaCostRecipeComponent {
  attributeId: string;
  optionValue: string;
  /** Multiplier applied after converting this component into the item total. */
  factor?: number;
}

/**
 * Composes one target attribute option from several already-approved material
 * costs. Used by admin margin/cost reads; approval and product rollups remain
 * atomic evidence samples.
 */
export interface FakturowniaCostRecipe extends Base, TenantOwned {
  name: string;
  targetAttributeId: string;
  targetOptionValue: string;
  components: FakturowniaCostRecipeComponent[];
}

export interface ApprovedFakturowniaCostEntry {
  attributeId?: string;
  attributeName?: string;
  combinationId?: string;
  confidence: number;
  /** Currency normalization of the underlying evidence amounts. */
  conversion?: FakturowniaCostCurrencyConversion;
  currency: string;
  evidenceId: string;
  /** Packaging metadata propagated from the approved mapping, used for canonical cost derivation. */
  packaging?: FakturowniaCostPackaging;
  invoice: FakturowniaCostSourceInvoice;
  invoiceKind?: FakturowniaCostInvoiceKind;
  optionLabel?: string;
  optionValue?: string;
  position: FakturowniaCostPositionSummary;
  productIds?: string[];
  productLinks?: FakturowniaCostProductLink[];
  productId?: string;
  productName?: string;
  quantity: number;
  quantityUnit?: string;
  reasoning?: string;
  sourceSignals: string[];
  supplier: FakturowniaCostSupplierSummary;
  totalPriceGross?: number;
  totalPriceNet?: number;
  unitCostGross?: number;
  unitCostNet?: number;
}
