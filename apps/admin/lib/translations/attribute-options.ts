import type { Attribute, OptionTranslation } from "@konfi/types";
import { isRecord } from "./path";

function readOptionValue(option: unknown): string | undefined {
  if (!isRecord(option)) {
    return undefined;
  }

  return typeof option.value === "string" ? option.value : undefined;
}

export function reconcileAttributeOptionTranslations(
  attribute: Pick<Attribute, "options">,
  translationOptions?: unknown,
): OptionTranslation[] {
  const existingOptions = Array.isArray(translationOptions)
    ? translationOptions
    : [];
  const translationsByValue = new Map<string, unknown>();

  existingOptions.forEach((option) => {
    const value = readOptionValue(option);
    if (value) {
      translationsByValue.set(value, option);
    }
  });

  return attribute.options.map((sourceOption, index) => {
    const matchedByValue = translationsByValue.get(sourceOption.value);
    const matchedLegacy = matchedByValue ?? existingOptions[index];
    const translatedLabel =
      isRecord(matchedLegacy) && typeof matchedLegacy.label === "string"
        ? matchedLegacy.label
        : sourceOption.label;
    const advancedPreset =
      isRecord(matchedLegacy) && isRecord(matchedLegacy.advancedPreset)
        ? (matchedLegacy.advancedPreset as OptionTranslation["advancedPreset"])
        : sourceOption.advancedPreset;

    return {
      value: sourceOption.value,
      label: translatedLabel,
      ...(advancedPreset ? { advancedPreset } : {}),
    };
  });
}
