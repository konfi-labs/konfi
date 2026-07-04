import {
  ProofingOptions,
  Unit,
  UnitReadable,
  type Locale,
  type ProofingMethodDefinition,
  type ProofingMethodId,
  type SelectOption,
  type UnitDefinition,
  type UnitId,
  type UnitsProofingSettings,
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

export type {
  ProofingMethodDefinition,
  ProofingMethodId,
  UnitDefinition,
  UnitId,
  UnitsProofingSettings,
};

export const UNITS_PROOFING_SETTINGS_DOC_ID = "unitsProofing";

const MAX_UNITS_PROOFING_ID_LENGTH = 80;
const FALLBACK_UNIT_ICON = "straighten";
const FALLBACK_PROOFING_ICON = "fact_check";
const DEFAULT_UNIT_PRECISION = 0;
const MAX_UNIT_PRECISION = 6;

export const DEFAULT_UNIT_DEFINITIONS = [
  {
    id: Unit.PCS,
    name: "Pieces",
    abbreviation: UnitReadable.PCS,
    precision: 0,
    icon: "inventory_2",
    colorPalette: "blue",
  },
  {
    id: Unit.M2,
    name: "Square meters",
    abbreviation: UnitReadable.M2,
    precision: 2,
    icon: "crop_square",
    colorPalette: "green",
  },
  {
    id: Unit.MB,
    name: "Running meters",
    abbreviation: UnitReadable.MB,
    precision: 2,
    icon: "linear_scale",
    colorPalette: "teal",
  },
  {
    id: Unit.HOUR,
    name: "Hours",
    abbreviation: UnitReadable.HOUR,
    precision: 2,
    icon: "schedule",
    colorPalette: "purple",
  },
  {
    id: Unit.SHEET,
    name: "Sheets",
    abbreviation: UnitReadable.SHEET,
    precision: 0,
    icon: "article",
    colorPalette: "orange",
  },
  {
    id: Unit.KM,
    name: "Kilometers",
    abbreviation: UnitReadable.KM,
    precision: 2,
    icon: "route",
    colorPalette: "cyan",
  },
  {
    id: Unit.CMB,
    name: "Cubic meters",
    abbreviation: UnitReadable.CMB,
    precision: 2,
    icon: "deployed_code",
    colorPalette: "pink",
  },
  {
    id: Unit.CM2,
    name: "Square centimeters",
    abbreviation: UnitReadable.CM2,
    precision: 2,
    icon: "aspect_ratio",
    colorPalette: "yellow",
  },
] as const satisfies readonly Omit<
  UnitDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_PROOFING_METHOD_DEFINITIONS = [
  {
    id: ProofingOptions.RUN_AS_IS,
    name: "Run as is",
    icon: "play_arrow",
    colorPalette: "green",
  },
  {
    id: ProofingOptions.MANUAL,
    name: "Manual proofing",
    icon: "fact_check",
    colorPalette: "purple",
  },
] as const satisfies readonly Omit<
  ProofingMethodDefinition,
  "enabled" | "order" | "archived" | "isDefault"
>[];

export const DEFAULT_UNIT_IDS = DEFAULT_UNIT_DEFINITIONS.map((unit) => unit.id);
export const DEFAULT_PROOFING_METHOD_IDS =
  DEFAULT_PROOFING_METHOD_DEFINITIONS.map((method) => method.id);

function cloneDefaultUnit(
  unit: (typeof DEFAULT_UNIT_DEFINITIONS)[number],
  order: number,
): UnitDefinition {
  return {
    ...unit,
    enabled: true,
    archived: false,
    isDefault: true,
    order,
  };
}

function cloneDefaultProofingMethod(
  method: (typeof DEFAULT_PROOFING_METHOD_DEFINITIONS)[number],
  order: number,
): ProofingMethodDefinition {
  return {
    ...method,
    enabled: true,
    archived: false,
    isDefault: true,
    order,
  };
}

export function createDefaultUnitsProofingSettings(): UnitsProofingSettings {
  return {
    units: DEFAULT_UNIT_DEFINITIONS.map((unit, index) =>
      cloneDefaultUnit(unit, index),
    ),
    proofingMethods: DEFAULT_PROOFING_METHOD_DEFINITIONS.map((method, index) =>
      cloneDefaultProofingMethod(method, index),
    ),
  };
}

export function isValidUnitId(value: unknown): value is UnitId {
  return isValidBusinessTaxonomyId(value, MAX_UNITS_PROOFING_ID_LENGTH);
}

export function isValidProofingMethodId(
  value: unknown,
): value is ProofingMethodId {
  return isValidBusinessTaxonomyId(value, MAX_UNITS_PROOFING_ID_LENGTH);
}

export function humanizeUnitId(id: UnitId): string {
  return humanizeBusinessTaxonomyId(id, "Unit");
}

export function humanizeProofingMethodId(id: ProofingMethodId): string {
  return humanizeBusinessTaxonomyId(id, "Proofing Method");
}

export function createUnitId(
  name: string,
  existingIds: readonly UnitId[] = [],
): UnitId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "unit",
    maxLength: MAX_UNITS_PROOFING_ID_LENGTH,
  });
}

