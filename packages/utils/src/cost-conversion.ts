import { calculateUnitsPerSheet, calculateSheetsNeeded } from "./sheet-calculations";
import type { CustomSizeWithQuantity, FakturowniaCostPackaging } from "@konfi/types";
import type { FakturowniaCostUnit } from "@konfi/types";

/**
 * Normalize a raw Fakturownia quantityUnit string to a FakturowniaCostUnit.
 * Lowercases the input and strips dots and spaces before matching.
 */
export function normalizeFakturowniaCostUnit(
  raw: string | undefined | null,
): FakturowniaCostUnit | undefined {
  if (!raw) return undefined;

  // Strip diacritics (ż→z, ą→a, …) and the non-decomposing ł so Polish unit
  // spellings like "metr bieżący" normalize to a comparable ASCII form.
  const normalized = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[\s.]/g, "");

  if (normalized === "m2" || normalized === "m²" || normalized === "mkw") {
    return "area_m2";
  }

  if (
    normalized === "szt" ||
    normalized === "sztuka" ||
    normalized === "pcs" ||
    normalized === "pc" ||
    normalized === "stk" ||
    normalized === "ea"
  ) {
    return "piece";
  }

  if (
    normalized === "ark" ||
    normalized === "arkusz" ||
    normalized === "arkusze" ||
    normalized === "sheet"
  ) {
    return "sheet";
  }

  if (
    normalized === "mb" ||
    normalized === "rm" ||
    normalized === "metrbiezacy"
  ) {
    return "metre";
  }

  return undefined;
}

export interface CostConversionGeometry {
  quantity: number;
  width?: number | null;
  height?: number | null;
  customSizes?: CustomSizeWithQuantity[] | null;
  bleed?: number | null;
  sheet?: {
    sheetWidth: number;
    sheetHeight: number;
    margin?: number;
    bleed?: number;
  } | null;
  unitsPerSheetOverride?: number | null;
}

/**
 * Returns the TOTAL net cost in PLN for the whole configured line (all quantity),
 * or undefined if not computable.
 */
export function convertUnitCostToItemTotal(
  basis: FakturowniaCostUnit,
  unitCost: number,
  geo: CostConversionGeometry,
): number | undefined {
  if (!Number.isFinite(unitCost)) return undefined;

  if (basis === "piece") {
    const totalPieces =
      geo.customSizes && geo.customSizes.length > 0
        ? geo.customSizes.reduce((sum, s) => sum + s.quantity, 0)
        : geo.quantity;
    return unitCost * totalPieces;
  }

  if (basis === "area_m2") {
    const bleed = geo.bleed ?? 0;
    const sizes: Array<{ width: number; height: number; quantity: number }> =
      geo.customSizes && geo.customSizes.length > 0
        ? geo.customSizes
        : [
            {
              width: geo.width ?? 0,
              height: geo.height ?? 0,
              quantity: geo.quantity,
            },
          ];

    let totalArea = 0;
    for (const s of sizes) {
      const w = s.width + bleed;
      const h = s.height + bleed;
      // Skip blank/partial size rows; the totalArea check below returns
      // undefined only when nothing usable remains.
      if (w <= 0 || h <= 0) continue;
      totalArea += (w * h / 1_000_000) * s.quantity;
    }

    if (totalArea <= 0) return undefined;
    return totalArea * unitCost;
  }

  if (basis === "sheet") {
    let unitsPerSheet: number | undefined;

    if (geo.unitsPerSheetOverride && geo.unitsPerSheetOverride > 0) {
      unitsPerSheet = geo.unitsPerSheetOverride;
    } else if (geo.sheet) {
      unitsPerSheet = calculateUnitsPerSheet({
        sheetWidth: geo.sheet.sheetWidth,
        sheetHeight: geo.sheet.sheetHeight,
        itemWidth: geo.width ?? 0,
        itemHeight: geo.height ?? 0,
        margin: geo.sheet.margin,
        bleed: geo.sheet.bleed,
      });
    }

    if (!unitsPerSheet || unitsPerSheet <= 0) return undefined;

    const sheetsNeeded = calculateSheetsNeeded(geo.quantity, unitsPerSheet);
    return sheetsNeeded * unitCost;
  }

  if (basis === "metre") {
    const lengthMetres =
      (Math.max(geo.width ?? 0, geo.height ?? 0) / 1000) * geo.quantity;
    if (lengthMetres <= 0) return undefined;
    return lengthMetres * unitCost;
  }

  return undefined;
}

/**
 * The canonical (normalised) cost representation derived from a raw invoice
 * price + packaging metadata.  All CODE maths — never delegate arithmetic to AI.
 */
