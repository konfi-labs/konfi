import {
  PrintingMethod,
  PrintingMethodColor,
  type Locale,
  type PrintingMethodDefinition,
  type PrintingMethodId,
  type PrintingMethodsSettings,
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

export const PRINTING_METHODS_SETTINGS_DOC_ID = "printingMethods";

export const DEFAULT_PRINTING_METHOD_DEFINITIONS = [
  {
    id: PrintingMethod.DIGITAL,
    name: "Digital",
    icon: "print",
    colorPalette: PrintingMethodColor.DIGITAL,
  },
  {
    id: PrintingMethod.OFFSET,
    name: "Offset",
    icon: "scatter_plot",
    colorPalette: PrintingMethodColor.OFFSET,
  },
  {
    id: PrintingMethod.LARGE_FORMAT,
    name: "Large Format",
    icon: "grain",
    colorPalette: PrintingMethodColor.LARGE_FORMAT,
  },
  {
    id: PrintingMethod.ECO_SOLVENT,
    name: "Eco Solvent",
    icon: "format_paint",
    colorPalette: PrintingMethodColor.ECO_SOLVENT,
  },
  {
    id: PrintingMethod.UV,
    name: "UV",
    icon: "fluorescent",
    colorPalette: PrintingMethodColor.UV,
  },
  {
    id: PrintingMethod.LASER,
    name: "Laser",
    icon: "stylus_laser_pointer",
    colorPalette: PrintingMethodColor.LASER,
  },
  {
    id: PrintingMethod.DTF,
    name: "DTF",
    icon: "laundry",
    colorPalette: PrintingMethodColor.DTF,
  },
  {
    id: PrintingMethod.CUTTING,
    name: "Cutting",
    icon: "content_cut",
    colorPalette: PrintingMethodColor.CUTTING,
  },
  {
    id: PrintingMethod.INSTALLATION,
    name: "Installation",
    icon: "construction",
    colorPalette: PrintingMethodColor.INSTALLATION,
  },
] as const satisfies readonly Omit<
  PrintingMethodDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_PRINTING_METHOD_IDS =
  DEFAULT_PRINTING_METHOD_DEFINITIONS.map((method) => method.id);

const FALLBACK_ICON = "print";
const MAX_PRINTING_METHOD_ID_LENGTH = 80;

function cloneDefaultMethod(
  method: (typeof DEFAULT_PRINTING_METHOD_DEFINITIONS)[number],
  order: number,
): PrintingMethodDefinition {
  return {
    ...method,
    enabled: true,
    archived: false,
    isDefault: true,
    order,
  };
}

export function createDefaultPrintingMethodsSettings(): PrintingMethodsSettings {
  return {
    methods: DEFAULT_PRINTING_METHOD_DEFINITIONS.map((method, index) =>
      cloneDefaultMethod(method, index),
    ),
  };
}

export function isValidPrintingMethodId(
  value: unknown,
): value is PrintingMethodId {
  return isValidBusinessTaxonomyId(value, MAX_PRINTING_METHOD_ID_LENGTH);
}

export function humanizePrintingMethodId(id: PrintingMethodId): string {
  return humanizeBusinessTaxonomyId(id, "Printing Method");
}

export function createPrintingMethodId(
  name: string,
  existingIds: readonly PrintingMethodId[] = [],
): PrintingMethodId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "printing-method",
    maxLength: MAX_PRINTING_METHOD_ID_LENGTH,
  });
}

function normalizeMethod(
  method: Partial<PrintingMethodDefinition> | undefined,
  order: number,
): PrintingMethodDefinition | null {
  return normalizeConfigurableDefinition(method, order, {
    fallbackIcon: FALLBACK_ICON,
    fallbackName: method?.id
      ? humanizePrintingMethodId(method.id)
      : "Printing Method",
    maxIdLength: MAX_PRINTING_METHOD_ID_LENGTH,
  });
}

export function normalizePrintingMethodsSettings(
  settings?: Partial<PrintingMethodsSettings> | null,
): PrintingMethodsSettings {
  const defaults = createDefaultPrintingMethodsSettings();
  const sourceMethods = Array.isArray(settings?.methods)
    ? settings.methods
    : [];
  const normalizedSourceMethods = sourceMethods
    .map((method, index) => normalizeMethod(method, index))
    .filter((method): method is PrintingMethodDefinition => method !== null);

  return {
    ...settings,
    methods: normalizeConfigurableDefinitions(
      defaults.methods,
      normalizedSourceMethods,
      {
        fallbackIcon: FALLBACK_ICON,
        maxIdLength: MAX_PRINTING_METHOD_ID_LENGTH,
      },
    ),
  };
}

export function getPrintingMethodDefinitions(
  settings?: Partial<PrintingMethodsSettings> | null,
): PrintingMethodDefinition[] {
  return normalizePrintingMethodsSettings(settings).methods;
}

export function getEnabledPrintingMethodDefinitions(
  settings?: Partial<PrintingMethodsSettings> | null,
): PrintingMethodDefinition[] {
  return getEnabledConfigurableDefinitions(
    getPrintingMethodDefinitions(settings),
  );
}

export function getPrintingMethodOptions(
  settings?: Partial<PrintingMethodsSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getPrintingMethodDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "PrintingMethod",
  });
}

export function getPrintingMethodDefinition(
  id: PrintingMethodId,
  settings?: Partial<PrintingMethodsSettings> | null,
): PrintingMethodDefinition | undefined {
  return getConfigurableDefinition(id, getPrintingMethodDefinitions(settings));
}

export function getPrintingMethodLabel(
  id: PrintingMethodId,
  settings?: Partial<PrintingMethodsSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getPrintingMethodDefinitions(settings),
    {
      fallback: humanizePrintingMethodId(id),
      locale,
      t,
      translationKeyPrefix: "PrintingMethod",
    },
  );
}

export function getPrintingMethodColorPalette(
  id: PrintingMethodId,
  settings?: Partial<PrintingMethodsSettings> | null,
): string {
  return getConfigurableColorPalette(
    id,
    getPrintingMethodDefinitions(settings),
  );
}

export function getPrintingMethodIcon(
  id: PrintingMethodId,
  settings?: Partial<PrintingMethodsSettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getPrintingMethodDefinitions(settings),
    FALLBACK_ICON,
  );
}

export function getKnownPrintingMethodIds(
  settings?: Partial<PrintingMethodsSettings> | null,
): PrintingMethodId[] {
  return getPrintingMethodDefinitions(settings).map((method) => method.id);
}

export function getActivePrintingMethodIds(
  settings?: Partial<PrintingMethodsSettings> | null,
): PrintingMethodId[] {
  return getEnabledPrintingMethodDefinitions(settings).map(
    (method) => method.id,
  );
}
