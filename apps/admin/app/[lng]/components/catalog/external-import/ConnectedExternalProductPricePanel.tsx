"use client";

import type { ExternalProductPriceFetchStrategy } from "@konfi/types";
import {
  Badge,
  Box,
  Button,
  Card,
  createListCollection,
  HStack,
  Input,
  Portal,
  Select,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, Switch, Tooltip } from "@konfi/components";
import { useMemo } from "react";
import type { TranslateFn } from "./types";

type ConnectedExternalProductPricePanelProps = {
  cancelExternalPriceWorkflowAction: () => void;
  cancellingExternalPriceWorkflow: boolean;
  deliveryTimeExtraDay: boolean;
  importDisabledReason?: string;
  importMode: "prices" | "prices-and-attributes" | null;
  isApplyingPendingExternalPrices: boolean;
  isExternalPriceFetchWorkflowActive: boolean;
  pendingPriceConfigurationsCount: number;
  refreshDiscountPercent: string;
  refreshFetchStrategy: ExternalProductPriceFetchStrategy;
  refreshMarginPercent: string;
  refreshTaxPercent: string;
  startingExternalPriceWorkflow: boolean;
  applyPendingExternalPricesAction: () => void;
  deliveryTimeExtraDayChangeAction: (value: boolean) => void;
  importProductPricesAction: (syncMappedAttributes: boolean) => void;
  requestSyncImportAction: () => void;
  refreshDiscountPercentChangeAction: (value: string) => void;
  refreshFetchStrategyChangeAction: (
    value: ExternalProductPriceFetchStrategy,
  ) => void;
  refreshMarginPercentChangeAction: (value: string) => void;
  refreshTaxPercentChangeAction: (value: string) => void;
  stageExternalPricesAction: () => void;
  t: TranslateFn;
};

