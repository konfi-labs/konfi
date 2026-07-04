import { describe, expect, it } from "vitest";
import type { ExternalAttribute } from "@konfi/types";
import {
  applyPricingResponseCorrection,
  buildPricingStrategyFromUnavailableResponse,
  buildPricingStrategyFromCorrection,
  deriveDeterministicPricingResponseCorrections,
  extractPricingResponseSignals,
  looksLikeUnavailablePricingResponse,
  mergePricingCombinationStrategies,
  sanitizePricingResponseCorrection,
  sortPricingResponseCorrectionsBySimplicity,
  summarizeUnavailablePricingSignals,
} from "./pricing-response-analysis";

describe("pricing response analysis", () => {
  const externalAttributes: ExternalAttribute[] = [
    {
      id: "paperFormat",
      name: "Format",
      values: ["format-b2-pion", "format-a3-pion"],
      affectsPricing: true,
    },
    {
      id: "foil",
      name: "Folia",
      values: ["none", "glossy-front", "matt-front"],
      affectsPricing: true,
    },
    {
      id: "barColor",
      name: "Kolor listwy",
      values: ["white", "silver"],
      affectsPricing: true,
    },
    {
      id: "barType",
      name: "Typ listwy",
      values: ["short-side-up-down", "long-side-up-down"],
      affectsPricing: true,
    },
  ];

  it("detects explicitly unavailable empty-price responses", () => {
    const invalidResponse = {
      available: false,
      prices: {
        priceTable: [],
      },
      exclusions: {
        disabledAttributes: ["barColor"],
        triggeredExclusions: {
          foil: {
            glossyFront: [],
          },
        },
      },
      description: {
        labelGroups: [
          {
            attributes: [
              {
                attributeId: "foil",
                firstValueIdFromValueLabels: "glossy-front",
              },
            ],
          },
        ],
      },
    };

    expect(looksLikeUnavailablePricingResponse(invalidResponse)).toBe(true);

    expect(extractPricingResponseSignals(invalidResponse)).toEqual({
      allPricesZero: undefined,
      available: false,
      disabledAttributes: ["barColor"],
      excludedAttributeValues: {
        foil: ["glossyFront"],
      },
      notSelectedRequiredAttributes: [],
      priceTableCount: 0,
      reportingParams: undefined,
      selectedAttributes: {
        foil: "glossy-front",
      },
      summaryDescription: undefined,
      triggeredExclusionAttributes: ["foil"],
    });

    expect(
      summarizeUnavailablePricingSignals(
        extractPricingResponseSignals(invalidResponse),
      ),
    ).toContain("available=false");
  });

  it("does not flag populated price tables as unavailable", () => {
    const validResponse = {
      available: true,
      prices: {
        priceTable: [{ volume: 5 }],
      },
    };

    expect(looksLikeUnavailablePricingResponse(validResponse)).toBe(false);
  });

  it("detects populated price tables with missing required attributes as unavailable when available is not explicit", () => {
    const partiallySelectedResponse = {
      exclusions: {
        notSelectedRequiredAttributes: ["color"],
      },
      prices: {
        priceTable: [{ volume: 5 }],
      },
    };

    expect(looksLikeUnavailablePricingResponse(partiallySelectedResponse)).toBe(
      true,
    );
  });

  it("treats response as available when provider confirms availability despite notSelectedRequiredAttributes", () => {
    const availableWithMissing = {
      available: true,
      exclusions: {
        notSelectedRequiredAttributes: ["color"],
      },
      prices: {
        priceTable: [{ volume: 5 }],
      },
    };

    expect(looksLikeUnavailablePricingResponse(availableWithMissing)).toBe(
      false,
    );
  });

  it("detects all-zero price tables as unavailable", () => {
    const zeroPriceResponse = {
      available: true,
      prices: {
        priceTable: [
          {
            volume: 10,
            priceRowsPerVolume: [
              {
                netPrice: { value: "0.00", currency: "PLN" },
                grossPrice: { value: "0.00", currency: "PLN" },
              },
            ],
          },
          {
            volume: 20,
            priceRowsPerVolume: [
              {
                netPrice: { value: "0.00", currency: "PLN" },
                grossPrice: { value: "0.00", currency: "PLN" },
              },
            ],
          },
        ],
      },
    };

    expect(looksLikeUnavailablePricingResponse(zeroPriceResponse)).toBe(true);

    const signals = extractPricingResponseSignals(zeroPriceResponse);

    expect(signals.allPricesZero).toBe(true);
    expect(signals.priceTableCount).toBe(2);
  });

  it("does not flag price tables with non-zero prices as unavailable", () => {
    const validPriceResponse = {
      available: true,
      prices: {
        priceTable: [
          {
            volume: 10,
            priceRowsPerVolume: [
              {
                netPrice: { value: "248.35", currency: "PLN" },
                grossPrice: { value: "305.47", currency: "PLN" },
              },
            ],
          },
        ],
      },
    };

    expect(looksLikeUnavailablePricingResponse(validPriceResponse)).toBe(false);

    const signals = extractPricingResponseSignals(validPriceResponse);

    expect(signals.allPricesZero).toBe(false);
    expect(signals.priceTableCount).toBe(1);
  });

  it("flags direct priceTable entries with zero netPrice values as unavailable", () => {
    const zeroPriceResponse = {
      available: true,
      prices: {
        priceTable: [
          {
            volume: 10,
            netPrice: { value: "0.00", currency: "PLN" },
          },
          {
            volume: 20,
            netPrice: { value: "0.00", currency: "PLN" },
          },
        ],
      },
      exclusions: {
        notSelectedRequiredAttributes: ["colorBothWithHeader"],
      },
    };

    expect(looksLikeUnavailablePricingResponse(zeroPriceResponse)).toBe(true);

    const signals = extractPricingResponseSignals(zeroPriceResponse);

    expect(signals.allPricesZero).toBe(true);
    expect(signals.notSelectedRequiredAttributes).toEqual([
      "colorBothWithHeader",
    ]);
  });

  it("sanitizes AI corrections to known attributes and values", () => {
    expect(
      sanitizePricingResponseCorrection({
        correction: {
          omitAttributes: ["Unknown", "Folia"],
          setValues: {
            Format: "format-b2-pion",
            Folia: "invented-value",
          },
        },
        currentConfiguration: {
          Format: "format-a3-pion",
          Folia: "glossy-front",
        },
        externalAttributes,
      }),
    ).toEqual({
      omitAttributes: ["Folia"],
      setValues: {
        Format: "format-b2-pion",
      },
    });
  });

  it("applies correction updates in omit-then-set order", () => {
    expect(
      applyPricingResponseCorrection(
        {
          Format: "format-b2-pion",
          Folia: "glossy-front",
        },
        {
          omitAttributes: ["Folia"],
          setValues: {
            Folia: "none",
          },
        },
      ),
    ).toEqual({
      Format: "format-b2-pion",
      Folia: "none",
    });
  });

  it("merges adaptive strategies by concatenating rules", () => {
    expect(
      mergePricingCombinationStrategies(
        {
          rules: [{ when: { Format: "format-b2-pion" } }],
        },
        {
          rules: [{ allowedValues: { Folia: ["none"] } }],
        },
      ),
    ).toEqual({
      rules: [
        { when: { Format: "format-b2-pion" } },
        { allowedValues: { Folia: ["none"] } },
      ],
    });
  });

  it("derives deterministic corrections from disabled and excluded attributes", () => {
    const corrections = deriveDeterministicPricingResponseCorrections({
      currentConfiguration: {
        Format: "format-b2-pion",
        Folia: "glossy-front",
        "Kolor listwy": "white",
        "Typ listwy": "short-side-up-down",
      },
      externalAttributes,
      responseData: {
        available: false,
        prices: {
          priceTable: [],
        },
        exclusions: {
          disabledAttributes: ["barColor"],
          exclusionForAttributeId: {
            foil: {
              "*": [],
            },
            barType: {
              "*": [],
            },
          },
        },
      },
    });

    expect(corrections).toEqual([
      {
        omitAttributes: ["Kolor listwy", "Typ listwy"],
        reason: "provider exclusions and disabled attributes",
        setValues: {
          Folia: "none",
        },
      },
      {
        omitAttributes: ["Kolor listwy", "Typ listwy", "Folia"],
        reason: "omit all currently excluded optional attributes",
      },
    ]);
  });

  it("derives deterministic corrections for missing required attributes", () => {
    const calendarAttributes: ExternalAttribute[] = [
      {
        id: "calendarPaperFormat",
        name: "calendarPaperFormat",
        values: ["calendar-format-convex-head-820-320"],
        affectsPricing: true,
      },
      {
        id: "calendarPaperConvexHeadWeight",
        name: "calendarPaperConvexHeadWeight",
        values: ["back-cardboard-300g-head-matt-300g", "back-cardboard-300g-head-matt-350g"],
        affectsPricing: true,
      },
      {
        id: "colorBothWithHeader",
        name: "colorBothWithHeader",
        values: ["4-0", "4-4"],
        affectsPricing: true,
      },
    ];

    const corrections = deriveDeterministicPricingResponseCorrections({
      currentConfiguration: {
        calendarPaperFormat: "calendar-format-convex-head-820-320",
        colorBothWithHeader: "4-0",
      },
      externalAttributes: calendarAttributes,
      responseData: {
        available: true,
        prices: {
          priceTable: [
            {
              volume: 10,
              priceRowsPerVolume: [
                { netPrice: { value: "0.00", currency: "PLN" } },
              ],
            },
          ],
        },
        exclusions: {
          notSelectedRequiredAttributes: ["calendarPaperConvexHeadWeight"],
        },
      },
    });

    expect(corrections).toEqual([
      {
        reason: "add missing required attributes reported by provider",
        setValues: {
          calendarPaperConvexHeadWeight: "back-cardboard-300g-head-matt-300g",
        },
      },
    ]);
  });

  it("prefers the simplest corrected configuration first", () => {
    const orderedCorrections = sortPricingResponseCorrectionsBySimplicity({
      corrections: [
        {
          omitAttributes: ["Kolor listwy", "Typ listwy"],
          reason: "provider exclusions and disabled attributes",
          setValues: {
            Folia: "none",
          },
        },
        {
          omitAttributes: ["Kolor listwy", "Typ listwy", "Folia"],
          reason: "omit all currently excluded optional attributes",
        },
      ],
      currentConfiguration: {
        Format: "format-b2-pion",
        Folia: "glossy-front",
        "Kolor listwy": "white",
        "Typ listwy": "short-side-up-down",
      },
    });

    expect(orderedCorrections).toEqual([
      {
        omitAttributes: ["Kolor listwy", "Typ listwy", "Folia"],
        reason: "omit all currently excluded optional attributes",
      },
      {
        omitAttributes: ["Kolor listwy", "Typ listwy"],
        reason: "provider exclusions and disabled attributes",
        setValues: {
          Folia: "none",
        },
      },
    ]);
  });

  it("builds a reusable strategy from a successful simplified correction", () => {
    expect(
      buildPricingStrategyFromCorrection({
        correctedConfiguration: {
          Format: "format-b2-pion",
          Folia: "none",
        },
        externalAttributes,
        originalConfiguration: {
          Format: "format-b2-pion",
          Folia: "glossy-front",
          "Kolor listwy": "white",
          "Typ listwy": "short-side-up-down",
        },
      }),
    ).toEqual({
      rules: [
        {
          when: {
            Format: "format-b2-pion",
          },
          omitAttributes: ["Kolor listwy", "Typ listwy"],
          requiredAttributes: ["Folia"],
          allowedValues: {
            Folia: ["none"],
          },
          reason: "learned from successful deterministic pricing correction",
        },
      ],
    });
  });

  it("builds conservative pruning rules from provider availability signals", () => {
    expect(
      buildPricingStrategyFromUnavailableResponse({
        currentConfiguration: {
          Format: "format-b2-pion",
          Folia: "glossy-front",
          "Kolor listwy": "white",
          "Typ listwy": "short-side-up-down",
        },
        externalAttributes,
        responseData: {
          available: false,
          prices: {
            priceTable: [],
          },
          exclusions: {
            disabledAttributes: ["barColor"],
            exclusionForAttributeId: {
              foil: {
                "*": [],
              },
            },
          },
        },
      }),
    ).toEqual({
      rules: [
        {
          omitAttributes: ["Kolor listwy"],
          reason: "learned from provider disabled-attribute signal",
          when: {
            Folia: "glossy-front",
            Format: "format-b2-pion",
            "Typ listwy": "short-side-up-down",
          },
        },
        {
          excludedValues: {
            Folia: ["glossy-front"],
          },
          reason: "learned from provider excluded-value signal",
          when: {
            Format: "format-b2-pion",
            "Kolor listwy": "white",
            "Typ listwy": "short-side-up-down",
          },
        },
      ],
    });
  });
});
