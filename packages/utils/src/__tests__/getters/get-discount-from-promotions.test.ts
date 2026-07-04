import { getDiscountFromPromotion } from "../../getters/get-discount-from-promotion";
import {
  Promotion,
  ApplicationMethodTypeEnum,
  ApplicationMethodTargetTypeEnum,
  ApplicationMethodAllocationEnum,
  DiscountTypeEnum,
  Discount,
  PromotionRuleAttributeEnum,
  PromotionRuleOperatorEnum,
} from "@konfi/types";

describe("getDiscountFromPromotion", () => {
  it("should return discount for SHIPPING_METHODS with PERCENTAGE type", () => {
    const promotion: Omit<Promotion, "createdAt" | "updatedAt"> = {
      id: "promotion-1",
      active: true,
      applicationMethod: {
        id: "promotion-1",
        type: ApplicationMethodTypeEnum.PERCENTAGE,
        targetType: ApplicationMethodTargetTypeEnum.SHIPPING_METHODS,
        allocation: ApplicationMethodAllocationEnum.ACROSS,
        value: 10, // 10% discount
      },
      rules: [],
    };

    const price = 100;
    const result = getDiscountFromPromotion(promotion, price);

    expect(result.discount).toEqual(
      new Discount(undefined, DiscountTypeEnum.PERCENTAGE, 10, 10, undefined),
    );
  });

  it("should return discount for ORDER with FIXED type", () => {
    const promotion: Omit<Promotion, "createdAt" | "updatedAt"> = {
      id: "promotion-1",
      active: true,
      applicationMethod: {
        id: "promotion-1",
        type: ApplicationMethodTypeEnum.FIXED,
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
        allocation: ApplicationMethodAllocationEnum.ACROSS,
        value: 20,
      },
      rules: [],
    };

    const price = 100;
    const result = getDiscountFromPromotion(promotion, price);

    expect(result.discount).toEqual(
      new Discount(undefined, DiscountTypeEnum.FIXED, 20, 20, undefined),
    );
  });

  it("should return empty result when subtotal is below minimum order value", () => {
    const promotion: Omit<Promotion, "createdAt" | "updatedAt"> = {
      id: "promotion-1",
      active: true,
      minimumOrderValue: 30000,
      applicationMethod: {
        id: "promotion-1",
        type: ApplicationMethodTypeEnum.FIXED,
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
        allocation: ApplicationMethodAllocationEnum.ACROSS,
        value: 10000,
      },
      rules: [],
    };

    const result = getDiscountFromPromotion(
      promotion,
      35000,
      undefined,
      undefined,
      undefined,
      25000,
    );

    expect(result).toEqual({});
  });

  it("should return discount when subtotal meets minimum order value", () => {
    const promotion: Omit<Promotion, "createdAt" | "updatedAt"> = {
      id: "promotion-1",
      active: true,
      minimumOrderValue: 30000,
      applicationMethod: {
        id: "promotion-1",
        type: ApplicationMethodTypeEnum.FIXED,
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
        allocation: ApplicationMethodAllocationEnum.ACROSS,
        value: 10000,
      },
      rules: [],
    };

    const result = getDiscountFromPromotion(
      promotion,
      35000,
      undefined,
      undefined,
      undefined,
      30000,
    );

    expect(result.discount).toEqual(
      new Discount(undefined, DiscountTypeEnum.FIXED, 10000, 10000, undefined),
    );
  });

  it("evaluates promotion currency rules against the supplied order currency", () => {
    const promotion: Omit<Promotion, "createdAt" | "updatedAt"> = {
      id: "promotion-eur",
      active: true,
      applicationMethod: {
        id: "promotion-eur",
        type: ApplicationMethodTypeEnum.FIXED,
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
        allocation: ApplicationMethodAllocationEnum.ACROSS,
        value: 500,
        currencyCode: "EUR",
      },
      rules: [
        {
          id: "currency-rule",
          attribute: PromotionRuleAttributeEnum.CURRENCY,
          operator: PromotionRuleOperatorEnum.EQ,
          values: ["EUR"],
        },
      ],
    };

    expect(
      getDiscountFromPromotion(
        promotion,
        10000,
        undefined,
        undefined,
        undefined,
        10000,
        "EUR",
      ).discount,
    ).toEqual(
      new Discount(undefined, DiscountTypeEnum.FIXED, 500, 500, undefined),
    );
    expect(
      getDiscountFromPromotion(
        promotion,
        10000,
        undefined,
        undefined,
        undefined,
        10000,
        "PLN",
      ),
    ).toEqual({});
  });

  it("should return empty result if promotion is inactive", () => {
    const promotion: Omit<Promotion, "createdAt" | "updatedAt"> = {
      id: "promotion-1",
      active: false,
      applicationMethod: {
        id: "promotion-1",
        type: ApplicationMethodTypeEnum.FIXED,
        targetType: ApplicationMethodTargetTypeEnum.ORDER,
        allocation: ApplicationMethodAllocationEnum.ACROSS,
        value: 20,
      },
      rules: [],
    };

    const price = 100;
    const result = getDiscountFromPromotion(promotion, price);

    expect(result).toEqual({});
  });

  // Add more test cases covering different scenarios
});
