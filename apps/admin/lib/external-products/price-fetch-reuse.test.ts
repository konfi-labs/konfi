import type { DocumentReference } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AttributeMapping,
  ExternalAttribute,
  ExternalPriceConfiguration,
  ExternalProduct,
} from "@konfi/types";
import { SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE } from "./option-mapping-utils";
import {
  buildPriceConfigurationReuseSignature,
  getLatestStoredPriceConfigurations,
  getReusableStoredPriceConfigurations,
  partitionPriceConfigurationsForReuse,
  preserveMissingDeliveryTimesInPriceConfigurations,
} from "./price-fetch-reuse";

vi.mock("@/lib/external-products/price-configuration-storage", () => ({
  readPendingPriceConfigurations: vi.fn(async ({ externalProduct }) =>
    externalProduct.pendingPriceConfigurations ?? []),
  readPriceConfigurations: vi.fn(async ({ externalProduct }) =>
    externalProduct.priceConfigurations ?? []),
}));

const docRef = {} as DocumentReference;

beforeEach(() => {
  vi.clearAllMocks();
});

const externalAttributes: ExternalAttribute[] = [
  {
    name: "Papier",
    values: ["matt-150g", "gloss-170g"],
    affectsPricing: true,
  },
  {
    name: "Folia",
    values: ["matt-front", "gloss-front"],
    affectsPricing: true,
  },
];

describe("buildPriceConfigurationReuseSignature", () => {
  it("ignores internal option target values when the external fetch space is unchanged", () => {
    const firstMappings: AttributeMapping[] = [
      {
        externalAttributeName: "Papier",
        internalAttributeId: "paper-a",
        optionMappings: {
          "gloss-170g": "gloss170",
          "matt-150g": "mat150",
        },
      },
    ];
    const secondMappings: AttributeMapping[] = [
      {
        externalAttributeName: "Papier",
        internalAttributeId: "paper-b",
        optionMappings: {
          "gloss-170g": "paperGloss170",
          "matt-150g": "paperMat150",
        },
      },
    ];

    const firstSignature = buildPriceConfigurationReuseSignature({
      attributeMappings: firstMappings,
      discountPercent: 0,
      externalAttributes,
      marginPercent: 0,
      pricingSelection: {
        configurationParams: {
          Folia: "foil",
          Papier: "paper",
        },
        endpointId: "pricing",
      },
      selectedEndpoint: {
        id: "pricing",
        url: "https://provider.test/pricing",
      },
      taxPercent: 0,
    });
    const secondSignature = buildPriceConfigurationReuseSignature({
      attributeMappings: secondMappings,
      discountPercent: 0,
      externalAttributes,
      marginPercent: 0,
      pricingSelection: {
        configurationParams: {
          Folia: "foil",
          Papier: "paper",
        },
        endpointId: "pricing",
      },
      selectedEndpoint: {
        id: "pricing",
        url: "https://provider.test/pricing",
      },
      taxPercent: 0,
    });

    expect(firstSignature).toBe(secondSignature);
  });

  it("changes when the mapped external option set changes", () => {
    const firstSignature = buildPriceConfigurationReuseSignature({
      attributeMappings: [
        {
          externalAttributeName: "Papier",
          internalAttributeId: "paper",
          optionMappings: {
            "matt-150g": "mat150",
          },
        },
      ],
      discountPercent: 0,
      externalAttributes,
      marginPercent: 0,
      pricingSelection: {
        configurationParams: {
          Papier: "paper",
        },
        endpointId: "pricing",
      },
      selectedEndpoint: {
        id: "pricing",
        url: "https://provider.test/pricing",
      },
      taxPercent: 0,
    });
    const secondSignature = buildPriceConfigurationReuseSignature({
      attributeMappings: [
        {
          externalAttributeName: "Papier",
          internalAttributeId: "paper",
          optionMappings: {
            "gloss-170g": "gloss170",
            "matt-150g": "mat150",
          },
        },
      ],
      discountPercent: 0,
      externalAttributes,
      marginPercent: 0,
      pricingSelection: {
        configurationParams: {
          Papier: "paper",
        },
        endpointId: "pricing",
      },
      selectedEndpoint: {
        id: "pricing",
        url: "https://provider.test/pricing",
      },
      taxPercent: 0,
    });

    expect(firstSignature).not.toBe(secondSignature);
  });
});

