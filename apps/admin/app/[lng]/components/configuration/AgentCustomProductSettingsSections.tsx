"use client";

import type { AgentCustomProductSearchCandidate } from "@/actions/agent-custom-product-settings";
import { useT } from "@/i18n/client";
import { canUseProductForAgentCustomProduct } from "@/lib/agent-custom-product-settings";
import {
  Alert,
  Button,
  Card,
  HStack,
  Input,
  Separator,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import {
  AgentCustomProductSearchResults,
  ProductCompatibilityBadges,
} from "./AgentCustomProductProductParts";

export function AgentCustomProductInfoAlert() {
  const { t } = useT(["allegro", "translation"]);

  return (
    <Alert.Root status="info">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {t("agents.customProduct.title", {
            defaultValue: "Agent custom product",
          })}
        </Alert.Title>
        <Alert.Description>
          {t("agents.customProduct.description", {
            defaultValue:
              "Pick one SINGLE product with custom price enabled for future agent workflows that need a generic custom-price item.",
          })}
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

export function SavedAgentCustomProductCard({
  clearing,
  loadingSettings,
  onClear,
  savedProductChannelId,
  savedProductId,
  savedProductName,
}: {
  clearing: boolean;
  loadingSettings: boolean;
  onClear: () => void;
  savedProductChannelId: string | undefined;
  savedProductId: string | undefined;
  savedProductName: string | undefined;
}) {
  const { t } = useT(["allegro", "translation"]);

  return (
    <Skeleton loading={loadingSettings}>
      <Card.Root>
        <Card.Body>
          <VStack align="stretch" gap={4}>
            <Text fontWeight="semibold">
              {t("agents.customProduct.currentSelection", {
                defaultValue: "Currently saved custom product",
              })}
            </Text>

            {savedProductId && savedProductName ? (
              <HStack justify="space-between" align="center" wrap="wrap">
                <VStack align="flex-start" gap={1}>
                  <Text fontWeight="medium">{savedProductName}</Text>
                  <Text fontSize="sm" color="fg.muted">
                    {t("agents.customProduct.productIdLabel", {
                      defaultValue: "ID: {{id}}",
                      id: savedProductId,
                    })}
                    {savedProductChannelId ? (
                      <>
                        {" "}
                        {t("agents.customProduct.channelIdLabel", {
                          defaultValue: "Channel: {{id}}",
                          id: savedProductChannelId,
                        })}
                      </>
                    ) : null}
                  </Text>
                </VStack>
                <Button
                  variant="outline"
                  colorPalette="red"
                  loading={clearing}
                  onClick={onClear}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("actions.clear", { defaultValue: "Clear" })}
                </Button>
              </HStack>
            ) : (
              <Text color="fg.muted">
                {t("agents.customProduct.noSavedProduct", {
                  defaultValue: "No agent custom product configured yet.",
                })}
              </Text>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>
    </Skeleton>
  );
}

export function AgentCustomProductSearchCard({
  onClearSelection,
  onSave,
  onSearch,
  onSearchTermChange,
  onSelectProduct,
  saving,
  searchResults,
  searching,
  searchTerm,
  selectedProduct,
}: {
  onClearSelection: () => void;
  onSave: () => void;
  onSearch: () => void;
  onSearchTermChange: (value: string) => void;
  onSelectProduct: (candidate: AgentCustomProductSearchCandidate) => void;
  saving: boolean;
  searchResults: AgentCustomProductSearchCandidate[];
  searching: boolean;
  searchTerm: string;
  selectedProduct: AgentCustomProductSearchCandidate | null;
}) {
  const { t } = useT(["allegro", "translation"]);

  return (
    <Card.Root>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <Text fontWeight="semibold">
            {t("agents.customProduct.searchLabel", {
              defaultValue: "Search products",
            })}
          </Text>

          <HStack align="stretch">
            <Input
              aria-label={t("agents.customProduct.searchLabel", {
                defaultValue: "Search products",
              })}
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder={t("allegro.settings.searchPlaceholder", {
                defaultValue: "Type product name...",
              })}
            />
            <Button
              colorPalette="primary"
              loading={searching}
              onClick={onSearch}
            >
              <MaterialSymbol>search</MaterialSymbol>
              {t("actions.search", { defaultValue: "Search" })}
            </Button>
          </HStack>

          {selectedProduct ? (
            <SelectedAgentCustomProduct
              onClearSelection={onClearSelection}
              onSave={onSave}
              saving={saving}
              selectedProduct={selectedProduct}
            />
          ) : null}

          <Separator />

          <AgentCustomProductSearchResults
            onSelectProduct={onSelectProduct}
            searchResults={searchResults}
            searching={searching}
            searchTerm={searchTerm}
          />
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function SelectedAgentCustomProduct({
  onClearSelection,
  onSave,
  saving,
  selectedProduct,
}: {
  onClearSelection: () => void;
  onSave: () => void;
  saving: boolean;
  selectedProduct: AgentCustomProductSearchCandidate;
}) {
  const { t } = useT(["allegro", "translation"]);
  const valid = canUseProductForAgentCustomProduct(selectedProduct.product);

  return (
    <VStack align="stretch" gap={2} borderWidth="1px" borderRadius="md" p={4}>
      <Text fontWeight="semibold">
        {t("agents.customProduct.selectedProduct", {
          defaultValue: "Selected product",
        })}
      </Text>
      <Text>{selectedProduct.product.name}</Text>
      <ProductCompatibilityBadges product={selectedProduct.product} />

      {!valid && (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t("agents.customProduct.invalidDescription", {
                defaultValue:
                  "Choose a SINGLE product with custom price enabled so agents can preserve supplier item names and prices.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <HStack>
        <Button
          colorPalette="primary"
          loading={saving}
          disabled={!valid}
          onClick={onSave}
        >
          <MaterialSymbol>save</MaterialSymbol>
          {t("actions.saveChanges", {
            defaultValue: "Save changes",
          })}
        </Button>
        <Button variant="outline" onClick={onClearSelection}>
          <MaterialSymbol>close</MaterialSymbol>
          {t("common.clearSelection", {
            defaultValue: "Clear selection",
          })}
        </Button>
      </HStack>
    </VStack>
  );
}
