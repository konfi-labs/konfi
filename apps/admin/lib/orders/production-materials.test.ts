import {
  PriceTypeEnum,
  productionGroupingClassificationVersion,
  type OrderItem,
  type ProductionGroupingClassification,
  type ProductionGroupingProfile,
} from "@konfi/types";
import { describe, expect, test } from "vitest";
import {
  classifyProductionGroupingDeterministic,
  createProductionGroupingGroupKey,
  getProductionGroupingCacheKey,
  getProductionGroupingInputHash,
  getProductionGroupingProfileHash,
  getProductionGroupingSignatureHash,
  PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
  productionGroupingNeedsAiClassification,
  resolveProductionGroupingClassification,
  toSerializableProductionGroupingItems,
} from "./production-materials";

const profile: ProductionGroupingProfile = {
  id: "default",
  label: "Production grouping",
  primaryAxis: {
    aliases: ["material", "substrate", "paper"],
    allowAiSuggestedValues: true,
    id: "material",
    label: "Material",
  },
  secondaryAxis: {
    aliases: ["finish", "lamination"],
    allowedValues: [
      {
        aliases: ["mat", "matte"],
        key: "matte",
        label: "Matte",
      },
      {
        aliases: ["gloss", "glossy"],
        key: "gloss",
        label: "Gloss",
      },
    ],
    allowAiSuggestedValues: true,
    id: "finish",
    label: "Finish",
  },
};

const profileWithoutSecondary: ProductionGroupingProfile = {
  ...profile,
  secondaryAxis: null,
};

function orderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    active: true,
    calculatedCombination: null,
    combination: null,
    customFormat: false,
    customPrice: null,
    description: "",
    discount: {
      code: null,
      discountedAmount: 0,
      discountValue: 0,
      type: "PERCENTAGE",
    },
    id: "item-1",
    name: "Poster",
    product: {
      attributeOptions: {},
      attributes: [],
      category: {
        id: "cat-1",
        name: "Posters",
      },
      id: "product-1",
      name: "Poster",
      priceType: PriceTypeEnum.MATRIX,
      productType: {
        id: "type-1",
        name: "Poster",
      },
    } as OrderItem["product"],
    quantity: 1,
    totalPrice: 100,
    unit: "PCS",
    ...overrides,
  };
}

