import {
  ShippingOptions,
  ShippingTypes,
  type Locale,
  type SelectOption,
  type ShippingMethodDefinition,
  type ShippingMethodId,
  type ShippingMethodKind,
  type ShippingMethodRuleConditions,
  type ShippingMethodRules,
  type ShippingMethodsSettings,
} from "@konfi/types";
import {
  createBusinessTaxonomyId,
  getConfigurableColorPalette,
  getConfigurableDefinition,
  getConfigurableDefinitionLabel,
  getConfigurableIcon,
  getConfigurableOptions,
  getEnabledConfigurableDefinitions,
  humanizeBusinessTaxonomyId,
  isValidBusinessTaxonomyId,
  normalizeConfigurableDefinitions,
  normalizeConfigurableDefinition,
  type TranslationFunction,
} from "./business-taxonomy";

export const SHIPPING_METHODS_SETTINGS_DOC_ID = "shippingMethods";

export const DEFAULT_SHIPPING_METHOD_DEFINITIONS = [
  {
    id: ShippingOptions.CUSTOM,
    name: "Custom",
    kind: ShippingTypes.CUSTOM,
    provider: "custom",
    supportsPickupPoint: false,
    icon: "category",
    colorPalette: "gray",
  },
  {
    id: ShippingOptions.COMPANY_COURIER,
    name: "Company Courier",
    kind: ShippingTypes.COURIER,
    provider: "company",
    supportsPickupPoint: false,
    icon: "local_shipping",
    colorPalette: "blue",
  },
  {
    id: ShippingOptions.PERSONAL_COLLECTION,
    name: "Personal Collection",
    kind: ShippingTypes.PERSONAL_COLLECTION,
    provider: "pickup",
    supportsPickupPoint: false,
    icon: "storefront",
    colorPalette: "green",
  },
  {
    id: ShippingOptions.INPOST,
    name: "InPost",
    kind: ShippingTypes.COURIER,
    provider: "inpost",
    supportsPickupPoint: false,
    icon: "local_shipping",
    colorPalette: "yellow",
  },
  {
    id: ShippingOptions.PACZKOMATY_INPOST,
    name: "Paczkomaty InPost",
    kind: ShippingTypes.PARCEL_DELIVERY_LOCKER,
    provider: "inpost",
    supportsPickupPoint: true,
    icon: "package_2",
    colorPalette: "orange",
  },
  {
    id: ShippingOptions.DHL,
    name: "DHL",
    kind: ShippingTypes.COURIER,
    provider: "dhl",
    supportsPickupPoint: false,
    icon: "local_shipping",
    colorPalette: "red",
  },
  {
    id: ShippingOptions.DPD,
    name: "DPD",
    kind: ShippingTypes.COURIER,
    provider: "dpd",
    supportsPickupPoint: false,
    icon: "local_shipping",
    colorPalette: "purple",
  },
  {
    id: ShippingOptions.FEDEX,
    name: "FedEx",
    kind: ShippingTypes.COURIER,
    provider: "fedex",
    supportsPickupPoint: false,
    icon: "local_shipping",
    colorPalette: "pink",
  },
] as const satisfies readonly Omit<
  ShippingMethodDefinition,
  "enabled" | "order" | "archived" | "isDefault" | "label"
>[];

export const DEFAULT_SHIPPING_METHOD_IDS =
  DEFAULT_SHIPPING_METHOD_DEFINITIONS.map((method) => method.id);

const FALLBACK_ICON = "local_shipping";
const FALLBACK_PROVIDER = "custom";
const MAX_SHIPPING_METHOD_ID_LENGTH = 80;
const SHIPPING_METHOD_KIND_VALUES = new Set<string>(
  Object.values(ShippingTypes),
);

const PROVIDER_LOOKUP_IGNORED_VALUES = new Set(["CUSTOM", "COMPANY", "PICKUP"]);

export interface ShippingRuleContext {
  categoryIds?: readonly string[];
  channelId?: string | null;
  country?: string | null;
  postalCode?: string | null;
  productTypeIds?: readonly string[];
  subtotal?: number | null;
}

