"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  createListCollection,
  Dialog,
  Field,
  HStack,
  Portal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  AdvancedAttributeSelection,
  AdvancedEdgeSide,
  AdvancedFinishingType,
  Attribute,
  Configuration,
} from "@konfi/types";
import {
  ADVANCED_EDGE_SIDES,
  createSelectionFromPreset,
  hasAnyGrommets,
  normalizeAdvancedSelection,
  setCutToSize,
  toggleFinishingSide,
  updateGrommets,
} from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import {
  CloseButton,
  NumberInputField,
  NumberInputRoot,
  Switch,
} from "../../ui";

type Props = {
  attribute: Attribute;
  configuration: Configuration;
  updateConfiguration: React.Dispatch<Partial<Configuration>>;
  t: TFunction;
  i18n: i18n;
};

type PresetOption = {
  value: string;
  label: string;
  preset?: Attribute["options"][number]["advancedPreset"];
};

type SummaryItem = {
  colorPalette: string;
  key: string;
  label: string;
};

type SectionConfig = {
  colorPalette: string;
  hintKey: string;
  hintDefault: string;
  titleDefault: string;
  titleKey: string;
  type: AdvancedFinishingType;
};

const SIDE_LABEL_KEYS: Record<AdvancedEdgeSide, string> = {
  top: "product.finishing.sides.top",
  right: "product.finishing.sides.right",
  bottom: "product.finishing.sides.bottom",
  left: "product.finishing.sides.left",
};

const SIDE_DEFAULT: Record<AdvancedEdgeSide, string> = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

const SECTIONS: SectionConfig[] = [
  {
    type: "reinforcement",
    titleKey: "product.finishing.reinforcement",
    titleDefault: "Reinforcement",
    hintKey: "product.finishing.reinforcementHint",
    hintDefault: "Reinforce the selected edges.",
    colorPalette: "orange",
  },
  {
    type: "grommets",
    titleKey: "product.finishing.grommets",
    titleDefault: "Grommets",
    hintKey: "product.finishing.grommetsHint",
    hintDefault:
      "Add grommets on selected edges. Can be combined with reinforcement on the same edge or with cut to size.",
    colorPalette: "primary",
  },
  {
    type: "tunnel",
    titleKey: "product.finishing.tunnel",
    titleDefault: "Tunnel",
    hintKey: "product.finishing.tunnelHint",
    hintDefault:
      "Welded tunnel on selected edges. Cannot be combined with reinforcement or grommets on the same edge.",
    colorPalette: "purple",
  },
];

const EDGE_POSITION: Record<
  AdvancedEdgeSide,
  {
    bottom?: string;
    height?: string;
    left?: string;
    right?: string;
    top?: string;
    width?: string;
  }
> = {
  top: { top: "0", left: "0", right: "0", height: "10px" },
  bottom: { bottom: "0", left: "0", right: "0", height: "10px" },
  left: { top: "0", bottom: "0", left: "0", width: "10px" },
  right: { top: "0", bottom: "0", right: "0", width: "10px" },
};

const LABEL_POSITION: Record<
  AdvancedEdgeSide,
  {
    bottom?: string;
    left?: string;
    right?: string;
    top?: string;
    transform?: string;
  }
> = {
  top: { top: "-22px", left: "50%", transform: "translateX(-50%)" },
  bottom: { bottom: "-22px", left: "50%", transform: "translateX(-50%)" },
  left: {
    left: "-8px",
    top: "50%",
    transform: "translate(100%, -50%)",
  },
  right: {
    right: "-14px",
    top: "50%",
    transform: "translate(-100%, -50%)",
  },
};

function getSideLabel(side: AdvancedEdgeSide, t: TFunction) {
  return t(SIDE_LABEL_KEYS[side], {
    defaultValue: SIDE_DEFAULT[side],
  });
}

function formatSelectedSides(sides: AdvancedEdgeSide[], t: TFunction) {
  return sides.map((side) => getSideLabel(side, t)).join(", ");
}

