import type { CreatePromotionRule } from "@konfi/types";

type PromotionRuleAttribute = CreatePromotionRule["attribute"];

type PromotionRuleLike = {
  attribute?: PromotionRuleAttribute;
};

export function getPromotionRuleValueResetIndexes(
  previousAttributes: Array<PromotionRuleAttribute | undefined>,
  rules: PromotionRuleLike[] | undefined,
): number[] {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.reduce<number[]>((indexes, rule, index) => {
    const previousAttribute = previousAttributes[index];
    const currentAttribute = rule?.attribute;

    if (previousAttribute && previousAttribute !== currentAttribute) {
      indexes.push(index);
    }

    return indexes;
  }, []);
}