function cloneDefaultMethod(
  method: (typeof DEFAULT_SHIPPING_METHOD_DEFINITIONS)[number],
  order: number,
): ShippingMethodDefinition {
  return {
    ...method,
    label: method.name,
    enabled: true,
    archived: false,
    isDefault: true,
    order,
  };
}

export function createDefaultShippingMethodsSettings(): ShippingMethodsSettings {
  return {
    methods: DEFAULT_SHIPPING_METHOD_DEFINITIONS.map((method, index) =>
      cloneDefaultMethod(method, index),
    ),
  };
}

export function isValidShippingMethodId(
  value: unknown,
): value is ShippingMethodId {
  return isValidBusinessTaxonomyId(value, MAX_SHIPPING_METHOD_ID_LENGTH);
}

export function humanizeShippingMethodId(id: ShippingMethodId): string {
  return humanizeBusinessTaxonomyId(id, "Shipping Method");
}

export function createShippingMethodId(
  name: string,
  existingIds: readonly ShippingMethodId[] = [],
): ShippingMethodId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "shipping-method",
    maxLength: MAX_SHIPPING_METHOD_ID_LENGTH,
  });
}

function isShippingMethodKind(value: unknown): value is ShippingMethodKind {
  return typeof value === "string" && SHIPPING_METHOD_KIND_VALUES.has(value);
}

function normalizeShippingMethodKind(
  value: unknown,
  fallback: ShippingMethodKind,
): ShippingMethodKind {
  return isShippingMethodKind(value) ? value : fallback;
}

function normalizeProvider(
  value: unknown,
  fallback = FALLBACK_PROVIDER,
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizePositiveAmount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
}

function normalizeShippingMethodRules(
  rules: Partial<ShippingMethodRules> | undefined,
): ShippingMethodRules | undefined {
  if (!rules || rules.enabled !== true) {
    return undefined;
  }

  const categoryIds = normalizeStringList(rules.conditions?.categoryIds);
  const channelIds = normalizeStringList(rules.conditions?.channelIds);
  const countries = normalizeStringList(rules.conditions?.countries)?.map(
    (country) => country.toUpperCase(),
  );
  const maxSubtotal = normalizePositiveAmount(rules.conditions?.maxSubtotal);
  const minSubtotal = normalizePositiveAmount(rules.conditions?.minSubtotal);
  const postalCodePrefixes = normalizeStringList(
    rules.conditions?.postalCodePrefixes,
  );
  const productTypeIds = normalizeStringList(rules.conditions?.productTypeIds);
  const conditions: ShippingMethodRuleConditions = {
    ...(categoryIds ? { categoryIds } : {}),
    ...(channelIds ? { channelIds } : {}),
    ...(countries ? { countries } : {}),
    ...(maxSubtotal !== undefined ? { maxSubtotal } : {}),
    ...(minSubtotal !== undefined ? { minSubtotal } : {}),
    ...(postalCodePrefixes ? { postalCodePrefixes } : {}),
    ...(productTypeIds ? { productTypeIds } : {}),
  };
  const hasConditions = Object.keys(conditions).length > 0;
  const freeShippingThreshold = normalizePositiveAmount(
    rules.freeShippingThreshold,
  );

  return {
    enabled: true,
    ...(hasConditions ? { conditions } : {}),
    ...(freeShippingThreshold !== undefined ? { freeShippingThreshold } : {}),
  };
}

function getDefinitionName(
  method: Partial<ShippingMethodDefinition> | undefined,
  defaultDefinition: ShippingMethodDefinition | undefined,
): string {
  if (typeof method?.name === "string" && method.name.trim()) {
    return method.name.trim();
  }

  if (typeof method?.label === "string" && method.label.trim()) {
    return method.label.trim();
  }

  if (defaultDefinition) {
    return defaultDefinition.name;
  }

  return method?.id ? humanizeShippingMethodId(method.id) : "Shipping Method";
}

