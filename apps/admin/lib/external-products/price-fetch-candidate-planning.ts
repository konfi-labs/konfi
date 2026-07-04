import type { AttributeMapping, ExternalAttribute } from "@konfi/types";
import {
  buildPriceConfigurationInputs,
  type PriceConfigurationInput,
  type PricingCombinationStrategy,
} from "@/lib/external-products/pricing-combination-planner";

type CandidatePlanningMode = "primary" | "fallback-strategy" | "unconstrained";

const MAX_EFFECTIVE_PRICE_FETCH_CANDIDATES = 750;
const LARGE_SPACE_PREFIX_SAMPLE_SIZE = 75;

function getConfigurationSampleKey(input: PriceConfigurationInput): string {
  return JSON.stringify(input.configuration);
}

function getConfigurationComplexityScore(
  configuration: Record<string, string>,
): number {
  const values = Object.values(configuration);
  const definedAttributeCount = values.length;
  const nonNeutralValueCount = values.filter(
    (value) => value.trim().toLowerCase() !== "none",
  ).length;

  return definedAttributeCount * 10 + nonNeutralValueCount;
}

function sortInputsByComplexity(
  inputs: PriceConfigurationInput[],
): PriceConfigurationInput[] {
  return [...inputs].toSorted((left, right) => {
    const complexityDiff =
      getConfigurationComplexityScore(left.configuration) -
      getConfigurationComplexityScore(right.configuration);

    if (complexityDiff !== 0) {
      return complexityDiff;
    }

    return getConfigurationSampleKey(left).localeCompare(
      getConfigurationSampleKey(right),
    );
  });
}

export function samplePriceConfigurationInputs(
  inputs: PriceConfigurationInput[],
  limit: number = MAX_EFFECTIVE_PRICE_FETCH_CANDIDATES,
): PriceConfigurationInput[] {
  if (inputs.length <= limit) {
    return inputs;
  }

  const orderedInputs = sortInputsByComplexity(inputs);
  const selectedInputs: PriceConfigurationInput[] = [];
  const selectedKeys = new Set<string>();
  const coveredSingleValues = new Set<string>();
  const allSingleValues = new Set<string>();

  const addInput = (input: PriceConfigurationInput): boolean => {
    if (selectedInputs.length >= limit) {
      return false;
    }

    const key = getConfigurationSampleKey(input);

    if (selectedKeys.has(key)) {
      return false;
    }

    selectedInputs.push(input);
    selectedKeys.add(key);

    for (const [attributeName, value] of Object.entries(
      input.configuration,
    )) {
      coveredSingleValues.add(`${attributeName}=${value}`);
    }

    return true;
  };

  for (const input of orderedInputs) {
    for (const [attributeName, value] of Object.entries(
      input.configuration,
    )) {
      allSingleValues.add(`${attributeName}=${value}`);
    }
  }

  const prefixSampleSize = Math.min(
    LARGE_SPACE_PREFIX_SAMPLE_SIZE,
    Math.max(1, Math.floor(limit * 0.1)),
  );

  for (const input of orderedInputs.slice(0, prefixSampleSize)) {
    addInput(input);
  }

  for (const input of orderedInputs) {
    if (coveredSingleValues.size >= allSingleValues.size) {
      break;
    }

    const addsUncoveredValue = Object.entries(input.configuration).some(
      ([attributeName, value]) =>
        !coveredSingleValues.has(`${attributeName}=${value}`),
    );

    if (addsUncoveredValue) {
      addInput(input);
    }
  }

  const remainingSlots = limit - selectedInputs.length;

  if (remainingSlots > 0) {
    const step = Math.max(1, Math.floor(orderedInputs.length / remainingSlots));

    for (
      let index = 0;
      index < orderedInputs.length && selectedInputs.length < limit;
      index += step
    ) {
      addInput(orderedInputs[index]);
    }
  }

  for (const input of orderedInputs) {
    if (selectedInputs.length >= limit) {
      break;
    }

    addInput(input);
  }

  return selectedInputs;
}

function buildInputs(options: {
  externalAttributes: ExternalAttribute[];
  attributeMappings?: AttributeMapping[];
  configurationParams?: Record<string, string>;
  fixedSelections?: Record<string, string>;
  strategy?: PricingCombinationStrategy;
}): PriceConfigurationInput[] {
  return buildPriceConfigurationInputs(options);
}

export function resolvePriceFetchCandidateInputs(options: {
  externalAttributes: ExternalAttribute[];
  attributeMappings?: AttributeMapping[];
  configurationParams?: Record<string, string>;
  fixedSelections?: Record<string, string>;
  primaryStrategy?: PricingCombinationStrategy;
  fallbackStrategies?: Array<PricingCombinationStrategy | undefined>;
  maxEffectiveCandidates?: number;
}): {
  configurationInputs: PriceConfigurationInput[];
  effectiveConfigurationInputs: PriceConfigurationInput[];
  appliedStrategy?: PricingCombinationStrategy;
  candidateLimitApplied?: {
    limitedCount: number;
    originalCount: number;
  };
  planningMode: CandidatePlanningMode;
} {
  const {
    externalAttributes,
    attributeMappings,
    configurationParams,
    fixedSelections,
    primaryStrategy,
    fallbackStrategies = [],
    maxEffectiveCandidates = MAX_EFFECTIVE_PRICE_FETCH_CANDIDATES,
  } = options;
  const buildOptions = {
    externalAttributes,
    attributeMappings,
    configurationParams,
    fixedSelections,
  };
  const limitEffectiveInputs = (inputs: PriceConfigurationInput[]) => {
    const sampledInputs = samplePriceConfigurationInputs(
      inputs,
      maxEffectiveCandidates,
    );

    return {
      candidateLimitApplied:
        sampledInputs.length < inputs.length
          ? {
              limitedCount: sampledInputs.length,
              originalCount: inputs.length,
            }
          : undefined,
      inputs: sampledInputs,
    };
  };
  const primaryInputs = buildInputs({
    ...buildOptions,
    strategy: primaryStrategy,
  });

  if (!primaryStrategy?.rules?.length || primaryInputs.length > 0) {
    const limited = limitEffectiveInputs(primaryInputs);

    return {
      configurationInputs: primaryInputs,
      effectiveConfigurationInputs: limited.inputs,
      appliedStrategy: primaryStrategy,
      candidateLimitApplied: limited.candidateLimitApplied,
      planningMode: "primary",
    };
  }

  for (const fallbackStrategy of fallbackStrategies) {
    if (!fallbackStrategy?.rules?.length) {
      continue;
    }

    const fallbackInputs = buildInputs({
      ...buildOptions,
      strategy: fallbackStrategy,
    });

    if (fallbackInputs.length > 0) {
      const limited = limitEffectiveInputs(fallbackInputs);

      return {
        configurationInputs: primaryInputs,
        effectiveConfigurationInputs: limited.inputs,
        appliedStrategy: fallbackStrategy,
        candidateLimitApplied: limited.candidateLimitApplied,
        planningMode: "fallback-strategy",
      };
    }
  }

  const unconstrainedInputs = buildInputs(buildOptions);
  const effectiveUnconstrainedInputs =
    unconstrainedInputs.length > 0 ? unconstrainedInputs : primaryInputs;
  const limited = limitEffectiveInputs(effectiveUnconstrainedInputs);

  return {
    configurationInputs: primaryInputs,
    effectiveConfigurationInputs: limited.inputs,
    appliedStrategy: undefined,
    candidateLimitApplied: limited.candidateLimitApplied,
    planningMode: "unconstrained",
  };
}
