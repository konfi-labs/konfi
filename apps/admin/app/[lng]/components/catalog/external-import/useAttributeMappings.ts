import { createListCollection } from "@chakra-ui/react";
import {
  aiMapAttributes,
  createAttributeOption,
  updateExternalProductMappings,
} from "@/actions/external-products";
import type {
  AISuggestedAttributeMapping,
  AISuggestedOptionMapping,
} from "@/lib/external-products/ai-mapping-types";
import {
  getDuplicateInternalAttributeMappings,
  getUniqueInternalAttributeId,
  type DuplicateInternalAttributeMapping,
} from "@/lib/external-products/attribute-mapping-validation";
import { isSyntheticExternalOptionValue } from "@/lib/external-products/option-mapping-utils";
import { isExternalAttributeSelectable } from "@/lib/external-products/provider-pricing";
import { isAttributeMappingReady } from "@/lib/external-products/provider-pricing";
import { getPersistedManualPricingExclusionRules } from "@/lib/external-products/pricing-combination-planner";
import { toaster } from "@konfi/components";
import type {
  Attribute,
  AttributeMapping,
  ExternalProduct,
  ExternalProductPricingExclusionRule,
} from "@konfi/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AttributeCollection,
  AttributeCollectionItem,
  ExternalProductWithId,
  TranslateFn,
} from "./types";
import { getExternalAttributeKey } from "./attributeMappingUtils";

const normalizeToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-");

type UseAttributeMappingsParams = {
  product: ExternalProductWithId;
  internalAttributes: Attribute[];
  onMappingsUpdated: () => void;
  onAttributesRefresh: () => void;
  onAllMappedChange: (allMapped: boolean) => void;
  t: TranslateFn;
};

export type UseAttributeMappingsResult = {
  draftMappings: AttributeMapping[];
  draftPricingExclusionRules: ExternalProductPricingExclusionRule[];
  duplicateMappings: DuplicateInternalAttributeMapping[];
  savingMappings: boolean;
  aiMapping: boolean;
  aiSuggestions: AISuggestedAttributeMapping[];
  creatingOptions: Record<string, boolean>;
  externalAttributes: ExternalProduct["attributes"][number][];
  externalAttributeNameSet: Set<string>;
  displayExternalAttributes: ExternalProduct["attributes"][number][];
  attributeCollection: AttributeCollection;
  getAiSuggestion: (
    externalAttributeName: string,
  ) => AISuggestedAttributeMapping | undefined;
  getAiOptionSuggestion: (
    externalAttributeName: string,
    externalValue: string,
  ) => AISuggestedOptionMapping | undefined;
  updateMapping: (
    externalAttributeName: string,
    updates: Partial<AttributeMapping>,
  ) => void;
  updateOptionMapping: (
    externalAttributeName: string,
    externalValue: string,
    internalValue?: string,
  ) => void;
  handleAutoMatchOptions: (
    externalAttributeName: string,
    internalAttributeId?: string,
  ) => void;
  handleRemoveCustomAttribute: (externalAttributeName: string) => void;
  addPricingExclusionRule: (rule: ExternalProductPricingExclusionRule) => void;
  addPricingExclusionRules: (
    rules: ExternalProductPricingExclusionRule[],
  ) => void;
  removePricingExclusionRule: (ruleIndex: number) => void;
  handleSaveMappings: () => Promise<void>;
  handleAiMapping: () => Promise<void>;
  handleApplyAiSuggestion: (suggestion: AISuggestedAttributeMapping) => void;
  handleCreateOption: (
    attributeId: string,
    externalAttributeName: string,
    externalValue: string,
    suggestedOption: { label: string; value: string },
  ) => Promise<void>;
};

