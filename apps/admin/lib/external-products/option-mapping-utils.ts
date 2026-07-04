import type { AttributeMapping } from "@konfi/types";

export const SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE =
  "konfiSyntheticEmpty";
export const SYNTHETIC_EMPTY_BRANCH_EXTERNAL_OPTION_PREFIX =
  "konfiSyntheticEmptyBranch_";
export const OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE =
  "konfiOmitExternalAttribute";

export function isSyntheticEmptyExternalOptionValue(
  value?: string,
): value is typeof SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE {
  return value === SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE;
}

export function isSyntheticEmptyBranchExternalOptionValue(
  value?: string,
): value is `${typeof SYNTHETIC_EMPTY_BRANCH_EXTERNAL_OPTION_PREFIX}${string}` {
  return Boolean(
    value?.startsWith(SYNTHETIC_EMPTY_BRANCH_EXTERNAL_OPTION_PREFIX),
  );
}

export function isSyntheticExternalOptionValue(value?: string): boolean {
  return (
    isSyntheticEmptyExternalOptionValue(value) ||
    isSyntheticEmptyBranchExternalOptionValue(value)
  );
}

export function getSyntheticEmptyOptionMappingValue(
  mapping?: Pick<AttributeMapping, "optionMappings">,
): string | undefined {
  return mapping?.optionMappings?.[SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE];
}

export function createSyntheticEmptyBranchExternalOptionValue(
  input: string,
): string {
  return `${SYNTHETIC_EMPTY_BRANCH_EXTERNAL_OPTION_PREFIX}${toOptionValue(input)}`;
}

export function resolveExternalRequestValue(options: {
  rawValue?: string;
  mappedValue?: string;
}):
  | { type: "omit"; }
  | { type: "set"; value: string; }
  | { type: "unresolved"; } {
  const { rawValue, mappedValue } = options;

  if (!rawValue) {
    return { type: "omit" };
  }

  if (mappedValue === OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE) {
    return { type: "omit" };
  }

  if (typeof mappedValue === "string" && mappedValue.length > 0) {
    return { type: "set", value: mappedValue };
  }

  if (isSyntheticEmptyExternalOptionValue(rawValue)) {
    return { type: "omit" };
  }

  if (isSyntheticEmptyBranchExternalOptionValue(rawValue)) {
    return { type: "unresolved" };
  }

  return { type: "set", value: rawValue };
}

export function toOptionValue(input: string): string {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");

  const words = normalized.split(/[^a-zA-Z0-9+]+/).filter(Boolean);

  if (words.length === 0) {
    return "option";
  }

  return words
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
}
