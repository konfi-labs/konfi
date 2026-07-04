import {
  OrderStatus,
  PrintingMethod,
  type Locale,
  type OrderRulePresetDefinition,
  type OrderRulePresetsSettings,
  type OrderWorkflowStatusDefinition,
  type OrderWorkflowStatusId,
  type OrderWorkflowStatusesSettings,
  type PrintingMethodDefinition,
  type PrintingMethodId,
  type PrintingMethodsSettings,
  type RulePreset,
} from "@konfi/types";
import { FieldPath, where } from "firebase/firestore";
import {
  createBusinessTaxonomyId,
  getConfigurableDefinitionLabel,
  getEnabledConfigurableDefinitions,
  humanizeBusinessTaxonomyId,
  isValidBusinessTaxonomyId,
  normalizeBusinessTaxonomyLocalizedNames,
  type TranslationFunction,
} from "./business-taxonomy";
import { getEnabledOrderWorkflowStatusDefinitions } from "./order-workflow-statuses";
import { getEnabledPrintingMethodDefinitions } from "./printing-methods";

export const ORDER_RULE_PRESETS_SETTINGS_DOC_ID = "orderRulePresets";

const MAX_ORDER_RULE_PRESET_ID_LENGTH = 80;
const MAX_FIRESTORE_DISJUNCTION_VALUES = 30;
const DEFAULT_ACTIVE_STATUS_IDS: readonly OrderWorkflowStatusId[] = [
  OrderStatus.NEW,
  OrderStatus.IN_PROGRESS,
  OrderStatus.WAITING_FOR_MATERIALS,
  OrderStatus.UNDER_REVIEW,
];
const BIG_FORMAT_METHOD_IDS: readonly PrintingMethodId[] = [
  PrintingMethod.LARGE_FORMAT,
  PrintingMethod.ECO_SOLVENT,
  PrintingMethod.UV,
  PrintingMethod.CUTTING,
  PrintingMethod.INSTALLATION,
];

type PresetSeed = Pick<
  OrderRulePresetDefinition,
  | "id"
  | "name"
  | "localizedNames"
  | "icon"
  | "colorPalette"
  | "printingMethodIds"
  | "statusIds"
>;

function uniqueKnownValues<T extends string>(
  values: readonly unknown[] | undefined,
  knownValues: ReadonlySet<T>,
): T[] {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values ?? []) {
    if (typeof value !== "string" || !knownValues.has(value as T)) {
      continue;
    }

    const typedValue = value as T;
    if (seen.has(typedValue)) {
      continue;
    }

    seen.add(typedValue);
    result.push(typedValue);
  }

  return result.slice(0, MAX_FIRESTORE_DISJUNCTION_VALUES);
}

function getDefaultActiveStatusIds(
  orderStatuses: readonly OrderWorkflowStatusDefinition[],
): OrderWorkflowStatusId[] {
  const statusIds = new Set(orderStatuses.map((status) => status.id));
  const preferredStatusIds = DEFAULT_ACTIVE_STATUS_IDS.filter((statusId) =>
    statusIds.has(statusId),
  );

  if (preferredStatusIds.length > 0) {
    return preferredStatusIds;
  }

  return orderStatuses
    .filter(
      (status) =>
        status.countsAsActive &&
        !status.isDraft &&
        !status.isTerminal &&
        !status.archived &&
        status.enabled,
    )
    .map((status) => status.id)
    .slice(0, MAX_FIRESTORE_DISJUNCTION_VALUES);
}

function getActiveMethodIds(
  methodIds: readonly PrintingMethodId[],
  printingMethods: readonly PrintingMethodDefinition[],
): PrintingMethodId[] {
  const activeMethodIds = new Set(printingMethods.map((method) => method.id));
  return methodIds.filter((methodId) => activeMethodIds.has(methodId));
}

