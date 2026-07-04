import {
  CurrencyEnum,
  PromotionRule,
  PromotionRuleAttributeEnum,
} from "@konfi/types";
import { validatePromotionRules } from "../../price";

describe("validatePromotionRules", () => {
  const productId = "product-123";
  const categoryId = "category-456";
  const currency = CurrencyEnum.PLN;

  it("should match when PRODUCT rule uses EQ with correct product id", () => {
    const rules: PromotionRule[] = [
      { id: "r1", attribute: "PRODUCT", operator: "EQ", values: [productId] },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      true,
    );
  });

  it("should NOT match when PRODUCT rule uses EQ with wrong product id", () => {
    const rules: PromotionRule[] = [
      { id: "r1", attribute: "PRODUCT", operator: "EQ", values: ["other-id"] },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should match when CATEGORY rule uses IN with matching category", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "CATEGORY",
        operator: "IN",
        values: ["cat-a", categoryId, "cat-b"],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      true,
    );
  });

  it("should NOT match when CATEGORY rule uses IN without matching category", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "CATEGORY",
        operator: "IN",
        values: ["cat-a", "cat-b"],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should match CURRENCY rule with EQ operator", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "CURRENCY",
        operator: "EQ",
        values: [CurrencyEnum.PLN],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      true,
    );
  });

  it("should NOT match CURRENCY rule when currency differs", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "CURRENCY",
        operator: "EQ",
        values: ["EUR"],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should match when NE operator is used and value differs", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "PRODUCT",
        operator: "NE",
        values: ["other-product"],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      true,
    );
  });

  it("should require ALL rules to match (every semantics)", () => {
    const rules: PromotionRule[] = [
      { id: "r1", attribute: "PRODUCT", operator: "EQ", values: [productId] },
      {
        id: "r2",
        attribute: "CURRENCY",
        operator: "EQ",
        values: ["EUR"],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  // --- Edge cases: invalid / malformed rules should not crash ---

  it("should return false when a rule has no attribute", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: undefined as unknown as PromotionRule["attribute"],
        operator: "EQ",
        values: [productId],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should return false when a rule has no operator", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "PRODUCT",
        operator: undefined as unknown as PromotionRule["operator"],
        values: [productId],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should return false when a rule has empty values array", () => {
    const rules: PromotionRule[] = [
      { id: "r1", attribute: "PRODUCT", operator: "EQ", values: [] },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should return false when a rule has null values", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "PRODUCT",
        operator: "EQ",
        values: null as unknown as string[],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should return false for an unrecognized attribute", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "UNKNOWN_ATTR" as PromotionRule["attribute"],
        operator: "EQ",
        values: ["anything"],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should return false for an unrecognized operator", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "PRODUCT",
        operator: "LIKE" as PromotionRule["operator"],
        values: [productId],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should return true for an empty rules array (vacuously true)", () => {
    expect(validatePromotionRules([], productId, categoryId, currency)).toBe(
      true,
    );
  });

  it("should handle CATEOGRY typo attribute correctly", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: "CATEOGRY" as PromotionRule["attribute"],
        operator: "EQ",
        values: [categoryId],
      },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      true,
    );
  });

  it("should match USER rule when userId is provided", () => {
    const rules: PromotionRule[] = [
      { id: "r1", attribute: "USER", operator: "EQ", values: ["user-789"] },
    ];
    expect(
      validatePromotionRules(
        rules,
        productId,
        categoryId,
        currency,
        "user-789",
      ),
    ).toBe(true);
  });

  it("should NOT match USER rule when userId is not provided", () => {
    const rules: PromotionRule[] = [
      { id: "r1", attribute: "USER", operator: "EQ", values: ["user-789"] },
    ];
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      false,
    );
  });

  it("should handle GT/LT/GTE/LTE operators on string values", () => {
    const rules: PromotionRule[] = [
      { id: "r1", attribute: "PRODUCT", operator: "GT", values: ["a"] },
    ];
    // "product-123" > "a" lexicographically
    expect(validatePromotionRules(rules, productId, categoryId, currency)).toBe(
      true,
    );
  });

  it("matches CUSTOMER_GROUP rules against any assigned customer group", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: PromotionRuleAttributeEnum.CUSTOMER_GROUP,
        operator: "IN",
        values: ["vip", "reseller"],
      },
    ];

    expect(
      validatePromotionRules(
        rules,
        productId,
        categoryId,
        currency,
        undefined,
        {
          customerGroupIds: ["b2b", "vip"],
        },
      ),
    ).toBe(true);
  });

  it("does not match CUSTOMER_GROUP rules when context has no overlap", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: PromotionRuleAttributeEnum.CUSTOMER_GROUP,
        operator: "IN",
        values: ["vip"],
      },
    ];

    expect(
      validatePromotionRules(
        rules,
        productId,
        categoryId,
        currency,
        undefined,
        {
          customerGroupIds: ["b2b"],
        },
      ),
    ).toBe(false);
  });

  it("matches CHANNEL and PRODUCT_TYPE rules from commerce context", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: PromotionRuleAttributeEnum.CHANNEL,
        operator: "EQ",
        values: ["storefront"],
      },
      {
        id: "r2",
        attribute: PromotionRuleAttributeEnum.PRODUCT_TYPE,
        operator: "EQ",
        values: ["print"],
      },
    ];

    expect(
      validatePromotionRules(
        rules,
        productId,
        categoryId,
        currency,
        undefined,
        {
          channelId: "storefront",
          productTypeId: "print",
        },
      ),
    ).toBe(true);
  });

  it("matches FIRST_ORDER and USAGE_COUNT rules from commerce context", () => {
    const rules: PromotionRule[] = [
      {
        id: "r1",
        attribute: PromotionRuleAttributeEnum.FIRST_ORDER,
        operator: "EQ",
        values: ["true"],
      },
      {
        id: "r2",
        attribute: PromotionRuleAttributeEnum.USAGE_COUNT,
        operator: "LT",
        values: ["3"],
      },
    ];

    expect(
      validatePromotionRules(
        rules,
        productId,
        categoryId,
        currency,
        undefined,
        {
          isFirstOrder: true,
          usageCount: 2,
        },
      ),
    ).toBe(true);
  });
});
