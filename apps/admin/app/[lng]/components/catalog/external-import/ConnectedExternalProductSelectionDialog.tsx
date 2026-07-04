"use client";

import {
  Alert,
  Badge,
  Button,
  Dialog,
  HStack,
  Input,
  Portal,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CloseButton, MaterialSymbol } from "@konfi/components";
import type { ExternalProductWithId, TranslateFn } from "./types";

type ConnectedExternalProductSelectionDialogProps = {
  connectionDialogOpen: boolean;
  connectionSearch: string;
  connectingExternalProductId: string | null;
  currentExternalProductId: string | null;
  externalProducts: ExternalProductWithId[];
  externalProductsLoading: boolean;
  connectExternalProductAction: (externalProductId: string) => void;
  connectionSearchChangeAction: (value: string) => void;
  openChangeAction: (open: boolean) => void;
  t: TranslateFn;
};

export default function ConnectedExternalProductSelectionDialog({
  connectionDialogOpen,
  connectionSearch,
  connectingExternalProductId,
  currentExternalProductId,
  externalProducts,
  externalProductsLoading,
  connectExternalProductAction,
  connectionSearchChangeAction,
  openChangeAction,
  t,
}: ConnectedExternalProductSelectionDialogProps) {
  return (
    <Dialog.Root
      open={connectionDialogOpen}
      onOpenChange={(details) => openChangeAction(details.open)}
      size="xl"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {t("externalProducts.connectionDialogTitle", {
                  defaultValue: "Connect external product",
                })}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack gap={4} alignItems="stretch">
                <Text color="fg.muted" fontSize="sm">
                  {t("externalProducts.connectionDialogDescription", {
                    defaultValue:
                      "Choose one of the imported external products. You can change the connection later.",
                  })}
                </Text>
                <Input
                  autoComplete="off"
                  aria-label={t("externalProducts.connectionSearchLabel", {
                    defaultValue: "Search imported external products",
                  })}
                  name="external-product-search"
                  value={connectionSearch}
                  onChange={(event) =>
                    connectionSearchChangeAction(event.target.value)
                  }
                  placeholder={t(
                    "externalProducts.connectionSearchPlaceholder",
                    {
                      defaultValue: "Search by name, provider, or URL…",
                    },
                  )}
                />

                {externalProductsLoading ? (
                  <VStack gap={2} alignItems="stretch">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} h="16" borderRadius="2xl" />
                    ))}
                  </VStack>
                ) : externalProducts.length === 0 ? (
                  <Alert.Root status="info">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>
                        {connectionSearch.trim()
                          ? t("externalProducts.connectionNoSearchResults", {
                              defaultValue:
                                "No imported external products match your search.",
                            })
                          : t("externalProducts.connectionNoImportedProducts", {
                              defaultValue:
                                "No imported external products are available yet. Import one first.",
                            })}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                ) : (
                  <VStack
                    maxH="420px"
                    overflowY="auto"
                    gap={2}
                    alignItems="stretch"
                  >
                    {externalProducts.map((item) => {
                      const isCurrentConnection =
                        item.id === currentExternalProductId;
                      const itemHasPrices = Boolean(
                        (item.priceConfigurationsCount ??
                          item.priceConfigurations?.length) ||
                        item.priceInfo?.priceRanges?.length,
                      );

                      return (
                        <Button
                          key={item.id}
                          justifyContent="space-between"
                          alignItems="flex-start"
                          h="auto"
                          py={3}
                          variant="outline"
                          disabled={
                            isCurrentConnection ||
                            (connectingExternalProductId !== null &&
                              connectingExternalProductId !== item.id)
                          }
                          onClick={() => connectExternalProductAction(item.id)}
                          loading={connectingExternalProductId === item.id}
                          borderRadius="2xl"
                        >
                          <VStack alignItems="flex-start" gap={1} minW={0}>
                            <Text fontWeight="medium" textAlign="left" truncate>
                              {item.originalName}
                            </Text>
                            <HStack gap={2} flexWrap="wrap">
                              {isCurrentConnection ? (
                                <Badge colorPalette="primary">
                                  {t(
                                    "externalProducts.connectionCurrentBadge",
                                    {
                                      defaultValue: "Current connection",
                                    },
                                  )}
                                </Badge>
                              ) : null}
                              {item.source?.platform ? (
                                <Badge colorPalette="gray">
                                  {item.source.platform}
                                </Badge>
                              ) : null}
                              <Badge
                                colorPalette={
                                  itemHasPrices ? "success" : "orange"
                                }
                              >
                                {itemHasPrices
                                  ? t("externalProducts.hasPrices", {
                                      defaultValue: "Has prices",
                                    })
                                  : t("externalProducts.noPrices", {
                                      defaultValue: "No prices",
                                    })}
                              </Badge>
                              <Text fontSize="sm" color="fg.muted">
                                {item.attributes?.length ?? 0}{" "}
                                {t("externalProducts.attributes", {
                                  defaultValue: "attributes",
                                })}
                              </Text>
                            </HStack>
                          </VStack>
                          <MaterialSymbol>link</MaterialSymbol>
                        </Button>
                      );
                    })}
                  </VStack>
                )}
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
