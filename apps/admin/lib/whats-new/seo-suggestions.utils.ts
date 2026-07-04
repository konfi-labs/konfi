import type { ProductSeoSuggestion, SeoSuggestionDraft } from "./types";

export interface SeoDraftGroundingSource {
  name: string;
  category?: string;
  keywords?: string[];
}

export function normalizeSeoDraft(
  draft: Partial<SeoSuggestionDraft> | undefined,
  productName: string,
): SeoSuggestionDraft {
  return {
    title: draft?.title?.trim() || productName,
    description: draft?.description?.trim() || "",
  };
}

export function sortSeoSuggestions(suggestions: ProductSeoSuggestion[]) {
  return suggestions.toSorted((left, right) =>
    left.productName.localeCompare(right.productName),
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[łŁ]/g, "l")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pl-PL");
}

function getGroundingTokens(source: SeoDraftGroundingSource) {
  return [source.name, source.category ?? "", ...(source.keywords ?? [])]
    .flatMap((value) => normalizeSearchText(value).split(/[^a-z0-9]+/u))
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

export function isSeoDraftGroundedInProduct(
  draft: SeoSuggestionDraft,
  source: SeoDraftGroundingSource,
) {
  const tokens = getGroundingTokens(source);

  if (tokens.length === 0) {
    return true;
  }

  const text = normalizeSearchText(`${draft.title} ${draft.description}`);

  return tokens.some((token) => text.includes(token));
}
