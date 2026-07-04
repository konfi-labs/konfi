"use client";

import {
  Box,
  Button,
  Circle,
  CloseButton,
  Drawer,
  Flex,
  Float,
  Grid,
  HStack,
  Portal,
  Text,
} from "@chakra-ui/react";
import {
  type Rule,
  type RulePreset,
  type RulesState,
  type RulesStateAction,
  type SelectOption,
} from "@konfi/types";
import { initialRulesQueries, initialValues } from "@konfi/utils";
import { QueryConstraint, where } from "firebase/firestore";
import { TFunction } from "i18next";
import {
  Dispatch,
  memo,
  ReactNode,
  SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toaster, Tooltip } from "../../ui";
import { themeGradients } from "../../../theme/gradients";
import { MaterialSymbol } from "../MaterialSymbol";

// Add this helper function anywhere above the component
function constraintsEqual(a: QueryConstraint[], b: QueryConstraint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      return false;
    }
  }
  return true;
}

function parseRuleValue(value: string): string | boolean {
  return value === "false" ? false : value === "true" ? true : value;
}

// Extract option component for better code organization
const OptionComponent = memo(
  ({
    values,
    option,
    handleAddValue,
    handleRemoveValue,
    queriesLength,
    valuesLength,
    t,
  }: {
    values: string[];
    option: SelectOption;
    handleAddValue: (value: string) => void;
    handleRemoveValue: (value: string) => void;
    queriesLength: number;
    valuesLength: number;
    t: TFunction;
  }) => {
    const [checked, setChecked] = useState<boolean>(
      values?.includes(option.value) ?? false,
    );

    const handleOnClick = useCallback(() => {
      if (checked) {
        handleRemoveValue(option.value);
        setChecked(false);
      } else if (valuesLength >= 3) {
        toaster.error({
          title: t("rules.maxValues", {
            defaultValue: "Maximum number of values",
          }),
          description: t("rules.maxValuesDescription", {
            defaultValue: "You can select maximum 3 values",
          }),
        });
      } else {
        handleAddValue(option.value);
        setChecked(true);
      }
    }, [
      checked,
      valuesLength,
      handleAddValue,
      handleRemoveValue,
      option.value,
      t,
    ]);

    // Disable option if limit is reached and this option is not already selected
    const isDisabled = valuesLength >= 3 && !checked;

    return (
      <Button
        size={"sm"}
        variant={"outline"}
        colorPalette={"gray"}
        disabled={isDisabled}
        position={"relative"}
        overflow={"hidden"}
        _hover={{
          background: checked ? undefined : themeGradients.primarySurfaceHover,
        }}
        onClick={handleOnClick}
      >
        {checked && (
          <Circle
            position={"absolute"}
            top={"-8px"}
            right={"-8px"}
            size={"24px"}
            bg={"primary.solid"}
            filter={"blur(8px)"}
            animation="floatSmall"
          />
        )}
        {option.label}
        {checked && <MaterialSymbol>close</MaterialSymbol>}
      </Button>
    );
  },
);