export function createProofingMethodId(
  name: string,
  existingIds: readonly ProofingMethodId[] = [],
): ProofingMethodId {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "proofing-method",
    maxLength: MAX_UNITS_PROOFING_ID_LENGTH,
  });
}

function normalizeUnitPrecision(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_UNIT_PRECISION;
  }

  return Math.max(0, Math.min(MAX_UNIT_PRECISION, Math.trunc(value)));
}

function normalizeUnitAbbreviation(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeUnit(
  unit: Partial<UnitDefinition> | undefined,
  order: number,
): UnitDefinition | null {
  const defaultUnit = isValidUnitId(unit?.id)
    ? createDefaultUnitsProofingSettings().units.find(
        (definition) => definition.id === unit.id,
      )
    : undefined;
  const normalized = normalizeConfigurableDefinition(unit, order, {
    defaultDefinition: defaultUnit,
    fallbackIcon: FALLBACK_UNIT_ICON,
    fallbackName: unit?.id ? humanizeUnitId(unit.id) : "Unit",
    maxIdLength: MAX_UNITS_PROOFING_ID_LENGTH,
  });

  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    abbreviation: normalizeUnitAbbreviation(
      normalized.abbreviation,
      defaultUnit?.abbreviation ?? humanizeUnitId(normalized.id),
    ),
    precision: normalizeUnitPrecision(normalized.precision),
  };
}

function normalizeProofingMethod(
  method: Partial<ProofingMethodDefinition> | undefined,
  order: number,
): ProofingMethodDefinition | null {
  const defaultMethod = isValidProofingMethodId(method?.id)
    ? createDefaultUnitsProofingSettings().proofingMethods.find(
        (definition) => definition.id === method.id,
      )
    : undefined;

  return normalizeConfigurableDefinition(method, order, {
    defaultDefinition: defaultMethod,
    fallbackIcon: FALLBACK_PROOFING_ICON,
    fallbackName: method?.id
      ? humanizeProofingMethodId(method.id)
      : "Proofing Method",
    maxIdLength: MAX_UNITS_PROOFING_ID_LENGTH,
  });
}

export function normalizeUnitsProofingSettings(
  settings?: Partial<UnitsProofingSettings> | null,
): UnitsProofingSettings {
  const defaults = createDefaultUnitsProofingSettings();
  const sourceUnits = Array.isArray(settings?.units) ? settings.units : [];
  const sourceProofingMethods = Array.isArray(settings?.proofingMethods)
    ? settings.proofingMethods
    : [];
  const normalizedUnits = sourceUnits
    .map((unit, index) => normalizeUnit(unit, index))
    .filter((unit): unit is UnitDefinition => unit !== null);
  const normalizedProofingMethods = sourceProofingMethods
    .map((method, index) => normalizeProofingMethod(method, index))
    .filter((method): method is ProofingMethodDefinition => method !== null);

  return {
    ...settings,
    units: normalizeConfigurableDefinitions(defaults.units, normalizedUnits, {
      fallbackIcon: FALLBACK_UNIT_ICON,
      maxIdLength: MAX_UNITS_PROOFING_ID_LENGTH,
    }).map((unit) => ({
      ...unit,
      abbreviation: normalizeUnitAbbreviation(
        unit.abbreviation,
        humanizeUnitId(unit.id),
      ),
      precision: normalizeUnitPrecision(unit.precision),
    })),
    proofingMethods: normalizeConfigurableDefinitions(
      defaults.proofingMethods,
      normalizedProofingMethods,
      {
        fallbackIcon: FALLBACK_PROOFING_ICON,
        maxIdLength: MAX_UNITS_PROOFING_ID_LENGTH,
      },
    ),
  };
}

export function hasMissingUnitsProofingDefaults(
  settings?: Partial<UnitsProofingSettings> | null,
): boolean {
  const unitIds = new Set(
    Array.isArray(settings?.units) ? settings.units.map((unit) => unit.id) : [],
  );
  const proofingMethodIds = new Set(
    Array.isArray(settings?.proofingMethods)
      ? settings.proofingMethods.map((method) => method.id)
      : [],
  );

  return (
    DEFAULT_UNIT_IDS.some((id) => !unitIds.has(id)) ||
    DEFAULT_PROOFING_METHOD_IDS.some((id) => !proofingMethodIds.has(id))
  );
}

export function getUnitDefinitions(
  settings?: Partial<UnitsProofingSettings> | null,
): UnitDefinition[] {
  return normalizeUnitsProofingSettings(settings).units;
}

