import { Button, HStack, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { TranslateFn } from "./types";

type AttributeMappingHeaderProps = {
  aiMapping: boolean;
  canAiMap: boolean;
  onAiMapping: () => void;
  t: TranslateFn;
};

export default function AttributeMappingHeader({
  aiMapping,
  canAiMap,
  onAiMapping,
  t,
}: AttributeMappingHeaderProps) {
  return (
    <HStack
      justifyContent="space-between"
      alignItems="flex-start"
      flexWrap="wrap"
      gap={2}
    >
      <VStack alignItems="stretch" gap={1}>
        <Text fontWeight="semibold">
          {t("externalProducts.mappingTitle", {
            defaultValue: "Attribute Mapping",
          })}
        </Text>
        <Text fontSize="sm" color="gray.500">
          {t("externalProducts.mappingDescription", {
            defaultValue:
              "Map external attributes to internal attributes and options.",
          })}
        </Text>
      </VStack>

      <Button
        variant="ai"
        size="sm"
        onClick={onAiMapping}
        loading={aiMapping}
        disabled={!canAiMap}
      >
        <MaterialSymbol>auto_awesome</MaterialSymbol>
        {t("externalProducts.aiAutoMap", {
          defaultValue: "AI Auto-Map",
        })}
      </Button>
    </HStack>
  );
}