function normalizeMethod(
  method: Partial<ShippingMethodDefinition> | undefined,
  order: number,
  defaultDefinition?: ShippingMethodDefinition,
): ShippingMethodDefinition | null {
  const name = getDefinitionName(method, defaultDefinition);
  const normalized = normalizeConfigurableDefinition(
    method ? { ...method, name } : method,
    order,
    {
      defaultDefinition,
      fallbackIcon: FALLBACK_ICON,
      fallbackName: name,
      maxIdLength: MAX_SHIPPING_METHOD_ID_LENGTH,
    },
  );

  if (!normalized) {
    return null;
  }

  const kind = normalizeShippingMethodKind(
    method?.kind,
    defaultDefinition?.kind ?? ShippingTypes.CUSTOM,
  );
  const provider = normalizeProvider(
    method?.provider,
    defaultDefinition?.provider ?? FALLBACK_PROVIDER,
  );
  const supportsPickupPoint =
    typeof method?.supportsPickupPoint === "boolean"
      ? method.supportsPickupPoint
      : (defaultDefinition?.supportsPickupPoint ??
        kind === ShippingTypes.PARCEL_DELIVERY_LOCKER);
  const rules = normalizeShippingMethodRules(method?.rules);

  return {
    ...normalized,
    kind,
    provider,
    ...(rules ? { rules } : {}),
    supportsPickupPoint,
    label:
      typeof method?.label === "string" && method.label.trim()
        ? method.label.trim()
        : normalized.name,
  };
}

