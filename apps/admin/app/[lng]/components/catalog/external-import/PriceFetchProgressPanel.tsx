"use client";

import {
  Alert,
  Badge,
  HStack,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { TranslateFn } from "./types";

type PriceFetchProgressPanelProps = {
  estimatedConfigurationCount: number;
  fetchedConfigurationCount: number;
  fetchingPrices: boolean;
  elapsedSeconds: number;
  currentStageTitle: string;
  currentStageDescription: string;
  t: TranslateFn;
};

export default function PriceFetchProgressPanel({
  estimatedConfigurationCount,
  fetchedConfigurationCount,
  fetchingPrices,
  elapsedSeconds,
  currentStageTitle,
  currentStageDescription,
  t,
}: PriceFetchProgressPanelProps) {
  const statusLabel = fetchingPrices
    ? t("externalProducts.priceFetchProgress.status.fetching", {
        defaultValue: "Fetching",
      })
    : fetchedConfigurationCount > 0
      ? t("externalProducts.priceFetchProgress.status.ready", {
          defaultValue: "Fetched",
        })
      : t("externalProducts.priceFetchProgress.status.idle", {
          defaultValue: "Ready",
        });

  const statusPalette = fetchingPrices
    ? "blue"
    : fetchedConfigurationCount > 0
      ? "success"
      : "gray";

  return (
    <Alert.Root status="info" variant="subtle">
      <Alert.Indicator />
      <Alert.Content>
        <VStack alignItems="stretch" gap={3} width="100%">
          <HStack justifyContent="space-between" flexWrap="wrap" gap={2}>
            <VStack alignItems="flex-start" gap={0}>
              <Alert.Title>
                {t("externalProducts.priceFetchProgress.title", {
                  defaultValue: "Price fetch progress",
                })}
              </Alert.Title>
              <Alert.Description>{currentStageDescription}</Alert.Description>
            </VStack>
            <Badge colorPalette={statusPalette}>{statusLabel}</Badge>
          </HStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
            <VStack alignItems="flex-start" gap={0}>
              <Text fontSize="xs" color="gray.500">
                {t("externalProducts.priceFetchProgress.expectedLabel", {
                  defaultValue: "Configurations to fetch",
                })}
              </Text>
              <Text fontWeight="semibold">{estimatedConfigurationCount}</Text>
            </VStack>
            <VStack alignItems="flex-start" gap={0}>
              <Text fontSize="xs" color="gray.500">
                {t("externalProducts.priceFetchProgress.fetchedLabel", {
                  defaultValue: "Fetched last run",
                })}
              </Text>
              <Text fontWeight="semibold">{fetchedConfigurationCount}</Text>
            </VStack>
            <VStack alignItems="flex-start" gap={0}>
              <Text fontSize="xs" color="gray.500">
                {t("externalProducts.priceFetchProgress.elapsedLabel", {
                  defaultValue: "Elapsed",
                })}
              </Text>
              <Text fontWeight="semibold">
                {t("externalProducts.priceFetchProgress.elapsedValue", {
                  defaultValue: "{{seconds}}s",
                  seconds: elapsedSeconds,
                })}
              </Text>
            </VStack>
          </SimpleGrid>

          <VStack alignItems="flex-start" gap={0}>
            <Text fontSize="xs" color="gray.500">
              {t("externalProducts.priceFetchProgress.stageLabel", {
                defaultValue: "Current stage",
              })}
            </Text>
            <Text fontWeight="medium">{currentStageTitle}</Text>
          </VStack>
        </VStack>
      </Alert.Content>
    </Alert.Root>
  );
}
