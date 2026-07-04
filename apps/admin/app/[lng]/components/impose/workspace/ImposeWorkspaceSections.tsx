"use client";

import { useT } from "@/i18n/client";
import {
  resolveImpositionSourceSizing,
  supportsManualSourceSizing,
} from "@/lib/imposition/source-sizing";
import {
  Box,
  Button,
  HStack,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Checkbox, MaterialSymbol, Switch } from "@konfi/components";
import {
  duplexMode,
  layoutType,
  type CreateImpositionWorkflow,
  type SelectOption,
} from "@konfi/types";
import type { ReactNode } from "react";
import { useWatch } from "react-hook-form";
import {
  setImposeFormValue,
  type ImposeFormMethods,
  type ImposeFormValues,
} from "../impose-form";
import { ImposeTemplatesPanel } from "../ImposeTemplatesPanel";
import { NumberField, SelectField } from "./controls";

function SectionSwitch({
  checked,
  children,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Switch
      size="sm"
      colorPalette="primary"
      display="flex"
      alignItems="center"
      gap={2}
      checked={checked}
      onCheckedChange={({ checked: nextChecked }) =>
        onChange(Boolean(nextChecked))
      }
    >
      <Text as="span" fontSize="sm" lineHeight="1">
        {children}
      </Text>
    </Switch>
  );
}

export function LayoutSection({
  methods,
  layoutOptions,
  orientationOptions,
}: {
  methods: ImposeFormMethods;
  layoutOptions: SelectOption[];
  orientationOptions: SelectOption[];
}) {
  const { t } = useT(["impose", "translation"]);
  const {
    layout,
    automaticNumberOfHorizontalItems,
    automaticNumberOfVerticalItems,
    automaticSheetOrientation,
    automaticItemOrientation,
    sheetOrientation,
    itemOrientation,
    numItemsHorizontal,
    numItemsVertical,
  } = useWatch({ control: methods.control });

  return (
    <VStack align="stretch" gap={3}>
      <SelectField
        label={t("forms.impose.labels.layout", {
          defaultValue: "Layout",
        })}
        value={layout}
        placeholder={t("forms.impose.labels.layout", {
          defaultValue: "Layout",
        })}
        options={layoutOptions}
        width="100%"
        onChange={(value) =>
          setImposeFormValue(
            methods,
            "layout",
            value as ImposeFormValues["layout"],
          )
        }
      />
      <SectionSwitch
        checked={Boolean(automaticNumberOfHorizontalItems)}
        onChange={(checked) =>
          setImposeFormValue(
            methods,
            "automaticNumberOfHorizontalItems",
            checked,
          )
        }
      >
        {t("impose.workspace.autoAcross", {
          defaultValue: "Auto across",
        })}
      </SectionSwitch>
      {!automaticNumberOfHorizontalItems && (
        <NumberField
          label={t("impose.workspace.itemsAcross", {
            defaultValue: "Items across",
          })}
          value={numItemsHorizontal}
          min={1}
          step={1}
          width="100%"
          onChange={(value) =>
            setImposeFormValue(
              methods,
              "numItemsHorizontal",
              value === undefined ? undefined : Math.max(1, Math.round(value)),
            )
          }
        />
      )}
      <SectionSwitch
        checked={Boolean(automaticNumberOfVerticalItems)}
        onChange={(checked) =>
          setImposeFormValue(methods, "automaticNumberOfVerticalItems", checked)
        }
      >
        {t("impose.workspace.autoDown", {
          defaultValue: "Auto down",
        })}
      </SectionSwitch>
      {!automaticNumberOfVerticalItems && (
        <NumberField
          label={t("impose.workspace.itemsDown", {
            defaultValue: "Items down",
          })}
          value={numItemsVertical}
          min={1}
          step={1}
          width="100%"
          onChange={(value) =>
            setImposeFormValue(
              methods,
              "numItemsVertical",
              value === undefined ? undefined : Math.max(1, Math.round(value)),
            )
          }
        />
      )}
      {!automaticSheetOrientation && (
        <SelectField
          label={t("forms.impose.labels.sheetOrientation", {
            defaultValue: "Sheet orientation",
          })}
          value={sheetOrientation}
          placeholder={t("forms.impose.labels.sheetOrientation", {
            defaultValue: "Sheet orientation",
          })}
          options={orientationOptions}
          width="100%"
          onChange={(value) =>
            setImposeFormValue(
              methods,
              "sheetOrientation",
              value as ImposeFormValues["sheetOrientation"],
            )
          }
        />
      )}
      {!automaticItemOrientation && (
        <SelectField
          label={t("forms.impose.labels.itemOrientation", {
            defaultValue: "Item orientation",
          })}
          value={itemOrientation}
          placeholder={t("forms.impose.labels.itemOrientation", {
            defaultValue: "Item orientation",
          })}
          options={orientationOptions}
          width="100%"
          onChange={(value) =>
            setImposeFormValue(
              methods,
              "itemOrientation",
              value as ImposeFormValues["itemOrientation"],
            )
          }
        />
      )}
    </VStack>
  );
}

