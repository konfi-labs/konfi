"use client";

import {
  Alert,
  Button,
  Collapsible,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import type { Attribute } from "@konfi/types";
import { useState } from "react";
import type { ExternalProductWithId, TranslateFn } from "./types";
import AiSuggestionsAlert from "./AiSuggestionsAlert";
import AttributeMappingCard from "./AttributeMappingCard";
import AttributeMappingDebug from "./AttributeMappingDebug";
import AttributeMappingHeader from "./AttributeMappingHeader";
import PricingExclusionSection from "./PricingExclusionSection";
import { getExternalAttributeKey } from "./attributeMappingUtils";
import { useAttributeMappings } from "./useAttributeMappings";

type AttributeMappingSectionProps = {
  product: ExternalProductWithId;
  onMappingsUpdated: () => void;
  onAttributesRefresh: () => void;
  internalAttributes: Attribute[];
  onAllMappedChange: (allMapped: boolean) => void;
  t: TranslateFn;
};

export default function AttributeMappingSection(
  props: AttributeMappingSectionProps,
) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <Collapsible.Root
      mt={2}
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) {
          setHasOpened(true);
        }
      }}
    >
      <Collapsible.Trigger asChild>
        <Button variant="outline" size="sm" alignSelf="flex-start">
          {props.t("externalProducts.viewMappings", {
            defaultValue: "View Mappings",
          })}
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content mt={4}>
        {hasOpened ? <AttributeMappingContent {...props} /> : null}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function AttributeMappingContent({
  product,
  onMappingsUpdated,
  onAttributesRefresh,
  internalAttributes,
  onAllMappedChange,
  t,
}: AttributeMappingSectionProps) {
  const {
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
  } = useAttributeMappings({
    product,
    internalAttributes,
    onMappingsUpdated,
    onAttributesRefresh,
    onAllMappedChange,
    t,
  });
  const internalAttributeNamesById = new Map(
    internalAttributes.map((attribute) => [attribute.id, attribute.name]),
  );
  const duplicateMappingSummary = duplicateMappings
    .map(({ internalAttributeId, externalAttributeNames }) => {
      const internalAttributeName =
        internalAttributeNamesById.get(internalAttributeId) ??
        internalAttributeId;

      return `${internalAttributeName} <- ${externalAttributeNames.join(", ")}`;
    })
    .join("; ");

  const allReservedInternalAttributeIds = new Set(
    draftMappings
      .filter(
        (item) =>
          item.ignored !== true &&
          item.providerOnlyPricing !== true &&
          !item.specialRole &&
          Boolean(item.internalAttributeId),
      )
      .map((item) => item.internalAttributeId as string),
  );

  return (
    <VStack alignItems="stretch" gap={4}>
      <AttributeMappingHeader
        aiMapping={aiMapping}
        canAiMap={externalAttributes.length > 0}
        onAiMapping={handleAiMapping}
        t={t}
      />

      <AiSuggestionsAlert hasSuggestions={aiSuggestions.length > 0} t={t} />

      {duplicateMappings.length > 0 && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("externalProducts.mappingDuplicateTitle", {
                defaultValue: "Resolve duplicate attribute mappings",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("externalProducts.mappingDuplicateDescription", {
                defaultValue:
                  "Each internal attribute can only be mapped once. Resolve duplicates for: {{mappings}}.",
                mappings: duplicateMappingSummary,
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      {externalAttributes.length === 0 ? (
        <Alert.Root status="info">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t("externalProducts.mappingNoAttributes", {
                defaultValue: "No external attributes found.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap={3}>
          {displayExternalAttributes.map((externalAttribute) => {
            const attrKey = getExternalAttributeKey(externalAttribute);
            const mapping = draftMappings.find(
              (item) => item.externalAttributeName === attrKey,
            );
            const isCustomAttribute = !externalAttributeNameSet.has(attrKey);
            const aiSuggestion = getAiSuggestion(attrKey);
            const ownInternalId = mapping?.internalAttributeId;
            let reservedInternalAttributeIds: Set<string>;
            if (
              ownInternalId &&
              allReservedInternalAttributeIds.has(ownInternalId)
            ) {
              reservedInternalAttributeIds = new Set(
                allReservedInternalAttributeIds,
              );
              reservedInternalAttributeIds.delete(ownInternalId);
            } else {
              reservedInternalAttributeIds = allReservedInternalAttributeIds;
            }
            const duplicateExternalAttributeNames = mapping?.internalAttributeId
              ? (duplicateMappings
                  .find(
                    (duplicate) =>
                      duplicate.internalAttributeId ===
                        mapping.internalAttributeId &&
                      duplicate.externalAttributeNames.includes(attrKey),
                  )
                  ?.externalAttributeNames.filter((name) => name !== attrKey) ??
                [])
              : [];

            return (
              <AttributeMappingCard
                key={attrKey}
                externalAttribute={externalAttribute}
                mapping={mapping}
                internalAttributes={internalAttributes}
                attributeCollection={attributeCollection}
                reservedInternalAttributeIds={reservedInternalAttributeIds}
                duplicateExternalAttributeNames={
                  duplicateExternalAttributeNames
                }
                isCustomAttribute={isCustomAttribute}
                aiSuggestion={aiSuggestion}
                creatingOptions={creatingOptions}
                getAiOptionSuggestion={getAiOptionSuggestion}
                onApplyAiSuggestion={handleApplyAiSuggestion}
                onRemoveCustomAttribute={handleRemoveCustomAttribute}
                onUpdateMapping={updateMapping}
                onUpdateOptionMapping={updateOptionMapping}
                onAutoMatchOptions={handleAutoMatchOptions}
                onCreateOption={handleCreateOption}
                t={t}
              />
            );
          })}
        </SimpleGrid>
      )}

      {externalAttributes.length > 0 && (
        <PricingExclusionSection
          draftMappings={draftMappings}
          draftPricingExclusionRules={draftPricingExclusionRules}
          displayExternalAttributes={displayExternalAttributes}
          addPricingExclusionRule={addPricingExclusionRule}
          addPricingExclusionRules={addPricingExclusionRules}
          removePricingExclusionRule={removePricingExclusionRule}
          productId={product.id}
          t={t}
        />
      )}

      {externalAttributes.length > 0 && (
        <Button
          colorPalette="primary"
          size="sm"
          onClick={handleSaveMappings}
          loading={savingMappings}
          alignSelf="flex-start"
        >
          {t("externalProducts.mappingSave", {
            defaultValue: "Save mappings",
          })}
        </Button>
      )}
      <AttributeMappingDebug
        externalAttributes={externalAttributes}
        draftMappings={draftMappings}
        t={t}
      />
    </VStack>
  );
}