export interface CanonicalCost {
  /** The canonical purchase-unit basis after interpreting packaging. */
  costUnit: FakturowniaCostUnit;
  /** Net unit cost in base currency expressed in this canonical unit. */
  unitCostNetBase: number;
  /** Width of a single purchase sheet in mm, when costUnit is "sheet". */
  sheetWidthMm?: number;
  /** Height of a single purchase sheet in mm, when costUnit is "sheet". */
  sheetHeightMm?: number;
}

/**
 * Normalise a raw per-purchase-unit price into a canonical per-unit cost by
 * interpreting the packaging metadata.
 *
 * Rules (first match wins):
 *  ROLL   – packaging has rollWidthMm + rollLengthM → convert to area_m2
 *  REAM   – packaging has sheetsPerPack > 0, or purchaseUnit looks like
 *            ream/ryza/ark/sheet → cost-per-sheet (amortised over sheetsPerPack)
 *  AREA   – purchaseUnit matches m2 → area_m2 as-is
 *  METRE  – purchaseUnit matches metre/mb → metre as-is
 *  PIECE  – purchaseUnit matches piece/szt → piece as-is
 *  FALLBACK – normalizeFakturowniaCostUnit(quantityUnit) ?? "piece"
 */
export function deriveCanonicalCost(input: {
  rawUnitCostNetBase: number;
  quantityUnit?: string | null;
  packaging?: FakturowniaCostPackaging | null;
}): CanonicalCost | undefined {
  const { rawUnitCostNetBase, quantityUnit, packaging: p } = input;

  if (!Number.isFinite(rawUnitCostNetBase)) return undefined;

  /** Strip diacritics + lowercase + remove whitespace/dots for loose matching. */
  function normPu(s: string | undefined | null): string {
    if (!s) return "";
    return s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/ł/g, "l")
      .replace(/[\s.]/g, "");
  }

  const pu = normPu(p?.purchaseUnit);

  // --- ROLL: rollWidthMm + rollLengthM present, AND the unit confirms a roll
  //     (or there is no conflicting ream/sheet signal on the same line) ---
  const isRollByUnit = pu === "roll" || pu === "rolka" || pu === "rl";
  const isReamByUnit =
    pu === "ream" ||
    pu === "ryza" ||
    pu === "ark" ||
    pu === "arkusz" ||
    pu === "arkusze" ||
    pu === "sheet";
  const hasSheetsPack = p?.sheetsPerPack != null && p.sheetsPerPack > 0;
  if (
    p?.rollWidthMm && p.rollWidthMm > 0 &&
    p.rollLengthM && p.rollLengthM > 0 &&
    (isRollByUnit || (!hasSheetsPack && !isReamByUnit))
  ) {
    const areaM2 = (p.rollWidthMm / 1000) * p.rollLengthM;
    if (areaM2 > 0) {
      return { costUnit: "area_m2", unitCostNetBase: rawUnitCostNetBase / areaM2 };
    }
  }

  // --- REAM / SHEET-PACK ---
  if (hasSheetsPack || isReamByUnit) {
    const sheets = hasSheetsPack ? p!.sheetsPerPack! : 1;
    return {
      costUnit: "sheet",
      unitCostNetBase: rawUnitCostNetBase / sheets,
      ...(p?.sheetWidthMm != null ? { sheetWidthMm: p.sheetWidthMm } : {}),
      ...(p?.sheetHeightMm != null ? { sheetHeightMm: p.sheetHeightMm } : {}),
    };
  }

  // --- EXPLICIT AREA ---
  if (pu === "m2" || pu === "m²" || pu === "mkw") {
    return { costUnit: "area_m2", unitCostNetBase: rawUnitCostNetBase };
  }

  // --- EXPLICIT METRE ---
  if (pu === "mb" || pu === "rm" || pu === "metrbiezacy" || pu === "metre" || pu === "metr") {
    return { costUnit: "metre", unitCostNetBase: rawUnitCostNetBase };
  }

  // --- EXPLICIT PIECE ---
  if (pu === "szt" || pu === "sztuka" || pu === "piece" || pu === "pcs" || pu === "pc" || pu === "stk" || pu === "ea") {
    return { costUnit: "piece", unitCostNetBase: rawUnitCostNetBase };
  }

  // --- FALLBACK: derive from quantityUnit (no packaging dims available) ---
  const basis = normalizeFakturowniaCostUnit(quantityUnit) ?? "piece";
  return { costUnit: basis, unitCostNetBase: rawUnitCostNetBase };
}
