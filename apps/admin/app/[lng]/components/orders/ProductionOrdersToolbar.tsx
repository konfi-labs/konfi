"use client";

import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  SegmentGroup,
  Text,
} from "@chakra-ui/react";
import { FromToDateInput } from "@konfi/components/shared/FromToDateInput";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { SearchInput } from "@konfi/components/shared/SearchInput";
import { Rules } from "@konfi/components/shared/Table";
import {
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@konfi/components/ui/menu";
import {
  type OrderWorkflowStatusId,
  type OrderRulePresetDefinition,
  type PrintingMethodId,
  type Rule,
  type RulePreset,
  type RulesState,
  type RulesStateAction,
  type SelectOption,
} from "@konfi/types";
import { getLocalizedBusinessTaxonomyName } from "@konfi/utils/business-taxonomy";
import type { QueryConstraint } from "firebase/firestore";
import type { TFunction, i18n as I18nInstance } from "i18next";
import type { Dispatch, SetStateAction } from "react";
import {
  normalizeProductionGroupingMode,
  type ProductionGroupingMode,
} from "@/lib/orders/production-view";

const PRODUCTION_TOOLBAR_COMPACT_EXPAND_AT = "9999px";
const PRODUCTION_TOOLBAR_COMPACT_EXPAND_QUERY = `@media screen and (min-width: ${PRODUCTION_TOOLBAR_COMPACT_EXPAND_AT})`;
const PRODUCTION_TOOLBAR_BUTTON_CSS = {
  [PRODUCTION_TOOLBAR_COMPACT_EXPAND_QUERY]: {
    paddingInline: "var(--chakra-spacing-4)",
  },
} as const;
const PRODUCTION_TOOLBAR_LABEL_CSS = {
  [PRODUCTION_TOOLBAR_COMPACT_EXPAND_QUERY]: {
    display: "inline",
  },
} as const;

export interface ProductionGroupingModeOption {
  icon: string;
  label: string;
  mode: ProductionGroupingMode;
}

interface ProductionOrdersToolbarProps {
  activeLocale: string;
  activePrintingMethodIds: PrintingMethodId[];
  allPrintingMethodsSelected: boolean;
  allVisibleStatusesSelected: boolean;
  blockedOnlyLabel: string;
  dispatchRulesState: Dispatch<RulesStateAction>;
  endDate: string | undefined;
  groupingMode: ProductionGroupingMode;
  groupingViewLabel: string;
  handlePrintingMethodToggle: (
    methodId: PrintingMethodId,
    checked: boolean,
  ) => void;
  handleSetDate: (startDate: string, endDate: string) => void;
  handleVisibleStatusToggle: (
    statusId: OrderWorkflowStatusId,
    checked: boolean,
  ) => void;
  i18n: I18nInstance;
  orderStatusOptions: SelectOption[];
  printingMethodOptions: SelectOption[];
  printingMethodRulePresets: OrderRulePresetDefinition[];
  productionGroupingModeOptions: ProductionGroupingModeOption[];
  queryConstraints: QueryConstraint[];
  quickFilter: string | null;
  refreshCounts: () => void;
  resetVisibleStatuses: () => void;
  rulePresets: RulePreset[];
  rules: Rule[];
  rulesState: RulesState;
  selectedPrintingMethodIds: PrintingMethodId[];
  selectedPrintingMethodLabel: string;
  selectedPrintingMethodSet: Set<string>;
  setGroupingMode: Dispatch<SetStateAction<ProductionGroupingMode>>;
  setPrintingMethodPreset: (methodIds: PrintingMethodId[]) => void;
  setQueryConstraints: (queryConstraints: QueryConstraint[]) => void;
  setQuickFilter: Dispatch<SetStateAction<string | null>>;
  setShowBlockedOnly: Dispatch<SetStateAction<boolean>>;
  showBlockedOnly: boolean;
  startDate: string | undefined;
  t: TFunction;
  visibleStatusOptionCount: number;
  visibleStatusesLabel: string;
  visibleStatusSet: Set<string>;
}

function ProductionToolbarLabel({ children }: { children: string }) {
  return (
    <Box
      as="span"
      display="none"
      whiteSpace="nowrap"
      css={PRODUCTION_TOOLBAR_LABEL_CSS}
    >
      {children}
    </Box>
  );
}

function getSelectOptionIcon(option: SelectOption): string | null {
  if (!option.object || typeof option.object !== "object") {
    return null;
  }

  const icon = (option.object as { icon?: unknown }).icon;
  return typeof icon === "string" ? icon : null;
}

export function ProductionOrdersToolbar({
  activeLocale,
  activePrintingMethodIds,
  allPrintingMethodsSelected,
  allVisibleStatusesSelected,
  blockedOnlyLabel,
  dispatchRulesState,
  endDate,
  groupingMode,
  groupingViewLabel,
  handlePrintingMethodToggle,
  handleSetDate,
  handleVisibleStatusToggle,
  i18n,
  orderStatusOptions,
  printingMethodOptions,
  printingMethodRulePresets,
  productionGroupingModeOptions,
  queryConstraints,
  quickFilter,
  refreshCounts,
  resetVisibleStatuses,
  rulePresets,
  rules,
  rulesState,
  selectedPrintingMethodIds,
  selectedPrintingMethodLabel,
  selectedPrintingMethodSet,
  setGroupingMode,
  setPrintingMethodPreset,
  setQueryConstraints,
  setQuickFilter,
  setShowBlockedOnly,
  showBlockedOnly,
  startDate,
  t,
  visibleStatusOptionCount,
  visibleStatusesLabel,
  visibleStatusSet,
}: ProductionOrdersToolbarProps) {
  return (
    <Flex align="flex-start" gap={2} justify="space-between" wrap="wrap">
      <HStack
        align="stretch"
        flex={{ base: "1 1 100%", xl: "1 1 auto" }}
        gap={2}
        minW={0}
        wrap="wrap"
      >
        <SearchInput
          placeholder={t("orders.productionView.quickFilter", {
            defaultValue: "Filter loaded production orders...",
          })}
          maxW={{ base: "full", md: "sm" }}
          searchKey={quickFilter}
          setSearchKey={setQuickFilter}
          searchMode="manual"
          t={t}
        />
        {rulesState.rulesQueries.length > 0 && (
          <Rules
            compactOnDesktop
            compactExpandAt={PRODUCTION_TOOLBAR_COMPACT_EXPAND_AT}
            dispatchRulesState={dispatchRulesState}
            queries={queryConstraints}
            refreshFn={() => {
              setQueryConstraints([]);
              refreshCounts();
            }}
            rulePresets={rulePresets}
            rules={rules}
            savedRulesQueries={rulesState}
            setQueries={setQueryConstraints}
            t={t}
          />
        )}
        <FromToDateInput
          compactOnDesktop
          compactExpandAt={PRODUCTION_TOOLBAR_COMPACT_EXPAND_AT}
          handleSetDate={handleSetDate}
          i18n={i18n}
          initEndDate={endDate}
          initStartDate={startDate}
        />
      </HStack>
      <HStack
        align="stretch"
        flex={{ base: "1 1 100%", xl: "0 0 auto" }}
        gap={2}
        justify={{ base: "flex-start", xl: "flex-end" }}
        wrap="wrap"
      >
        <HStack
          align="center"
          borderColor="border.subtle"
          borderRadius="full"
          borderWidth="1px"
          gap={2}
          px={2}
          py={1}
        >
          <Text
            color="fg.muted"
            fontSize="xs"
            fontWeight="medium"
            whiteSpace="nowrap"
          >
            {groupingViewLabel}
          </Text>
          <SegmentGroup.Root
            colorPalette="primary"
            css={{ "--segment-radius": "radii.full" }}
            size="xs"
            value={groupingMode}
            onValueChange={({ value }) => {
              if (value) {
                setGroupingMode(normalizeProductionGroupingMode(value));
              }
            }}
          >
            <SegmentGroup.Indicator shadow="none" />
            {productionGroupingModeOptions.map(({ icon, label, mode }) => (
              <SegmentGroup.Item key={mode} value={mode}>
                <SegmentGroup.ItemText>
                  <HStack as="span" gap={1}>
                    <MaterialSymbol>{icon}</MaterialSymbol>
                    <Text as="span">{label}</Text>
                  </HStack>
                </SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            ))}
          </SegmentGroup.Root>
        </HStack>
        <Button
          aria-label={blockedOnlyLabel}
          aria-pressed={showBlockedOnly}
          colorPalette={showBlockedOnly ? "red" : undefined}
          css={PRODUCTION_TOOLBAR_BUTTON_CSS}
          px="2.5"
          title={blockedOnlyLabel}
          variant={showBlockedOnly ? "subtle" : "outline"}
          onClick={() => setShowBlockedOnly((current) => !current)}
        >
          <MaterialSymbol>error</MaterialSymbol>
          <ProductionToolbarLabel>{blockedOnlyLabel}</ProductionToolbarLabel>
        </Button>
        <MenuRoot
          closeOnSelect={false}
          positioning={{
            placement: "bottom-end",
          }}
        >
          <MenuTrigger asChild>
            <Button
              aria-label={visibleStatusesLabel}
              colorPalette={allVisibleStatusesSelected ? undefined : "primary"}
              css={PRODUCTION_TOOLBAR_BUTTON_CSS}
              px="2.5"
              title={visibleStatusesLabel}
              variant="outline"
            >
              <MaterialSymbol>visibility</MaterialSymbol>
              <ProductionToolbarLabel>
                {visibleStatusesLabel}
              </ProductionToolbarLabel>
              {!allVisibleStatusesSelected ? (
                <Badge size="xs" variant="surface">
                  {visibleStatusOptionCount}/{orderStatusOptions.length}
                </Badge>
              ) : null}
            </Button>
          </MenuTrigger>
          <MenuContent minW="16rem">
            <MenuItemGroup title={visibleStatusesLabel}>
              <MenuItem value="reset-statuses" onClick={resetVisibleStatuses}>
                <MaterialSymbol>restart_alt</MaterialSymbol>
                {t("orders.productionView.resetVisibleStatuses", {
                  defaultValue: "Reset defaults",
                })}
              </MenuItem>
              <MenuSeparator />
              {orderStatusOptions.map((option) => (
                <MenuCheckboxItem
                  key={option.value}
                  checked={visibleStatusSet.has(option.value)}
                  value={option.value}
                  onCheckedChange={(checked) =>
                    handleVisibleStatusToggle(option.value, checked)
                  }
                >
                  {option.label}
                </MenuCheckboxItem>
              ))}
            </MenuItemGroup>
          </MenuContent>
        </MenuRoot>
        {printingMethodOptions.length > 0 ? (
          <MenuRoot
            closeOnSelect={false}
            positioning={{
              placement: "bottom-end",
            }}
          >
            <MenuTrigger asChild>
              <Button
                aria-label={selectedPrintingMethodLabel}
                colorPalette={
                  allPrintingMethodsSelected ? undefined : "primary"
                }
                css={PRODUCTION_TOOLBAR_BUTTON_CSS}
                px="2.5"
                title={selectedPrintingMethodLabel}
                variant="outline"
              >
                <MaterialSymbol>print</MaterialSymbol>
                <ProductionToolbarLabel>
                  {selectedPrintingMethodLabel}
                </ProductionToolbarLabel>
                {!allPrintingMethodsSelected ? (
                  <Badge size="xs" variant="surface">
                    {`${selectedPrintingMethodIds.length}/${activePrintingMethodIds.length}`}
                  </Badge>
                ) : null}
              </Button>
            </MenuTrigger>
            <MenuContent minW="18rem">
              <MenuItemGroup
                title={t("orders.productionView.printingMethods.heading", {
                  defaultValue: "Print type",
                })}
              >
                <MenuItem
                  value="printing-methods-all"
                  onClick={() =>
                    setPrintingMethodPreset(activePrintingMethodIds)
                  }
                >
                  <MaterialSymbol>checklist</MaterialSymbol>
                  {t("orders.productionView.printingMethods.all", {
                    defaultValue: "All print types",
                  })}
                </MenuItem>
                {printingMethodRulePresets.map((preset) => (
                  <MenuItem
                    key={preset.id}
                    value={`printing-methods-preset-${preset.id}`}
                    onClick={() =>
                      setPrintingMethodPreset(preset.printingMethodIds)
                    }
                  >
                    <MaterialSymbol>{preset.icon}</MaterialSymbol>
                    {getLocalizedBusinessTaxonomyName(preset, activeLocale)}
                  </MenuItem>
                ))}
                <MenuSeparator />
                {printingMethodOptions.map((option) => {
                  const optionIcon = getSelectOptionIcon(option);

                  return (
                    <MenuCheckboxItem
                      key={option.value}
                      checked={selectedPrintingMethodSet.has(option.value)}
                      value={`printing-method-${option.value}`}
                      onCheckedChange={(checked) =>
                        handlePrintingMethodToggle(option.value, checked)
                      }
                    >
                      <HStack gap={2}>
                        {optionIcon ? (
                          <MaterialSymbol>{optionIcon}</MaterialSymbol>
                        ) : null}
                        <Text>{option.label}</Text>
                      </HStack>
                    </MenuCheckboxItem>
                  );
                })}
              </MenuItemGroup>
            </MenuContent>
          </MenuRoot>
        ) : null}
      </HStack>
    </Flex>
  );
}