describe("production grouping helpers", () => {
  test("builds stable item hashes for equivalent classification inputs", () => {
    const first = orderItem({
      description: "Material: PVC 3mm, Finish: Matte",
    });
    const second = orderItem({
      description: "Material: PVC 3mm, Finish: Matte",
      quantity: 100,
    });

    expect(getProductionGroupingInputHash(first)).toBe(
      getProductionGroupingInputHash(second),
    );
  });

  test("invalidates signatures when the grouping profile changes", () => {
    const item = orderItem({
      description: "Material: PVC 3mm",
    });
    const windowProfile: ProductionGroupingProfile = {
      ...profileWithoutSecondary,
      primaryAxis: {
        aliases: ["glass"],
        id: "glass",
        label: "Glass",
      },
    };

    expect(getProductionGroupingProfileHash(profileWithoutSecondary)).not.toBe(
      getProductionGroupingProfileHash(windowProfile),
    );
    expect(
      getProductionGroupingSignatureHash(item, profileWithoutSecondary),
    ).not.toBe(getProductionGroupingSignatureHash(item, windowProfile));
  });

  test("classifies configured primary and secondary fields deterministically", () => {
    const item = toSerializableProductionGroupingItems([
      orderItem({
        description: "Material: Folia monomeryczna, Finish: Matte",
      }),
    ])[0];

    const classification = classifyProductionGroupingDeterministic(
      item,
      profile,
    );

    expect(classification).toMatchObject({
      confidence: 0.95,
      needsAi: false,
      source: "deterministic",
    });
    expect(classification.primary).toMatchObject({
      groupKey: "material:folia-monomeryczna",
      label: "Folia monomeryczna",
    });
    expect(classification.secondary).toMatchObject({
      groupKey: "finish:matte",
      label: "Matte",
    });
  });

  test("does not infer configured values from unrelated text without an axis field", () => {
    const item = toSerializableProductionGroupingItems([
      orderItem({
        description: "Material: PVC 3mm, gloss surface",
      }),
    ])[0];

    const classification = classifyProductionGroupingDeterministic(
      item,
      profile,
    );

    expect(classification.primary).toMatchObject({
      groupKey: "material:pvc-3mm",
      label: "PVC 3mm",
    });
    expect(classification.secondary).toBeUndefined();
    expect(classification.needsAi).toBe(true);
  });

  test("uses tenant profile aliases instead of hardcoded print labels", () => {
    const windowProfile: ProductionGroupingProfile = {
      id: "windows",
      label: "Window production",
      primaryAxis: {
        aliases: ["profile"],
        id: "frameProfile",
        label: "Frame profile",
      },
      secondaryAxis: null,
    };
    const item = toSerializableProductionGroupingItems([
      orderItem({
        description: "Profile: Aluprof MB-86, Color: white",
      }),
    ])[0];

    const classification = classifyProductionGroupingDeterministic(
      item,
      windowProfile,
    );

    expect(classification.primary).toMatchObject({
      groupKey: "frameProfile:aluprof-mb-86",
      label: "Aluprof MB-86",
    });
    expect(classification.needsAi).toBe(false);
  });

  test("marks unresolved primary grouping as an AI candidate", () => {
    const classification = classifyProductionGroupingDeterministic(
      toSerializableProductionGroupingItems([
        orderItem({
          name: "Custom wedding board",
          product: {
            ...orderItem().product,
            name: "Custom product",
            priceType: PriceTypeEnum.SINGLE,
          } as OrderItem["product"],
        }),
      ])[0],
      profile,
    );

    expect(classification.needsAi).toBe(true);
    expect(classification.primary.groupKey).toBe(
      PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
    );
  });

  test("uses matching cached classifications and skips AI", () => {
    const item = toSerializableProductionGroupingItems([
      orderItem({
        name: "Custom PVC sign",
        product: {
          ...orderItem().product,
          priceType: PriceTypeEnum.SINGLE,
        } as OrderItem["product"],
      }),
    ])[0];
    const cached: ProductionGroupingClassification = {
      classificationVersion: productionGroupingClassificationVersion,
      confidence: 0.91,
      inputHash: getProductionGroupingInputHash(item),
      itemId: item.id,
      primary: {
        axisId: "material",
        groupKey: createProductionGroupingGroupKey(profile.primaryAxis, "PVC"),
        key: "pvc",
        label: "PVC",
      },
      profileHash: getProductionGroupingProfileHash(profile),
      profileId: profile.id,
      signatureHash: getProductionGroupingSignatureHash(item, profile),
      source: "ai",
    };

    expect(
      resolveProductionGroupingClassification(item, profile, cached),
    ).toMatchObject({
      needsAi: false,
      primary: {
        groupKey: "material:pvc",
        label: "PVC",
      },
      source: "ai",
    });
    expect(productionGroupingNeedsAiClassification(item, profile, cached)).toBe(
      false,
    );
  });

  test("falls back to deterministic classification for stale profile cache", () => {
    const item = toSerializableProductionGroupingItems([
      orderItem({
        name: "Custom order",
        product: {
          ...orderItem().product,
          priceType: PriceTypeEnum.SINGLE,
        } as OrderItem["product"],
      }),
    ])[0];
    const cached: ProductionGroupingClassification = {
      classificationVersion: productionGroupingClassificationVersion,
      confidence: 0.91,
      inputHash: getProductionGroupingInputHash(item),
      itemId: item.id,
      primary: {
        axisId: "material",
        groupKey: "material:pvc",
        key: "pvc",
        label: "PVC",
      },
      profileHash: "stale-profile",
      profileId: profile.id,
      signatureHash: getProductionGroupingSignatureHash(item, profile),
      source: "ai",
    };

    expect(
      resolveProductionGroupingClassification(item, profile, cached),
    ).toMatchObject({
      needsAi: true,
      primary: {
        groupKey: PRODUCTION_GROUPING_UNCLASSIFIED_KEY,
      },
      source: "unclassified",
    });
  });

  test("creates cache keys by order and item", () => {
    expect(getProductionGroupingCacheKey("order-1", "item-2")).toBe(
      "order-1:item-2",
    );
  });
});
