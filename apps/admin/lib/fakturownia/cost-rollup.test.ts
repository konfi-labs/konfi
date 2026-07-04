import { describe, expect, it } from "vitest";
import type {
  ApprovedFakturowniaCostEntry,
  FakturowniaCostCurrencyConversion,
} from "@konfi/types";
import {
  buildProductCostRollupId,
  computeProductCostRollup,
} from "./cost-rollup";

function entry(
  overrides: Partial<ApprovedFakturowniaCostEntry> & {
    evidenceId: string;
    issueDate?: string;
  },
): ApprovedFakturowniaCostEntry {
  const { issueDate, ...rest } = overrides;
  const conversion: FakturowniaCostCurrencyConversion | undefined =
    overrides.conversion;
  return {
    confidence: 1,
    currency: "PLN",
    invoice: { id: `inv-${overrides.evidenceId}`, ...(issueDate ? { issueDate } : {}) },
    position: { index: 0 },
    quantity: 1,
    sourceSignals: [],
    supplier: {},
    ...rest,
    ...(conversion ? { conversion } : {}),
  };
}

describe("buildProductCostRollupId", () => {
  it("uses the bare productId when there is no tenant", () => {
    expect(buildProductCostRollupId("prod-1")).toBe("prod-1");
    expect(buildProductCostRollupId("prod-1", undefined)).toBe("prod-1");
  });

  it("namespaces by tenant when present", () => {
    expect(buildProductCostRollupId("prod-1", "tenant-a")).toBe(
      "tenant-a__prod-1",
    );
  });
});