function createDefaultPresetSeeds(
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
): PresetSeed[] {
  const orderStatuses = getEnabledOrderWorkflowStatusDefinitions(
    orderWorkflowStatusesSettings,
  );
  const printingMethods = getEnabledPrintingMethodDefinitions(
    printingMethodsSettings,
  );
  const statusIds = getDefaultActiveStatusIds(orderStatuses);

  if (statusIds.length === 0) {
    return [];
  }

  const seeds: PresetSeed[] = [
    {
      id: "active",
      name: "Active",
      icon: "visibility",
      colorPalette: "blue",
      statusIds,
      printingMethodIds: [],
    },
  ];
  const digitalMethodIds = getActiveMethodIds(
    [PrintingMethod.DIGITAL],
    printingMethods,
  );
  const bigFormatMethodIds = getActiveMethodIds(
    BIG_FORMAT_METHOD_IDS,
    printingMethods,
  );
  const dtfMethodIds = getActiveMethodIds(
    [PrintingMethod.DTF],
    printingMethods,
  );

  if (digitalMethodIds.length > 0) {
    seeds.push({
      id: "digital-print",
      name: "Digital print",
      icon: "print",
      colorPalette: "cyan",
      statusIds,
      printingMethodIds: digitalMethodIds,
    });
  }

  if (bigFormatMethodIds.length > 0) {
    seeds.push({
      id: "big-format",
      name: "Big format",
      icon: "grain",
      colorPalette: "purple",
      statusIds,
      printingMethodIds: bigFormatMethodIds,
    });
  }

  if (dtfMethodIds.length > 0) {
    seeds.push({
      id: "dtf",
      name: "DTF",
      icon: "laundry",
      colorPalette: "orange",
      statusIds,
      printingMethodIds: dtfMethodIds,
    });
  }

  return seeds;
}

function createDefaultPreset(
  seed: PresetSeed,
  order: number,
): OrderRulePresetDefinition {
  return {
    ...seed,
    archived: false,
    enabled: true,
    isDefault: true,
    order,
  };
}

function normalizePreset(
  preset: Partial<OrderRulePresetDefinition> | undefined,
  order: number,
  knownStatusIds: ReadonlySet<OrderWorkflowStatusId>,
  knownMethodIds: ReadonlySet<PrintingMethodId>,
): OrderRulePresetDefinition | null {
  if (!isValidBusinessTaxonomyId(preset?.id, MAX_ORDER_RULE_PRESET_ID_LENGTH)) {
    return null;
  }

  const statusIds = uniqueKnownValues(preset.statusIds, knownStatusIds);
  if (statusIds.length === 0) {
    return null;
  }

  const name =
    typeof preset.name === "string" && preset.name.trim().length > 0
      ? preset.name.trim()
      : humanizeBusinessTaxonomyId(preset.id, "Preset");

  return {
    id: preset.id,
    name,
    localizedNames: normalizeBusinessTaxonomyLocalizedNames(
      preset.localizedNames,
    ),
    icon:
      typeof preset.icon === "string" && preset.icon.trim().length > 0
        ? preset.icon.trim()
        : "filter_alt",
    colorPalette:
      typeof preset.colorPalette === "string" &&
      preset.colorPalette.trim().length > 0
        ? preset.colorPalette.trim()
        : "gray",
    order,
    enabled: preset.enabled !== false,
    archived: preset.archived === true,
    isDefault: preset.isDefault === true,
    statusIds,
    printingMethodIds: uniqueKnownValues(
      preset.printingMethodIds,
      knownMethodIds,
    ),
  };
}

export function createOrderRulePresetId(
  name: string,
  existingIds: readonly string[] = [],
): string {
  return createBusinessTaxonomyId(name, existingIds, {
    fallback: "order-rule-preset",
    maxLength: MAX_ORDER_RULE_PRESET_ID_LENGTH,
  });
}

export function createDefaultOrderRulePresetsSettings(
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
): OrderRulePresetsSettings {
  return {
    presets: createDefaultPresetSeeds(
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
    ).map((seed, index) => createDefaultPreset(seed, index)),
  };
}