export function useAttributeMappings({
  product,
  internalAttributes,
  onMappingsUpdated,
  onAttributesRefresh,
  onAllMappedChange,
  t,
}: UseAttributeMappingsParams): UseAttributeMappingsResult {
  const [draftMappings, setDraftMappings] = useState<AttributeMapping[]>([]);
  const [draftPricingExclusionRules, setDraftPricingExclusionRules] = useState<
    ExternalProductPricingExclusionRule[]
  >([]);
  const [savingMappings, setSavingMappings] = useState(false);
  const [aiMapping, setAiMapping] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<
    AISuggestedAttributeMapping[]
  >([]);
  const [creatingOptions, setCreatingOptions] = useState<
    Record<string, boolean>
  >({});

  const externalAttributes: ExternalProduct["attributes"][number][] =
    product.attributes ?? [];
  const internalAttributesById = useMemo(
    () =>
      new Map(internalAttributes.map((attribute) => [attribute.id, attribute])),
    [internalAttributes],
  );
  const duplicateMappings = useMemo(
    () => getDuplicateInternalAttributeMappings(draftMappings),
    [draftMappings],
  );

  const allAttributesMapped = useMemo(() => {
    if (duplicateMappings.length > 0) {
      return false;
    }

    if (externalAttributes.length === 0) return true;
    return externalAttributes.every((externalAttribute) => {
      if (!isExternalAttributeSelectable(externalAttribute)) {
        return true;
      }

      const mapping = draftMappings.find(
        (item) =>
          item.externalAttributeName ===
          getExternalAttributeKey(externalAttribute),
      );

      return mapping ? isAttributeMappingReady(mapping) : false;
    });
  }, [draftMappings, duplicateMappings.length, externalAttributes]);

  useEffect(() => {
    onAllMappedChange(allAttributesMapped);
  }, [allAttributesMapped, onAllMappedChange]);

  const externalAttributeNameSet = useMemo(() => {
    return new Set(
      externalAttributes.map((attribute) => getExternalAttributeKey(attribute)),
    );
  }, [externalAttributes]);

  const displayExternalAttributes = useMemo(() => {
    const map = new Map<string, ExternalProduct["attributes"][number]>();

    externalAttributes.forEach((attribute) => {
      map.set(getExternalAttributeKey(attribute), attribute);
    });

    draftMappings.forEach((mapping) => {
      if (!map.has(mapping.externalAttributeName)) {
        map.set(mapping.externalAttributeName, {
          name: mapping.externalAttributeName,
          values: Object.keys(mapping.optionMappings ?? {}),
        });
      }
    });

    return Array.from(map.values());
  }, [draftMappings, externalAttributes]);

  const attributeCollection = useMemo(
    () =>
      createListCollection<AttributeCollectionItem>({
        items: [
          {
            label: t("externalProducts.mappingNone", {
              defaultValue: "None",
            }),
            value: "__none__",
            calculated: false,
          },
          ...internalAttributes.map((attribute) => ({
            label: attribute.name,
            value: attribute.id,
            calculated: attribute.calculated,
          })),
        ],
      }),
    [internalAttributes, t],
  );

  const formatDuplicateMappings = useCallback(
    (duplicates: DuplicateInternalAttributeMapping[]) =>
      duplicates
        .map(({ internalAttributeId, externalAttributeNames }) => {
          const internalAttributeName =
            internalAttributesById.get(internalAttributeId)?.name ??
            internalAttributeId;

          return `${internalAttributeName} <- ${externalAttributeNames.join(", ")}`;
        })
        .join("; "),
    [internalAttributesById],
  );

  const showDuplicateMappingsError = useCallback(
    (duplicates: DuplicateInternalAttributeMapping[]) => {
      toaster.create({
        title: t("externalProducts.mappingDuplicateTitle", {
          defaultValue: "Resolve duplicate attribute mappings",
        }),
        description: t("externalProducts.mappingDuplicateDescription", {
          defaultValue:
            "Each internal attribute can only be mapped once. Resolve duplicates for: {{mappings}}.",
          mappings: formatDuplicateMappings(duplicates),
        }),
        type: "error",
      });
    },
    [formatDuplicateMappings, t],
  );

  const showDuplicateSelectionError = useCallback(
    (options: {
      conflictingExternalAttributeName: string;
      internalAttributeId: string;
    }) => {
      const internalAttributeName =
        internalAttributesById.get(options.internalAttributeId)?.name ??
        options.internalAttributeId;

      toaster.create({
        title: t("externalProducts.mappingDuplicateSelectionTitle", {
          defaultValue: "Attribute already mapped",
        }),
        description: t(
          "externalProducts.mappingDuplicateSelectionDescription",
          {
            defaultValue:
              '"{{attribute}}" is already mapped to "{{externalAttribute}}". Choose another internal attribute.',
            attribute: internalAttributeName,
            externalAttribute: options.conflictingExternalAttributeName,
          },
        ),
        type: "error",
      });
    },
    [internalAttributesById, t],
  );

  const mergeMappings = useCallback(
    (
      currentMappings: AttributeMapping[],
      nextMappings: AttributeMapping[],
    ): {
      mergedMappings: AttributeMapping[];
      skippedDuplicates: Array<{
        conflictingExternalAttributeName: string;
        externalAttributeName: string;
        internalAttributeId: string;
      }>;
    } => {
      const replacedExternalAttributeNames = new Set(
        nextMappings.map((mapping) => mapping.externalAttributeName),
      );
      const reservedInternalAttributeIds = new Map<string, string>();

      currentMappings.forEach((mapping) => {
        const internalAttributeId = getUniqueInternalAttributeId(mapping);

        if (
          !internalAttributeId ||
          replacedExternalAttributeNames.has(mapping.externalAttributeName)
        ) {
          return;
        }

        reservedInternalAttributeIds.set(
          internalAttributeId,
          mapping.externalAttributeName,
        );
      });

      const mergedMappings = [...currentMappings];
      const skippedDuplicates: Array<{
        conflictingExternalAttributeName: string;
        externalAttributeName: string;
        internalAttributeId: string;
      }> = [];

      for (const nextMapping of nextMappings) {
        const internalAttributeId = getUniqueInternalAttributeId(nextMapping);
        const conflictingExternalAttributeName = internalAttributeId
          ? reservedInternalAttributeIds.get(internalAttributeId)
          : undefined;

        if (
          internalAttributeId &&
          conflictingExternalAttributeName &&
          conflictingExternalAttributeName !== nextMapping.externalAttributeName
        ) {
          skippedDuplicates.push({
            conflictingExternalAttributeName,
            externalAttributeName: nextMapping.externalAttributeName,
            internalAttributeId,
          });
          continue;
        }

        if (internalAttributeId) {
          reservedInternalAttributeIds.set(
            internalAttributeId,
            nextMapping.externalAttributeName,
          );
        }

        const existingIndex = mergedMappings.findIndex(
          (mapping) =>
            mapping.externalAttributeName === nextMapping.externalAttributeName,
        );

        if (existingIndex >= 0) {
          mergedMappings[existingIndex] = {
            ...mergedMappings[existingIndex],
            ...nextMapping,
          };
          continue;
        }

        mergedMappings.push(nextMapping);
      }

      return {
        mergedMappings,
        skippedDuplicates,
      };
    },
    [],
  );

  const getAiSuggestion = useCallback(
    (
      externalAttributeName: string,
    ): AISuggestedAttributeMapping | undefined => {
      return aiSuggestions.find(
        (suggestion) =>
          suggestion.externalAttributeName === externalAttributeName,
      );
    },
    [aiSuggestions],
  );

  const getAiOptionSuggestion = useCallback(
    (
      externalAttributeName: string,
      externalValue: string,
    ): AISuggestedOptionMapping | undefined => {
      const attrSuggestion = getAiSuggestion(externalAttributeName);
      return attrSuggestion?.optionMappings.find(
        (option) => option.externalValue === externalValue,
      );
    },
    [getAiSuggestion],
  );

  const buildDraftMappings = useCallback((): AttributeMapping[] => {
    const existingMappings = new Map<string, AttributeMapping>();
    (product.attributeMappings ?? []).forEach((mapping) => {
      existingMappings.set(mapping.externalAttributeName, mapping);
    });

    const mappedAttributes = externalAttributes.map((externalAttribute) => {
      const key = getExternalAttributeKey(externalAttribute);
      // Try matching by key (id-based) first, fall back to name for backward compat
      const existing =
        existingMappings.get(key) ??
        existingMappings.get(externalAttribute.name);
      return {
        externalAttributeName: key,
        ignored: existing?.ignored,
        internalAttributeId: existing?.internalAttributeId,
        providerOnlyPricing: existing?.providerOnlyPricing,
        specialRole: existing?.specialRole,
        fixedExternalValue: existing?.fixedExternalValue,
        optionMappings: existing?.optionMappings ?? {},
        confidence: existing?.confidence,
        verified: existing?.verified ?? false,
      };
    });

    const externalKeys = new Set(
      externalAttributes.map((attr) => getExternalAttributeKey(attr)),
    );
    const externalNames = new Set(externalAttributes.map((attr) => attr.name));
    const extraMappings = (product.attributeMappings ?? [])
      .filter(
        (mapping) =>
          !externalKeys.has(mapping.externalAttributeName) &&
          !externalNames.has(mapping.externalAttributeName),
      )
      .map((mapping) => ({
        externalAttributeName: mapping.externalAttributeName,
        ignored: mapping.ignored,
        internalAttributeId: mapping.internalAttributeId,
        providerOnlyPricing: mapping.providerOnlyPricing,
        specialRole: mapping.specialRole,
        fixedExternalValue: mapping.fixedExternalValue,
        optionMappings: mapping.optionMappings ?? {},
        confidence: mapping.confidence,
        verified: mapping.verified ?? true,
      }));

    return [...mappedAttributes, ...extraMappings];
  }, [externalAttributes, product.attributeMappings]);

  useEffect(() => {
    setDraftMappings(buildDraftMappings());
  }, [buildDraftMappings]);

  useEffect(() => {
    setDraftPricingExclusionRules(
      getPersistedManualPricingExclusionRules(product.pricingExclusionRules),
    );
  }, [product.pricingExclusionRules]);

  const updateMapping = useCallback(
    (externalAttributeName: string, updates: Partial<AttributeMapping>) => {
      const currentMapping = draftMappings.find(
        (mapping) => mapping.externalAttributeName === externalAttributeName,
      ) ?? {
        externalAttributeName,
        optionMappings: {},
      };
      const nextMapping = {
        ...currentMapping,
        ...updates,
        verified: true,
      } satisfies AttributeMapping;
      const { mergedMappings, skippedDuplicates } = mergeMappings(
        draftMappings,
        [nextMapping],
      );

      if (skippedDuplicates.length > 0) {
        const duplicate = skippedDuplicates[0];

        if (duplicate) {
          showDuplicateSelectionError({
            conflictingExternalAttributeName:
              duplicate.conflictingExternalAttributeName,
            internalAttributeId: duplicate.internalAttributeId,
          });
        }

        return;
      }

      setDraftMappings(mergedMappings);
    },
    [draftMappings, mergeMappings, showDuplicateSelectionError],
  );

  const updateOptionMapping = useCallback(
    (
      externalAttributeName: string,
      externalValue: string,
      internalValue?: string,
    ) => {
      setDraftMappings((prev) =>
        prev.map((mapping) => {
          if (mapping.externalAttributeName !== externalAttributeName) {
            return mapping;
          }

          const nextOptionMappings = { ...mapping.optionMappings };

          if (!internalValue) {
            delete nextOptionMappings[externalValue];
          } else {
            nextOptionMappings[externalValue] = internalValue;
          }

          return {
            ...mapping,
            optionMappings: nextOptionMappings,
            verified: true,
          };
        }),
      );
    },
    [],
  );

  const handleAutoMatchOptions = useCallback(
    (externalAttributeName: string, internalAttributeId?: string) => {
      if (!internalAttributeId) return;

      const externalAttribute = externalAttributes.find(
        (attribute) =>
          getExternalAttributeKey(attribute) === externalAttributeName,
      );
      const internalAttribute = internalAttributes.find(
        (attribute) => attribute.id === internalAttributeId,
      );

      if (!externalAttribute || !internalAttribute?.options?.length) {
        return;
      }

      const existingOptionMappings =
        draftMappings.find(
          (mapping) => mapping.externalAttributeName === externalAttributeName,
        )?.optionMappings ?? {};
      const nextOptionMappings: Record<string, string> = Object.fromEntries(
        Object.entries(existingOptionMappings).filter(([externalValue]) =>
          isSyntheticExternalOptionValue(externalValue),
        ),
      );

      externalAttribute.values.forEach((value) => {
        const normalizedCandidates = new Set([
          normalizeToken(value),
          normalizeToken(
            externalAttribute.options?.find((option) => option.value === value)
              ?.label ?? value,
          ),
        ]);
        const matched = internalAttribute.options.find(
          (option) =>
            normalizedCandidates.has(normalizeToken(option.value)) ||
            normalizedCandidates.has(normalizeToken(option.label)),
        );

        if (matched) {
          nextOptionMappings[value] = matched.value;
        }
      });

      updateMapping(externalAttributeName, {
        optionMappings: nextOptionMappings,
      });
    },
    [draftMappings, externalAttributes, internalAttributes, updateMapping],
  );

  const handleRemoveCustomAttribute = useCallback(
    (externalAttributeName: string) => {
      setDraftMappings((prev) =>
        prev.filter(
          (mapping) => mapping.externalAttributeName !== externalAttributeName,
        ),
      );
    },
    [],
  );

  const addPricingExclusionRule = useCallback(
    (rule: ExternalProductPricingExclusionRule) => {
      setDraftPricingExclusionRules((prev) => [...prev, rule]);
    },
    [],
  );

  const addPricingExclusionRules = useCallback(
    (rules: ExternalProductPricingExclusionRule[]) => {
      setDraftPricingExclusionRules((prev) => {
        const seenRuleKeys = new Set(prev.map((rule) => JSON.stringify(rule)));
        const nextRules = [...prev];

        for (const rule of rules) {
          const ruleKey = JSON.stringify(rule);

          if (seenRuleKeys.has(ruleKey)) {
            continue;
          }

          seenRuleKeys.add(ruleKey);
          nextRules.push(rule);
        }

        return nextRules;
      });
    },
    [],
  );

  const removePricingExclusionRule = useCallback((ruleIndex: number) => {
    setDraftPricingExclusionRules((prev) =>
      prev.filter((_, index) => index !== ruleIndex),
    );
  }, []);

  const handleSaveMappings = useCallback(async () => {
    setSavingMappings(true);

    try {
      const cleanedMappings = draftMappings
        .filter(
          (mapping) =>
            Boolean(mapping.ignored) ||
            Boolean(mapping.internalAttributeId) ||
            Boolean(
              mapping.providerOnlyPricing && mapping.fixedExternalValue,
            ) ||
            Boolean(mapping.specialRole),
        )
        .map((mapping) => ({
          externalAttributeName: mapping.externalAttributeName,
          ignored: mapping.ignored === true ? true : undefined,
          internalAttributeId:
            mapping.ignored === true || mapping.specialRole
              ? undefined
              : mapping.internalAttributeId,
          providerOnlyPricing:
            mapping.ignored === true || mapping.specialRole
              ? undefined
              : mapping.providerOnlyPricing,
          specialRole:
            mapping.ignored === true ? undefined : mapping.specialRole,
          fixedExternalValue: mapping.providerOnlyPricing
            ? mapping.fixedExternalValue
            : undefined,
          optionMappings:
            mapping.ignored !== true &&
            !mapping.providerOnlyPricing &&
            !mapping.specialRole &&
            mapping.optionMappings &&
            Object.keys(mapping.optionMappings).length > 0
              ? mapping.optionMappings
              : undefined,
          confidence: mapping.confidence,
          verified: true,
        })) as AttributeMapping[];
      const duplicateCleanedMappings =
        getDuplicateInternalAttributeMappings(cleanedMappings);

      if (duplicateCleanedMappings.length > 0) {
        showDuplicateMappingsError(duplicateCleanedMappings);
        return;
      }

      const cleanedPricingExclusionRules = draftPricingExclusionRules
        .map((rule) => {
          const sanitizedWhen = Object.fromEntries(
            Object.entries(rule.when ?? {})
              .map(([attributeName, values]) => {
                const sanitizedValues = [...new Set(values ?? [])].filter(
                  (value) => value.trim().length > 0,
                );

                if (
                  attributeName.trim().length === 0 ||
                  sanitizedValues.length === 0
                ) {
                  return null;
                }

                return [attributeName, sanitizedValues] as const;
              })
              .filter((entry): entry is readonly [string, string[]] =>
                Boolean(entry),
              ),
          );
          const conditionAttributeNames = new Set(Object.keys(sanitizedWhen));
          const sanitizedOmitAttributes = [
            ...new Set(rule.omitAttributes ?? []),
          ]
            .map((attributeName) => attributeName.trim())
            .filter((attributeName) => attributeName.length > 0)
            .filter(
              (attributeName) => !conditionAttributeNames.has(attributeName),
            );
          const sanitizedExcludeValues = Object.fromEntries(
            Object.entries(rule.excludeValues ?? {})
              .map(([attributeName, values]) => {
                const trimmedAttributeName = attributeName.trim();
                const sanitizedValues = [...new Set(values ?? [])].filter(
                  (value) => value.trim().length > 0,
                );

                if (
                  trimmedAttributeName.length === 0 ||
                  conditionAttributeNames.has(trimmedAttributeName) ||
                  sanitizedValues.length === 0
                ) {
                  return null;
                }

                return [trimmedAttributeName, sanitizedValues] as const;
              })
              .filter((entry): entry is readonly [string, string[]] =>
                Boolean(entry),
              ),
          );

          if (
            Object.keys(sanitizedWhen).length === 0 ||
            (sanitizedOmitAttributes.length === 0 &&
              Object.keys(sanitizedExcludeValues).length === 0)
          ) {
            return null;
          }

          return {
            when: sanitizedWhen,
            ...(sanitizedOmitAttributes.length > 0
              ? { omitAttributes: sanitizedOmitAttributes }
              : {}),
            ...(Object.keys(sanitizedExcludeValues).length > 0
              ? { excludeValues: sanitizedExcludeValues }
              : {}),
            ...(rule.source ? { source: rule.source } : {}),
          } satisfies ExternalProductPricingExclusionRule;
        })
        .filter((rule): rule is ExternalProductPricingExclusionRule =>
          Boolean(rule),
        );

      const result = await updateExternalProductMappings({
        externalProductId: product.id,
        attributeMappings: cleanedMappings,
        pricingExclusionRules: cleanedPricingExclusionRules,
      });

      if (!result.success) {
        const duplicateDescription = result.duplicateMappingsSummary
          ? t("externalProducts.mappingDuplicateDescription", {
              defaultValue:
                "Each internal attribute can only be mapped once. Resolve duplicates for: {{mappings}}.",
              mappings: result.duplicateMappingsSummary,
            })
          : result.error;

        toaster.create({
          title: result.duplicateMappingsSummary
            ? t("externalProducts.mappingDuplicateTitle", {
                defaultValue: "Resolve duplicate attribute mappings",
              })
            : t("externalProducts.mappingSaveFailed", {
                defaultValue: "Failed to save mappings",
              }),
          description: duplicateDescription,
          type: "error",
        });
        return;
      }

      toaster.create({
        title: t("externalProducts.mappingSaved", {
          defaultValue: "Mappings saved",
        }),
        type: "success",
      });

      onMappingsUpdated();
    } catch (error) {
      console.error("Error saving mappings:", error);
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        type: "error",
      });
    } finally {
      setSavingMappings(false);
    }
  }, [
    draftMappings,
    draftPricingExclusionRules,
    onMappingsUpdated,
    product.id,
    showDuplicateMappingsError,
    t,
  ]);

  const handleAiMapping = useCallback(async () => {
    setAiMapping(true);
    setAiSuggestions([]);

    try {
      const result = await aiMapAttributes({
        externalProductId: product.id,
      });

      if (!result.success) {
        toaster.create({
          title: t("externalProducts.aiMappingFailed", {
            defaultValue: "AI mapping failed",
          }),
          description: result.error,
          type: "error",
        });
        return;
      }

      setAiSuggestions(result.mappings);

      const newMappings: AttributeMapping[] = [];

      for (const suggestion of result.mappings) {
        if (suggestion.internalAttributeId && suggestion.confidence >= 0.7) {
          const optionMappings: Record<string, string> = {};

          for (const optSuggestion of suggestion.optionMappings) {
            if (
              optSuggestion.internalValue &&
              optSuggestion.confidence >= 0.7
            ) {
              optionMappings[optSuggestion.externalValue] =
                optSuggestion.internalValue;
            }
          }

          newMappings.push({
            externalAttributeName: suggestion.externalAttributeName,
            ignored: false,
            internalAttributeId: suggestion.internalAttributeId,
            providerOnlyPricing: false,
            specialRole: undefined,
            fixedExternalValue: undefined,
            optionMappings,
            confidence: suggestion.confidence,
            verified: false,
          });
        }
      }

      if (newMappings.length > 0) {
        const { mergedMappings, skippedDuplicates } = mergeMappings(
          draftMappings,
          newMappings,
        );
        const appliedMappingsCount =
          newMappings.length - skippedDuplicates.length;

        if (appliedMappingsCount > 0) {
          setDraftMappings(mergedMappings);

          toaster.create({
            title: t("externalProducts.aiMappingApplied", {
              defaultValue: "AI suggestions applied",
            }),
            description: t("externalProducts.aiMappingAppliedDescription", {
              defaultValue: "{{count}} high-confidence mappings applied",
              count: appliedMappingsCount,
            }),
            type: "success",
          });
        }

        if (skippedDuplicates.length > 0) {
          toaster.create({
            title: t("externalProducts.aiMappingSkippedDuplicatesTitle", {
              defaultValue: "Some AI suggestions were skipped",
            }),
            description: t(
              "externalProducts.aiMappingSkippedDuplicatesDescription",
              {
                defaultValue: "Skipped duplicate mappings for: {{mappings}}.",
                mappings: skippedDuplicates
                  .map(
                    ({ externalAttributeName, internalAttributeId }) =>
                      `${
                        internalAttributesById.get(internalAttributeId)?.name ??
                        internalAttributeId
                      } <- ${externalAttributeName}`,
                  )
                  .join("; "),
              },
            ),
            type: "warning",
          });
        }
      } else {
        toaster.create({
          title: t("externalProducts.aiMappingReview", {
            defaultValue: "Review AI suggestions",
          }),
          description: t("externalProducts.aiMappingReviewDescription", {
            defaultValue:
              "No high-confidence matches found. Please review suggestions manually.",
          }),
          type: "info",
        });
      }
    } catch (error) {
      console.error("Error in AI mapping:", error);
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        type: "error",
      });
    } finally {
      setAiMapping(false);
    }
  }, [draftMappings, internalAttributesById, mergeMappings, product.id, t]);

  const handleApplyAiSuggestion = useCallback(
    (suggestion: AISuggestedAttributeMapping) => {
      if (!suggestion.internalAttributeId) return;

      const optionMappings: Record<string, string> = {};
      for (const optSuggestion of suggestion.optionMappings) {
        if (optSuggestion.internalValue) {
          optionMappings[optSuggestion.externalValue] =
            optSuggestion.internalValue;
        }
      }

      updateMapping(suggestion.externalAttributeName, {
        ignored: false,
        internalAttributeId: suggestion.internalAttributeId,
        providerOnlyPricing: false,
        specialRole: undefined,
        fixedExternalValue: undefined,
        optionMappings,
        confidence: suggestion.confidence,
      });
    },
    [updateMapping],
  );

  const handleCreateOption = useCallback(
    async (
      attributeId: string,
      externalAttributeName: string,
      externalValue: string,
      suggestedOption: { label: string; value: string },
    ) => {
      const key = `${attributeId}-${externalValue}`;
      setCreatingOptions((prev) => ({ ...prev, [key]: true }));

      try {
        const result = await createAttributeOption({
          attributeId,
          option: suggestedOption,
        });

        if (!result.success) {
          toaster.create({
            title: t("externalProducts.createOptionFailed", {
              defaultValue: "Failed to create option",
            }),
            description: result.error,
            type: "error",
          });
          return;
        }

        updateOptionMapping(
          externalAttributeName,
          externalValue,
          suggestedOption.value,
        );

        toaster.create({
          title: t("externalProducts.optionCreated", {
            defaultValue: "Option created",
          }),
          description: suggestedOption.label,
          type: "success",
        });

        onAttributesRefresh();
      } catch (error) {
        console.error("Error creating option:", error);
        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          type: "error",
        });
      } finally {
        setCreatingOptions((prev) => ({ ...prev, [key]: false }));
      }
    },
    [onAttributesRefresh, t, updateOptionMapping],
  );

  return {
    draftMappings,
    draftPricingExclusionRules,
    duplicateMappings,
    savingMappings,
    aiMapping,
    aiSuggestions,
    creatingOptions,
    externalAttributes,
    externalAttributeNameSet,
    displayExternalAttributes,
    attributeCollection,
    getAiSuggestion,
    getAiOptionSuggestion,
    updateMapping,
    updateOptionMapping,
    handleAutoMatchOptions,
    handleRemoveCustomAttribute,
    addPricingExclusionRule,
    addPricingExclusionRules,
    removePricingExclusionRule,
    handleSaveMappings,
    handleAiMapping,
    handleApplyAiSuggestion,
    handleCreateOption,
  };
}