describe("getReusableStoredPriceConfigurations", () => {
  it("prefers pending configurations when the signature matches", async () => {
    const externalProduct = {
      pendingPriceConfigurations: [
        {
          configuration: { Papier: "matt-150g" },
          priceInfo: { priceRanges: [{ price: 10, quantity: 1 }] },
          sourceUrl: "https://provider.test/pricing?paper=matt-150g",
        },
      ],
      priceConfigurationReuseSignature: "same-signature",
      priceConfigurations: [
        {
          configuration: { Papier: "gloss-170g" },
          priceInfo: { priceRanges: [{ price: 15, quantity: 1 }] },
          sourceUrl: "https://provider.test/pricing?paper=gloss-170g",
        },
      ],
    } satisfies Pick<
      ExternalProduct,
      | "pendingPriceConfigurations"
      | "priceConfigurationReuseSignature"
      | "priceConfigurations"
    >;

    await expect(
      getReusableStoredPriceConfigurations({
        currentSignature: "same-signature",
        docRef,
        externalProduct,
      }),
    ).resolves.toEqual({
      configurations: externalProduct.pendingPriceConfigurations,
      source: "pending",
    });
  });

  it("returns no reusable configurations when the signature differs", async () => {
    const externalProduct = {
      priceConfigurationReuseSignature: "old-signature",
      priceConfigurations: [
        {
          configuration: { Papier: "matt-150g" },
          priceInfo: { priceRanges: [{ price: 10, quantity: 1 }] },
        },
      ],
    } satisfies Pick<
      ExternalProduct,
      | "pendingPriceConfigurations"
      | "priceConfigurationReuseSignature"
      | "priceConfigurations"
    >;

    await expect(
      getReusableStoredPriceConfigurations({
        currentSignature: "new-signature",
        docRef,
        externalProduct,
      }),
    ).resolves.toEqual({
      configurations: [],
      source: "none",
    });
  });
});

describe("getLatestStoredPriceConfigurations", () => {
  it("prefers pending configurations even without a matching reuse signature", async () => {
    const externalProduct = {
      pendingPriceConfigurations: [
        {
          configuration: { Papier: "matt-150g" },
          priceInfo: {
            priceRanges: [{ deliveryTime: 3, price: 10, quantity: 1 }],
          },
        },
      ],
      pendingPriceConfigurationsCount: 1,
      priceConfigurationReuseSignature: "old-signature",
      priceConfigurations: [
        {
          configuration: { Papier: "gloss-170g" },
          priceInfo: {
            priceRanges: [{ deliveryTime: 5, price: 15, quantity: 1 }],
          },
        },
      ],
      priceConfigurationsCount: 1,
    } satisfies Pick<
      ExternalProduct,
      | "pendingPriceConfigurations"
      | "pendingPriceConfigurationsCount"
      | "priceConfigurationReuseSignature"
      | "priceConfigurations"
      | "priceConfigurationsCount"
    >;

    await expect(
      getLatestStoredPriceConfigurations({
        docRef,
        externalProduct,
      }),
    ).resolves.toEqual({
      configurations: externalProduct.pendingPriceConfigurations,
      source: "pending",
    });
  });
});