export function normalizeOrderRulePresetsSettings(
  settings?: Partial<OrderRulePresetsSettings> | null,
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
): OrderRulePresetsSettings {
  const orderStatuses = getEnabledOrderWorkflowStatusDefinitions(
    orderWorkflowStatusesSettings,
  );
  const printingMethods = getEnabledPrintingMethodDefinitions(
    printingMethodsSettings,
  );
  const knownStatusIds = new Set(orderStatuses.map((status) => status.id));
  const knownMethodIds = new Set(printingMethods.map((method) => method.id));
  const sourcePresets = Array.isArray(settings?.presets)
    ? settings.presets
    : [];
  const normalizedPresets = sourcePresets
    .map((preset, index) =>
      normalizePreset(preset, index, knownStatusIds, knownMethodIds),
    )
    .filter((preset): preset is OrderRulePresetDefinition => preset !== null);
  const presetIds = new Set(normalizedPresets.map((preset) => preset.id));

  for (const seed of createDefaultPresetSeeds(
    orderWorkflowStatusesSettings,
    printingMethodsSettings,
  )) {
    if (presetIds.has(seed.id)) {
      continue;
    }

    normalizedPresets.push(createDefaultPreset(seed, normalizedPresets.length));
  }

  return {
    ...settings,
    presets: normalizedPresets
      .map((preset, index) => ({ ...preset, order: index }))
      .sort((a, b) => a.order - b.order),
  };
}

export function getEnabledOrderRulePresetDefinitions(
  settings?: Partial<OrderRulePresetsSettings> | null,
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
): OrderRulePresetDefinition[] {
  return getEnabledConfigurableDefinitions(
    normalizeOrderRulePresetsSettings(
      settings,
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
    ).presets,
  );
}

export function getOrderRulePresetLabel(
  id: string,
  settings?: Partial<OrderRulePresetsSettings> | null,
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
  t?: TranslationFunction,
  locale?: Locale | string,
): string {
  return getConfigurableDefinitionLabel(
    id,
    normalizeOrderRulePresetsSettings(
      settings,
      orderWorkflowStatusesSettings,
      printingMethodsSettings,
    ).presets,
    {
      fallback: humanizeBusinessTaxonomyId(id, "Preset"),
      locale,
      t,
      translationKeyPrefix: "OrderRulePreset",
    },
  );
}

export function compileOrderRulePreset(
  preset: OrderRulePresetDefinition,
  options: {
    locale?: Locale | string;
    t?: TranslationFunction;
  } = {},
): RulePreset | null {
  if (preset.statusIds.length === 0) {
    return null;
  }

  const statusIds = preset.statusIds;
  // Clamp the printingMethodIds used in the compiled clause so that
  // statusIds.length × printingMethodIds.length stays within the Firestore
  // 30-disjunction limit.  The structured field keeps the full list so
  // consumers that need all ids (e.g. planSectionPresetConstraints) can
  // apply their own budget math per query.
  const maxMethods = Math.max(
    1,
    Math.floor(MAX_FIRESTORE_DISJUNCTION_VALUES / statusIds.length),
  );
  const clampedMethodIds = preset.printingMethodIds.slice(0, maxMethods);

  const values = [where(new FieldPath("status"), "in", statusIds)];

  if (clampedMethodIds.length === 1) {
    values.push(
      where(
        new FieldPath("printingMethods"),
        "array-contains",
        clampedMethodIds[0],
      ),
    );
  } else if (clampedMethodIds.length > 1) {
    values.push(
      where(
        new FieldPath("printingMethods"),
        "array-contains-any",
        clampedMethodIds,
      ),
    );
  }

  return {
    id: preset.id,
    label: getConfigurableDefinitionLabel(preset.id, [preset], {
      fallback: preset.name,
      locale: options.locale,
      t: options.t,
      translationKeyPrefix: "OrderRulePreset",
    }),
    icon: preset.icon,
    values,
    statusIds,
    printingMethodIds: preset.printingMethodIds,
  };
}

export function compileOrderRulePresets(
  settings?: Partial<OrderRulePresetsSettings> | null,
  orderWorkflowStatusesSettings?: Partial<OrderWorkflowStatusesSettings> | null,
  printingMethodsSettings?: Partial<PrintingMethodsSettings> | null,
  options: {
    locale?: Locale | string;
    t?: TranslationFunction;
  } = {},
): RulePreset[] {
  return getEnabledOrderRulePresetDefinitions(
    settings,
    orderWorkflowStatusesSettings,
    printingMethodsSettings,
  ).flatMap((preset) => {
    const compiled = compileOrderRulePreset(preset, options);
    return compiled ? [compiled] : [];
  });
}
