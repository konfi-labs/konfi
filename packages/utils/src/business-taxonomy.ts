import type {
  BusinessTaxonomyDefinition,
  BusinessTaxonomyId,
  SelectOption,
} from "@konfi/types";
import { Locale } from "@konfi/types";

export const BUSINESS_TAXONOMY_ID_MAX_LENGTH = 80;
export const BUSINESS_TAXONOMY_FALLBACK_COLOR_PALETTE = "gray";
export const BUSINESS_TAXONOMY_FALLBACK_ICON = "category";

export type TranslationFunction = (
  key: string,
  options?: { defaultValue?: string },
) => string;

export interface NormalizeConfigurableDefinitionOptions<
  TDefinition extends BusinessTaxonomyDefinition,
> {
  defaultDefinition?: TDefinition;
  fallbackColorPalette?: string;
  fallbackIcon?: string;
  fallbackName?: string;
  maxIdLength?: number;
}

export function isValidBusinessTaxonomyId(
  value: unknown,
  maxLength = BUSINESS_TAXONOMY_ID_MAX_LENGTH,
): value is BusinessTaxonomyId {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function humanizeBusinessTaxonomyId(
  id: BusinessTaxonomyId,
  fallback = "Value",
): string {
  const normalized = id.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  if (!normalized) {
    return fallback;
  }

  if (normalized === normalized.toUpperCase()) {
    return normalized
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function createBusinessTaxonomyId(
  name: string,
  existingIds: readonly BusinessTaxonomyId[] = [],
  options: { fallback?: string; maxLength?: number } = {},
): BusinessTaxonomyId {
  const maxLength = Math.max(
    1,
    options.maxLength ?? BUSINESS_TAXONOMY_ID_MAX_LENGTH,
  );
  const fallback = options.fallback ?? "value";
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength) || fallback;

  const existing = new Set(existingIds.map((id) => id.toLowerCase()));
  if (!existing.has(base)) {
    return base;
  }

  let suffix = 2;
  let candidate = base;
  do {
    const suffixText = `-${suffix}`;
    const prefixLength = Math.max(0, maxLength - suffixText.length);
    const prefix = base.slice(0, prefixLength).replace(/-+$/g, "");
    candidate = prefix
      ? `${prefix}${suffixText}`
      : String(suffix).slice(-maxLength);
    suffix += 1;
  } while (existing.has(candidate.toLowerCase()));

  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeBusinessTaxonomyLocalizedNames(
  localizedNames: unknown,
): Partial<Record<Locale, string>> | undefined {
  if (!isRecord(localizedNames)) {
    return undefined;
  }

  const normalized: Partial<Record<Locale, string>> = {};
  for (const locale of Object.values(Locale)) {
    const value = localizedNames[locale];
    if (typeof value === "string" && value.trim().length > 0) {
      normalized[locale] = value.trim();
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function getNormalizedLocale(locale?: Locale | string): Locale | undefined {
  if (!locale) {
    return undefined;
  }

  const normalized = locale.toLowerCase().split("-")[0];
  return Object.values(Locale).find((candidate) => candidate === normalized);
}

export function getLocalizedBusinessTaxonomyName(
  definition: Pick<BusinessTaxonomyDefinition, "localizedNames" | "name">,
  locale?: Locale | string,
): string {
  const normalizedLocale = getNormalizedLocale(locale);
  const localizedName = normalizedLocale
    ? definition.localizedNames?.[normalizedLocale]
    : undefined;

  return typeof localizedName === "string" && localizedName.trim().length > 0
    ? localizedName.trim()
    : definition.name;
}

export function normalizeConfigurableDefinition<
  TDefinition extends BusinessTaxonomyDefinition,
>(
  definition: Partial<TDefinition> | undefined,
  order: number,
  options: NormalizeConfigurableDefinitionOptions<TDefinition> = {},
): TDefinition | null {
  const maxIdLength = options.maxIdLength ?? BUSINESS_TAXONOMY_ID_MAX_LENGTH;
  if (!isValidBusinessTaxonomyId(definition?.id, maxIdLength)) {
    return null;
  }

  const fallbackName =
    options.fallbackName ?? humanizeBusinessTaxonomyId(definition.id, "Value");
  const name =
    typeof definition.name === "string" && definition.name.trim()
      ? definition.name.trim()
      : fallbackName;
  const icon =
    typeof definition.icon === "string" && definition.icon.trim()
      ? definition.icon.trim()
      : (options.defaultDefinition?.icon ??
        options.fallbackIcon ??
        BUSINESS_TAXONOMY_FALLBACK_ICON);
  const colorPalette =
    typeof definition.colorPalette === "string" &&
    definition.colorPalette.trim()
      ? definition.colorPalette.trim()
      : (options.defaultDefinition?.colorPalette ??
        options.fallbackColorPalette ??
        BUSINESS_TAXONOMY_FALLBACK_COLOR_PALETTE);

  return {
    ...options.defaultDefinition,
    ...definition,
    id: definition.id,
    name,
    localizedNames: normalizeBusinessTaxonomyLocalizedNames(
      definition.localizedNames,
    ),
    icon,
    colorPalette,
    order: typeof definition.order === "number" ? definition.order : order,
    enabled: definition.enabled !== false,
    archived: definition.archived === true,
    isDefault: options.defaultDefinition?.isDefault ?? definition.isDefault,
  } as TDefinition;
}

export function normalizeConfigurableDefinitions<
  TDefinition extends BusinessTaxonomyDefinition,
>(
  defaults: readonly TDefinition[],
  sourceDefinitions:
    | readonly (Partial<TDefinition> | null | undefined)[]
    | undefined,
  options: Omit<
    NormalizeConfigurableDefinitionOptions<TDefinition>,
    "defaultDefinition" | "fallbackName"
  > = {},
): TDefinition[] {
  const definitionsById = new Map<BusinessTaxonomyId, TDefinition>();

  for (const definition of defaults) {
    definitionsById.set(definition.id, definition);
  }

  sourceDefinitions?.forEach((definition, index) => {
    if (!definition) {
      return;
    }

    const defaultDefinition = isValidBusinessTaxonomyId(definition.id)
      ? definitionsById.get(definition.id)
      : undefined;
    const normalized = normalizeConfigurableDefinition(definition, index, {
      ...options,
      defaultDefinition,
    });
    if (!normalized) {
      return;
    }

    definitionsById.set(normalized.id, normalized);
  });

  return Array.from(definitionsById.values()).sort((left, right) => {
    if (left.archived !== right.archived) {
      return left.archived ? 1 : -1;
    }

    return left.order - right.order || left.name.localeCompare(right.name);
  });
}

export function getEnabledConfigurableDefinitions<
  TDefinition extends BusinessTaxonomyDefinition,
>(definitions: readonly TDefinition[]): TDefinition[] {
  return definitions.filter(
    (definition) => definition.enabled && !definition.archived,
  );
}

export function getConfigurableOptions<
  TDefinition extends BusinessTaxonomyDefinition,
>(
  definitions: readonly TDefinition[],
  options: {
    locale?: Locale | string;
    translationKeyPrefix?: string;
    t?: TranslationFunction;
  } = {},
): SelectOption[] {
  return getEnabledConfigurableDefinitions(definitions).map((definition) => ({
    label:
      definition.isDefault && options.t && options.translationKeyPrefix
        ? options.t(`${options.translationKeyPrefix}.${definition.id}`, {
            defaultValue: getLocalizedBusinessTaxonomyName(
              definition,
              options.locale,
            ),
          })
        : getLocalizedBusinessTaxonomyName(definition, options.locale),
    value: definition.id,
  }));
}

export function getConfigurableDefinition<
  TDefinition extends BusinessTaxonomyDefinition,
>(
  id: BusinessTaxonomyId,
  definitions: readonly TDefinition[],
): TDefinition | undefined {
  return definitions.find((definition) => definition.id === id);
}

export function getConfigurableDefinitionLabel<
  TDefinition extends BusinessTaxonomyDefinition,
>(
  id: BusinessTaxonomyId,
  definitions: readonly TDefinition[],
  options: {
    fallback?: string;
    locale?: Locale | string;
    translationKeyPrefix?: string;
    t?: TranslationFunction;
  } = {},
): string {
  const definition = getConfigurableDefinition(id, definitions);
  const fallback = definition
    ? getLocalizedBusinessTaxonomyName(definition, options.locale)
    : (options.fallback ?? humanizeBusinessTaxonomyId(id));

  if (definition?.isDefault && options.t && options.translationKeyPrefix) {
    return options.t(`${options.translationKeyPrefix}.${id}`, {
      defaultValue: fallback,
    });
  }

  return fallback;
}

export function getConfigurableColorPalette<
  TDefinition extends BusinessTaxonomyDefinition,
>(
  id: BusinessTaxonomyId,
  definitions: readonly TDefinition[],
  fallback = BUSINESS_TAXONOMY_FALLBACK_COLOR_PALETTE,
): string {
  return getConfigurableDefinition(id, definitions)?.colorPalette ?? fallback;
}

export function getConfigurableIcon<
  TDefinition extends BusinessTaxonomyDefinition,
>(
  id: BusinessTaxonomyId,
  definitions: readonly TDefinition[],
  fallback = BUSINESS_TAXONOMY_FALLBACK_ICON,
): string {
  return getConfigurableDefinition(id, definitions)?.icon ?? fallback;
}
