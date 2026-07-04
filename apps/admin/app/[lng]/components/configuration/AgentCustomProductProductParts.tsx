"use client";

import type {
  AgentCustomProductCandidateProduct,
  AgentCustomProductSearchCandidate,
} from "@/actions/agent-custom-product-settings";
import { useT } from "@/i18n/client";
import { canUseProductForAgentCustomProduct } from "@/lib/agent-custom-product-settings";
import { Badge, Button, Card, HStack, Text, VStack } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { PriceTypeEnum } from "@konfi/types";

export function AgentCustomProductSearchResults({
  onSelectProduct,
  searchResults,
  searching,
  searchTerm,
}: {
  onSelectProduct: (candidate: AgentCustomProductSearchCandidate) => void;
  searchResults: AgentCustomProductSearchCandidate[];
  searching: boolean;
  searchTerm: string;
}) {
  const { t } = useT(["allegro", "translation"]);

  return (
    <VStack align="stretch" gap={3}>
      {searchResults.map((candidate) => (
        <AgentCustomProductSearchResult
          candidate={candidate}
          key={`${candidate.channelId}:${candidate.product.id}`}
          onSelectProduct={onSelectProduct}
        />
      ))}

      {!searching &&
      searchResults.length === 0 &&
      searchTerm.trim().length >= 2 ? (
        <Text color="fg.muted">
          {t("allegro.settings.noResultsHint", {
            defaultValue: "No products found for this search yet.",
          })}
        </Text>
      ) : null}
    </VStack>
  );
}

function AgentCustomProductSearchResult({
  candidate,
  onSelectProduct,
}: {
  candidate: AgentCustomProductSearchCandidate;
  onSelectProduct: (candidate: AgentCustomProductSearchCandidate) => void;
}) {
  const { t } = useT(["allegro", "translation"]);
  const product = candidate.product;
  const valid = canUseProductForAgentCustomProduct(product);

  return (
    <Card.Root variant="outline">
      <Card.Body>
        <HStack justify="space-between" align="center" wrap="wrap">
          <VStack align="flex-start" gap={1}>
            <Text fontWeight="medium">{product.name}</Text>
            <Text fontSize="sm" color="fg.muted">
              {t("agents.customProduct.productIdLabel", {
                defaultValue: "ID: {{id}}",
                id: product.id,
              })}{" "}
              {t("agents.customProduct.channelIdLabel", {
                defaultValue: "Channel: {{id}}",
                id: candidate.channelId,
              })}
            </Text>
            <ProductCompatibilityBadges product={product} />
          </VStack>
          <Button
            variant={valid ? "solid" : "outline"}
            colorPalette={valid ? "primary" : "gray"}
            onClick={() => onSelectProduct(candidate)}
          >
            <MaterialSymbol>{valid ? "check_circle" : "rule"}</MaterialSymbol>
            {t("agents.customProduct.selectProduct", {
              defaultValue: "Select",
            })}
          </Button>
        </HStack>
      </Card.Body>
    </Card.Root>
  );
}

export function ProductCompatibilityBadges({
  product,
}: {
  product: AgentCustomProductCandidateProduct;
}) {
  const { t } = useT(["allegro", "translation"]);

  return (
    <HStack wrap="wrap">
      <Badge>
        {t("agents.customProduct.priceType", {
          defaultValue: "Price type: {{priceType}}",
          priceType: product.priceType,
        })}
      </Badge>
      <Badge colorPalette={product.allowCustomPrice ? "success" : "red"}>
        {product.allowCustomPrice
          ? t("agents.customProduct.customPriceEnabled", {
              defaultValue: "Custom price enabled",
            })
          : t("agents.customProduct.customPriceDisabled", {
              defaultValue: "Custom price disabled",
            })}
      </Badge>
      {product.priceType === PriceTypeEnum.SINGLE ? (
        <Badge colorPalette="blue">
          {t("agents.customProduct.singlePriceProduct", {
            defaultValue: "Single price product",
          })}
        </Badge>
      ) : null}
    </HStack>
  );
}
