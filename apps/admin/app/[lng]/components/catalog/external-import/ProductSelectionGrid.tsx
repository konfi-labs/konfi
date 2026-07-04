"use client";

import {
  Alert,
  Button,
  Card,
  createListCollection,
  Field,
  HStack,
  Image,
  Portal,
  Select,
  Skeleton,
  SimpleGrid,
  Spinner,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useEffect, useMemo, useState } from "react";
import ExternalImportPagination from "./ExternalImportPagination";
import type {
  ExternalImportProgress,
  ExternalProviderWithId,
  ProviderCatalogItem,
  TranslateFn,
} from "./types";

const PROVIDER_PRODUCT_PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;

type ProductSelectionGridProps = {
  externalProviders: ExternalProviderWithId[];
  activeProviderId: string | null;
  providerProducts: ProviderCatalogItem[];
  activeImport: ExternalImportProgress | null;
  processing: boolean;
  importing: boolean;
  manualUrl: string;
  onProviderChange: (providerId: string | null) => void;
  onImportProduct: (product: ProviderCatalogItem) => void;
  onManualUrlChange: (value: string) => void;
  onManualImport: (event: React.FormEvent) => void;
  t: TranslateFn;
};

export default function ProductSelectionGrid({
  externalProviders,
  activeProviderId,
  providerProducts,
  activeImport,
  processing,
  importing,
  manualUrl,
  onProviderChange,
  onImportProduct,
  onManualUrlChange,
  onManualImport,
  t,
}: ProductSelectionGridProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(
    PROVIDER_PRODUCT_PAGE_SIZE_OPTIONS[0],
  );
  const pageCount = Math.max(1, Math.ceil(providerProducts.length / pageSize));
  const boundedPageIndex = Math.min(pageIndex, pageCount - 1);
  const paginatedProducts = useMemo(() => {
    const start = boundedPageIndex * pageSize;
    return providerProducts.slice(start, start + pageSize);
  }, [boundedPageIndex, pageSize, providerProducts]);
  const providerCollection = useMemo(
    () =>
      createListCollection({
        items: externalProviders.map((provider) => ({
          label: provider.name,
          value: provider.id,
        })),
      }),
    [externalProviders],
  );
  useEffect(() => {
    setPageIndex(0);
  }, [activeProviderId, providerProducts]);

  useEffect(() => {
    if (pageIndex !== boundedPageIndex) {
      setPageIndex(boundedPageIndex);
    }
  }, [boundedPageIndex, pageIndex]);

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>
          {t("externalProducts.selectProduct", {
            defaultValue: "Select Product to Import",
          })}
        </Card.Title>
        <Card.Description>
          {t("externalProducts.selectProductDescription", {
            defaultValue:
              "Choose a provider and click on a product to import it.",
          })}
        </Card.Description>
      </Card.Header>
      <Card.Body>
        <VStack gap={4} alignItems="stretch">
          <Field.Root>
            <Field.Label>
              {t("externalProducts.provider", {
                defaultValue: "Provider",
              })}
            </Field.Label>
            <Select.Root
              collection={providerCollection}
              value={activeProviderId ? [activeProviderId] : []}
              disabled={importing}
              onValueChange={(event) => {
                const nextId = event.value[0] ?? null;
                onProviderChange(nextId);
              }}
              size="sm"
            >
              <Select.HiddenSelect />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText
                    placeholder={t("externalProducts.providerPlaceholder", {
                      defaultValue: "Select provider",
                    })}
                  />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content>
                    {providerCollection.items.map((item) => (
                      <Select.Item key={item.value} item={item}>
                        {item.label}
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </Field.Root>

          {activeProviderId && (
            <>
              {activeImport && (
                <Alert.Root status="info">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>
                      {t("externalProducts.importProgress.title", {
                        defaultValue: "Importing {{name}}…",
                        name: activeImport.label,
                      })}
                    </Alert.Title>
                    <VStack mt={2} gap={2} alignItems="stretch">
                      <HStack gap={2} alignItems="center">
                        <Spinner size="sm" />
                        <Text fontWeight="medium">
                          {activeImport.currentStageTitle}
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color="fg.muted">
                        {activeImport.currentStageDescription}
                      </Text>
                      <HStack
                        gap={3}
                        justifyContent="space-between"
                        alignItems="flex-start"
                        flexWrap="wrap"
                      >
                        <Text fontSize="xs" color="fg.muted">
                          {t("externalProducts.importProgress.elapsed", {
                            defaultValue: "{{seconds}}s elapsed",
                            seconds: activeImport.elapsedSeconds,
                          })}
                        </Text>
                        {activeImport.upcomingStageTitles.length > 0 && (
                          <Text fontSize="xs" color="fg.muted">
                            {t("externalProducts.importProgress.upNext", {
                              defaultValue: "Up next: {{steps}}",
                              steps:
                                activeImport.upcomingStageTitles.join(" • "),
                            })}
                          </Text>
                        )}
                      </HStack>
                      <Text fontSize="xs" color="fg.muted">
                        {t("externalProducts.importProgress.hint", {
                          defaultValue:
                            "Some providers take longer than others. Keep this page open while we finish the import.",
                        })}
                      </Text>
                    </VStack>
                  </Alert.Content>
                </Alert.Root>
              )}

              {processing ? (
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={3}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} h="20" borderRadius="2xl" />
                  ))}
                </SimpleGrid>
              ) : providerProducts.length === 0 ? (
                <Alert.Root status="info">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>
                      {t("externalProducts.noProductsFound", {
                        defaultValue:
                          "No products found. The provider may not have an all-products endpoint, or the catalog is empty.",
                      })}
                    </Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              ) : (
                <VStack alignItems="stretch" gap={3}>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={3}>
                    {paginatedProducts.map((product) => (
                      <Button
                        key={product.id}
                        variant="outline"
                        h="auto"
                        py={3}
                        px={4}
                        justifyContent="flex-start"
                        onClick={() => onImportProduct(product)}
                        loading={activeImport?.productId === product.id}
                        disabled={
                          importing && activeImport?.productId !== product.id
                        }
                        borderRadius="2xl"
                      >
                        <HStack gap={3} w="100%" minW={0}>
                          {product.imageUrl && (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              boxSize="40px"
                              objectFit="contain"
                              borderRadius="md"
                            />
                          )}
                          <VStack
                            alignItems="flex-start"
                            gap={0}
                            flex={1}
                            minW={0}
                          >
                            <Text
                              fontWeight="semibold"
                              lineClamp={1}
                              textAlign="left"
                            >
                              {product.name}
                            </Text>
                            <Text fontSize="xs" color="gray.500" truncate>
                              {product.id}
                            </Text>
                          </VStack>
                        </HStack>
                      </Button>
                    ))}
                  </SimpleGrid>
                  <ExternalImportPagination
                    disabled={importing}
                    itemsCount={providerProducts.length}
                    pageCount={pageCount}
                    pageIndex={boundedPageIndex}
                    pageSize={pageSize}
                    pageSizeOptions={PROVIDER_PRODUCT_PAGE_SIZE_OPTIONS}
                    t={t}
                    onPageChange={setPageIndex}
                    onPageSizeChange={(nextPageSize) => {
                      setPageIndex(0);
                      setPageSize(nextPageSize);
                    }}
                  />
                </VStack>
              )}

              <form onSubmit={onManualImport}>
                <HStack gap={2}>
                  <Field.Root flex={1}>
                    <Textarea
                      value={manualUrl}
                      disabled={importing}
                      onChange={(e) => onManualUrlChange(e.target.value)}
                      placeholder={t("externalProducts.manualUrlPlaceholder", {
                        defaultValue:
                          "Paste a direct product URL or supplier search phrase...",
                      })}
                      rows={1}
                      borderRadius="3xl"
                    />
                  </Field.Root>
                  <Button
                    type="submit"
                    variant="outline"
                    loading={importing && !activeImport?.productId}
                    disabled={!manualUrl.trim() || importing}
                  >
                    <MaterialSymbol>download</MaterialSymbol>
                    {t("externalProducts.import", {
                      defaultValue: "Import",
                    })}
                  </Button>
                </HStack>
              </form>
            </>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