export function SpacingSection({ methods }: { methods: ImposeFormMethods }) {
  const { t } = useT(["impose", "translation"]);
  const {
    automaticSpacingHorizontal,
    automaticSpacingVertical,
    spacingHorizontal,
    spacingVertical,
  } = useWatch({ control: methods.control });

  return (
    <VStack align="stretch" gap={3}>
      <SectionSwitch
        checked={Boolean(automaticSpacingHorizontal)}
        onChange={(checked) =>
          setImposeFormValue(methods, "automaticSpacingHorizontal", checked)
        }
      >
        {t("impose.workspace.autoHorizontalSpacing", {
          defaultValue: "Auto horizontal spacing",
        })}
      </SectionSwitch>
      <SectionSwitch
        checked={Boolean(automaticSpacingVertical)}
        onChange={(checked) =>
          setImposeFormValue(methods, "automaticSpacingVertical", checked)
        }
      >
        {t("impose.workspace.autoVerticalSpacing", {
          defaultValue: "Auto vertical spacing",
        })}
      </SectionSwitch>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setImposeFormValue(methods, "automaticSpacingHorizontal", false);
          setImposeFormValue(methods, "automaticSpacingVertical", false);
          setImposeFormValue(methods, "spacingHorizontal", "");
          setImposeFormValue(methods, "spacingVertical", "");
        }}
      >
        <MaterialSymbol>restart_alt</MaterialSymbol>
        {t("impose.workspace.resetSpacing", {
          defaultValue: "Reset spacing",
        })}
      </Button>
      <Text fontSize="sm" color={{ base: "gray.600", _dark: "gray.400" }}>
        {t("impose.workspace.horizontalSpacingBadge", {
          defaultValue: "H spacing: {{value}}",
          value: spacingHorizontal || "0",
        })}
        {" · "}
        {t("impose.workspace.verticalSpacingBadge", {
          defaultValue: "V spacing: {{value}}",
          value: spacingVertical || "0",
        })}
      </Text>
    </VStack>
  );
}

