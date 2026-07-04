import {
  PaymentType,
  ShippingOptions,
  type Locale,
  type PaymentMethodDefinition,
  type PaymentMethodId,
  type PaymentMethodProviderKind,
  type PaymentMethodsSettings,
  type SelectOption,
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

export const PAYMENT_METHODS_SETTINGS_DOC_ID = "paymentMethods";

export const PAYMENT_METHOD_PROVIDER_KINDS = [
  "manual",
  "stripe",
  "przelewy24",
  "allegro",
  "bank_transfer",
  "deferred",
  "pickup",
  "delivery",
] as const satisfies readonly PaymentMethodProviderKind[];

export const LEGACY_PAYMENT_OPTIONS_FOR_SHIPPING_OPTIONS = {
  [ShippingOptions.CUSTOM]: [
    PaymentType.ON_DELIVERY,
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
  [ShippingOptions.COMPANY_COURIER]: [
    PaymentType.ON_DELIVERY,
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
  [ShippingOptions.DHL]: [
    PaymentType.ON_DELIVERY,
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
  [ShippingOptions.DPD]: [
    PaymentType.ON_DELIVERY,
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
  [ShippingOptions.FEDEX]: [
    PaymentType.ON_DELIVERY,
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
  [ShippingOptions.INPOST]: [
    PaymentType.ON_DELIVERY,
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
  [ShippingOptions.PACZKOMATY_INPOST]: [
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
  [ShippingOptions.PERSONAL_COLLECTION]: [
    PaymentType.ON_DELIVERY,
    PaymentType.ON_PICKUP,
    PaymentType.PROFORMA,
    PaymentType.BANK_TRANSFER,
    PaymentType.DEFERRED,
    PaymentType.STRIPE,
    PaymentType.PRZELEWY24,
    PaymentType.ALLEGRO,
  ],
} as const satisfies Record<ShippingOptions, readonly PaymentType[]>;

const ALL_LEGACY_SHIPPING_METHOD_IDS = Object.values(ShippingOptions);
const FALLBACK_ICON = "payments";
const MAX_PAYMENT_METHOD_ID_LENGTH = 80;

const LEGACY_STORE_PAYMENT_ORDER = [
  PaymentType.STRIPE,
  PaymentType.PRZELEWY24,
  PaymentType.BANK_TRANSFER,
  PaymentType.ON_PICKUP,
  PaymentType.DEFERRED,
] as const;

const LEGACY_ADMIN_PAYMENT_ORDER = [
  PaymentType.STRIPE,
  PaymentType.BANK_TRANSFER,
  PaymentType.ON_DELIVERY,
  PaymentType.ON_PICKUP,
  PaymentType.PROFORMA,
  PaymentType.DEFERRED,
  PaymentType.ALLEGRO,
] as const;

const DEFAULT_PAYMENT_METHOD_INPUTS = [
  {
    id: PaymentType.ON_PICKUP,
    name: "On pickup",
    providerKind: "pickup",
    icon: "storefront",
    colorPalette: "green",
    storefrontEnabled: true,
  },
  {
    id: PaymentType.ON_DELIVERY,
    name: "On delivery",
    providerKind: "delivery",
    icon: "local_shipping",
    colorPalette: "orange",
    storefrontEnabled: false,
  },
  {
    id: PaymentType.PROFORMA,
    name: "Proforma",
    providerKind: "manual",
    icon: "receipt_long",
    colorPalette: "purple",
    storefrontEnabled: false,
  },
  {
    id: PaymentType.BANK_TRANSFER,
    name: "Bank transfer",
    providerKind: "bank_transfer",
    icon: "account_balance",
    colorPalette: "blue",
    storefrontEnabled: true,
  },
  {
    id: PaymentType.DEFERRED,
    name: "Deferred",
    providerKind: "deferred",
    icon: "event_available",
    colorPalette: "yellow",
    storefrontEnabled: true,
  },
  {
    id: PaymentType.STRIPE,
    name: "Stripe",
    providerKind: "stripe",
    icon: "credit_card",
    colorPalette: "purple",
    storefrontEnabled: true,
  },
  {
    id: PaymentType.PRZELEWY24,
    name: "Przelewy24",
    providerKind: "przelewy24",
    icon: "payments",
    colorPalette: "cyan",
    storefrontEnabled: true,
  },
  {
    id: PaymentType.ALLEGRO,
    name: "Allegro",
    providerKind: "allegro",
    icon: "shopping_bag",
    colorPalette: "orange",
    storefrontEnabled: false,
  },
] as const satisfies readonly Omit<
  PaymentMethodDefinition,
  "allowedShippingMethodIds" | "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_PAYMENT_METHOD_DEFINITIONS =
  DEFAULT_PAYMENT_METHOD_INPUTS.map((method, index) =>
    cloneDefaultPaymentMethod(method, index),
  );

export const DEFAULT_PAYMENT_METHOD_IDS =
  DEFAULT_PAYMENT_METHOD_DEFINITIONS.map((method) => method.id);

type PaymentMethodDefaultInput = (typeof DEFAULT_PAYMENT_METHOD_INPUTS)[number];

export interface PaymentMethodAvailabilityOptions {
  settings?: Partial<PaymentMethodsSettings> | null;
  isStore?: boolean;
  allowedBankPayments?: boolean;
  allowedDeferredPayments?: boolean;
  allowedOnPickupPayments?: boolean;
  anonymousPackageShipping?: boolean;
}

function cloneDefaultPaymentMethod(
  method: PaymentMethodDefaultInput,
  order: number,
): PaymentMethodDefinition {
  return {
    ...method,
    allowedShippingMethodIds: [
      ...getLegacyShippingMethodIdsForPaymentMethod(method.id),
    ],
    enabled: true,
    archived: false,
    isDefault: true,
    label: method.name,
    order,
    storefrontEnabled: method.storefrontEnabled,
  };
}

function isPaymentMethodProviderKind(
  value: unknown,
): value is PaymentMethodProviderKind {
  return (
    typeof value === "string" &&
    PAYMENT_METHOD_PROVIDER_KINDS.includes(value as PaymentMethodProviderKind)
  );
}

function getLegacyShippingMethodIdsForPaymentMethod(
  paymentMethodId: PaymentMethodId,
): string[] {
  return Object.entries(LEGACY_PAYMENT_OPTIONS_FOR_SHIPPING_OPTIONS)
    .filter(([, paymentMethodIds]) =>
      (paymentMethodIds as readonly PaymentType[]).includes(
        paymentMethodId as PaymentType,
      ),
    )
    .map(([shippingMethodId]) => shippingMethodId);
}

function normalizeAllowedShippingMethodIds(
  value: unknown,
  fallback: readonly string[],
): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const ids = value
    .filter((id): id is string => isValidBusinessTaxonomyId(id))
    .map((id) => id.trim());

  return Array.from(new Set(ids));
}

function getDefaultStorefrontEnabled(
  providerKind: PaymentMethodProviderKind,
): boolean {
  return (
    providerKind === "stripe" ||
    providerKind === "przelewy24" ||
    providerKind === "bank_transfer" ||
    providerKind === "pickup" ||
    providerKind === "deferred"
  );
}

function getDefaultPaymentMethodDefinition(
  id: PaymentMethodId | undefined,
): PaymentMethodDefinition | undefined {
  if (!id) {
    return undefined;
  }

  return DEFAULT_PAYMENT_METHOD_DEFINITIONS.find((method) => method.id === id);
}

function normalizePaymentMethod(
  method: Partial<PaymentMethodDefinition> | undefined,
  order: number,
): PaymentMethodDefinition | null {
  const sourceName =
    typeof method?.name === "string" && method.name.trim()
      ? method.name
      : method?.label;
  const sourceMethod = {
    ...method,
    name: sourceName,
  };
  const defaultDefinition = getDefaultPaymentMethodDefinition(method?.id);
  const normalized = normalizeConfigurableDefinition<PaymentMethodDefinition>(
    sourceMethod,
    order,
    {
      defaultDefinition,
      fallbackIcon: FALLBACK_ICON,
      fallbackName: method?.id
        ? humanizePaymentMethodId(method.id)
        : "Payment Method",
      maxIdLength: MAX_PAYMENT_METHOD_ID_LENGTH,
    },
  );

  if (!normalized) {
    return null;
  }

  const providerKind = isPaymentMethodProviderKind(method?.providerKind)
    ? method.providerKind
    : (defaultDefinition?.providerKind ?? "manual");
  const allowedShippingMethodIds = normalizeAllowedShippingMethodIds(
    method?.allowedShippingMethodIds,
    defaultDefinition?.allowedShippingMethodIds ??
      ALL_LEGACY_SHIPPING_METHOD_IDS,
  );
  const storefrontEnabled =
    typeof method?.storefrontEnabled === "boolean"
      ? method.storefrontEnabled
      : (defaultDefinition?.storefrontEnabled ??
        getDefaultStorefrontEnabled(providerKind));

  return {
    ...normalized,
    providerKind,
    allowedShippingMethodIds,
    label: normalized.name,
    storefrontEnabled,
  };
}

function getSourceDefinitions(
  settings?: Partial<PaymentMethodsSettings> | null,
): readonly Partial<PaymentMethodDefinition>[] {
  return Array.isArray(settings?.methods) ? settings.methods : [];
}

function hasExplicitSettings(
  settings?: Partial<PaymentMethodsSettings> | null,
): settings is Partial<PaymentMethodsSettings> {
  return Array.isArray(settings?.methods);
}

function isPaymentMethodAllowedForShipping(
  method: PaymentMethodDefinition,
  shippingMethodId: string,
): boolean {
  return method.allowedShippingMethodIds.includes(shippingMethodId);
}

function isStoreEligiblePaymentMethod(
  method: PaymentMethodDefinition,
  options: PaymentMethodAvailabilityOptions,
): boolean {
  if (method.storefrontEnabled !== true) {
    return false;
  }

  switch (method.providerKind) {
    case "stripe":
    case "przelewy24":
      return true;
    case "bank_transfer":
      return options.allowedBankPayments === true;
    case "pickup":
      return options.allowedOnPickupPayments === true;
    case "deferred":
      return options.allowedDeferredPayments === true;
    case "delivery":
      return true;
    default:
      return false;
  }
}

function isAdminEligiblePaymentMethod(
  method: PaymentMethodDefinition,
  options: PaymentMethodAvailabilityOptions,
): boolean {
  if (method.providerKind === "przelewy24") {
    return false;
  }

  if (method.providerKind === "deferred") {
    return options.allowedDeferredPayments === true;
  }

  return true;
}

function getLegacyAvailablePaymentMethodIds(
  shippingMethodId: string,
  options: PaymentMethodAvailabilityOptions,
): PaymentMethodId[] {
  if (!isValidBusinessTaxonomyId(shippingMethodId)) {
    return [];
  }

  const shippingPaymentOptions =
    LEGACY_PAYMENT_OPTIONS_FOR_SHIPPING_OPTIONS[
      shippingMethodId as ShippingOptions
    ];
  if (!shippingPaymentOptions) {
    return [];
  }

  const order = options.isStore
    ? LEGACY_STORE_PAYMENT_ORDER
    : LEGACY_ADMIN_PAYMENT_ORDER;
  const paymentMethodIds = order.filter((paymentMethodId) => {
    if (
      !(shippingPaymentOptions as readonly PaymentType[]).includes(
        paymentMethodId,
      )
    ) {
      return false;
    }

    if (
      paymentMethodId === PaymentType.BANK_TRANSFER &&
      options.isStore &&
      options.allowedBankPayments !== true
    ) {
      return false;
    }

    if (
      paymentMethodId === PaymentType.ON_PICKUP &&
      options.isStore &&
      options.allowedOnPickupPayments !== true
    ) {
      return false;
    }

    if (
      paymentMethodId === PaymentType.DEFERRED &&
      options.allowedDeferredPayments !== true
    ) {
      return false;
    }

    return true;
  });

  if (options.anonymousPackageShipping) {
    return paymentMethodIds.filter(
      (paymentMethodId) => paymentMethodId !== PaymentType.ON_DELIVERY,
    );
  }

  return paymentMethodIds;
}

export function createDefaultPaymentMethodsSettings(): PaymentMethodsSettings {
  return {
    methods: DEFAULT_PAYMENT_METHOD_DEFINITIONS.map((method) => ({
      ...method,
      allowedShippingMethodIds: [...method.allowedShippingMethodIds],
    })),
  };
}

export function isValidPaymentMethodId(
  value: unknown,
): value is PaymentMethodId {
  return isValidBusinessTaxonomyId(value, MAX_PAYMENT_METHOD_ID_LENGTH);
}

export function humanizePaymentMethodId(id: PaymentMethodId): string {
  return humanizeBusinessTaxonomyId(id, "Payment Method");
}

export function createPaymentMethodId(
  name: string,
  existingIds: readonly PaymentMethodId[] = [],
): PaymentMethodId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "payment-method",
    maxLength: MAX_PAYMENT_METHOD_ID_LENGTH,
  });
}

export function normalizePaymentMethodsSettings(
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodsSettings {
  const defaults = createDefaultPaymentMethodsSettings();
  const normalizedSourceDefinitions = getSourceDefinitions(settings)
    .map((method, index) => normalizePaymentMethod(method, index))
    .filter((method): method is PaymentMethodDefinition => method !== null);

  return {
    ...settings,
    methods: normalizeConfigurableDefinitions(
      defaults.methods,
      normalizedSourceDefinitions,
      {
        fallbackIcon: FALLBACK_ICON,
        maxIdLength: MAX_PAYMENT_METHOD_ID_LENGTH,
      },
    )
      .map((method, index) => {
        const normalizedMethod = normalizePaymentMethod(method, index);
        return normalizedMethod
          ? {
              ...normalizedMethod,
              order: method.order,
            }
          : null;
      })
      .filter((method): method is PaymentMethodDefinition => method !== null),
  };
}

export function getPaymentMethodDefinitions(
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodDefinition[] {
  return normalizePaymentMethodsSettings(settings).methods;
}

export function getEnabledPaymentMethodDefinitions(
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodDefinition[] {
  return getEnabledConfigurableDefinitions(
    getPaymentMethodDefinitions(settings),
  );
}

export function getPaymentMethodOptions(
  settings?: Partial<PaymentMethodsSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getPaymentMethodDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "PaymentType",
  });
}

export function getPaymentMethodDefinition(
  id: PaymentMethodId,
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodDefinition | undefined {
  return getConfigurableDefinition(id, getPaymentMethodDefinitions(settings));
}

export function getPaymentMethodLabel(
  id: PaymentMethodId,
  settings?: Partial<PaymentMethodsSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getPaymentMethodDefinitions(settings),
    {
      fallback: humanizePaymentMethodId(id),
      locale,
      t,
      translationKeyPrefix: "PaymentType",
    },
  );
}

export function getPaymentMethodColorPalette(
  id: PaymentMethodId,
  settings?: Partial<PaymentMethodsSettings> | null,
): string {
  return getConfigurableColorPalette(id, getPaymentMethodDefinitions(settings));
}

export function getPaymentMethodIcon(
  id: PaymentMethodId,
  settings?: Partial<PaymentMethodsSettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getPaymentMethodDefinitions(settings),
    FALLBACK_ICON,
  );
}

export function getPaymentMethodProviderKind(
  id: PaymentMethodId,
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodProviderKind {
  return getPaymentMethodDefinition(id, settings)?.providerKind ?? "manual";
}

export function getKnownPaymentMethodIds(
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodId[] {
  return getPaymentMethodDefinitions(settings).map((method) => method.id);
}

export function getActivePaymentMethodIds(
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodId[] {
  return getEnabledPaymentMethodDefinitions(settings).map(
    (method) => method.id,
  );
}

export function getPaymentMethodDefinitionsAllowedForShippingMethod(
  shippingMethodId: string | null | undefined,
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodDefinition[] {
  if (!shippingMethodId || !isValidBusinessTaxonomyId(shippingMethodId)) {
    return [];
  }

  return getEnabledPaymentMethodDefinitions(settings).filter((method) =>
    isPaymentMethodAllowedForShipping(method, shippingMethodId),
  );
}

export function getPaymentMethodIdsAllowedForShippingMethod(
  shippingMethodId: string | null | undefined,
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodId[] {
  return getPaymentMethodDefinitionsAllowedForShippingMethod(
    shippingMethodId,
    settings,
  ).map((method) => method.id);
}

export function getAvailablePaymentMethodIds(
  shippingMethodId: string | null | undefined,
  options: PaymentMethodAvailabilityOptions = {},
): PaymentMethodId[] {
  if (!shippingMethodId) {
    return [];
  }

  if (!hasExplicitSettings(options.settings)) {
    return getLegacyAvailablePaymentMethodIds(shippingMethodId, options);
  }

  const eligibleMethods = getPaymentMethodDefinitionsAllowedForShippingMethod(
    shippingMethodId,
    options.settings,
  ).filter((method) =>
    options.isStore
      ? isStoreEligiblePaymentMethod(method, options)
      : isAdminEligiblePaymentMethod(method, options),
  );

  const paymentMethodIds = eligibleMethods.map((method) => method.id);

  if (options.anonymousPackageShipping) {
    return paymentMethodIds.filter(
      (paymentMethodId) => paymentMethodId !== PaymentType.ON_DELIVERY,
    );
  }

  return paymentMethodIds;
}

export function mergePaymentMethodDefaultDefinitions(
  settings?: Partial<PaymentMethodsSettings> | null,
): PaymentMethodsSettings {
  return normalizePaymentMethodsSettings(settings);
}

export function hasMissingPaymentMethodDefaultDefinitions(
  settings?: Partial<PaymentMethodsSettings> | null,
): boolean {
  const ids = new Set(
    getSourceDefinitions(settings).map((method) => method.id),
  );

  return DEFAULT_PAYMENT_METHOD_IDS.some((id) => !ids.has(id));
}
