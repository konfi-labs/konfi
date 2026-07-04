import { PriceTypeEnum, Product } from "@konfi/types";
import { Firestore } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPricesForProduct } from "../fetch-prices";

const dynamicProduct = {
  id: "dynamic-product",
  name: "Dynamic product",
  priceType: PriceTypeEnum.DYNAMIC,
  dynamicPricing: {
    enabled: true,
    basePrice: 1000,
    baseDeliveryTime: 2,
    linkedPresetIds: [],
    globalRules: [],
    attributeRules: [
      {
        attributeId: "material",
        mode: "adjust",
        adjustments: [{ optionValue: "vinyl", priceAdjustment: 200 }],
      },
      {
        attributeId: "finish",
        mode: "adjust",
        adjustments: [{ optionValue: "gloss", priceAdjustment: 300 }],
      },
    ],
  },
  attributes: ["material", "finish"],
  attributeOptions: {
    finish: ["gloss", "matt"],
    material: ["paper", "vinyl"],
  },
  attributeDependencies: {
    finish: {
      dependsOn: "material",
      dependencyValues: ["vinyl"],
    },
  },
  customSize: false,
  spec: {
    minimumOrder: 10,
    maximumOrder: 1000,
    defaultOrder: 10,
    step: 10,
  },
  volumes: [{ value: 10 }, { value: 100 }],
} as Product;

describe("fetchPricesForProduct", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the combination when dynamic selected options only contain volume", async () => {
    const prices = await fetchPricesForProduct(
      {} as Firestore,
      dynamicProduct,
      "vinyl-gloss",
      "channel-1",
      undefined,
      {
        combination: "vinyl-gloss",
        selectedAttributeOptions: { volume: 10 },
      },
    );

    expect(prices?.[0]?.combination?.id).toBe("vinyl-gloss");
    expect(prices?.[0]?.value).toBe(1500);
  });

  it("applies product price offsets to locally resolved dynamic prices", async () => {
    const prices = await fetchPricesForProduct(
      {} as Firestore,
      {
        ...dynamicProduct,
        priceOffsets: {
          enabled: true,
          rules: [
            {
              enabled: true,
              id: "product-markup",
              percent: 10,
              scope: "product",
            },
            {
              attributeId: "material",
              enabled: true,
              fixedValue: 50,
              id: "vinyl-fee",
              optionValue: "vinyl",
              scope: "attributeOption",
            },
            {
              calculatedCombination: "vinyl-gloss",
              enabled: true,
              fixedValue: -20,
              id: "exact-discount",
              scope: "configuration",
              volumeValue: 10,
            },
          ],
        },
      } as Product,
      "vinyl-gloss",
      "channel-1",
      undefined,
      {
        combination: "vinyl-gloss",
        selectedAttributeOptions: {
          finish: "gloss",
          material: "vinyl",
        },
        volume: 10,
      },
    );

    expect(prices?.[0]?.value).toBe(1680);
    expect(prices?.[1]?.value).toBe(1700);
  });

  it("prefers the explicitly resolved channelId for remote dynamic pricing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ prices: [] }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPricesForProduct(
      {} as Firestore,
      {
        ...dynamicProduct,
        channelId: "stale-product-channel",
        dynamicPricing: {
          ...dynamicProduct.dynamicPricing,
          linkedPresetIds: ["preset-1"],
        },
      } as Product,
      "vinyl-gloss",
      "resolved-preview-channel",
      undefined,
      {
        combination: "vinyl-gloss",
        selectedAttributeOptions: { volume: 10 },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
    });

    const fetchOptions = fetchMock.mock.calls[0]?.[1] as
      | { body?: string }
      | undefined;
    const requestBody = JSON.parse(String(fetchOptions?.body)) as {
      channelId?: string;
      priceOffsets?: Product["priceOffsets"];
    };

    expect(requestBody.channelId).toBe("resolved-preview-channel");
    expect(requestBody.priceOffsets).toEqual(
      dynamicProduct.priceOffsets ?? null,
    );
  });

  it("resolves page-count sheet-volume dynamic pricing locally for product drafts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const prices = await fetchPricesForProduct(
      {} as Firestore,
      {
        ...dynamicProduct,
        dynamicPricing: {
          ...dynamicProduct.dynamicPricing,
          attributeRules: [],
          basePrice: 0,
          globalRules: [
            {
              calculator: "tier",
              fixedValue: 100,
              id: "sheet-rate",
              label: "Sheet rate",
              maximumMetricValue: 200,
              metric: "totalSheetVolume",
              minimumMetricValue: 0,
              outputMultiplierMetric: "totalSheetsPerUnit",
              target: "price",
            },
          ],
        },
        pageCount: {
          coverPages: 4,
          enabled: true,
          maximum: 20,
          minimum: 4,
          step: 4,
        },
      } as Product,
      "vinyl-gloss",
      "channel-1",
      4,
      {
        combination: "vinyl-gloss",
        selectedAttributeOptions: { finish: "gloss", material: "vinyl" },
        volume: 100,
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prices?.[0]?.value).toBe(200);
  });
});