export function FinishingSection({
  methods,
  duplexOptions,
  backRotationOptions,
}: {
  methods: ImposeFormMethods;
  duplexOptions: SelectOption[];
  backRotationOptions: SelectOption[];
}) {
  const { t } = useT(["impose", "translation"]);
  const {
    duplexMode: currentDuplexMode,
    backPageRotation,
    frontBackAlignment,
    mirrorBack,
  } = useWatch({ control: methods.control });

  return (
    <VStack align="stretch" gap={3}>
      <SelectField
        label={t("forms.impose.labels.duplexMode", {
          defaultValue: "Duplex mode",
        })}
        value={currentDuplexMode}
        placeholder={t("forms.impose.labels.duplexMode", {
          defaultValue: "Duplex mode",
        })}
        options={duplexOptions}
        width="100%"
        onChange={(value) =>
          setImposeFormValue(
            methods,
            "duplexMode",
            value as ImposeFormValues["duplexMode"],
          )
        }
      />
      {currentDuplexMode !== duplexMode.SIMPLEX && (
        <>
          <SelectField
            label={t("forms.impose.labels.backPageRotation", {
              defaultValue: "Back page rotation",
            })}
            value={backPageRotation}
            placeholder={t("forms.impose.labels.backPageRotation", {
              defaultValue: "Back page rotation",
            })}
            options={backRotationOptions}
            width="100%"
            onChange={(value) =>
              setImposeFormValue(
                methods,
                "backPageRotation",
                value as ImposeFormValues["backPageRotation"],
              )
            }
          />
          <SectionSwitch
            checked={Boolean(frontBackAlignment)}
            onChange={(checked) =>
              setImposeFormValue(methods, "frontBackAlignment", checked)
            }
          >
            {t("forms.impose.labels.frontBackAlignment", {
              defaultValue: "Front back alignment",
            })}
          </SectionSwitch>
          <SectionSwitch
            checked={Boolean(mirrorBack)}
            onChange={(checked) =>
              setImposeFormValue(methods, "mirrorBack", checked)
            }
          >
            {t("forms.impose.labels.mirrorBack", {
              defaultValue: "Mirror back",
            })}
          </SectionSwitch>
        </>
      )}
    </VStack>
  );
}

export function BleedSizingSection({
  methods,
  bleedOptions,
  sourceSizingOptions,
}: {
  methods: ImposeFormMethods;
  bleedOptions: SelectOption[];
  sourceSizingOptions: SelectOption[];
}) {
  const { t } = useT(["impose", "translation"]);
  const { bleed, bleedType, sourceSizing, cropMarks } = useWatch({
    control: methods.control,
  });

  return (
    <VStack align="stretch" gap={3}>
      <NumberField
        label={t("forms.impose.labels.bleed", {
          defaultValue: "Bleed",
        })}
        value={bleed}
        min={0}
        step={0.5}
        width="100%"
        onChange={(value) => setImposeFormValue(methods, "bleed", value ?? 0)}
      />
      <SelectField
        label={t("forms.impose.labels.bleedType", {
          defaultValue: "Bleed type",
        })}
        value={bleedType}
        placeholder={t("forms.impose.labels.bleedType", {
          defaultValue: "Bleed type",
        })}
        options={bleedOptions}
        width="100%"
        onChange={(value) =>
          setImposeFormValue(
            methods,
            "bleedType",
            value as ImposeFormValues["bleedType"],
          )
        }
      />
      {supportsManualSourceSizing(bleedType) && (
        <SelectField
          label={t("forms.impose.labels.sourceSizing", {
            defaultValue: "Source sizing",
          })}
          value={resolveImpositionSourceSizing({ bleedType, sourceSizing })}
          placeholder={t("forms.impose.labels.sourceSizing", {
            defaultValue: "Source sizing",
          })}
          options={sourceSizingOptions}
          width="100%"
          onChange={(value) =>
            setImposeFormValue(
              methods,
              "sourceSizing",
              value as ImposeFormValues["sourceSizing"],
            )
          }
        />
      )}
      <SectionSwitch
        checked={Boolean(cropMarks)}
        onChange={(checked) =>
          setImposeFormValue(methods, "cropMarks", checked)
        }
      >
        {t("forms.impose.labels.cropMarks", {
          defaultValue: "Crop marks",
        })}
      </SectionSwitch>
    </VStack>
  );
}

