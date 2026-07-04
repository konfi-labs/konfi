import { createHash } from "crypto";
import type {
  AttributeMapping,
  ExternalAttribute,
  ExternalPriceConfiguration,
  ExternalProduct,
  ExternalProductPricingExclusionRule,
  ExternalProductPricingSelection,
  ExternalProviderEndpoint,
} from "@konfi/types";
import type { DocumentReference } from "firebase-admin/firestore";
import { normalizeExternalDeliveryTime } from "@/lib/external-products/delivery-time";
import {
  buildManualPricingCombinationStrategy,
  getPersistedManualPricingExclusionRules,
} from "@/lib/external-products/pricing-combination-planner";
import {
  normalizeExternalPriceConfigurationSelection,
  normalizeExternalPriceConfigurations,
} from "@/lib/external-products/price-configuration-normalization";
import {
  readPendingPriceConfigurations,
  readPriceConfigurations,
} from "@/lib/external-products/price-configuration-storage";

const PRICE_CONFIGURATION_REUSE_SIGNATURE_VERSION = 2;

export type PriceConfigurationReuseCandidate = {
  url: string;
  configuration: Record<string, string>;
};

type PriceFetchReuseSignatureOptions = {
  externalAttributes: ExternalAttribute[];
  attributeMappings?: AttributeMapping[];
  pricingExclusionRules?: ExternalProductPricingExclusionRule[];
  pricingSelection?: Pick<
    ExternalProductPricingSelection,
    "configurationParams" | "endpointId" | "staticQueryParams" | "valueMappings"
  >;
  selectedEndpoint?: Pick<ExternalProviderEndpoint, "id" | "sampleUrl" | "url">;
  marginPercent: number;
  taxPercent: number;
  discountPercent: number;
};

type ReusableStoredPriceConfigurationsOptions = {
  docRef: DocumentReference;
  externalProduct: Pick<
    ExternalProduct,
    | "pendingPriceConfigurations"
    | "pendingPriceConfigurationsCount"
    | "priceConfigurationReuseSignature"
    | "priceConfigurations"
    | "priceConfigurationsCount"
  >;
  currentSignature: string;
};

type PartitionPriceConfigurationsForReuseOptions = {
  candidates: PriceConfigurationReuseCandidate[];
  existingConfigurations: ExternalPriceConfiguration[];
};

type LatestStoredPriceConfigurationsOptions = Omit<
  ReusableStoredPriceConfigurationsOptions,
  "currentSignature"
>;

type StoredPriceConfigurationSource = "applied" | "none" | "pending";

type PreserveMissingDeliveryTimesOptions = {
  existingConfigurations: ExternalPriceConfiguration[];
  nextConfigurations: ExternalPriceConfiguration[];
};

function sortStringArray(values?: string[]): string[] | undefined {
  const normalized = [...new Set(values ?? [])]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .toSorted((left, right) => left.localeCompare(right));

  return normalized.length > 0 ? normalized : undefined;
}