describe("computeProductCostRollup", () => {
  it("returns an empty overall bucket for no entries", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [],
      productId: "prod-1",
    });
    expect(rollup).toEqual({
      baseCurrency: "PLN",
      overall: { sampleCount: 0 },
      productId: "prod-1",
    });
    expect(rollup.overall.averageUnitCostNetBase).toBeUndefined();
    expect(rollup.byAttributeOption).toBeUndefined();
  });

  it("averages usable entries and rounds to 2dp", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({ evidenceId: "a", issueDate: "2026-01-01", unitCostNet: 10 }),
        entry({ evidenceId: "b", issueDate: "2026-01-02", unitCostNet: 11 }),
        entry({ evidenceId: "c", issueDate: "2026-01-03", unitCostNet: 12 }),
      ],
      productId: "prod-1",
    });
    expect(rollup.overall.sampleCount).toBe(3);
    expect(rollup.overall.averageUnitCostNetBase).toBe(11);
  });

  it("rounds the average to 2 decimal places", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({ evidenceId: "a", issueDate: "2026-01-01", unitCostNet: 10 }),
        entry({ evidenceId: "b", issueDate: "2026-01-02", unitCostNet: 10 }),
        entry({ evidenceId: "c", issueDate: "2026-01-03", unitCostNet: 11 }),
      ],
      productId: "prod-1",
    });
    // (10 + 10 + 11) / 3 = 10.333...
    expect(rollup.overall.averageUnitCostNetBase).toBe(10.33);
  });

  it("selects latest and previous by issue date", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({ evidenceId: "a", issueDate: "2026-01-02", unitCostNet: 20 }),
        entry({ evidenceId: "c", issueDate: "2026-03-01", unitCostNet: 30 }),
        entry({ evidenceId: "b", issueDate: "2026-02-01", unitCostNet: 25 }),
      ],
      productId: "prod-1",
    });
    expect(rollup.overall.latestIssueDate).toBe("2026-03-01");
    expect(rollup.overall.latestUnitCostNetBase).toBe(30);
    expect(rollup.overall.previousUnitCostNetBase).toBe(25);
  });

  it("breaks issue-date ties deterministically by evidenceId", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({ evidenceId: "z", issueDate: "2026-01-01", unitCostNet: 99 }),
        entry({ evidenceId: "a", issueDate: "2026-01-01", unitCostNet: 1 }),
      ],
      productId: "prod-1",
    });
    // "z" > "a" so z is latest, a is previous — stable regardless of input order.
    expect(rollup.overall.latestUnitCostNetBase).toBe(99);
    expect(rollup.overall.previousUnitCostNetBase).toBe(1);
  });

  it("omits previousUnitCostNetBase when there is a single entry", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({ evidenceId: "a", issueDate: "2026-01-01", unitCostNet: 7 }),
      ],
      productId: "prod-1",
    });
    expect(rollup.overall.latestUnitCostNetBase).toBe(7);
    expect(rollup.overall.previousUnitCostNetBase).toBeUndefined();
  });

  it("prefers conversion.unitCostNetBase over the raw unit cost", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({
          conversion: {
            baseCurrency: "PLN",
            exchangeRate: 4,
            unitCostNetBase: 40,
          },
          currency: "EUR",
          evidenceId: "a",
          issueDate: "2026-01-01",
          unitCostNet: 10,
        }),
      ],
      productId: "prod-1",
    });
    expect(rollup.overall.averageUnitCostNetBase).toBe(40);
    expect(rollup.overall.latestUnitCostNetBase).toBe(40);
  });

  it("nets corrections (negative base costs) against originals", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({ evidenceId: "a", issueDate: "2026-01-01", unitCostNet: 100 }),
        entry({
          evidenceId: "b",
          invoiceKind: "correction",
          issueDate: "2026-01-02",
          unitCostNet: -40,
        }),
      ],
      productId: "prod-1",
    });
    expect(rollup.overall.sampleCount).toBe(2);
    // (100 + -40) / 2 = 30
    expect(rollup.overall.averageUnitCostNetBase).toBe(30);
    expect(rollup.overall.latestUnitCostNetBase).toBe(-40);
  });

  it("skips foreign-currency entries without a conversion", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({ evidenceId: "a", issueDate: "2026-01-01", unitCostNet: 10 }),
        entry({
          currency: "EUR",
          evidenceId: "b",
          issueDate: "2026-01-02",
          unitCostNet: 999,
        }),
      ],
      productId: "prod-1",
    });
    // Only the PLN entry counts; the EUR one is excluded from aggregation.
    expect(rollup.overall.sampleCount).toBe(1);
    expect(rollup.overall.averageUnitCostNetBase).toBe(10);
    expect(rollup.overall.latestUnitCostNetBase).toBe(10);
  });

  it("groups usable entries by attribute option", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({
          attributeId: "color",
          evidenceId: "a",
          issueDate: "2026-01-01",
          optionValue: "red",
          unitCostNet: 10,
        }),
        entry({
          attributeId: "color",
          evidenceId: "b",
          issueDate: "2026-01-03",
          optionValue: "red",
          unitCostNet: 20,
        }),
        entry({
          attributeId: "color",
          evidenceId: "c",
          issueDate: "2026-01-02",
          optionValue: "blue",
          unitCostNet: 5,
        }),
      ],
      productId: "prod-1",
    });

    expect(rollup.overall.sampleCount).toBe(3);
    const groups = rollup.byAttributeOption ?? {};
    expect(Object.keys(groups).sort()).toEqual(["color:blue", "color:red"]);

    const red = groups["color:red"];
    expect(red?.attributeId).toBe("color");
    expect(red?.optionValue).toBe("red");
    expect(red?.sampleCount).toBe(2);
    expect(red?.averageUnitCostNetBase).toBe(15);
    expect(red?.latestUnitCostNetBase).toBe(20);
    expect(red?.previousUnitCostNetBase).toBe(10);

    const blue = groups["color:blue"];
    expect(blue?.sampleCount).toBe(1);
    expect(blue?.averageUnitCostNetBase).toBe(5);
  });

  it("omits byAttributeOption entirely when no entry has both attribute and option", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [
        entry({
          attributeId: "color",
          evidenceId: "a",
          issueDate: "2026-01-01",
          unitCostNet: 10,
        }),
        entry({
          evidenceId: "b",
          issueDate: "2026-01-02",
          optionValue: "red",
          unitCostNet: 20,
        }),
      ],
      productId: "prod-1",
    });
    expect(rollup.byAttributeOption).toBeUndefined();
  });

  it("carries productName through when provided", () => {
    const rollup = computeProductCostRollup({
      baseCurrency: "PLN",
      entries: [],
      productId: "prod-1",
      productName: "Widget",
    });
    expect(rollup.productName).toBe("Widget");
  });

  describe("deriveCanonicalCost conversion path — packaging metadata exercises", () => {
    it("converts a roll entry to area_m2 and stores per-m² cost in the bucket", () => {
      // raw cost 450 PLN for a roll 1050 mm × 50 m → area = 52.5 m²
      // canonical unitCostNetBase = 450 / 52.5
      const rollWidthMm = 1050;
      const rollLengthM = 50;
      const rawCost = 450;
      const areaM2 = (rollWidthMm / 1000) * rollLengthM;
      const expectedUnitCost = rawCost / areaM2;

      const rollup = computeProductCostRollup({
        baseCurrency: "PLN",
        entries: [
          entry({
            evidenceId: "roll-a",
            issueDate: "2026-01-01",
            unitCostNet: rawCost,
            packaging: { rollWidthMm, rollLengthM },
          }),
        ],
        productId: "prod-roll",
      });

      expect(rollup.overall.sampleCount).toBe(1);
      expect(rollup.overall.averageUnitCostNetBase).toBeCloseTo(expectedUnitCost, 5);
      expect(rollup.overall.latestUnitCostNetBase).toBeCloseTo(expectedUnitCost, 5);
    });

    it("amortises a ream entry to cost-per-sheet and stores it in the bucket", () => {
      // raw cost 250 PLN for a ream of 250 sheets → 1.00 PLN / sheet
      const sheetsPerPack = 250;
      const rawCost = 250;
      const expectedUnitCost = rawCost / sheetsPerPack;

      const rollup = computeProductCostRollup({
        baseCurrency: "PLN",
        entries: [
          entry({
            evidenceId: "ream-a",
            issueDate: "2026-01-01",
            unitCostNet: rawCost,
            packaging: {
              sheetsPerPack,
              sheetWidthMm: 320,
              sheetHeightMm: 450,
            },
          }),
        ],
        productId: "prod-ream",
      });

      expect(rollup.overall.sampleCount).toBe(1);
      expect(rollup.overall.averageUnitCostNetBase).toBeCloseTo(expectedUnitCost, 10);
      expect(rollup.overall.latestUnitCostNetBase).toBeCloseTo(expectedUnitCost, 10);
    });
  });
});
