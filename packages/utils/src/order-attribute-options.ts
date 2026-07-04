import { Option } from "@konfi/types";

export function orderAttributeOptions(
  attributeOptions: Option[] | null | undefined,
  selectedValues: Option["value"][] | null | undefined,
): Option[] {
  if (
    !Array.isArray(attributeOptions) ||
    !Array.isArray(selectedValues) ||
    selectedValues.length === 0
  ) {
    return [];
  }

  const optionLookup = new Map(
    attributeOptions.map((option) => [option.value, option] as const),
  );
  const seenOptions = new Set<Option["value"]>();

  return selectedValues.reduce<Option[]>((acc, value) => {
    const option = optionLookup.get(value);
    if (!option) {
      return acc;
    }
    if (seenOptions.has(option.value)) {
      return acc;
    }

    acc.push(option);
    seenOptions.add(option.value);
    return acc;
  }, []);
}
