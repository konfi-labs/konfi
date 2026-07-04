"use client";

import {
  Alert,
  Badge,
  Box,
  HStack,
  ScrollArea,
  Stack,
  Text,
} from "@chakra-ui/react";
import type {
  ExternalProduct,
  ExternalProductPricingExclusionRule,
} from "@konfi/types";
import { useMemo } from "react";
import type { TranslateFn } from "./types";
import {
  getExternalAttributeKey,
  getExternalAttributeLabel,
} from "./attributeMappingUtils";

export type PricingExclusionAssistantSuggestion = {
  estimatedConfigurationCountBefore?: number;
  rules: ExternalProductPricingExclusionRule[];
  summary?: string;
  warnings: string[];
};

type PricingExclusionRulePreviewProps = {
  displayExternalAttributes: ExternalProduct["attributes"][number][];
  suggestion: PricingExclusionAssistantSuggestion;
  t: TranslateFn;
};

function getExternalOptionLabel(
  attribute: ExternalProduct["attributes"][number] | undefined,
  value: string,
): string {
  return (
    attribute?.options?.find((option) => option.value === value)?.label ?? value
  );
}

export default function PricingExclusionRulePreview({
  displayExternalAttributes,
  suggestion,
  t,
}: PricingExclusionRulePreviewProps) {
  const attributesByKey = useMemo(
    () =>
      new Map(
        displayExternalAttributes.map((attribute) => [
          getExternalAttributeKey(attribute),
          attribute,
        ]),
      ),
    [displayExternalAttributes],
  );

  const resolveAttributeLabel = (key: string): string => {
    const attr = attributesByKey.get(key);
    return attr ? getExternalAttributeLabel(attr) : key;
  };

  return (
    <Stack gap={3}>
      <HStack justifyContent="space-between" gap={3}>
        <Text fontWeight="medium">
          {t("externalProducts.pricingExclusionsAssistantProposed", {
            defaultValue: "Proposed rules",
          })}
        </Text>
        {suggestion.estimatedConfigurationCountBefore ? (
          <Badge variant="subtle" colorPalette="gray">
            {t("externalProducts.pricingExclusionsAssistantCandidateEstimate", {
              defaultValue:
                "{{count}} candidate configurations before exclusions",
              count: suggestion.estimatedConfigurationCountBefore,
            })}
          </Badge>
        ) : null}
      </HStack>

      {suggestion.summary ? (
        <Text fontSize="sm" color="fg.muted">
          {suggestion.summary}
        </Text>
      ) : null}

      {suggestion.warnings.length > 0 ? (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {suggestion.warnings.join(" ")}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}

      <ScrollArea.Root maxH="45vh" size="sm" variant="always">
        <ScrollArea.Viewport>
          <ScrollArea.Content pe={3}>
            <Stack gap={3}>
              {suggestion.rules.map((rule, ruleIndex) => (
                <Box
                  key={`${ruleIndex}-${JSON.stringify(rule)}`}
                  p={3}
                  borderWidth="1px"
                  borderRadius="xl"
                >
                  <Text fontSize="sm" fontWeight="medium" mb={2}>
                    {t("externalProducts.pricingExclusionsRuleLabel", {
                      defaultValue: "Rule {{number}}",
                      number: ruleIndex + 1,
                    })}
                  </Text>
                  <Text fontSize="xs" color="fg.muted" mb={2}>
                    {t("externalProducts.pricingExclusionsWhen", {
                      defaultValue: "When all of these supplier values match",
                    })}
                  </Text>
                  <HStack gap={2} flexWrap="wrap" mb={3}>
                    {Object.entries(rule.when).map(([attributeKey, values]) => (
                      <Badge
                        key={`${attributeKey}-${values.join("|")}`}
                        variant="subtle"
                        colorPalette="blue"
                      >
                        {resolveAttributeLabel(attributeKey)}:{" "}
                        {values
                          .map((value) =>
                            getExternalOptionLabel(
                              attributesByKey.get(attributeKey),
                              value,
                            ),
                          )
                          .join(", ")}
                      </Badge>
                    ))}
                  </HStack>
                  <Text fontSize="xs" color="fg.muted" mb={2}>
                    {t("externalProducts.pricingExclusionsThenOmit", {
                      defaultValue: "Omit these supplier attributes",
                    })}
                  </Text>
                  <HStack gap={2} flexWrap="wrap">
                    {(rule.omitAttributes ?? []).map((attributeKey) => (
                      <Badge
                        key={attributeKey}
                        variant="subtle"
                        colorPalette="orange"
                      >
                        {resolveAttributeLabel(attributeKey)}
                      </Badge>
                    ))}
                    {Object.entries(rule.excludeValues ?? {}).map(
                      ([attributeKey, values]) => (
                        <Badge
                          key={`${attributeKey}-${values.join("|")}`}
                          variant="subtle"
                          colorPalette="orange"
                        >
                          {resolveAttributeLabel(attributeKey)}:{" "}
                          {values
                            .map((value) =>
                              getExternalOptionLabel(
                                attributesByKey.get(attributeKey),
                                value,
                              ),
                            )
                            .join(", ")}
                        </Badge>
                      ),
                    )}
                  </HStack>
                </Box>
              ))}
            </Stack>
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </Stack>
  );
}