// Extract rule component for better separation of concerns
const RuleComponent = memo(
  ({
    index,
    rule,
    queriesLength,
    updateRulesQueries,
    values,
    setValues,
    t,
  }: {
    index: number;
    rule: Rule;
    queriesLength: number;
    updateRulesQueries: (index: number, newQueries: QueryConstraint[]) => void;
    values: string[][];
    setValues: Dispatch<SetStateAction<string[][]>>;
    t: TFunction;
  }) => {
    // Optimize query generation with useMemo
    const queries: QueryConstraint[] = useMemo(() => {
      if (values[index].length === 0) {
        return [];
      }

      const parsedValues = values[index].map(parseRuleValue);

      if (rule.opStr === "in") {
        return [where(rule.fieldPath, "in", parsedValues)];
      }

      if (rule.opStr === "==") {
        return parsedValues.map((value) => where(rule.fieldPath, "==", value));
      }

      if (rule.opStr === "array-contains-any") {
        if (parsedValues.length === 1) {
          const [value] = parsedValues;
          return value === undefined
            ? []
            : [where(rule.fieldPath, "array-contains", value)];
        }

        return [where(rule.fieldPath, "array-contains-any", parsedValues)];
      }

      return [];
    }, [values, index, rule.fieldPath, rule.opStr]);

    // Update parent component with new queries
    useEffect(() => {
      updateRulesQueries(index, queries);
    }, [queries, index, updateRulesQueries]);

    // Memoize handlers for better performance
    const handleAddValue = useCallback(
      (value: string) => {
        if (values[index].length >= 3) {
          toaster.error({
            title: t("rules.maxValues", {
              defaultValue: "Maximum number of values",
            }),
            description: t("rules.maxValuesDescription", {
              defaultValue: "You can select maximum 3 values",
            }),
          });
          return;
        }
        setValues((prev) => [
          ...prev.slice(0, index),
          [...prev[index], value],
          ...prev.slice(index + 1),
        ]);
      },
      [index, values, setValues, t],
    );

    const handleRemoveValue = useCallback(
      (value: string) => {
        setValues((prev) => [
          ...prev.slice(0, index),
          prev[index].filter((v) => v !== value),
          ...prev.slice(index + 1),
        ]);
      },
      [index, setValues],
    );

    return (
      <Box>
        <Text color={{ base: "gray.500", _dark: "gray.400" }}>
          {rule.label}
        </Text>
        <HStack wrap={"wrap"} mt={2}>
          {rule.options?.map((option, _index) => (
            <Flex key={_index} align={"flex-start"}>
              <OptionComponent
                values={values[index]}
                option={option}
                handleAddValue={handleAddValue}
                handleRemoveValue={handleRemoveValue}
                queriesLength={queriesLength}
                valuesLength={values[index].length}
                t={t}
              />
            </Flex>
          ))}
        </HStack>
      </Box>
    );
  },
);

