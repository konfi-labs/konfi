import type { Product } from "@konfi/types";

export const PRODUCT_SEARCH_QUERY_LIMIT = 4;
const PRODUCT_SEARCH_QUERY_MAX_LENGTH = 120;
const PRODUCT_SEARCH_MIN_TOKEN_LENGTH = 2;

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

function normalizeProductSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .trim();
}

function tokenizeProductSearchQuery(query: string): string[] {
  return Array.from(
    new Set(
      normalizeProductSearchText(query)
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= PRODUCT_SEARCH_MIN_TOKEN_LENGTH),
    ),
  );
}

export function normalizeProductSearchQueries({
  generatedQueries,
  query,
}: {
  generatedQueries?: readonly string[];
  query: string;
}): string[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  return uniqueStrings([
    trimmedQuery,
    ...(generatedQueries ?? []).filter(
      (generatedQuery) =>
        generatedQuery.trim().length <= PRODUCT_SEARCH_QUERY_MAX_LENGTH,
    ),
  ]).slice(0, PRODUCT_SEARCH_QUERY_LIMIT);
}

function productSearchFields(product: Product): string[] {
  return [
    product.id,
    product.name,
    product.description,
    product.category?.name,
    product.seo?.title,
    product.seo?.description,
    product.specialNotes,
    ...(product.keywords ?? []),
  ]
    .map(normalizeProductSearchText)
    .filter(Boolean);
}

export function scoreProductSearchMatch(
  query: string,
  product: Product,
): number {
  const normalizedQuery = normalizeProductSearchText(query);
  const queryTokens = tokenizeProductSearchQuery(query);
  const fields = productSearchFields(product);

  if (!normalizedQuery || fields.length === 0) {
    return 0;
  }

  let score = 0;

  for (const field of fields) {
    if (field === normalizedQuery) {
      score += 120;
    } else if (field.includes(normalizedQuery)) {
      score += 70;
    }

    const fieldWords = new Set(field.split(/[^a-z0-9]+/).filter(Boolean));
    for (const token of queryTokens) {
      if (fieldWords.has(token)) {
        score += 25;
      } else if (field.includes(token)) {
        score += 10;
      }
    }
  }

  return score;
}

export function rankProductSearchResults(
  query: string,
  products: readonly Product[],
): Product[] {
  return products
    .map((product, index) => ({
      product,
      index,
      score: scoreProductSearchMatch(query, product),
    }))
    .toSorted((left, right) => {
      const scoreDiff = right.score - left.score;
      return scoreDiff !== 0 ? scoreDiff : left.index - right.index;
    })
    .map(({ product }) => product);
}