function sortStringRecord(
  record?: Record<string, string>,
): Record<string, string> | undefined {
  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0)
    .toSorted(([keyA], [keyB]) => keyA.localeCompare(keyB));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sortStringArrayRecord(
  record?: Record<string, string[]>,
): Record<string, string[]> | undefined {
  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record)
    .map(([key, value]) => [key.trim(), sortStringArray(value)] as const)
    .filter(
      (entry): entry is readonly [string, string[]] =>
        entry[0].length > 0 && Boolean(entry[1]?.length),
    )
    .toSorted(([keyA], [keyB]) => keyA.localeCompare(keyB));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeExternalAttributesForSignature(
  externalAttributes: ExternalAttribute[],
) {
  return [...externalAttributes]
    .map((attribute) => ({
      affectsPricing: attribute.affectsPricing === true,
      id: attribute.id,
      name: attribute.name,
      values: sortStringArray(attribute.values) ?? [],
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

function normalizeAttributeMappingsForSignature(mappings?: AttributeMapping[]) {
  return [...(mappings ?? [])]
    .map((mapping) => {
      const mode = mapping.ignored
        ? "ignored"
        : mapping.providerOnlyPricing
          ? "providerOnly"
          : mapping.internalAttributeId
            ? "mapped"
            : "unmapped";

      return {
        externalAttributeName: mapping.externalAttributeName,
        fixedExternalValue:
          mode === "providerOnly"
            ? mapping.fixedExternalValue?.trim() || undefined
            : undefined,
        mappedExternalValues:
          mode === "mapped"
            ? sortStringArray(Object.keys(mapping.optionMappings ?? {}))
            : undefined,
        mode,
      };
    })
    .toSorted((left, right) =>
      left.externalAttributeName.localeCompare(right.externalAttributeName),
    );
}

function normalizePricingSelectionForSignature(
  pricingSelection?: Pick<
    ExternalProductPricingSelection,
    "configurationParams" | "endpointId" | "staticQueryParams" | "valueMappings"
  >,
) {
  if (!pricingSelection) {
    return undefined;
  }

  const normalizedValueMappings = pricingSelection.valueMappings
    ? Object.fromEntries(
        Object.entries(pricingSelection.valueMappings)
          .map(
            ([attributeName, mapping]) =>
              [attributeName.trim(), sortStringRecord(mapping)] as const,
          )
          .filter(
            (entry): entry is readonly [string, Record<string, string>] =>
              entry[0].length > 0 && Boolean(entry[1]),
          )
          .toSorted(([keyA], [keyB]) => keyA.localeCompare(keyB)),
      )
    : undefined;

  return {
    configurationParams: sortStringRecord(pricingSelection.configurationParams),
    endpointId: pricingSelection.endpointId,
    staticQueryParams: sortStringRecord(pricingSelection.staticQueryParams),
    valueMappings:
      normalizedValueMappings && Object.keys(normalizedValueMappings).length > 0
        ? normalizedValueMappings
        : undefined,
  };
}

function normalizePricingExclusionRulesForSignature(
  rules?: ExternalProductPricingExclusionRule[],
) {
  const manualStrategy = buildManualPricingCombinationStrategy(
    getPersistedManualPricingExclusionRules(rules),
  );

  return (manualStrategy?.rules ?? [])
    .map((rule) => ({
      excludedValues: sortStringArrayRecord(rule.excludedValues),
      omitAttributes: sortStringArray(rule.omitAttributes),
      reason: rule.reason,
      when: sortStringRecord(rule.when),
    }))
    .toSorted((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

function normalizeConfiguration(
  configuration: Record<string, string>,
): Record<string, string> {
  return normalizeExternalPriceConfigurationSelection(configuration);
}

function buildConfigurationOnlyKey(
  configuration: Record<string, string>,
): string {
  return JSON.stringify(normalizeConfiguration(configuration));
}

function buildConfigurationAndUrlKey(options: {
  configuration: Record<string, string>;
  sourceUrl?: string;
}): string {
  const { configuration, sourceUrl } = options;
  return `${buildConfigurationOnlyKey(configuration)}::${sourceUrl ?? ""}`;
}

function buildStoredRangeDeliveryTimeMap(
  priceRanges?: ExternalPriceConfiguration["priceInfo"]["priceRanges"],
): Map<string, number> {
  const deliveryTimesByRange = new Map<string, number>();

  for (const range of priceRanges ?? []) {
    if (
      typeof range.quantity !== "number" ||
      !Number.isFinite(range.quantity)
    ) {
      continue;
    }

    const deliveryTime = normalizeExternalDeliveryTime(range.deliveryTime);

    if (deliveryTime === undefined) {
      continue;
    }

    const normalizedUnit = range.unit?.trim().toLowerCase() ?? "";
    const rangeKey = `${range.quantity}::${normalizedUnit}`;

    if (!deliveryTimesByRange.has(rangeKey)) {
      deliveryTimesByRange.set(rangeKey, deliveryTime);
    }
  }

  return deliveryTimesByRange;
}

async function getStoredPriceConfigurations(options: {
  currentSignature?: string;
  docRef: DocumentReference;
  externalProduct: ReusableStoredPriceConfigurationsOptions["externalProduct"];
  requireMatchingSignature: boolean;
}): Promise<{
  configurations: ExternalPriceConfiguration[];
  source: StoredPriceConfigurationSource;
}> {
  const {
    currentSignature,
    docRef,
    externalProduct,
    requireMatchingSignature,
  } = options;

  if (
    requireMatchingSignature &&
    externalProduct.priceConfigurationReuseSignature !== currentSignature
  ) {
    return { configurations: [], source: "none" };
  }

  const pendingCount =
    externalProduct.pendingPriceConfigurationsCount ??
    externalProduct.pendingPriceConfigurations?.length ??
    0;

  if (pendingCount > 0) {
    const configurations = await readPendingPriceConfigurations({
      docRef,
      externalProduct,
    });

    if (configurations.length > 0) {
      return { configurations, source: "pending" };
    }
  }

  const appliedCount =
    externalProduct.priceConfigurationsCount ??
    externalProduct.priceConfigurations?.length ??
    0;

  if (appliedCount > 0) {
    const configurations = await readPriceConfigurations({
      docRef,
      externalProduct,
    });

    if (configurations.length > 0) {
      return { configurations, source: "applied" };
    }
  }

  return { configurations: [], source: "none" };
}

export function buildPriceConfigurationReuseSignature(
  options: PriceFetchReuseSignatureOptions,
): string {
  const {
    attributeMappings,
    discountPercent,
    externalAttributes,
    marginPercent,
    pricingExclusionRules,
    pricingSelection,
    selectedEndpoint,
    taxPercent,
  } = options;

  const payload = {
    version: PRICE_CONFIGURATION_REUSE_SIGNATURE_VERSION,
    adjustments: {
      discountPercent,
      marginPercent,
      taxPercent,
    },
    attributeMappings:
      normalizeAttributeMappingsForSignature(attributeMappings),
    externalAttributes:
      normalizeExternalAttributesForSignature(externalAttributes),
    pricingExclusionRules: normalizePricingExclusionRulesForSignature(
      pricingExclusionRules,
    ),
    pricingSelection: normalizePricingSelectionForSignature(pricingSelection),
    selectedEndpoint: selectedEndpoint
      ? {
          id: selectedEndpoint.id,
          sampleUrl: selectedEndpoint.sampleUrl,
          url: selectedEndpoint.url,
        }
      : undefined,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function getReusableStoredPriceConfigurations(
  options: ReusableStoredPriceConfigurationsOptions,
): Promise<{
  configurations: ExternalPriceConfiguration[];
  source: StoredPriceConfigurationSource;
}> {
  const { currentSignature, docRef, externalProduct } = options;

  return getStoredPriceConfigurations({
    currentSignature,
    docRef,
    externalProduct,
    requireMatchingSignature: true,
  });
}

export async function getLatestStoredPriceConfigurations(
  options: LatestStoredPriceConfigurationsOptions,
): Promise<{
  configurations: ExternalPriceConfiguration[];
  source: StoredPriceConfigurationSource;
}> {
  const { docRef, externalProduct } = options;

  return getStoredPriceConfigurations({
    docRef,
    externalProduct,
    requireMatchingSignature: false,
  });
}

export function partitionPriceConfigurationsForReuse(
  options: PartitionPriceConfigurationsForReuseOptions,
): {
  remainingCandidates: PriceConfigurationReuseCandidate[];
  reusedConfigurations: ExternalPriceConfiguration[];
} {
  const { candidates, existingConfigurations } = options;
  const exactMatchMap = new Map<string, ExternalPriceConfiguration>();
  const configurationOnlyMap = new Map<string, ExternalPriceConfiguration>();

  for (const configuration of existingConfigurations) {
    const exactKey = buildConfigurationAndUrlKey({
      configuration: configuration.configuration,
      sourceUrl: configuration.sourceUrl,
    });
    const configurationOnlyKey = buildConfigurationOnlyKey(
      configuration.configuration,
    );

    if (!exactMatchMap.has(exactKey)) {
      exactMatchMap.set(exactKey, configuration);
    }

    if (!configurationOnlyMap.has(configurationOnlyKey)) {
      configurationOnlyMap.set(configurationOnlyKey, configuration);
    }
  }

  const reusedConfigurations: ExternalPriceConfiguration[] = [];
  const remainingCandidates: PriceConfigurationReuseCandidate[] = [];

  for (const candidate of candidates) {
    const exactMatch = exactMatchMap.get(
      buildConfigurationAndUrlKey({
        configuration: candidate.configuration,
        sourceUrl: candidate.url,
      }),
    );
    const reusableConfiguration =
      exactMatch ??
      configurationOnlyMap.get(
        buildConfigurationOnlyKey(candidate.configuration),
      );

    if (reusableConfiguration) {
      reusedConfigurations.push(reusableConfiguration);
      continue;
    }

    remainingCandidates.push(candidate);
  }

  return {
    remainingCandidates,
    reusedConfigurations,
  };
}

export function preserveMissingDeliveryTimesInPriceConfigurations(
  options: PreserveMissingDeliveryTimesOptions,
): {
  configurations: ExternalPriceConfiguration[];
  preservedRangeCount: number;
} {
  const normalizedExistingConfigurations = normalizeExternalPriceConfigurations(
    options.existingConfigurations,
  );
  const normalizedNextConfigurations = normalizeExternalPriceConfigurations(
    options.nextConfigurations,
  );
  const exactMatchMap = new Map<string, Map<string, number>>();
  const configurationOnlyMap = new Map<string, Map<string, number>>();

  for (const configuration of normalizedExistingConfigurations) {
    const deliveryTimesByRange = buildStoredRangeDeliveryTimeMap(
      configuration.priceInfo?.priceRanges,
    );

    if (deliveryTimesByRange.size === 0) {
      continue;
    }

    const exactKey = buildConfigurationAndUrlKey({
      configuration: configuration.configuration,
      sourceUrl: configuration.sourceUrl,
    });
    const configurationOnlyKey = buildConfigurationOnlyKey(
      configuration.configuration,
    );

    if (!exactMatchMap.has(exactKey)) {
      exactMatchMap.set(exactKey, deliveryTimesByRange);
    }

    if (!configurationOnlyMap.has(configurationOnlyKey)) {
      configurationOnlyMap.set(configurationOnlyKey, deliveryTimesByRange);
    }
  }

  let preservedRangeCount = 0;

  const configurations = normalizedNextConfigurations.map((configuration) => {
    const exactMatch = exactMatchMap.get(
      buildConfigurationAndUrlKey({
        configuration: configuration.configuration,
        sourceUrl: configuration.sourceUrl,
      }),
    );
    const deliveryTimesByRange =
      exactMatch ??
      configurationOnlyMap.get(
        buildConfigurationOnlyKey(configuration.configuration),
      );

    if (
      !deliveryTimesByRange ||
      !configuration.priceInfo?.priceRanges?.length
    ) {
      return configuration;
    }

    return {
      ...configuration,
      priceInfo: {
        ...configuration.priceInfo,
        priceRanges: configuration.priceInfo.priceRanges.map((range) => {
          const currentDeliveryTime = normalizeExternalDeliveryTime(
            range.deliveryTime,
          );

          if (currentDeliveryTime !== undefined) {
            return range;
          }

          if (
            typeof range.quantity !== "number" ||
            !Number.isFinite(range.quantity)
          ) {
            return range;
          }

          const normalizedUnit = range.unit?.trim().toLowerCase() ?? "";
          const preservedDeliveryTime = deliveryTimesByRange.get(
            `${range.quantity}::${normalizedUnit}`,
          );

          if (preservedDeliveryTime === undefined) {
            return range;
          }

          preservedRangeCount += 1;

          return {
            ...range,
            deliveryTime: preservedDeliveryTime,
          };
        }),
      },
    };
  });

  return {
    configurations,
    preservedRangeCount,
  };
}
