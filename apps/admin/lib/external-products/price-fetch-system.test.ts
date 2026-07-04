import { describe, expect, it } from "vitest";
import type { ExternalAttribute } from "@konfi/types";
import { resolveConfigurationParamsForPricingAttributes } from "./pricing-selection-resolution";

describe("resolveConfigurationParamsForPricingAttributes", () => {
  const calendarPricingAttributes: ExternalAttribute[] = [
    {
      id: "calendarPaperFormat",
      name: "Typ",
      values: ["flat", "convex"],
      affectsPricing: true,
    },
    {
      id: "calendarPaperFlatHeadWeight",
      name: "Papier",
      values: ["flat-paper"],
      affectsPricing: true,
    },
    {
      id: "calendarPaperConvexHeadWeight",
      name: "Papier",
      values: ["convex-paper"],
      affectsPricing: true,
    },
    {
      id: "colorBothWithHeader",
      name: "Kolorystyka",
      values: ["4-0-header"],
      affectsPricing: true,
    },
    {
      id: "color",
      name: "Kolorystyka",
      values: ["4-0"],
      affectsPricing: true,
    },
  ];

  it("corrects duplicate-name display-key fallbacks to attribute ids for template endpoints", () => {
    const result = resolveConfigurationParamsForPricingAttributes({
      pricingAttributes: calendarPricingAttributes,
      savedConfigParams: {
        Typ: "calendarPaperFormat",
        Papier: "calendarPaperFlatHeadWeight",
        Kolorystyka: "colorBothWithHeader",
      },
      endpointQueryParams: [],
    });

    expect(result.correctedConfigurationParams).toBe(true);
    expect(result.resolvedConfigurationParams).toEqual({
      calendarPaperFormat: "calendarPaperFormat",
      calendarPaperFlatHeadWeight: "calendarPaperFlatHeadWeight",
      calendarPaperConvexHeadWeight: "calendarPaperConvexHeadWeight",
      colorBothWithHeader: "colorBothWithHeader",
      color: "color",
    });
  });

  it("preserves explicit key-specific params for duplicate-name attributes", () => {
    const result = resolveConfigurationParamsForPricingAttributes({
      pricingAttributes: calendarPricingAttributes,
      savedConfigParams: {
        Typ: "calendarPaperFormat",
        calendarPaperFlatHeadWeight: "calendarPaperFlatHeadWeight",
        calendarPaperConvexHeadWeight: "customConvexParam",
        colorBothWithHeader: "colorBothWithHeader",
        color: "customColorParam",
      },
      endpointQueryParams: ["calendarPaperFormat", "customConvexParam", "customColorParam"],
    });

    expect(result.resolvedConfigurationParams).toEqual({
      calendarPaperFormat: "calendarPaperFormat",
      calendarPaperFlatHeadWeight: "calendarPaperFlatHeadWeight",
      calendarPaperConvexHeadWeight: "customConvexParam",
      colorBothWithHeader: "colorBothWithHeader",
      color: "customColorParam",
    });
  });
});
