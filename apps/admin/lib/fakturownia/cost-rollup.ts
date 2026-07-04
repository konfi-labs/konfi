import type {
  ApprovedFakturowniaCostEntry,
  Base,
  FakturowniaCostPackaging,
  FakturowniaCostUnit,
  FakturowniaProductCostRollup,
  FakturowniaProductCostRollupBucket,
} from "@konfi/types";
import { deriveCanonicalCost } from "@konfi/utils";

/**
 * The compute helper returns the rollup payload WITHOUT the persistence/audit
 * envelope (`Base`) or `tenantId`; the server layer merges those in when it
 * upserts the document.
 */
export type ComputedProductCostRollup = Omit<
  FakturowniaProductCostRollup,
  keyof Base | "tenantId"
>;

export interface ComputeProductCostRollupInput {
  baseCurrency: string;
  entries: ApprovedFakturowniaCostEntry[];
  productId: string;
  productName?: string;
}

interface UsableEntry {
  costUnit?: FakturowniaCostUnit;
  evidenceId: string;
  issueDate?: string;
  packaging?: FakturowniaCostPackaging;
  sheetHeightMm?: number;
  sheetWidthMm?: number;
  unitCostNetBase: number;
}

/**
 * Builds the deterministic Firestore doc id for a product cost rollup. Plain
 * `productId` when there is no tenant, otherwise `${tenantId}__${productId}` so
 * the same product in different tenants never collides on a shared collection.
 */
export function buildProductCostRollupId(
  productId: string,
  tenantId?: string,
): string {
  return tenantId ? `${tenantId}__${productId}` : productId;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Resolves an entry's net unit cost in the base currency:
 *  - prefer the explicit converted figure (`conversion.unitCostNetBase`),
 *  - else fall back to the raw `unitCostNet` ONLY when the entry currency already
 *    equals the base currency (no conversion needed),
 *  - else return undefined so the entry is skipped (we never aggregate an
 *    unconverted foreign amount into a base-currency average).
 *
 * Corrections carry negative base costs and are returned with their sign so they
 * net out against the originals during aggregation.
 */
function resolveUnitCostNetBase(
  entry: ApprovedFakturowniaCostEntry,
  baseCurrency: string,
): number | undefined {
  const converted = entry.conversion?.unitCostNetBase;
  if (typeof converted === "number" && Number.isFinite(converted)) {
    return converted;
  }

  if (
    entry.currency === baseCurrency &&
    typeof entry.unitCostNet === "number" &&
    Number.isFinite(entry.unitCostNet)
  ) {
    return entry.unitCostNet;
  }

  return undefined;
}

/**
 * Orders usable entries oldest -> newest by issue date, breaking ties on
 * `evidenceId` so the latest/previous selection is stable across runs. Entries
 * without an issue date sort first (treated as oldest).
 */
function sortByIssueDate(left: UsableEntry, right: UsableEntry): number {
  const leftDate = left.issueDate ?? "";
  const rightDate = right.issueDate ?? "";
  if (leftDate !== rightDate) {
    return leftDate < rightDate ? -1 : 1;
  }
  return left.evidenceId.localeCompare(right.evidenceId);
}

function buildBucket(
  entries: UsableEntry[],
  identity: { attributeId?: string; optionValue?: string } = {},
): FakturowniaProductCostRollupBucket {
  if (entries.length === 0) {
    return {
      ...(identity.attributeId ? { attributeId: identity.attributeId } : {}),
      ...(identity.optionValue ? { optionValue: identity.optionValue } : {}),
      sampleCount: 0,
    };
  }

  const sorted = entries.toSorted(sortByIssueDate);
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
  const average =
    sorted.length === 1
      ? sorted[0].unitCostNetBase
      : round2(
          sorted.reduce((sum, entry) => sum + entry.unitCostNetBase, 0) /
            sorted.length,
        );

  return {
    ...(identity.attributeId ? { attributeId: identity.attributeId } : {}),
    averageUnitCostNetBase: average,
    ...(latest.costUnit ? { costUnit: latest.costUnit } : {}),
    ...(latest.issueDate ? { latestIssueDate: latest.issueDate } : {}),
    latestUnitCostNetBase: latest.unitCostNetBase,
    ...(identity.optionValue ? { optionValue: identity.optionValue } : {}),
    ...(previous
      ? { previousUnitCostNetBase: previous.unitCostNetBase }
      : {}),
    sampleCount: sorted.length,
    ...(latest.sheetWidthMm !== undefined
      ? { sheetWidthMm: latest.sheetWidthMm }
      : {}),
    ...(latest.sheetHeightMm !== undefined
      ? { sheetHeightMm: latest.sheetHeightMm }
      : {}),
    ...(latest.packaging !== undefined
      ? { packaging: latest.packaging }
      : {}),
  };
}

/**
 * Pure aggregation of approved cost entries into a per-product rollup (overall +
 * optional per attribute-option buckets). See {@link resolveUnitCostNetBase} for
 * conversion/foreign-skip semantics and correction netting. Robust to an empty
 * entry list (returns an overall bucket with `sampleCount` 0 and no numeric
 * fields).
 */
export function computeProductCostRollup(
  input: ComputeProductCostRollupInput,
): ComputedProductCostRollup {
  const usable: UsableEntry[] = [];
  const byKey = new Map<
    string,
    { attributeId: string; entries: UsableEntry[]; optionValue: string }
  >();

  for (const entry of input.entries) {
    const raw = resolveUnitCostNetBase(entry, input.baseCurrency);
    if (raw === undefined) {
      continue;
    }

    const canonical = deriveCanonicalCost({
      rawUnitCostNetBase: raw,
      quantityUnit: entry.quantityUnit,
      packaging: entry.packaging,
    });
    if (canonical === undefined) {
      continue;
    }

    const usableEntry: UsableEntry = {
      ...(canonical.costUnit ? { costUnit: canonical.costUnit } : {}),
      evidenceId: entry.evidenceId,
      ...(entry.invoice.issueDate
        ? { issueDate: entry.invoice.issueDate }
        : {}),
      ...(entry.packaging !== undefined
        ? { packaging: entry.packaging }
        : {}),
      ...(canonical.sheetWidthMm !== undefined
        ? { sheetWidthMm: canonical.sheetWidthMm }
        : {}),
      ...(canonical.sheetHeightMm !== undefined
        ? { sheetHeightMm: canonical.sheetHeightMm }
        : {}),
      unitCostNetBase: canonical.unitCostNetBase,
    };
    usable.push(usableEntry);

    if (entry.attributeId && entry.optionValue) {
      const key = `${entry.attributeId}:${entry.optionValue}`;
      const group = byKey.get(key) ?? {
        attributeId: entry.attributeId,
        entries: [],
        optionValue: entry.optionValue,
      };
      group.entries.push(usableEntry);
      byKey.set(key, group);
    }
  }

  const byAttributeOption: Record<string, FakturowniaProductCostRollupBucket> =
    {};
  for (const [key, group] of byKey) {
    byAttributeOption[key] = buildBucket(group.entries, {
      attributeId: group.attributeId,
      optionValue: group.optionValue,
    });
  }
  const hasGroups = Object.keys(byAttributeOption).length > 0;

  return {
    baseCurrency: input.baseCurrency,
    ...(hasGroups ? { byAttributeOption } : {}),
    overall: buildBucket(usable),
    productId: input.productId,
    ...(input.productName ? { productName: input.productName } : {}),
  };
}
