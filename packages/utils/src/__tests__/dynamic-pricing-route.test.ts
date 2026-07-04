import { PriceTypeEnum, Product } from "@konfi/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DynamicPricingRouteReaders,
  resolveDynamicPricingRoutePrices,
  sanitizeDynamicPricingRouteBody,
} from "../dynamic-pricing-route";

function createTimestamp(date: Date) {
  return {
    toDate: () => date,
  };
}

function createProduct(overrides?: Partial<Product>): Product {
  return {
    active: true,
    attributes: ["material"],
    attributeDependencies: {},
    attributeOptions: {
      material: ["paper", "vinyl"],
    },
    availability: {
      availableForPurchase: true,
      published: true,
      publication: createTimestamp(new Date(Date.now() - 60_000)),
    },
    customSize: false,
    defaultPrice: {
      currency: "PLN",
    },
    dynamicPricing: {
      attributeRules: [
        {
          adjustments: [{ optionValue: "vinyl", priceAdjustment: 200 }],
          attributeId: "material",
          mode: "adjust",
        },
      ],
      baseDeliveryTime: 2,
      basePrice: 1000,
      enabled: true,
      globalRules: [],
      linkedPresetIds: [],
    },
    id: "product-1",
    priceType: PriceTypeEnum.DYNAMIC,
    spec: {
      defaultOrder: 10,
      maximumOrder: 100,
      minimumOrder: 10,
    },
    volumes: [{ value: 10 }],
    ...overrides,
  } as Product;
}

describe("dynamic pricing route helpers", () => {
  let readers: DynamicPricingRouteReaders;

  beforeEach(() => {
    readers = {
      getDynamicPricingAttributes: vi.fn(async () => []),
      getDynamicPricingPresetsByIds: vi.fn(async () => []),
      getProduct: vi.fn(async () => createProduct()),
      getProductDynamicPricing: vi.fn(async () => undefined),
    };
  });

  it("sanitizes safe request bodies and blocks unsafe option keys", () => {
    expect(
      sanitizeDynamicPricingRouteBody({
        channelId: "channel-1",
        productId: "product-1",
        selectedAttributeOptions: {
          material: "vinyl",
        },
        volume: 10,
      }),
    ).toEqual({
      channelId: "channel-1",
      productId: "product-1",
      selectedAttributeOptions: {
        material: "vinyl",
      },
      volume: 10,
    });

    expect(
      sanitizeDynamicPricingRouteBody(
        JSON.parse(
          '{"channelId":"channel-1","productId":"product-1","selectedAttributeOptions":{"__proto__":"polluted"}}',
        ),
      ),
    ).toBeNull();
  });

  it("returns a bad request result when product context is missing", async () => {
    const result = await resolveDynamicPricingRoutePrices({
      allowAdminPreview: false,
      body: {
        channelId: "channel-1",
      },
      readers,
    });

    expect(result).toEqual({
      error: "Missing product pricing context",
      kind: "bad-request",
    });
  });

  it("resolves dynamic prices with explicit selected options", async () => {
    const result = await resolveDynamicPricingRoutePrices({
      allowAdminPreview: false,
      body: {
        calculatedCombination: "vinyl",
        channelId: "channel-1",
        productId: "product-1",
        selectedAttributeOptions: {
          material: "vinyl",
        },
      },
      readers,
    });

    expect(result).toMatchObject({
      kind: "prices",
      prices: [
        {
          combination: {
            id: "vinyl",
          },
          value: 1200,
        },
      ],
    });
  });

  it("applies persisted product price offsets to route-resolved prices", async () => {
    readers = {
      ...readers,
      getProduct: vi.fn(async () =>
        createProduct({
          priceOffsets: {
            enabled: true,
            rules: [
              {
                enabled: true,
                fixedValue: 25,
                id: "product-fee",
                percent: 10,
                scope: "product",
              },
            ],
          },
        }),
      ),
    };

    const result = await resolveDynamicPricingRoutePrices({
      allowAdminPreview: false,
      body: {
        calculatedCombination: "vinyl",
        channelId: "channel-1",
        productId: "product-1",
        selectedAttributeOptions: {
          material: "vinyl",
        },
      },
      readers,
    });

    expect(result).toMatchObject({
      kind: "prices",
      prices: [
        {
          value: 1345,
        },
      ],
    });
  });

  it("uses request price offsets only for admin preview", async () => {
    const body = sanitizeDynamicPricingRouteBody({
      calculatedCombination: "vinyl",
      channelId: "channel-1",
      priceOffsets: {
        enabled: true,
        rules: [
          {
            enabled: true,
            fixedValue: -500,
            id: "preview-discount",
            scope: "product",
          },
        ],
      },
      productId: "product-1",
      selectedAttributeOptions: {
        material: "vinyl",
      },
    });

    expect(body).not.toBeNull();

    await expect(
      resolveDynamicPricingRoutePrices({
        allowAdminPreview: false,
        body: body!,
        readers,
      }),
    ).resolves.toMatchObject({
      kind: "prices",
      prices: [
        {
          value: 1200,
        },
      ],
    });

    await expect(
      resolveDynamicPricingRoutePrices({
        allowAdminPreview: true,
        body: body!,
        readers,
      }),
    ).resolves.toMatchObject({
      kind: "prices",
      prices: [
        {
          value: 700,
        },
      ],
    });
  });

  it("uses subcollection dynamic pricing when the product document is trimmed", async () => {
    readers = {
      ...readers,
      getProduct: vi.fn(async () =>
        createProduct({
          dynamicPricing: undefined,
        }),
      ),
      getProductDynamicPricing: vi.fn(async () => ({
        attributeRules: [],
        baseDeliveryTime: 2,
        basePrice: 900,
        enabled: true,
        globalRules: [],
        linkedPresetIds: [],
      })),
    };

    const result = await resolveDynamicPricingRoutePrices({
      allowAdminPreview: false,
      body: {
        channelId: "channel-1",
        combination: "vinyl",
        productId: "product-1",
      },
      readers,
    });

    expect(result).toMatchObject({
      kind: "prices",
      prices: [
        {
          value: 900,
        },
      ],
    });
    expect(readers.getProductDynamicPricing).toHaveBeenCalledWith(
      "channel-1",
      "product-1",
    );
  });

  it("does not resolve unpublished products unless admin preview is allowed", async () => {
    readers = {
      ...readers,
      getProduct: vi.fn(async () =>
        createProduct({
          availability: {
            availableForPurchase: false,
            published: false,
            publication: createTimestamp(new Date(Date.now() + 60_000)),
          },
        }),
      ),
    };

    await expect(
      resolveDynamicPricingRoutePrices({
        allowAdminPreview: false,
        body: {
          channelId: "channel-1",
          productId: "product-1",
        },
        readers,
      }),
    ).resolves.toEqual({
      kind: "prices",
      prices: [],
    });

    const adminResult = await resolveDynamicPricingRoutePrices({
      allowAdminPreview: true,
      body: {
        channelId: "channel-1",
        productId: "product-1",
      },
      readers,
    });

    expect(adminResult).toMatchObject({
      kind: "prices",
      prices: [
        {
          value: 1000,
        },
      ],
    });
  });
});
