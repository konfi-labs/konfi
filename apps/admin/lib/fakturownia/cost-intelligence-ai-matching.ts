import type { Attribute, Product } from "@konfi/types";

export const AI_COST_MATCH_CONFIDENCE_THRESHOLD = 0.9;

export interface RawAiCostMatch {
  attributeId?: string | null;
  confidence: number;
  optionValue?: string | null;
  productId?: string | null;
  reasoning?: string | null;
}

export interface ResolvedAiCostMatch {
  attributeId?: string;
  attributeName?: string;
  confidence: number;
  optionLabel?: string;
  optionValue?: string;
  /**
   * The matched catalog product, when the AI tied the cost to a single finished
   * product. Absent for material-level matches: an (attributeId, optionValue)
   * that applies to every product using that option (shared material cost).
   */
  product?: Product;
  reasoning?: string;
  sourceSignals: string[];
}

function normalizeConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    return 0;
  }

  if (confidence > 1 && confidence <= 100) {
    return confidence / 100;
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Resolves a raw AI cost match into a high-confidence catalog match, or null
 * when it is below threshold or carries no actionable signal.
 *
 * Two shapes are accepted, in order of preference:
 *  - **Material match** — a valid (attributeId, optionValue) with NO productId.
 *    The cost applies to every product using that option, so it is validated
 *    product-agnostically against the global attribute catalog.
 *  - **Product match** — a productId from the bounded candidate list, optionally
 *    narrowed to an (attributeId, optionValue) the product actually uses.
 *
 * A productId that is supplied but absent from the candidate list is treated as
 * a hallucination and rejects the whole match. A match with neither a valid
 * product nor a valid material classification returns null.
 */
export function resolveHighConfidenceAiCostMatch(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  match: RawAiCostMatch;
  products: readonly Product[];
  threshold?: number;
}): ResolvedAiCostMatch | null {
  const confidence = normalizeConfidence(input.match.confidence);
  if (confidence < (input.threshold ?? AI_COST_MATCH_CONFIDENCE_THRESHOLD)) {
    return null;
  }

  // A product id, when supplied, must resolve to a bounded candidate. An
  // unknown id is a hallucination and rejects the whole match.
  const productId = input.match.productId?.trim();
  let product: Product | undefined;
  if (productId) {
    product = input.products.find((candidate) => candidate.id === productId);
    if (!product) {
      return null;
    }
  }

  const attributeId = input.match.attributeId?.trim();
  const optionValue = input.match.optionValue?.trim();
  const attribute = attributeId
    ? input.attributesById.get(attributeId)
    : undefined;
  const option =
    attribute && optionValue
      ? attribute.options.find((candidate) => candidate.value === optionValue)
      : undefined;

  // When a product is present the option must be one the product actually uses
  // (trusting the product's own option list). When no product is present the
  // option is validated product-agnostically against the global attribute.
  const productOptionAllowed = Boolean(
    product &&
      attributeId &&
      optionValue &&
      product.attributeOptions?.[attributeId]?.includes(optionValue),
  );
  const materialOptionValid = Boolean(!product && option);
  const hasMaterial = productOptionAllowed || materialOptionValid;

  // Neither a product nor a usable material classification — nothing to apply.
  if (!product && !hasMaterial) {
    return null;
  }

  const reasoning = input.match.reasoning?.trim().slice(0, 500);
  const sourceSignals = ["ai_high_confidence_match"];
  if (!product && hasMaterial) {
    sourceSignals.push("ai_material_option_match");
  }

  return {
    ...(hasMaterial && attributeId ? { attributeId } : {}),
    ...(hasMaterial && attribute?.name
      ? { attributeName: attribute.name }
      : {}),
    confidence,
    ...(hasMaterial && option?.label ? { optionLabel: option.label } : {}),
    ...(hasMaterial && optionValue ? { optionValue } : {}),
    ...(product ? { product } : {}),
    ...(reasoning ? { reasoning } : {}),
    sourceSignals,
  };
}
