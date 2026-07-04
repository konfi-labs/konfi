import { describe, expect, it } from "vitest";
import { deriveCanonicalCost, convertUnitCostToItemTotal } from "../cost-conversion";

describe("deriveCanonicalCost", () => {
  describe("ROLL: rollWidthMm + rollLengthM present", () => {
    it("converts roll price to area_m2", () => {
      const result = deriveCanonicalCost({
        rawUnitCostNetBase: 450,
        packaging: { rollWidthMm: 1050, rollLengthM: 50 },
      });
      expect(result).toBeDefined();
      expect(result!.costUnit).toBe("area_m2");
      // area = (1050/1000) * 50 = 52.5 m²; cost = 450/52.5 ≈ 8.571
      expect(result!.unitCostNetBase).toBeCloseTo(450 / 52.5, 5);
    });

    it("converts roll price to area_m2 when purchaseUnit is 'rolka'", () => {
      const result = deriveCanonicalCost({
        rawUnitCostNetBase: 450,
        packaging: { purchaseUnit: "rolka", rollWidthMm: 1050, rollLengthM: 50 },
      });
      expect(result).toBeDefined();
      expect(result!.costUnit).toBe("area_m2");
      expect(result!.unitCostNetBase).toBeCloseTo(450 / 52.5, 5);
    });
  });

  describe("FALLBACK: roll price but no roll dims — documents the bug shape", () => {
    it("falls back to piece when no packaging dims and quantityUnit is 'szt'", () => {
      const result = deriveCanonicalCost({
        rawUnitCostNetBase: 450,
        quantityUnit: "szt",
      });
      expect(result).toBeDefined();
      expect(result!.costUnit).toBe("piece");
      expect(result!.unitCostNetBase).toBe(450);
    });
  });

  describe("SHEET/REAM: sheetsPerPack + sheet dimensions", () => {
    it("amortises ream price to cost-per-sheet and carries sheet dimensions", () => {
      const result = deriveCanonicalCost({
        rawUnitCostNetBase: 250,
        packaging: {
          sheetsPerPack: 250,
          sheetWidthMm: 320,
          sheetHeightMm: 450,
        },
      });
      expect(result).toBeDefined();
      expect(result!.costUnit).toBe("sheet");
      // 250 / 250 = 1.00
      expect(result!.unitCostNetBase).toBeCloseTo(1, 10);
      expect(result!.sheetWidthMm).toBe(320);
      expect(result!.sheetHeightMm).toBe(450);
    });
  });
});

describe("convertUnitCostToItemTotal", () => {
  describe("area_m2 basis", () => {
    it("computes total from quantity × item area in m²", () => {
      // item 100 mm × 100 mm = 0.01 m²; 100 items = 1 m²; unitCost 8.5714 → total ≈ 8.5714
      const total = convertUnitCostToItemTotal("area_m2", 8.5714, {
        quantity: 100,
        width: 100,
        height: 100,
      });
      expect(total).toBeDefined();
      expect(total!).toBeCloseTo(8.5714, 3);
    });

    it("scales proportionally when item width doubles", () => {
      const base = convertUnitCostToItemTotal("area_m2", 8.5714, {
        quantity: 100,
        width: 100,
        height: 100,
      });
      const doubled = convertUnitCostToItemTotal("area_m2", 8.5714, {
        quantity: 100,
        width: 200,
        height: 100,
      });
      expect(base).toBeDefined();
      expect(doubled).toBeDefined();
      expect(doubled!).toBeCloseTo(base! * 2, 3);
    });

    it("applies bleed once per axis by design (NOT bleed * 2)", () => {
      // Area-based material cost adds bleed a SINGLE time per axis: ganged
      // pieces share the bleed/gutter with their neighbours. The bleed * 2
      // convention belongs to discrete sheet-packing — see
      // calculateUnitsPerSheet in sheet-calculations.ts — which is a different
      // calculation. Do NOT "fix" this to bleed * 2.
      // 1 item, 100 mm × 100 mm, 4 mm bleed → cut size 104 × 104 mm.
      const total = convertUnitCostToItemTotal("area_m2", 10, {
        quantity: 1,
        width: 100,
        height: 100,
        bleed: 4,
      });
      expect(total).toBeDefined();
      expect(total!).toBeCloseTo((104 * 104 / 1_000_000) * 10, 8);
    });

    it("bleed: 0 produces the same result as omitting bleed", () => {
      const withZeroBleed = convertUnitCostToItemTotal("area_m2", 7, {
        quantity: 10,
        width: 150,
        height: 200,
        bleed: 0,
      });
      const withoutBleed = convertUnitCostToItemTotal("area_m2", 7, {
        quantity: 10,
        width: 150,
        height: 200,
      });
      expect(withZeroBleed).toBeDefined();
      expect(withoutBleed).toBeDefined();
      expect(withZeroBleed!).toBeCloseTo(withoutBleed!, 10);
    });
  });

  describe("piece basis — the bug shape", () => {
    it("returns quantity × unitCost regardless of item size", () => {
      // 100 pieces × 450 = 45000
      const total = convertUnitCostToItemTotal("piece", 450, {
        quantity: 100,
        width: 100,
        height: 100,
      });
      expect(total).toBe(45000);
    });

    it("is invariant to width and height changes", () => {
      const base = convertUnitCostToItemTotal("piece", 450, {
        quantity: 100,
        width: 100,
        height: 100,
      });
      const wider = convertUnitCostToItemTotal("piece", 450, {
        quantity: 100,
        width: 9999,
        height: 100,
      });
      expect(base).toBe(45000);
      expect(wider).toBe(45000);
    });
  });
});