describe("partitionPriceConfigurationsForReuse", () => {
  it("reuses exact matching stored configurations and keeps only the missing candidates", () => {
    const existingConfigurations: ExternalPriceConfiguration[] = [
      {
        configuration: { Folia: "matt-front", Papier: "matt-150g" },
        priceInfo: { priceRanges: [{ price: 10, quantity: 1 }] },
        sourceUrl:
          "https://provider.test/pricing?foil=matt-front&paper=matt-150g",
      },
    ];

    const result = partitionPriceConfigurationsForReuse({
      candidates: [
        {
          configuration: { Folia: "matt-front", Papier: "matt-150g" },
          url: "https://provider.test/pricing?foil=matt-front&paper=matt-150g",
        },
        {
          configuration: { Folia: "gloss-front", Papier: "gloss-170g" },
          url: "https://provider.test/pricing?foil=gloss-front&paper=gloss-170g",
        },
      ],
      existingConfigurations,
    });

    expect(result).toEqual({
      remainingCandidates: [
        {
          configuration: { Folia: "gloss-front", Papier: "gloss-170g" },
          url: "https://provider.test/pricing?foil=gloss-front&paper=gloss-170g",
        },
      ],
      reusedConfigurations: existingConfigurations,
    });
  });

  it("treats generic synthetic empty selections as equivalent to omitted attributes", () => {
    const existingConfigurations: ExternalPriceConfiguration[] = [
      {
        configuration: {
          Folia: SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
          Papier: "matt-150g",
        },
        priceInfo: { priceRanges: [{ price: 10, quantity: 1 }] },
        sourceUrl: "https://provider.test/pricing?paper=matt-150g",
      },
    ];

    const result = partitionPriceConfigurationsForReuse({
      candidates: [
        {
          configuration: { Papier: "matt-150g" },
          url: "https://provider.test/pricing?paper=matt-150g",
        },
      ],
      existingConfigurations,
    });

    expect(result).toEqual({
      remainingCandidates: [],
      reusedConfigurations: existingConfigurations,
    });
  });
});

describe("preserveMissingDeliveryTimesInPriceConfigurations", () => {
  it("backfills missing delivery times from matching stored configurations", () => {
    const existingConfigurations: ExternalPriceConfiguration[] = [
      {
        configuration: { Delivery: "standard", Papier: "matt-150g" },
        priceInfo: {
          priceRanges: [
            { deliveryTime: 4, price: 10, quantity: 10 },
            { deliveryTime: 6, price: 20, quantity: 25 },
          ],
        },
        sourceUrl: "https://provider.test/pricing?delivery=standard&paper=matt-150g",
      },
    ];
    const nextConfigurations: ExternalPriceConfiguration[] = [
      {
        configuration: { Delivery: "standard", Papier: "matt-150g" },
        priceInfo: {
          priceRanges: [
            { price: 11, quantity: 10 },
            { deliveryTime: 3, price: 21, quantity: 25 },
          ],
        },
        sourceUrl: "https://provider.test/pricing?delivery=standard&paper=matt-150g",
      },
    ];

    expect(
      preserveMissingDeliveryTimesInPriceConfigurations({
        existingConfigurations,
        nextConfigurations,
      }),
    ).toEqual({
      configurations: [
        {
          configuration: { Delivery: "standard", Papier: "matt-150g" },
          priceInfo: {
            priceRanges: [
              { deliveryTime: 4, price: 11, quantity: 10 },
              { deliveryTime: 3, price: 21, quantity: 25 },
            ],
          },
          sourceUrl:
            "https://provider.test/pricing?delivery=standard&paper=matt-150g",
        },
      ],
      preservedRangeCount: 1,
    });
  });

  it("falls back to configuration-only matching when the source url changes", () => {
    const existingConfigurations: ExternalPriceConfiguration[] = [
      {
        configuration: { Papier: "matt-150g" },
        priceInfo: {
          priceRanges: [{ deliveryTime: 5, price: 10, quantity: 10 }],
        },
        sourceUrl: "https://provider.test/pricing?paper=matt-150g&foo=1",
      },
    ];
    const nextConfigurations: ExternalPriceConfiguration[] = [
      {
        configuration: { Papier: "matt-150g" },
        priceInfo: {
          priceRanges: [{ price: 12, quantity: 10 }],
        },
        sourceUrl: "https://provider.test/pricing?paper=matt-150g&foo=2",
      },
    ];

    expect(
      preserveMissingDeliveryTimesInPriceConfigurations({
        existingConfigurations,
        nextConfigurations,
      }),
    ).toEqual({
      configurations: [
        {
          configuration: { Papier: "matt-150g" },
          priceInfo: {
            priceRanges: [{ deliveryTime: 5, price: 12, quantity: 10 }],
          },
          sourceUrl: "https://provider.test/pricing?paper=matt-150g&foo=2",
        },
      ],
      preservedRangeCount: 1,
    });
  });
});