export function getEnabledUnitDefinitions(
  settings?: Partial<UnitsProofingSettings> | null,
): UnitDefinition[] {
  return getEnabledConfigurableDefinitions(getUnitDefinitions(settings));
}

export function getUnitOptions(
  settings?: Partial<UnitsProofingSettings> | null,
  t?: TranslationFunction,
  _locale?: Locale | string,
): SelectOption[] {
  return getEnabledUnitDefinitions(settings).map((unit) => ({
    label:
      unit.isDefault && t
        ? t(`Unit.${unit.id}`, { defaultValue: unit.abbreviation })
        : unit.abbreviation,
    value: unit.id,
  }));
}

export function getUnitDefinition(
  id: UnitId,
  settings?: Partial<UnitsProofingSettings> | null,
): UnitDefinition | undefined {
  return getConfigurableDefinition(id, getUnitDefinitions(settings));
}

export function getUnitLabel(
  id: UnitId,
  settings?: Partial<UnitsProofingSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(id, getUnitDefinitions(settings), {
    fallback: humanizeUnitId(id),
    locale,
    t,
    translationKeyPrefix: "Unit",
  });
}

export function getUnitAbbreviation(
  id: UnitId,
  settings?: Partial<UnitsProofingSettings> | null,
  t?: TranslationFunction,
): string {
  const unit = getUnitDefinition(id, settings);
  const fallback = unit?.abbreviation ?? humanizeUnitId(id);

  if (unit?.isDefault && t) {
    return t(`Unit.${id}`, { defaultValue: fallback });
  }

  return fallback;
}

export function getUnitPrecision(
  id: UnitId,
  settings?: Partial<UnitsProofingSettings> | null,
): number {
  return getUnitDefinition(id, settings)?.precision ?? DEFAULT_UNIT_PRECISION;
}

export function getUnitColorPalette(
  id: UnitId,
  settings?: Partial<UnitsProofingSettings> | null,
): string {
  return getConfigurableColorPalette(id, getUnitDefinitions(settings));
}

export function getUnitIcon(
  id: UnitId,
  settings?: Partial<UnitsProofingSettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getUnitDefinitions(settings),
    FALLBACK_UNIT_ICON,
  );
}

export function getKnownUnitIds(
  settings?: Partial<UnitsProofingSettings> | null,
): UnitId[] {
  return getUnitDefinitions(settings).map((unit) => unit.id);
}

export function getActiveUnitIds(
  settings?: Partial<UnitsProofingSettings> | null,
): UnitId[] {
  return getEnabledUnitDefinitions(settings).map((unit) => unit.id);
}

export function getProofingMethodDefinitions(
  settings?: Partial<UnitsProofingSettings> | null,
): ProofingMethodDefinition[] {
  return normalizeUnitsProofingSettings(settings).proofingMethods;
}

export function getEnabledProofingMethodDefinitions(
  settings?: Partial<UnitsProofingSettings> | null,
): ProofingMethodDefinition[] {
  return getEnabledConfigurableDefinitions(
    getProofingMethodDefinitions(settings),
  );
}

export function getProofingMethodOptions(
  settings?: Partial<UnitsProofingSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): SelectOption[] {
  return getConfigurableOptions(getProofingMethodDefinitions(settings), {
    locale,
    t,
    translationKeyPrefix: "ProofingOptions",
  });
}

export function getProofingMethodDefinition(
  id: ProofingMethodId,
  settings?: Partial<UnitsProofingSettings> | null,
): ProofingMethodDefinition | undefined {
  return getConfigurableDefinition(id, getProofingMethodDefinitions(settings));
}

export function getProofingMethodLabel(
  id: ProofingMethodId,
  settings?: Partial<UnitsProofingSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    getProofingMethodDefinitions(settings),
    {
      fallback: humanizeProofingMethodId(id),
      locale,
      t,
      translationKeyPrefix: "ProofingOptions",
    },
  );
}

export function getProofingMethodColorPalette(
  id: ProofingMethodId,
  settings?: Partial<UnitsProofingSettings> | null,
): string {
  return getConfigurableColorPalette(
    id,
    getProofingMethodDefinitions(settings),
  );
}

export function getProofingMethodIcon(
  id: ProofingMethodId,
  settings?: Partial<UnitsProofingSettings> | null,
): string {
  return getConfigurableIcon(
    id,
    getProofingMethodDefinitions(settings),
    FALLBACK_PROOFING_ICON,
  );
}

export function getKnownProofingMethodIds(
  settings?: Partial<UnitsProofingSettings> | null,
): ProofingMethodId[] {
  return getProofingMethodDefinitions(settings).map((method) => method.id);
}

export function getActiveProofingMethodIds(
  settings?: Partial<UnitsProofingSettings> | null,
): ProofingMethodId[] {
  return getEnabledProofingMethodDefinitions(settings).map(
    (method) => method.id,
  );
}
