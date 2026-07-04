type NullableString = string | null | undefined;

export type ProductImageCustomSize = {
  name?: NullableString;
  width?: number | null;
  height?: number | null;
};

export type ProductImageSpecInput = {
  minimumWidth?: number | null;
  maximumWidth?: number | null;
  minimumHeight?: number | null;
  maximumHeight?: number | null;
  validateRatio?: boolean | null;
  minimumRatio?: number | null;
  maximumRatio?: number | null;
};

export type ProductImagePromptContextInput = {
  name?: NullableString;
  description?: NullableString;
  category?: { name?: NullableString } | NullableString;
  productType?: { name?: NullableString } | NullableString;
  customSize?: boolean | null;
  customSizes?: ProductImageCustomSize[] | null;
  spec?: ProductImageSpecInput | null;
  specialNotes?: NullableString;
  priceType?: NullableString;
};

const MAX_DESCRIPTION_LENGTH = 220;
const MAX_NOTES_LENGTH = 120;
const MAX_CONTEXT_LENGTH = 520;

function normalizeWhitespace(value: NullableString): string {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

export function stripMarkdownLikeText(value: NullableString): string {
  const normalizedValue = normalizeWhitespace(value);
  if (!normalizedValue) {
    return "";
  }

  return normalizeWhitespace(
    normalizedValue
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/(^|\s)[#>*-]+\s*/g, " ")
      .replace(/\s+/g, " "),
  );
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sentenceDedupe(value: string): string {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const sentence of sentences) {
    const key = sentence.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(sentence);
  }

  return deduped.join(" ");
}

function resolveNamedValue(
  value: { name?: NullableString } | NullableString,
): string {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  return normalizeWhitespace(value?.name);
}

function pushUniqueFragment(fragments: string[], value: string) {
  const normalizedValue = normalizeWhitespace(value);
  if (!normalizedValue) {
    return;
  }

  const normalizedKey = normalizedValue.toLocaleLowerCase();
  if (
    fragments.some(
      (fragment) => fragment.toLocaleLowerCase() === normalizedKey,
    )
  ) {
    return;
  }

  fragments.push(normalizedValue);
}

export function collectProductSignalText(
  input: ProductImagePromptContextInput,
): string {
  const values = [
    input.name,
    resolveNamedValue(input.category),
    resolveNamedValue(input.productType),
  ]
    .map((value) => stripMarkdownLikeText(value))
    .filter(Boolean);

  return values.join(" ");
}

export function buildCompactProductContext(
  input: ProductImagePromptContextInput,
): string {
  const fragments: string[] = [];

  const name = truncateText(stripMarkdownLikeText(input.name), 96);
  const categoryName = truncateText(
    stripMarkdownLikeText(resolveNamedValue(input.category)),
    64,
  );
  const productTypeName = truncateText(
    stripMarkdownLikeText(resolveNamedValue(input.productType)),
    64,
  );
  const description = truncateText(
    sentenceDedupe(stripMarkdownLikeText(input.description)),
    MAX_DESCRIPTION_LENGTH,
  );
  const specialNotes = truncateText(
    sentenceDedupe(stripMarkdownLikeText(input.specialNotes)),
    MAX_NOTES_LENGTH,
  );

  pushUniqueFragment(fragments, name);

  if (categoryName && categoryName.toLocaleLowerCase() !== name.toLocaleLowerCase()) {
    pushUniqueFragment(fragments, `category: ${categoryName}`);
  }

  if (
    productTypeName &&
    productTypeName.toLocaleLowerCase() !== name.toLocaleLowerCase() &&
    productTypeName.toLocaleLowerCase() !== categoryName.toLocaleLowerCase()
  ) {
    pushUniqueFragment(fragments, `type: ${productTypeName}`);
  }

  if (description) {
    pushUniqueFragment(fragments, `description: ${description}`);
  }

  if (specialNotes) {
    pushUniqueFragment(fragments, `notes: ${specialNotes}`);
  }

  return truncateText(fragments.join(" | "), MAX_CONTEXT_LENGTH);
}