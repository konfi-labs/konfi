import type {
  ProductionGroupingAllowedValue,
  ProductionGroupingAxis,
  ProductionGroupingProfile,
  ProductionGroupingSettings,
} from "@konfi/types";

export const PRODUCTION_GROUPING_SETTINGS_DOC_ID = "productionGrouping";

const DEFAULT_PRIMARY_AXIS: ProductionGroupingAxis = {
  allowAiSuggestedValues: true,
  id: "material",
  label: "Material",
};

const DEFAULT_SECONDARY_AXIS: ProductionGroupingAxis = {
  allowAiSuggestedValues: true,
  id: "finish",
  label: "Finish",
};

export function createDefaultProductionGroupingSettings(): ProductionGroupingSettings {
  return {
    profile: {
      id: "default",
      label: "Production grouping",
      primaryAxis: DEFAULT_PRIMARY_AXIS,
      secondaryAxis: DEFAULT_SECONDARY_AXIS,
    },
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeAllowedValue(
  value: Partial<ProductionGroupingAllowedValue> | undefined,
  fallbackOrder: number,
): ProductionGroupingAllowedValue | null {
  if (!value) {
    return null;
  }

  const key = value.key?.trim();
  const label = value.label?.trim();

  if (!key || !label) {
    return null;
  }

  return {
    aliases: normalizeStringArray(value.aliases),
    archived: value.archived === true,
    key,
    label,
    order:
      typeof value.order === "number" && Number.isFinite(value.order)
        ? value.order
        : fallbackOrder,
  };
}

function normalizeAxis(
  axis: Partial<ProductionGroupingAxis> | null | undefined,
  fallback: ProductionGroupingAxis,
): ProductionGroupingAxis {
  const id = axis?.id?.trim() || fallback.id;
  const label = axis?.label?.trim() || fallback.label;
  const sourceAllowedValues = Array.isArray(axis?.allowedValues)
    ? axis.allowedValues
    : fallback.allowedValues;
  const allowedValues = sourceAllowedValues
    ?.map((value, index) => normalizeAllowedValue(value, index))
    .filter((value): value is ProductionGroupingAllowedValue => value !== null)
    .toSorted((left, right) => (left.order ?? 0) - (right.order ?? 0));

  return {
    aliases: normalizeStringArray(axis?.aliases).length
      ? normalizeStringArray(axis?.aliases)
      : normalizeStringArray(fallback.aliases),
    allowAiSuggestedValues:
      axis?.allowAiSuggestedValues ?? fallback.allowAiSuggestedValues ?? true,
    ...(allowedValues && allowedValues.length > 0 ? { allowedValues } : {}),
    id,
    label,
  };
}

export function normalizeProductionGroupingSettings(
  settings?: Partial<ProductionGroupingSettings> | null,
): ProductionGroupingSettings {
  const defaults = createDefaultProductionGroupingSettings();
  const sourceProfile = settings?.profile;
  const primaryAxis = normalizeAxis(
    sourceProfile?.primaryAxis,
    defaults.profile.primaryAxis,
  );
  const secondaryAxis =
    sourceProfile?.secondaryAxis === null
      ? null
      : normalizeAxis(
          sourceProfile?.secondaryAxis,
          defaults.profile.secondaryAxis ?? DEFAULT_SECONDARY_AXIS,
        );

  return {
    ...settings,
    profile: {
      id: sourceProfile?.id?.trim() || defaults.profile.id,
      label: sourceProfile?.label?.trim() || defaults.profile.label,
      primaryAxis,
      secondaryAxis,
    },
  };
}
