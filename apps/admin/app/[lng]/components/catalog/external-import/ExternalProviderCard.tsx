"use client";

import { Badge, Button, Card, HStack, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { memo, useCallback } from "react";
import type { ExternalProviderWithId, TranslateFn } from "./types";

type ExternalProviderCardProps = {
  provider: ExternalProviderWithId;
  onDelete: (id: string) => void;
  t: TranslateFn;
};

const ExternalProviderCard = memo(function ExternalProviderCard({
  provider,
  onDelete,
  t,
}: ExternalProviderCardProps) {
  const handleDelete = useCallback(() => {
    onDelete(provider.id);
  }, [onDelete, provider.id]);

  const authLabel = (() => {
    switch (provider.auth?.type) {
      case "bearer":
        return t("externalProviders.auth.bearer", { defaultValue: "Bearer" });
      case "api-key":
        return t("externalProviders.auth.apiKey", { defaultValue: "API Key" });
      case "custom":
        return t("externalProviders.auth.custom", { defaultValue: "Custom" });
      default:
        return t("externalProviders.auth.none", { defaultValue: "Public" });
    }
  })();

  return (
    <Card.Root variant="outline">
      <Card.Body>
        <HStack justifyContent="space-between" alignItems="flex-start" gap={4}>
          <VStack alignItems="flex-start" gap={1}>
            <HStack gap={2}>
              <Text fontWeight="bold">{provider.name}</Text>
              <Badge colorPalette="purple" size="sm">
                {authLabel}
              </Badge>
            </HStack>
            {provider.baseUrl && (
              <Text fontSize="sm" color="gray.500">
                {provider.baseUrl}
              </Text>
            )}
          </VStack>
          <HStack gap={1}>
            <Button
              size="sm"
              colorPalette="red"
              variant="ghost"
              onClick={handleDelete}
            >
              <MaterialSymbol>delete</MaterialSymbol>
              {t("common.delete", { defaultValue: "Delete" })}
            </Button>
          </HStack>
        </HStack>
      </Card.Body>
    </Card.Root>
  );
});

export default ExternalProviderCard;
