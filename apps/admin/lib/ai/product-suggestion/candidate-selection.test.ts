import { describe, expect, it } from "vitest";
import type { FormattedOrderItem } from "@konfi/types";
import { selectBestProductSuggestionCandidate } from "./candidate-selection";

function createCandidateItem({
  customSizes = [],
  productId,
  totalPrice,
}: {
  customSizes?: NonNullable<FormattedOrderItem["customSizes"]>;
  productId: string;
  totalPrice: number;
}): FormattedOrderItem {
  return {
    calculatedCombination: undefined,
    combination: undefined,
    customFormat: customSizes.length > 0,
    customPrice: null,
    customSizes,
    description: "",
    discount: { percentage: 0, value: 0 },
    height: 0,
    id: `${productId}-item`,
    name: "",
    product: {
      channelId: "channel",
      id: productId,
      name: productId,
      spec: { images: [] },
    },
    quantity: 1,
    totalPrice,
    unit: "PCS",
    volume: 0,
    width: 0,
  } as FormattedOrderItem;
}

describe("product suggestion candidate selection", () => {
  it("does not choose a cheaper candidate that drops requested sizes", () => {
    const selected = selectBestProductSuggestionCandidate({
      candidates: [
        {
          deliveryTime: 2,
          item: createCandidateItem({
            customSizes: [
              { width: 707, height: 1000, quantity: 40 },
              { width: 500, height: 707, quantity: 40 },
            ],
            productId: "plakaty-standardowe",
            totalPrice: 12000,
          }),
        },
        {
          deliveryTime: 1,
          item: createCandidateItem({
            productId: "plakaty-jednostronne",
            totalPrice: 9000,
          }),
        },
      ],
      primaryProductId: "plakaty-standardowe",
      requestedMultipleSizes: { hasMultipleSizes: true, sizesCount: 2 },
    });

    expect(selected?.item.product.id).toBe("plakaty-standardowe");
  });

  it("does not let cheaper alternatives beat a faster primary product", () => {
    const selected = selectBestProductSuggestionCandidate({
      candidates: [
        {
          deliveryTime: 1,
          item: createCandidateItem({
            productId: "plakaty-standardowe",
            totalPrice: 12000,
          }),
        },
        {
          deliveryTime: 3,
          item: createCandidateItem({
            productId: "plakaty-jednostronne",
            totalPrice: 9000,
          }),
        },
      ],
      primaryProductId: "plakaty-standardowe",
    });

    expect(selected?.item.product.id).toBe("plakaty-standardowe");
  });

  it("uses price when the alternative is complete and not slower", () => {
    const selected = selectBestProductSuggestionCandidate({
      candidates: [
        {
          deliveryTime: 2,
          item: createCandidateItem({
            productId: "flyers",
            totalPrice: 8000,
          }),
        },
        {
          deliveryTime: 2,
          item: createCandidateItem({
            productId: "prints",
            totalPrice: 6000,
          }),
        },
      ],
      primaryProductId: "flyers",
    });

    expect(selected?.item.product.id).toBe("prints");
  });
});