function EdgeDiagram({
  type,
  selection,
  colorPalette,
  disabled = false,
  onToggle,
  t,
}: {
  colorPalette: string;
  disabled?: boolean;
  onToggle: (side: AdvancedEdgeSide) => void;
  selection: AdvancedAttributeSelection;
  t: TFunction;
  type: AdvancedFinishingType;
}) {
  const isSelected = (side: AdvancedEdgeSide) => {
    if (type === "reinforcement") {
      return selection.reinforcementSides.includes(side);
    }
    if (type === "tunnel") {
      return selection.tunnelSides.includes(side);
    }
    return (selection.grommets?.sides ?? []).includes(side);
  };

  const isDisabled = (side: AdvancedEdgeSide) => {
    if (disabled) {
      return true;
    }
    if (type === "tunnel") {
      return (
        selection.reinforcementSides.includes(side) ||
        (selection.grommets?.sides ?? []).includes(side)
      );
    }
    return selection.tunnelSides.includes(side);
  };

  return (
    <Box
      position="relative"
      w="full"
      maxW="240px"
      aspectRatio="2 / 1"
      mx="auto"
      my={6}
      borderWidth="1px"
      borderColor="border.emphasized"
      borderRadius="sm"
      bg="bg.subtle"
    >
      {ADVANCED_EDGE_SIDES.map((side) => {
        const selected = isSelected(side);
        const sideDisabled = isDisabled(side);
        const bar = EDGE_POSITION[side];
        const label = LABEL_POSITION[side];

        return (
          <Box key={side}>
            <Box
              position="absolute"
              style={bar}
              role="button"
              aria-label={getSideLabel(side, t)}
              aria-pressed={selected}
              aria-disabled={sideDisabled}
              tabIndex={sideDisabled ? -1 : 0}
              cursor={sideDisabled ? "not-allowed" : "pointer"}
              opacity={sideDisabled ? 0.35 : 1}
              bg={selected ? `${colorPalette}.solid` : "border.emphasized"}
              transition="background 0.15s"
              _hover={
                sideDisabled
                  ? undefined
                  : {
                      bg: selected
                        ? `${colorPalette}.emphasized`
                        : `${colorPalette}.muted`,
                    }
              }
              onClick={() => {
                if (!sideDisabled) {
                  onToggle(side);
                }
              }}
              onKeyDown={(event) => {
                if (sideDisabled) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggle(side);
                }
              }}
            />
            <Text
              position="absolute"
              style={label}
              fontSize="xs"
              color={
                sideDisabled
                  ? "fg.subtle"
                  : selected
                    ? `${colorPalette}.fg`
                    : "fg.muted"
              }
              fontWeight={selected ? 600 : 400}
              whiteSpace="nowrap"
              pointerEvents="none"
            >
              {getSideLabel(side, t)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function FinishingSectionCard({
  disabled,
  onToggle,
  section,
  selection,
  t,
}: {
  disabled: boolean;
  onToggle: (side: AdvancedEdgeSide) => void;
  section: SectionConfig;
  selection: AdvancedAttributeSelection;
  t: TFunction;
}) {
  return (
    <Card.Root
      variant="outline"
      borderColor="border"
      opacity={disabled ? 0.65 : 1}
      h="full"
    >
      <Card.Body p={4} h="full">
        <VStack align="stretch" gap={2} h="full" justify="space-between">
          <Stack gap={1}>
            <Text
              fontSize="sm"
              fontWeight={600}
              color={`${section.colorPalette}.fg`}
              textAlign="center"
            >
              {t(section.titleKey, { defaultValue: section.titleDefault })}
            </Text>
            <Text fontSize="xs" color="fg.muted" textAlign="center">
              {t(section.hintKey, { defaultValue: section.hintDefault })}
            </Text>
            {disabled && (
              <Text fontSize="xs" color="fg.muted" textAlign="center">
                {t("product.finishing.unavailableWithCutToSize", {
                  defaultValue: "Unavailable while Cut to size is enabled.",
                })}
              </Text>
            )}
          </Stack>

          <EdgeDiagram
            type={section.type}
            selection={selection}
            colorPalette={section.colorPalette}
            disabled={disabled}
            onToggle={onToggle}
            t={t}
          />
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

export function AdvancedFinishingSelect({
  attribute,
  configuration,
  updateConfiguration,
  t,
}: Props) {
  const presetOptions: PresetOption[] = useMemo(
    () =>
      attribute.options.map((option) => ({
        value: String(option.value),
        label: option.label,
        preset: option.advancedPreset,
      })),
    [attribute.options],
  );

  const presetCollection = useMemo(
    () =>
      createListCollection({
        items: presetOptions.map((preset) => ({
          label: preset.label,
          value: preset.value,
        })),
      }),
    [presetOptions],
  );

  const defaultPresetValue =
    configuration.selectedAttributeOptions?.[attribute.id]?.toString() ||
    String(attribute.options[0]?.value ?? "custom");

  const customPresetValue =
    presetOptions.find((preset) => preset.value === "custom")?.value ||
    defaultPresetValue;

  const selectionFromConfig =
    configuration.advancedAttributeSelections?.[attribute.id];

  const [selection, setSelection] = useState<AdvancedAttributeSelection>(() =>
    normalizeAdvancedSelection(
      selectionFromConfig ??
        createSelectionFromPreset(
          presetOptions.find((preset) => preset.value === defaultPresetValue)
            ?.preset,
          defaultPresetValue,
        ),
    ),
  );
  const [activePreset, setActivePreset] = useState(defaultPresetValue);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const nextSelectedPreset =
      configuration.selectedAttributeOptions?.[attribute.id]?.toString() ||
      activePreset;
    const nextSelection =
      configuration.advancedAttributeSelections?.[attribute.id];

    if (nextSelection) {
      setSelection(normalizeAdvancedSelection(nextSelection));
    } else {
      const preset = presetOptions.find(
        (presetOption) => presetOption.value === nextSelectedPreset,
      );
      setSelection(
        createSelectionFromPreset(preset?.preset, nextSelectedPreset),
      );
    }
    setActivePreset(nextSelectedPreset);
  }, [
    activePreset,
    attribute.id,
    configuration.advancedAttributeSelections,
    configuration.selectedAttributeOptions,
    presetOptions,
  ]);

  const commitSelection = (
    nextSelection: AdvancedAttributeSelection,
    presetValue?: string,
  ) => {
    const targetPreset = presetValue ?? customPresetValue;
    const normalized = normalizeAdvancedSelection(nextSelection);

    setSelection(normalized);
    setActivePreset(targetPreset);
    updateConfiguration({
      selectedAttributeOptions: {
        ...configuration.selectedAttributeOptions,
        [attribute.id]: targetPreset,
      },
      advancedAttributeSelections: {
        ...configuration.advancedAttributeSelections,
        [attribute.id]: { ...normalized, preset: targetPreset },
      },
    });
  };

  const handlePresetSelect = (value: string) => {
    const preset = presetOptions.find((option) => option.value === value);
    if (!preset) {
      return;
    }
    commitSelection(
      createSelectionFromPreset(preset.preset, preset.value),
      preset.value,
    );
  };

  const handleToggleSide = (
    type: AdvancedFinishingType,
    side: AdvancedEdgeSide,
  ) => {
    commitSelection(toggleFinishingSide(selection, type, side));
  };

  const handleGrommetNumber = (
    key: "spacing" | "offsetStart" | "offsetEnd",
    value: number,
  ) => {
    if (Number.isNaN(value)) {
      return;
    }
    commitSelection(updateGrommets(selection, { [key]: value }));
  };

  const handleCutToSizeToggle = (enabled: boolean) => {
    commitSelection(setCutToSize(selection, enabled));
  };

  const selectedPresetValue = activePreset ? [activePreset] : [];
  const grommetsActive = hasAnyGrommets(selection);
  const summaryItems: SummaryItem[] = [
    selection.cutToSize
      ? {
          key: "cutToSize",
          colorPalette: "green",
          label: t("product.finishing.cutToSize", {
            defaultValue: "Cut to size",
          }),
        }
      : null,
    selection.reinforcementSides.length > 0
      ? {
          key: "reinforcement",
          colorPalette: "orange",
          label: `${t("product.finishing.reinforcement", {
            defaultValue: "Reinforcement",
          })}: ${formatSelectedSides(selection.reinforcementSides, t)}`,
        }
      : null,
    grommetsActive
      ? {
          key: "grommets",
          colorPalette: "primary",
          label: `${t("product.finishing.grommets", {
            defaultValue: "Grommets",
          })}: ${formatSelectedSides(selection.grommets?.sides ?? [], t)}`,
        }
      : null,
    selection.tunnelSides.length > 0
      ? {
          key: "tunnel",
          colorPalette: "purple",
          label: `${t("product.finishing.tunnel", {
            defaultValue: "Tunnel",
          })}: ${formatSelectedSides(selection.tunnelSides, t)}`,
        }
      : null,
  ].filter((item): item is SummaryItem => item !== null);

  const grommetsSummary = grommetsActive
    ? t("product.finishing.grommetsSummary", {
        defaultValue:
          "Spacing {{spacing}} cm • first corner {{offsetStart}} cm • last corner {{offsetEnd}} cm",
        spacing: selection.grommets?.spacing ?? 50,
        offsetStart: selection.grommets?.offsetStart ?? 0,
        offsetEnd: selection.grommets?.offsetEnd ?? 0,
      })
    : undefined;

  return (
    <VStack align="stretch" gap={3}>
      <HStack justify="space-between" align="end" gap={3} flexWrap="wrap">
        {presetOptions.length > 0 && (
          <Field.Root flex="1" minW="220px">
            <Field.Label>
              {t("product.finishing.preset", { defaultValue: "Preset" })}
            </Field.Label>
            <Select.Root
              collection={presetCollection}
              value={selectedPresetValue}
              positioning={{ sameWidth: true }}
              onValueChange={({ value }) => {
                const next = value[0];
                if (next) {
                  handlePresetSelect(next);
                }
              }}
              size="sm"
            >
              <Select.HiddenSelect />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText
                    placeholder={t("product.finishing.presetPlaceholder", {
                      defaultValue: "Choose preset…",
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
                    {presetCollection.items.map((item) => (
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
        )}

        <Dialog.Root
          size="xl"
          open={dialogOpen}
          onOpenChange={(details) => setDialogOpen(details.open)}
          motionPreset="slide-in-bottom"
          lazyMount
        >
          <Dialog.Trigger asChild>
            <Button colorPalette="primary" variant="subtle" size="sm">
              {summaryItems.length > 0
                ? t("product.finishing.edit", {
                    defaultValue: "Edit finishing",
                  })
                : t("product.finishing.configure", {
                    defaultValue: "Configure finishing",
                  })}
            </Button>
          </Dialog.Trigger>
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content mx={2} my={4}>
                <Dialog.Header>
                  <Dialog.Title>
                    {t("product.finishing.dialogTitle", {
                      defaultValue: "Advanced finishing",
                    })}
                  </Dialog.Title>
                  <Dialog.Description>
                    {t("product.finishing.dialogDescription", {
                      defaultValue:
                        "Choose the edge options that should be applied to this product. Cut to size clears reinforcement and tunnels, but can stay combined with grommets.",
                    })}
                  </Dialog.Description>
                </Dialog.Header>
                <Dialog.Body overscrollBehavior="contain">
                  <VStack align="stretch" gap={4}>
                    <Card.Root variant="outline" borderColor="border">
                      <Card.Body p={4}>
                        <Switch
                          checked={Boolean(selection.cutToSize)}
                          onCheckedChange={(event) =>
                            handleCutToSizeToggle(Boolean(event.checked))
                          }
                        >
                          <Stack gap={0}>
                            <Text fontSize="sm" fontWeight={600}>
                              {t("product.finishing.cutToSize", {
                                defaultValue: "Cut to size",
                              })}
                            </Text>
                            <Text fontSize="sm" color="fg.muted">
                              {t("product.finishing.cutToSizeHint", {
                                defaultValue:
                                  "Trim all edges to the final size. This removes reinforcement and tunnels, but grommets can stay enabled.",
                              })}
                            </Text>
                          </Stack>
                        </Switch>
                      </Card.Body>
                    </Card.Root>

                    <SimpleGrid columns={{ base: 1, lg: 3 }} gap={3}>
                      {SECTIONS.map((section) => (
                        <FinishingSectionCard
                          key={section.type}
                          disabled={
                            Boolean(selection.cutToSize) &&
                            section.type !== "grommets"
                          }
                          onToggle={(side) =>
                            handleToggleSide(section.type, side)
                          }
                          section={section}
                          selection={selection}
                          t={t}
                        />
                      ))}
                    </SimpleGrid>

                    <Card.Root variant="outline" borderColor="border">
                      <Card.Body p={4}>
                        <VStack align="stretch" gap={3}>
                          <Stack gap={1}>
                            <Text fontSize="sm" fontWeight={600}>
                              {t("product.finishing.grommetsSettings", {
                                defaultValue:
                                  "Grommet spacing & corner distances",
                              })}
                            </Text>
                            <Text fontSize="xs" color="fg.muted">
                              {t("product.finishing.grommetsHint", {
                                defaultValue:
                                  "Add grommets on selected edges. Can be combined with reinforcement on the same edge or with cut to size.",
                              })}
                            </Text>
                          </Stack>

                          {grommetsActive ? (
                            <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
                              <Field.Root>
                                <Field.Label fontSize="xs">
                                  {t("product.finishing.grommetsSpacing", {
                                    defaultValue: "Spacing (cm)",
                                  })}
                                </Field.Label>
                                <NumberInputRoot
                                  size="sm"
                                  value={
                                    selection.grommets?.spacing?.toString() ??
                                    "50"
                                  }
                                  min={1}
                                  onValueChange={({ value }) =>
                                    handleGrommetNumber(
                                      "spacing",
                                      Number(value),
                                    )
                                  }
                                >
                                  <NumberInputField />
                                </NumberInputRoot>
                                <Field.HelperText>
                                  {t("product.finishing.grommetsSpacingHint", {
                                    defaultValue:
                                      "Distance between consecutive grommets on each selected edge.",
                                  })}
                                </Field.HelperText>
                              </Field.Root>

                              <Field.Root>
                                <Field.Label fontSize="xs">
                                  {t("product.finishing.grommetsOffsetStart", {
                                    defaultValue:
                                      "Distance from first corner (cm)",
                                  })}
                                </Field.Label>
                                <NumberInputRoot
                                  size="sm"
                                  value={
                                    selection.grommets?.offsetStart?.toString() ??
                                    "0"
                                  }
                                  min={0}
                                  onValueChange={({ value }) =>
                                    handleGrommetNumber(
                                      "offsetStart",
                                      Number(value),
                                    )
                                  }
                                >
                                  <NumberInputField />
                                </NumberInputRoot>
                                <Field.HelperText>
                                  {t(
                                    "product.finishing.grommetsOffsetStartHint",
                                    {
                                      defaultValue:
                                        "Leaves free space before the first grommet on each selected edge.",
                                    },
                                  )}
                                </Field.HelperText>
                              </Field.Root>

                              <Field.Root>
                                <Field.Label fontSize="xs">
                                  {t("product.finishing.grommetsOffsetEnd", {
                                    defaultValue:
                                      "Distance from last corner (cm)",
                                  })}
                                </Field.Label>
                                <NumberInputRoot
                                  size="sm"
                                  value={
                                    selection.grommets?.offsetEnd?.toString() ??
                                    "0"
                                  }
                                  min={0}
                                  onValueChange={({ value }) =>
                                    handleGrommetNumber(
                                      "offsetEnd",
                                      Number(value),
                                    )
                                  }
                                >
                                  <NumberInputField />
                                </NumberInputRoot>
                                <Field.HelperText>
                                  {t(
                                    "product.finishing.grommetsOffsetEndHint",
                                    {
                                      defaultValue:
                                        "Leaves free space after the last grommet on each selected edge.",
                                    },
                                  )}
                                </Field.HelperText>
                              </Field.Root>
                            </SimpleGrid>
                          ) : (
                            <Text fontSize="sm" color="fg.muted">
                              {t("product.finishing.grommetsSettingsEmpty", {
                                defaultValue:
                                  "Select at least one grommet edge to adjust spacing and corner distances.",
                              })}
                            </Text>
                          )}
                        </VStack>
                      </Card.Body>
                    </Card.Root>
                  </VStack>
                </Dialog.Body>
                <Dialog.Footer>
                  <Button onClick={() => setDialogOpen(false)}>
                    {t("common.close", { defaultValue: "Close" })}
                  </Button>
                </Dialog.Footer>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      </HStack>

      <Card.Root variant="outline" borderColor="border">
        <Card.Body p={3}>
          <Stack gap={2}>
            <Text fontSize="sm" fontWeight={600}>
              {t("product.finishing.currentConfiguration", {
                defaultValue: "Current configuration",
              })}
            </Text>

            {summaryItems.length > 0 ? (
              <HStack gap={2} flexWrap="wrap">
                {summaryItems.map((item) => (
                  <Badge
                    key={item.key}
                    colorPalette={item.colorPalette}
                    variant="surface"
                    whiteSpace="normal"
                  >
                    {item.label}
                  </Badge>
                ))}
              </HStack>
            ) : (
              <Text fontSize="sm" color="fg.muted">
                {t("product.finishing.noneSelected", {
                  defaultValue: "No finishing selected",
                })}
              </Text>
            )}

            {grommetsSummary && (
              <Text fontSize="xs" color="fg.muted">
                {grommetsSummary}
              </Text>
            )}
          </Stack>
        </Card.Body>
      </Card.Root>
    </VStack>
  );
}