export function normalizeShippingMethodsSettings(
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodsSettings {
  const defaults = createDefaultShippingMethodsSettings();
  const defaultsById = new Map(
    defaults.methods.map((method) => [method.id, method]),
  );
  const sourceMethods = Array.isArray(settings?.methods)
    ? settings.methods
    : [];
  const normalizedSourceMethods = sourceMethods
    .map((method, index) =>
      normalizeMethod(
        method,
        index,
        isValidShippingMethodId(method?.id)
          ? defaultsById.get(method.id)
          : undefined,
      ),
    )
    .filter((method): method is ShippingMethodDefinition => method !== null);

  return {
    ...settings,
    methods: normalizeConfigurableDefinitions(
      defaults.methods,
      normalizedSourceMethods,
      {
        fallbackIcon: FALLBACK_ICON,
        maxIdLength: MAX_SHIPPING_METHOD_ID_LENGTH,
      },
    ),
  };
}

export function getShippingMethodDefinitions(
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodDefinition[] {
  return normalizeShippingMethodsSettings(settings).methods;
}

export function getEnabledShippingMethodDefinitions(
  settings?: Partial<ShippingMethodsSettings> | null,
  options: {
    kinds?: readonly ShippingMethodKind[];
    excludeIds?: readonly ShippingMethodId[];
    ruleContext?: ShippingRuleContext;
    supportsPickupPoint?: boolean;
  } = {},
): ShippingMethodDefinition[] {
  const kinds = options.kinds ? new Set(options.kinds) : undefined;
  const excludeIds = options.excludeIds
    ? new Set(options.excludeIds)
    : undefined;

  return getEnabledConfigurableDefinitions(
    getShippingMethodDefinitions(settings),
  ).filter((method) => {
    if (kinds && !kinds.has(method.kind)) {
      return false;
    }

    if (excludeIds?.has(method.id)) {
      return false;
    }

    if (
      typeof options.supportsPickupPoint === "boolean" &&
      method.supportsPickupPoint !== options.supportsPickupPoint
    ) {
      return false;
    }

    return isShippingMethodEligible(method, options.ruleContext);
  });
}

export function getShippingMethodOptions(
  settings?: Partial<ShippingMethodsSettings> | null,
  options: Parameters<typeof getEnabledShippingMethodDefinitions>[1] = {},
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(
    getEnabledShippingMethodDefinitions(settings, options),
    {
      locale,
      t,
      translationKeyPrefix: "ShippingOptions",
    },
  );
}

export function getShippingMethodDefinition(
  id: ShippingMethodId,
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodDefinition | undefined {
  return getConfigurableDefinition(id, getShippingMethodDefinitions(settings));
}

export function getShippingMethodLabel(
  id: ShippingMethodId,
  settings?: Partial<ShippingMethodsSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getShippingMethodDefinitions(settings),
    {
      fallback: humanizeShippingMethodId(id),
      locale,
      t,
      translationKeyPrefix: "ShippingOptions",
    },
  );
}

export function getShippingMethodColorPalette(
  id: ShippingMethodId,
  settings?: Partial<ShippingMethodsSettings> | null,
): string {
  return getConfigurableColorPalette(
    id,
    getShippingMethodDefinitions(settings),
  );
}

export function getShippingMethodIcon(
  id: ShippingMethodId,
  settings?: Partial<ShippingMethodsSettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getShippingMethodDefinitions(settings),
    FALLBACK_ICON,
  );
}

export function getKnownShippingMethodIds(
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodId[] {
  return getShippingMethodDefinitions(settings).map((method) => method.id);
}

export function getActiveShippingMethodIds(
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodId[] {
  return getEnabledShippingMethodDefinitions(settings).map(
    (method) => method.id,
  );
}

export function getCourierShippingMethodDefinitions(
  settings?: Partial<ShippingMethodsSettings> | null,
  options: { noCompanyCourier?: boolean } = {},
): ShippingMethodDefinition[] {
  return getEnabledShippingMethodDefinitions(settings, {
    kinds: [ShippingTypes.COURIER, ShippingTypes.PARCEL_DELIVERY_LOCKER],
    excludeIds: options.noCompanyCourier
      ? [ShippingOptions.COMPANY_COURIER]
      : [],
  });
}

export function getCourierShippingMethodOptions(
  settings?: Partial<ShippingMethodsSettings> | null,
  options: { noCompanyCourier?: boolean } = {},
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(
    getCourierShippingMethodDefinitions(settings, options),
    {
      locale,
      t,
      translationKeyPrefix: "ShippingOptions",
    },
  );
}

export function isShippingMethodCourier(
  shippingMethodId: ShippingMethodId | null | undefined,
  settings?: Partial<ShippingMethodsSettings> | null,
  options: { noCompanyCourier?: boolean } = {},
): boolean {
  if (!shippingMethodId) {
    return false;
  }

  if (
    options.noCompanyCourier &&
    shippingMethodId === ShippingOptions.COMPANY_COURIER
  ) {
    return false;
  }

  const method = getShippingMethodDefinition(shippingMethodId, settings);
  return (
    method?.kind === ShippingTypes.COURIER ||
    method?.kind === ShippingTypes.PARCEL_DELIVERY_LOCKER
  );
}

function normalizeRuleCountry(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function normalizePostalCode(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, "").toUpperCase() ?? "";
}

function matchesConfiguredList(
  values: readonly string[] | undefined,
  allowedValues: readonly string[] | undefined,
): boolean {
  if (!allowedValues?.length) {
    return true;
  }

  if (!values?.length) {
    return false;
  }

  const allowed = new Set(allowedValues);
  return values.every((value) => allowed.has(value));
}

export function isShippingMethodEligible(
  method: ShippingMethodDefinition,
  context: ShippingRuleContext | undefined,
): boolean {
  const rules = method.rules;
  const conditions = rules?.conditions;

  if (!rules?.enabled || !conditions) {
    return true;
  }

  if (
    conditions.channelIds?.length &&
    (!context?.channelId || !conditions.channelIds.includes(context.channelId))
  ) {
    return false;
  }

  if (
    conditions.countries?.length &&
    !conditions.countries.includes(normalizeRuleCountry(context?.country))
  ) {
    return false;
  }

  if (conditions.postalCodePrefixes?.length) {
    const postalCode = normalizePostalCode(context?.postalCode);
    if (
      !postalCode ||
      !conditions.postalCodePrefixes.some((prefix) =>
        postalCode.startsWith(normalizePostalCode(prefix)),
      )
    ) {
      return false;
    }
  }

  if (
    !matchesConfiguredList(context?.productTypeIds, conditions.productTypeIds)
  ) {
    return false;
  }

  if (!matchesConfiguredList(context?.categoryIds, conditions.categoryIds)) {
    return false;
  }

  const subtotal = normalizePositiveAmount(context?.subtotal);

  if (
    conditions.minSubtotal !== undefined &&
    (subtotal === undefined || subtotal < conditions.minSubtotal)
  ) {
    return false;
  }

  if (
    conditions.maxSubtotal !== undefined &&
    (subtotal === undefined || subtotal > conditions.maxSubtotal)
  ) {
    return false;
  }

  return true;
}

export function getShippingMethodPrice(
  shippingMethodId: ShippingMethodId,
  basePrice: number | undefined,
  settings?: Partial<ShippingMethodsSettings> | null,
  context?: ShippingRuleContext,
): number {
  const normalizedBasePrice = normalizePositiveAmount(basePrice) ?? 0;
  const method = getShippingMethodDefinition(shippingMethodId, settings);
  const threshold = normalizePositiveAmount(
    method?.rules?.freeShippingThreshold,
  );
  const subtotal = normalizePositiveAmount(context?.subtotal);

  if (
    threshold !== undefined &&
    subtotal !== undefined &&
    subtotal >= threshold
  ) {
    return 0;
  }

  return normalizedBasePrice;
}

function normalizeProviderLookup(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function getConfiguredProviderMatch(
  providerName: string,
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodDefinition | undefined {
  const normalizedProviderName = normalizeProviderLookup(providerName);

  if (!normalizedProviderName) {
    return undefined;
  }

  return getShippingMethodDefinitions(settings).find((method) => {
    const normalizedProvider = normalizeProviderLookup(method.provider);

    if (
      !normalizedProvider ||
      PROVIDER_LOOKUP_IGNORED_VALUES.has(normalizedProvider)
    ) {
      return false;
    }

    return (
      normalizedProviderName.includes(normalizedProvider) ||
      normalizedProvider.includes(normalizedProviderName)
    );
  });
}

function getKnownMethodId(
  id: ShippingMethodId,
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodId {
  return getShippingMethodDefinition(id, settings)?.id ?? id;
}

export function mapShippingProviderToMethodId(
  providerName: string | null | undefined,
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodId {
  const normalizedProviderName = normalizeProviderLookup(providerName ?? "");

  if (!normalizedProviderName) {
    return getKnownMethodId(ShippingOptions.CUSTOM, settings);
  }

  if (
    normalizedProviderName.includes("PACZKOMAT") ||
    normalizedProviderName.includes("PARCELLOCKER") ||
    normalizedProviderName.includes("LOCKER")
  ) {
    return getKnownMethodId(ShippingOptions.PACZKOMATY_INPOST, settings);
  }

  const configuredProviderMatch = getConfiguredProviderMatch(
    providerName ?? "",
    settings,
  );
  if (configuredProviderMatch) {
    return configuredProviderMatch.id;
  }

  if (normalizedProviderName.includes("INPOST")) {
    return getKnownMethodId(ShippingOptions.INPOST, settings);
  }
  if (normalizedProviderName.includes("DPD")) {
    return getKnownMethodId(ShippingOptions.DPD, settings);
  }
  if (normalizedProviderName.includes("DHL")) {
    return getKnownMethodId(ShippingOptions.DHL, settings);
  }
  if (normalizedProviderName.includes("FEDEX")) {
    return getKnownMethodId(ShippingOptions.FEDEX, settings);
  }

  return getKnownMethodId(ShippingOptions.CUSTOM, settings);
}

export function hasMissingDefaultShippingMethods(
  settings?: Partial<ShippingMethodsSettings> | null,
): boolean {
  const sourceMethods = Array.isArray(settings?.methods)
    ? settings.methods
    : [];
  const ids = new Set(
    sourceMethods.map((method) => method.id).filter(isValidShippingMethodId),
  );

  return DEFAULT_SHIPPING_METHOD_IDS.some((id) => !ids.has(id));
}

export function mergeShippingMethodsSettingsWithDefaults(
  settings?: Partial<ShippingMethodsSettings> | null,
): ShippingMethodsSettings {
  return normalizeShippingMethodsSettings(settings);
}