export function SettingsSection({
  methods,
  paperSizeOptions,
  orientationOptions,
  bindingOptions,
}: {
  methods: ImposeFormMethods;
  paperSizeOptions: SelectOption[];
  orientationOptions: SelectOption[];
  bindingOptions: SelectOption[];
}) {
  const { t } = useT(["impose", "translation"]);
  const {
    customSheetSize,
    automaticSheetOrientation,
    sheetSizeName,
    sheetOrientation,
    customSheetSizeWidth,
    customSheetSizeHeight,
    customItemSize,
    automaticItemOrientation,
    itemSizeName,
    itemOrientation,
    customItemSizeWidth,
    customItemSizeHeight,
    layout,
    pagesPerSignature,
    bindingEdge,
  } = useWatch({ control: methods.control });

  return (
    <VStack align="stretch" gap={4}>
      {/* Sheet group */}
      <Box
        p={3}
        borderWidth="1px"
        borderRadius="xl"
        bg={{ base: "gray.50", _dark: "gray.900" }}
      >
        <VStack align="stretch" gap={3}>
          <Text fontWeight="semibold" fontSize="sm">
            {t("impose.workspace.sheetSettings", {
              defaultValue: "Sheet",
            })}
          </Text>
          <Checkbox
            checked={Boolean(customSheetSize)}
            onCheckedChange={({ checked }) => {
              setImposeFormValue(methods, "customSheetSize", Boolean(checked));
            }}
          >
            {t("forms.impose.labels.customSheetSize", {
              defaultValue: "Custom sheet size",
            })}
          </Checkbox>
          <Checkbox
            checked={Boolean(automaticSheetOrientation)}
            onCheckedChange={({ checked }) => {
              setImposeFormValue(
                methods,
                "automaticSheetOrientation",
                Boolean(checked),
              );
            }}
          >
            {t("forms.impose.labels.automaticSheetOrientation", {
              defaultValue: "Automatic sheet orientation",
            })}
          </Checkbox>
          {customSheetSize ? (
            <SimpleGrid columns={2} gap={2} minW={0} w="full">
              <NumberField
                label={t("forms.impose.labels.sheetWidth", {
                  defaultValue: "Sheet width",
                })}
                value={customSheetSizeWidth}
                width="100%"
                onChange={(value) =>
                  setImposeFormValue(methods, "customSheetSizeWidth", value)
                }
              />
              <NumberField
                label={t("forms.impose.labels.sheetHeight", {
                  defaultValue: "Sheet height",
                })}
                value={customSheetSizeHeight}
                width="100%"
                onChange={(value) =>
                  setImposeFormValue(methods, "customSheetSizeHeight", value)
                }
              />
            </SimpleGrid>
          ) : (
            <SelectField
              label={t("forms.impose.labels.sheetSize", {
                defaultValue: "Sheet size",
              })}
              value={sheetSizeName}
              placeholder={t("forms.impose.placeholders.selectSheetSize", {
                defaultValue: "Select sheet size...",
              })}
              options={paperSizeOptions}
              width="100%"
              onChange={(value) =>
                setImposeFormValue(
                  methods,
                  "sheetSizeName",
                  value as ImposeFormValues["sheetSizeName"],
                )
              }
            />
          )}
          {!automaticSheetOrientation && (
            <SelectField
              label={t("forms.impose.labels.sheetOrientation", {
                defaultValue: "Sheet orientation",
              })}
              value={sheetOrientation}
              placeholder={t(
                "forms.impose.placeholders.selectSheetOrientation",
                {
                  defaultValue: "Select sheet orientation...",
                },
              )}
              options={orientationOptions}
              width="100%"
              onChange={(value) =>
                setImposeFormValue(
                  methods,
                  "sheetOrientation",
                  value as ImposeFormValues["sheetOrientation"],
                )
              }
            />
          )}
        </VStack>
      </Box>

      {/* Item group */}
      <Box
        p={3}
        borderWidth="1px"
        borderRadius="xl"
        bg={{ base: "gray.50", _dark: "gray.900" }}
      >
        <VStack align="stretch" gap={3}>
          <Text fontWeight="semibold" fontSize="sm">
            {t("impose.workspace.itemSettings", {
              defaultValue: "Item",
            })}
          </Text>
          <Checkbox
            checked={Boolean(customItemSize)}
            onCheckedChange={({ checked }) => {
              setImposeFormValue(methods, "customItemSize", Boolean(checked));
            }}
          >
            {t("forms.impose.labels.customItemSize", {
              defaultValue: "Custom item size",
            })}
          </Checkbox>
          <Checkbox
            checked={Boolean(automaticItemOrientation)}
            onCheckedChange={({ checked }) => {
              setImposeFormValue(
                methods,
                "automaticItemOrientation",
                Boolean(checked),
              );
            }}
          >
            {t("forms.impose.labels.automaticItemOrientation", {
              defaultValue: "Automatic item orientation",
            })}
          </Checkbox>
          {customItemSize ? (
            <SimpleGrid columns={2} gap={2} minW={0} w="full">
              <NumberField
                label={t("forms.impose.labels.itemWidth", {
                  defaultValue: "Item width",
                })}
                value={customItemSizeWidth}
                width="100%"
                onChange={(value) =>
                  setImposeFormValue(methods, "customItemSizeWidth", value)
                }
              />
              <NumberField
                label={t("forms.impose.labels.itemHeight", {
                  defaultValue: "Item height",
                })}
                value={customItemSizeHeight}
                width="100%"
                onChange={(value) =>
                  setImposeFormValue(methods, "customItemSizeHeight", value)
                }
              />
            </SimpleGrid>
          ) : (
            <SelectField
              label={t("forms.impose.labels.itemSize", {
                defaultValue: "Item size",
              })}
              value={itemSizeName}
              placeholder={t("forms.impose.placeholders.selectItemSize", {
                defaultValue: "Select item size...",
              })}
              options={paperSizeOptions}
              width="100%"
              onChange={(value) =>
                setImposeFormValue(
                  methods,
                  "itemSizeName",
                  value as ImposeFormValues["itemSizeName"],
                )
              }
            />
          )}
          {!automaticItemOrientation && (
            <SelectField
              label={t("forms.impose.labels.itemOrientation", {
                defaultValue: "Item orientation",
              })}
              value={itemOrientation}
              placeholder={t(
                "forms.impose.placeholders.selectItemOrientation",
                {
                  defaultValue: "Select item orientation...",
                },
              )}
              options={orientationOptions}
              width="100%"
              onChange={(value) =>
                setImposeFormValue(
                  methods,
                  "itemOrientation",
                  value as ImposeFormValues["itemOrientation"],
                )
              }
            />
          )}
        </VStack>
      </Box>

      {/* Booklet group (conditional) */}
      {layout === layoutType.BOOKLET && (
        <Box
          p={3}
          borderWidth="1px"
          borderRadius="xl"
          bg={{ base: "gray.50", _dark: "gray.900" }}
        >
          <VStack align="stretch" gap={3}>
            <Text fontWeight="semibold" fontSize="sm">
              {t("impose.workspace.bookletSettings", {
                defaultValue: "Booklet",
              })}
            </Text>
            <NumberField
              label={t("forms.impose.labels.pagesPerSignature", {
                defaultValue: "Pages per signature",
              })}
              value={pagesPerSignature}
              min={4}
              step={4}
              width="100%"
              onChange={(value) =>
                setImposeFormValue(methods, "pagesPerSignature", value)
              }
            />
            <SelectField
              label={t("forms.impose.labels.bindingEdge", {
                defaultValue: "Binding edge",
              })}
              value={bindingEdge}
              placeholder={t("forms.impose.placeholders.selectBindingEdge", {
                defaultValue: "Select binding edge...",
              })}
              options={bindingOptions}
              width="100%"
              onChange={(value) =>
                setImposeFormValue(
                  methods,
                  "bindingEdge",
                  value as ImposeFormValues["bindingEdge"],
                )
              }
            />
          </VStack>
        </Box>
      )}
    </VStack>
  );
}

export function TemplatesSection({
  templates,
  isLoading,
  onLoadTemplate,
  onRemoveTemplate,
}: {
  templates: CreateImpositionWorkflow[];
  isLoading: boolean;
  onLoadTemplate: (impositionWorkflow: CreateImpositionWorkflow) => void;
  onRemoveTemplate: (id: string) => void | Promise<void>;
}) {
  return (
    <ImposeTemplatesPanel
      templates={templates}
      isLoading={isLoading}
      onLoadTemplate={onLoadTemplate}
      onRemoveTemplate={onRemoveTemplate}
    />
  );
}
