import type { Attribute, FakturowniaCostEvidence, Product } from "@konfi/types";
import { normalizeFakturowniaCostText } from "./cost-intelligence-normalization";

const COST_CANDIDATE_STOP_WORDS = new Set([
  "and",
  "bez",
  "dla",
  "do",
  "lub",
  "na",
  "oraz",
  "the",
  "with",
]);

export interface RankedCostProductCandidate {
  matchedTokens: string[];
  product: Product;
  score: number;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

function compactParts(
  parts: Array<string | number | null | undefined>,
): string {
  return parts
    .filter(
      (part): part is string | number => part !== undefined && part !== null,
    )
    .map(String)
    .join(" ");
}

function expandedCostTokens(value: string): string[] {
  const normalized = normalizeFakturowniaCostText(value);
  const tokens = normalized
    .split(" ")
    .flatMap((token) => {
      const parts = token.match(/[a-z]+|\d+/g) ?? [];
      return [token, ...parts];
    })
    .filter((token) => {
      if (COST_CANDIDATE_STOP_WORDS.has(token)) {
        return false;
      }

      return /^\d+$/.test(token) ? token.length >= 2 : token.length >= 3;
    });

  return uniqueStrings(tokens);
}

function tokenScore(token: string): number {
  if (/^\d+$/.test(token)) {
    return 3;
  }

  if (/\d/.test(token)) {
    return 2.5;
  }

  return token.length >= 5 ? 2 : 1;
}

export function costEvidenceSearchText(
  evidence: FakturowniaCostEvidence,
): string {
  return normalizeFakturowniaCostText(
    compactParts([
      evidence.normalizedText,
      evidence.position.name,
      evidence.position.code,
      evidence.position.description,
      evidence.position.fakturowniaProductId,
      evidence.quantityUnit,
      evidence.supplier.name,
    ]),
  );
}

function productAttributeSearchParts(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  product: Product;
}): string[] {
  const attributeIds = uniqueStrings([
    ...(input.product.attributes ?? []),
    ...Object.keys(input.product.attributeOptions ?? {}),
  ]);

  return attributeIds.flatMap((attributeId) => {
    const attribute = input.attributesById.get(attributeId);
    const allowedValues = input.product.attributeOptions?.[attributeId] ?? [];
    const optionsByValue = new Map(
      attribute?.options.map((option) => [option.value, option]) ?? [],
    );

    return [
      attributeId,
      attribute?.name,
      ...(attribute?.keywords ?? []),
      ...allowedValues.flatMap((value) => {
        const option = optionsByValue.get(value);
        return [
          value,
          option?.label,
          option?.formatWidth,
          option?.formatHeight,
          option?.pages,
        ];
      }),
    ]
      .filter(
        (part): part is string | number =>
          part !== undefined && part !== null && String(part).trim().length > 0,
      )
      .map(String);
  });
}

export function costProductSearchText(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  product: Product;
}): string {
  return normalizeFakturowniaCostText(
    compactParts([
      input.product.name,
      input.product.description,
      input.product.category?.name,
      input.product.productType?.name,
      input.product.seo?.title,
      input.product.seo?.description,
      input.product.provider?.productId,
      ...(input.product.keywords ?? []),
      ...productAttributeSearchParts(input),
    ]),
  );
}

export function scoreCostProductCandidate(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  evidence: FakturowniaCostEvidence;
  product: Product;
}): RankedCostProductCandidate {
  const evidenceText = costEvidenceSearchText(input.evidence);
  const productText = costProductSearchText({
    attributesById: input.attributesById,
    product: input.product,
  });
  if (!evidenceText || !productText) {
    return {
      matchedTokens: [],
      product: input.product,
      score: 0,
    };
  }

  const productName = normalizeFakturowniaCostText(input.product.name);
  const productTokens = new Set(expandedCostTokens(productText));
  const matchedTokens: string[] = [];
  let score = 0;

  if (productName && evidenceText.includes(productName)) {
    score += 8;
  }

  if (productName && productName.includes(evidenceText)) {
    score += 6;
  }

  if (
    input.evidence.position.fakturowniaProductId &&
    input.product.provider?.productId ===
      input.evidence.position.fakturowniaProductId
  ) {
    score += 10;
  }

  for (const token of expandedCostTokens(evidenceText)) {
    if (productTokens.has(token)) {
      matchedTokens.push(token);
      score += tokenScore(token);
      continue;
    }

    if (token.length >= 4 && productText.includes(token)) {
      matchedTokens.push(token);
      score += 0.75;
    }
  }

  return {
    matchedTokens: uniqueStrings(matchedTokens),
    product: input.product,
    score,
  };
}

export function rankCostProductCandidates(input: {
  attributesById: ReadonlyMap<string, Attribute>;
  evidence: FakturowniaCostEvidence;
  limit: number;
  products: readonly Product[];
}): RankedCostProductCandidate[] {
  return input.products
    .map((product) =>
      scoreCostProductCandidate({
        attributesById: input.attributesById,
        evidence: input.evidence,
        product,
      }),
    )
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.product.name.localeCompare(right.product.name),
    )
    .slice(0, input.limit);
}
