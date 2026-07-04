import { PromotionRuleAttributeEnum } from "@konfi/types";
import { getPromotionRuleValueResetIndexes } from "./promotion-rule-value-reset";

describe("getPromotionRuleValueResetIndexes", () => {
  it("returns an empty list when rules are missing", () => {
    expect(getPromotionRuleValueResetIndexes([], undefined)).toEqual([]);
  });

  it("returns changed rule indexes when attributes switch", () => {
    expect(
      getPromotionRuleValueResetIndexes(
        [
          PromotionRuleAttributeEnum.CURRENCY,
          PromotionRuleAttributeEnum.PRODUCT,
        ],
        [
          { attribute: PromotionRuleAttributeEnum.USER },
          { attribute: PromotionRuleAttributeEnum.PRODUCT },
        ],
      ),
    ).toEqual([0]);
  });

  it("ignores first render and unchanged attributes", () => {
    expect(
      getPromotionRuleValueResetIndexes(
        [undefined, PromotionRuleAttributeEnum.CATEGORY],
        [
          { attribute: PromotionRuleAttributeEnum.CURRENCY },
          { attribute: PromotionRuleAttributeEnum.CATEGORY },
        ],
      ),
    ).toEqual([]);
  });
});