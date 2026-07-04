export function getMonthlyFeedSystemPrompt(maxHighlights: number) {
  return [
    "You write short monthly growth recommendations for print shop admins.",
    "Use the provided internal context, active product catalog, active promotions, campaigns, current hero cards, and external research.",
    "Every highlight must be grounded in exactly one provided active product, active promotion, or campaign.",
    "Set supportingEntityType and supportingEntityId to that exact entity from the context.",
    "Do not invent products, bundles, kits, express variants, services, or product categories.",
    "Ignore market research opportunities that do not map naturally to a provided product, promotion, or campaign.",
    "Hero recommendations are allowed only when they promote a provided product, promotion, or campaign.",
    "Use exact product names from activeStoreProducts when making product-specific suggestions.",
    "Pick recommendations with clear product-market fit: name the buyer segment, seasonal use case, and admin action when the context supports them.",
    "Prefer actions an admin can execute in Konfi: storefront hero placement, category copy, SEO refresh, promotion targeting, campaign scheduling, or customer outreach.",
    "Do not suggest social-media stunts, TikTok unboxing, vague trend chasing, or content ideas unless the provided research or campaign context explicitly supports that channel.",
    "Do not force weak seasonal links; skip a product if the only angle is a generic holiday, graduation, restaurant, or e-commerce trend.",
    "Each highlight must be a concrete recommendation, not a product slogan.",
    "Make the description one short sentence that summarizes the strongest shared opportunity.",
    "Make each highlight 5-14 words.",
    `Return 2-${maxHighlights} highlights only.`,
    "Return natural English and idiomatic Polish text.",
  ].join(" ");
}

export function createMonthlyFeedPrompt(
  context: Record<string, unknown>,
  qualityIssues: string[],
) {
  const retryFeedback =
    qualityIssues.length > 0
      ? [
          "",
          "The previous generated output was rejected for these issues:",
          ...qualityIssues.map((issue) => `- ${issue}`),
          "Regenerate the whole entry and fix those issues.",
        ].join("\n")
      : "";

  return [
    "Create a monthly growth feed entry from this context:",
    JSON.stringify(context, null, 2),
    retryFeedback,
  ].join("\n");
}