// Main Rules component
export const Rules = memo(
  ({
    rules,
    queries,
    setQueries,
    rulePresets,
    disabled = false,
    compactOnDesktop = false,
    compactExpandAt = "1820px",
    savedRulesQueries,
    dispatchRulesState,
    belowPresets,
    refreshFn,
    t,
  }: {
    rules: Rule[];
    queries: QueryConstraint[];
    setQueries: (queryConstraints: QueryConstraint[]) => void;
    rulePresets: RulePreset[];
    disabled?: boolean;
    compactOnDesktop?: boolean;
    compactExpandAt?: string;
    savedRulesQueries: RulesState;
    dispatchRulesState: Dispatch<RulesStateAction>;
    belowPresets?: ReactNode;
    refreshFn?: () => void;
    t: TFunction;
  }) => {
    const compactExpandQuery = `@media screen and (min-width: ${compactExpandAt})`;

    const [rulesQueries, setRulesQueries] = useState<QueryConstraint[][]>(
      savedRulesQueries.rulesQueries,
    );
    const [values, setValues] = useState<string[][]>(savedRulesQueries.values);
    const [presetEnabled, setPresetEnabled] = useState<boolean>(
      savedRulesQueries.presetEnabled,
    );
    const [enabledPresetIndex, setEnabledPresetIndex] = useState<number | null>(
      savedRulesQueries.enabledPresetIndex,
    );
    const [enabledPresetId, setEnabledPresetId] = useState<string | null>(
      savedRulesQueries.enabledPresetId ?? null,
    );

    useEffect(() => {
      try {
        startTransition(() => {
          dispatchRulesState({
            rulesQueries,
            values,
            presetEnabled,
            enabledPresetIndex,
            enabledPresetId,
            type: "INIT",
          });
        });
      } catch {
        console.error("Error saving rules state to context");
      }
    }, [
      rulesQueries,
      values,
      presetEnabled,
      enabledPresetIndex,
      enabledPresetId,
    ]);

    // Update parent component with new queries
    useEffect(() => {
      startTransition(() => {
        const flattenedQueries = rulesQueries.flat();
        // Only update if there's a real change
        if (!constraintsEqual(queries, flattenedQueries)) {
          setQueries(flattenedQueries);
        }
      });
    }, [rulesQueries, queries, setQueries]);

    // Memoize handlers for better performance
    const updateRulesQueries = useCallback(
      (index: number, newQueries: QueryConstraint[]) => {
        setRulesQueries((prev) => [
          ...prev.slice(0, index),
          newQueries,
          ...prev.slice(index + 1),
        ]);
      },
      [setRulesQueries],
    );

    const handlePresetClick = useCallback(
      (rulePreset: RulePreset, index: number) => {
        const isActive = rulePreset.id
          ? enabledPresetId === rulePreset.id
          : enabledPresetIndex === index;

        if (isActive) {
          setRulesQueries(initialRulesQueries(rules));
          setValues(initialValues(rules));
          setPresetEnabled(false);
          setEnabledPresetIndex(null);
          setEnabledPresetId(null);
          return;
        }
        setEnabledPresetIndex(index);
        setEnabledPresetId(rulePreset.id ?? null);
        setRulesQueries(rulePreset.values.map((value) => [value]));
        setPresetEnabled(true);
      },
      [
        enabledPresetIndex,
        enabledPresetId,
        rules,
        setRulesQueries,
        setValues,
        setPresetEnabled,
      ],
    );

    const handleClearFilters = useCallback(() => {
      startTransition(() => {
        setRulesQueries(initialRulesQueries(rules));
        setValues(initialValues(rules));
        setPresetEnabled(false);
        setEnabledPresetIndex(null);
        setEnabledPresetId(null);
        if (refreshFn) {
          refreshFn();
        }
      });
    }, [setRulesQueries, setValues, setPresetEnabled]);

    return (
      <Drawer.Root size={{ base: "full", md: "md" }}>
        <Tooltip
          content={t("rules.selectFilters", { defaultValue: "Select filters" })}
        >
          <Drawer.Trigger asChild>
            <Button
              variant="outline"
              colorPalette={queries.length > 0 ? "primary" : undefined}
              disabled={disabled}
              position={"relative"}
              aria-label={t("rules.selectFilters", {
                defaultValue: "Select filters",
              })}
              px={compactOnDesktop ? "2.5" : undefined}
              css={
                compactOnDesktop
                  ? {
                      [compactExpandQuery]: {
                        paddingInline: "var(--chakra-spacing-4)",
                      },
                    }
                  : undefined
              }
            >
              <Box
                as="span"
                display={compactOnDesktop ? "none" : undefined}
                css={
                  compactOnDesktop
                    ? {
                        [compactExpandQuery]: {
                          display: "inline",
                        },
                      }
                    : undefined
                }
              >
                {t("rules.selectFilters", { defaultValue: "Select filters" })}
              </Box>
              <MaterialSymbol>filter_list</MaterialSymbol>
              {queries.length > 0 && (
                <Float>
                  <CloseButton
                    as={"span"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFilters();
                    }}
                    size={"2xs"}
                    variant={"surface"}
                    rounded={"full"}
                  />
                </Float>
              )}
            </Button>
          </Drawer.Trigger>
        </Tooltip>
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Header>
                <Drawer.Title>
                  {t("rules.selectFilters", { defaultValue: "Select filters" })}
                </Drawer.Title>
              </Drawer.Header>
              <Drawer.Body>
                <Text mb={"2"} color={{ base: "gray.500", _dark: "gray.400" }}>
                  {t("rules.presets", { defaultValue: "Presets" })}
                </Text>
                <HStack wrap={"wrap"} mb={6}>
                  {rulePresets.map((rulePreset, index) => {
                    const isActive = rulePreset.id
                      ? enabledPresetId === rulePreset.id
                      : enabledPresetIndex === index;

                    return (
                      <Button
                        key={rulePreset.id ?? index}
                        colorPalette={isActive ? "primary" : undefined}
                        onClick={() => handlePresetClick(rulePreset, index)}
                      >
                        {rulePreset.label}
                        <MaterialSymbol>{rulePreset.icon}</MaterialSymbol>
                      </Button>
                    );
                  })}
                </HStack>
                {belowPresets && <Box mb={6}>{belowPresets}</Box>}
                {!presetEnabled && (
                  <Grid
                    templateColumns={`repeat(1fr, ${rules.length})`}
                    gap={6}
                  >
                    {rules.map((rule, index) => (
                      <RuleComponent
                        key={index}
                        index={index}
                        rule={rule}
                        queriesLength={queries.length}
                        updateRulesQueries={updateRulesQueries}
                        values={values}
                        setValues={setValues}
                        t={t}
                      />
                    ))}
                  </Grid>
                )}
              </Drawer.Body>
              <Drawer.Footer>
                <Drawer.ActionTrigger asChild>
                  <Button variant={"outline"}>
                    {t("rules.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </Drawer.ActionTrigger>
                <Button onClick={handleClearFilters}>
                  {t("rules.clearFilters", { defaultValue: "Clear filters" })}
                </Button>
              </Drawer.Footer>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Drawer.CloseTrigger>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    );
  },
);

OptionComponent.displayName = "Option";
RuleComponent.displayName = "Rule";
Rules.displayName = "Rules";