export default function ConnectedExternalProductPricePanel({
  cancelExternalPriceWorkflowAction,
  cancellingExternalPriceWorkflow,
  deliveryTimeExtraDay,
  importDisabledReason,
  importMode,
  isApplyingPendingExternalPrices,
  isExternalPriceFetchWorkflowActive,
  pendingPriceConfigurationsCount,
  refreshDiscountPercent,
  refreshFetchStrategy,
  refreshMarginPercent,
  refreshTaxPercent,
  startingExternalPriceWorkflow,
  applyPendingExternalPricesAction,
  deliveryTimeExtraDayChangeAction,
  importProductPricesAction,
  requestSyncImportAction,
  refreshDiscountPercentChangeAction,
  refreshFetchStrategyChangeAction,
  refreshMarginPercentChangeAction,
  refreshTaxPercentChangeAction,
  stageExternalPricesAction,
  t,
}: ConnectedExternalProductPricePanelProps) {
  const priceFetchModeCollection = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: t("externalProducts.priceFetchModeReuse", {
              defaultValue: "Fetch missing only",
            }),
            value: "reuse",
          },
          {
            label: t("externalProducts.priceFetchModeFull", {
              defaultValue: "Refetch everything",
            }),
            value: "full",
          },
        ],
      }),
    [t],
  );

  return (
    <Card.Root>
      <Card.Header>
        <HStack justifyContent="space-between" alignItems="center">
          <Card.Title>
            {t("externalProducts.priceRefreshTitle", {
              defaultValue: "External price refresh",
            })}
          </Card.Title>
          <Badge
            colorPalette={
              pendingPriceConfigurationsCount > 0 ? "orange" : "success"
            }
          >
            {pendingPriceConfigurationsCount > 0
              ? t("externalProducts.pendingPricesCount", {
                  defaultValue: "{{count}} pending",
                  count: pendingPriceConfigurationsCount,
                })
              : t("externalProducts.noPendingPrices", {
                  defaultValue: "No pending prices",
                })}
          </Badge>
        </HStack>
      </Card.Header>
      <Card.Body>
        <VStack gap={3} alignItems="stretch">
          <HStack gap={2} flexWrap="wrap">
            <Input
              autoComplete="off"
              aria-label={t("externalProducts.discountLabel", {
                defaultValue: "% discount",
              })}
              inputMode="decimal"
              name="external-price-discount"
              size="sm"
              type="number"
              min={0}
              max={100}
              step={0.1}
              width="88px"
              value={refreshDiscountPercent}
              onChange={(event) =>
                refreshDiscountPercentChangeAction(event.target.value)
              }
              placeholder="0"
            />
            <Text fontSize="sm" color="fg.muted">
              {t("externalProducts.discountLabel", {
                defaultValue: "% discount",
              })}
            </Text>

            <Input
              autoComplete="off"
              aria-label={t("externalProducts.taxLabel", {
                defaultValue: "% tax",
              })}
              inputMode="decimal"
              name="external-price-tax"
              size="sm"
              type="number"
              min={0}
              max={100}
              step={0.1}
              width="88px"
              value={refreshTaxPercent}
              onChange={(event) =>
                refreshTaxPercentChangeAction(event.target.value)
              }
              placeholder="0"
            />
            <Text fontSize="sm" color="fg.muted">
              {t("externalProducts.taxLabel", {
                defaultValue: "% tax",
              })}
            </Text>

            <Input
              autoComplete="off"
              aria-label={t("externalProducts.marginLabel", {
                defaultValue: "% margin",
              })}
              inputMode="decimal"
              name="external-price-margin"
              size="sm"
              type="number"
              min={0}
              max={100}
              step={0.1}
              width="88px"
              value={refreshMarginPercent}
              onChange={(event) =>
                refreshMarginPercentChangeAction(event.target.value)
              }
              placeholder="0"
            />
            <Text fontSize="sm" color="fg.muted">
              {t("externalProducts.marginLabel", {
                defaultValue: "% margin",
              })}
            </Text>

            <Text fontSize="sm" color="fg.muted">
              {t("externalProducts.priceFetchModeLabel", {
                defaultValue: "Fetch mode",
              })}
            </Text>
            <Box display="inline-block" flexShrink={0}>
              <Select.Root
                size="sm"
                collection={priceFetchModeCollection}
                value={[refreshFetchStrategy]}
                positioning={{ sameWidth: true }}
                onValueChange={({ value }) =>
                  refreshFetchStrategyChangeAction(
                    value[0] === "full" ? "full" : "reuse",
                  )
                }
                disabled={
                  isExternalPriceFetchWorkflowActive ||
                  startingExternalPriceWorkflow ||
                  cancellingExternalPriceWorkflow
                }
              >
                <Select.HiddenSelect name="connected-price-fetch-mode" />
                <Select.Control width="220px">
                  <Select.Trigger
                    aria-label={t("externalProducts.priceFetchModeLabel", {
                      defaultValue: "Fetch mode",
                    })}
                  >
                    <Select.ValueText />
                  </Select.Trigger>
                  <Select.IndicatorGroup>
                    <Select.Indicator />
                  </Select.IndicatorGroup>
                </Select.Control>
                <Portal>
                  <Select.Positioner>
                    <Select.Content>
                      {priceFetchModeCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </Box>
          </HStack>

          <Switch
            size="sm"
            colorPalette="primary"
            checked={deliveryTimeExtraDay}
            onCheckedChange={({ checked }) =>
              deliveryTimeExtraDayChangeAction(checked)
            }
          >
            {t("externalProducts.deliveryTimeExtraDayLabel", {
              defaultValue: "+1 day to fetched delivery times",
            })}
          </Switch>

          <VStack gap={2} alignItems="stretch">
            {isExternalPriceFetchWorkflowActive ? (
              <Button
                colorPalette="red"
                variant="outline"
                onClick={cancelExternalPriceWorkflowAction}
                loading={cancellingExternalPriceWorkflow}
                disabled={cancellingExternalPriceWorkflow}
              >
                <MaterialSymbol>close</MaterialSymbol>
                {t("externalProducts.cancelPriceRefresh", {
                  defaultValue: "Cancel price refresh",
                })}
              </Button>
            ) : (
              <Button
                colorPalette="primary"
                variant="outline"
                onClick={stageExternalPricesAction}
                loading={startingExternalPriceWorkflow}
                disabled={startingExternalPriceWorkflow}
              >
                <MaterialSymbol>autorenew</MaterialSymbol>
                {t("externalProducts.refreshPricesForReview", {
                  defaultValue: "Refresh prices for review",
                })}
              </Button>
            )}

            <Button
              colorPalette="primary"
              onClick={applyPendingExternalPricesAction}
              loading={isApplyingPendingExternalPrices}
              disabled={pendingPriceConfigurationsCount === 0}
            >
              <MaterialSymbol>done_all</MaterialSymbol>
              {t("externalProducts.applyPendingPrices", {
                defaultValue: "Apply pending prices",
              })}
            </Button>

            <Tooltip
              content={importDisabledReason}
              disabled={!importDisabledReason}
            >
              <Button
                colorPalette="primary"
                variant="outline"
                onClick={() => importProductPricesAction(false)}
                loading={importMode === "prices"}
                disabled={Boolean(importDisabledReason)}
              >
                <MaterialSymbol>upload</MaterialSymbol>
                {t("externalProducts.importPricesToProduct", {
                  defaultValue: "Stage applied prices in form",
                })}
              </Button>
            </Tooltip>

            <Tooltip
              content={importDisabledReason}
              disabled={!importDisabledReason}
            >
              <Button
                colorPalette="primary"
                variant="subtle"
                onClick={requestSyncImportAction}
                loading={importMode === "prices-and-attributes"}
                disabled={Boolean(importDisabledReason)}
              >
                <MaterialSymbol>sync_alt</MaterialSymbol>
                {t("externalProducts.importPricesAndSyncAttributes", {
                  defaultValue: "Sync attributes & stage applied prices",
                })}
              </Button>
            </Tooltip>
          </VStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
