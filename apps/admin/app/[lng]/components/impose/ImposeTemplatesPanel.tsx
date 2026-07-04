import { useT } from "@/i18n/client";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  resolveImpositionSourceSizing,
  supportsManualSourceSizing,
} from "@/lib/imposition/source-sizing";
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  EmptyState,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Portal,
  ScrollArea,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  DataListItem,
  DataListRoot,
  MaterialSymbol,
  ToggleTip,
} from "@konfi/components";
import { CreateImpositionWorkflow, layoutType } from "@konfi/types";
import { useMemo, useState } from "react";

interface ImposeTemplatesPanelProps {
  templates: CreateImpositionWorkflow[];
  isLoading: boolean;
  onLoadTemplate: (impositionWorkflow: CreateImpositionWorkflow) => void;
  onRemoveTemplate: (id: string) => void | Promise<void>;
}

function getDimensionsLabel(width?: number, height?: number) {
  if (typeof width !== "number" || typeof height !== "number") {
    return undefined;
  }

  return `${width} x ${height} mm`;
}

function getItemSizeLabel(template: CreateImpositionWorkflow) {
  if (template.customItemSize) {
    return (
      getDimensionsLabel(
        template.customItemSizeWidth,
        template.customItemSizeHeight,
      ) ?? template.itemSizeName
    );
  }

  return (
    template.itemSizeName ??
    getDimensionsLabel(
      template.customItemSizeWidth,
      template.customItemSizeHeight,
    )
  );
}

function getSheetSizeLabel(template: CreateImpositionWorkflow) {
  if (template.customSheetSize) {
    return (
      getDimensionsLabel(
        template.customSheetSizeWidth,
        template.customSheetSizeHeight,
      ) ?? template.sheetSizeName
    );
  }

  return (
    template.sheetSizeName ??
    getDimensionsLabel(
      template.customSheetSizeWidth,
      template.customSheetSizeHeight,
    )
  );
}

function getSpacingLabel(values?: number[]) {
  if (!values || values.length === 0) {
    return "-";
  }

  return values.join(", ");
}

function TemplateDetails({
  impositionWorkflow,
}: {
  impositionWorkflow: CreateImpositionWorkflow;
}) {
  const { t } = useT(["impose", "translation"]);

  return (
    <DataListRoot orientation={"horizontal"} minW={"sm"} p={"4"}>
      <DataListItem
        grow
        label={t("impose.template.itemSize")}
        value={getItemSizeLabel(impositionWorkflow) ?? "-"}
      />
      <DataListItem
        grow
        label={t("impose.labels.sheetSize", { defaultValue: "Sheet size" })}
        value={getSheetSizeLabel(impositionWorkflow) ?? "-"}
      />
      <DataListItem
        grow
        label={t("impose.template.itemOrientation")}
        value={impositionWorkflow.itemOrientation}
      />
      <DataListItem
        grow
        label={t("impose.template.automaticHorizontalElements")}
        value={
          impositionWorkflow.automaticNumberOfHorizontalItems
            ? t("impose.template.automatically")
            : impositionWorkflow.numItemsHorizontal
        }
      />
      <DataListItem
        grow
        label={t("impose.template.verticalElements")}
        value={
          impositionWorkflow.automaticNumberOfVerticalItems
            ? t("impose.template.automatically")
            : impositionWorkflow.numItemsVertical
        }
      />
      <DataListItem
        grow
        label={t("impose.template.horizontalSpacing")}
        value={
          impositionWorkflow.automaticSpacingHorizontal
            ? t("impose.template.automatically")
            : getSpacingLabel(impositionWorkflow.spacingHorizontal)
        }
      />
      <DataListItem
        grow
        label={t("impose.template.verticalSpacing")}
        value={
          impositionWorkflow.automaticSpacingVertical
            ? t("impose.template.automatically")
            : getSpacingLabel(impositionWorkflow.spacingVertical)
        }
      />
      <DataListItem
        grow
        label={t("impose.template.bleed")}
        value={impositionWorkflow.bleed}
      />
      <DataListItem
        grow
        label={t("impose.template.bleedType")}
        value={impositionWorkflow.bleedType}
      />
      {supportsManualSourceSizing(impositionWorkflow.bleedType) && (
        <DataListItem
          grow
          label={t("impose.template.sourceSizing")}
          value={t(
            `SourceSizing.${resolveImpositionSourceSizing({
              bleedType: impositionWorkflow.bleedType,
              sourceSizing: impositionWorkflow.sourceSizing,
            })}`,
          )}
        />
      )}
      <DataListItem
        grow
        label={t("impose.template.cropMarks")}
        value={
          impositionWorkflow.cropMarks
            ? t("impose.template.yes")
            : t("impose.template.no")
        }
      />
      <DataListItem
        grow
        label={t("impose.template.impositionType")}
        value={
          impositionWorkflow.layout
            ? t(`LayoutType.${impositionWorkflow.layout}`)
            : "-"
        }
      />
      {impositionWorkflow.layout === layoutType.BOOKLET && (
        <>
          <DataListItem
            grow
            label={t("impose.template.pagesPerSheet")}
            value={impositionWorkflow.pagesPerSignature}
          />
          <DataListItem
            grow
            label={t("impose.template.bindingEdge")}
            value={impositionWorkflow.bindingEdge}
          />
        </>
      )}
    </DataListRoot>
  );
}

export function ImposeTemplatesPanel({
  templates,
  isLoading,
  onLoadTemplate,
  onRemoveTemplate,
}: ImposeTemplatesPanelProps) {
  const { t } = useT(["impose", "translation"]);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTemplates = useMemo(() => {
    return filterLocalFuseItems(templates, searchTerm, {
      keys: [
        { name: "name", weight: 0.55 },
        { name: "itemSizeName", weight: 0.15 },
        { name: "sheetSizeName", weight: 0.15 },
        { name: "layout", weight: 0.1 },
        { name: "bleedType", weight: 0.05 },
      ],
      threshold: 0.36,
    });
  }, [searchTerm, templates]);

  const hasSearchQuery = searchTerm.trim().length > 0;

  return (
    <Card.Root
      size={"sm"}
      rounded={"2xl"}
      overflow={"hidden"}
      h={"full"}
      minH={0}
      minW={0}
      w={"full"}
      flex={1}
      display={"flex"}
      flexDirection={"column"}
    >
      <Card.Header>
        <HStack justify={"space-between"} align={"start"} gap={4}>
          <VStack align={"start"} gap={1}>
            <Card.Title fontSize="lg">
              {t("templates", { defaultValue: "Templates" })}
            </Card.Title>
            <Text
              mb={2}
              fontSize={"sm"}
              color={{ base: "gray.600", _dark: "gray.400" }}
            >
              {t("impose.savedTemplatesDescription", {
                defaultValue: "Load, inspect, or delete saved templates.",
              })}
            </Text>
          </VStack>
          <Badge colorPalette={"primary"}>{templates.length}</Badge>
        </HStack>
      </Card.Header>
      <Card.Body pt={0} flex={1} minH={0} w={"full"}>
        <VStack align={"stretch"} gap={4} flex={1} minH={0}>
          <InputGroup startElement={<MaterialSymbol>search</MaterialSymbol>}>
            <Input
              aria-label={t("impose.searchTemplates", {
                defaultValue: "Search templates…",
              })}
              autoComplete={"off"}
              name={"templateSearch"}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              placeholder={t("impose.searchTemplates", {
                defaultValue: "Search templates…",
              })}
            />
          </InputGroup>
          <Skeleton
            loading={isLoading}
            display={"flex"}
            flexDirection={"column"}
            flex={1}
            minH={0}
            w={"full"}
          >
            {filteredTemplates.length === 0 ? (
              <Box py={6}>
                <EmptyState.Root>
                  <EmptyState.Content>
                    <EmptyState.Indicator>
                      <MaterialSymbol fontSize={40}>
                        {hasSearchQuery ? "search_off" : "view_module"}
                      </MaterialSymbol>
                    </EmptyState.Indicator>
                    <EmptyState.Title>
                      {hasSearchQuery
                        ? t("impose.noTemplateResultsTitle", {
                            defaultValue: "No Matching Templates",
                          })
                        : t("impose.noTemplatesTitle", {
                            defaultValue: "No Templates Yet",
                          })}
                    </EmptyState.Title>
                    <EmptyState.Description>
                      {hasSearchQuery
                        ? t("impose.noTemplateResultsDescription", {
                            defaultValue: "Try a different search phrase.",
                          })
                        : t("impose.noTemplatesDescription", {
                            defaultValue:
                              "Save a template from the form to reuse imposition settings.",
                          })}
                    </EmptyState.Description>
                  </EmptyState.Content>
                </EmptyState.Root>
              </Box>
            ) : (
              <ScrollArea.Root flex={1} minH={0}>
                <ScrollArea.Viewport h={"full"}>
                  <ScrollArea.Content>
                    <VStack align={"stretch"} gap={2}>
                      {filteredTemplates.map((impositionWorkflow) => {
                        const itemSizeLabel =
                          getItemSizeLabel(impositionWorkflow);
                        const sheetSizeLabel =
                          getSheetSizeLabel(impositionWorkflow);
                        const layoutLabel = impositionWorkflow.layout
                          ? t(`LayoutType.${impositionWorkflow.layout}`)
                          : undefined;

                        return (
                          <Card.Root
                            size={"sm"}
                            variant={"outline"}
                            rounded={"xl"}
                            key={impositionWorkflow.id}
                            w={"full"}
                          >
                            <Card.Body p={2.5} gap={1.5}>
                              <HStack
                                justify={"space-between"}
                                align={"center"}
                                gap={2}
                              >
                                <Card.Title
                                  fontSize="sm"
                                  lineClamp={1}
                                  flex="1"
                                  minW={0}
                                >
                                  {impositionWorkflow.name}
                                </Card.Title>
                                <HStack gap={1} flexShrink={0}>
                                  <ToggleTip
                                    size={"sm"}
                                    content={
                                      <TemplateDetails
                                        impositionWorkflow={impositionWorkflow}
                                      />
                                    }
                                  >
                                    <IconButton
                                      size={"xs"}
                                      variant={"ghost"}
                                      aria-label={t("common.info", {
                                        defaultValue: "Information",
                                      })}
                                    >
                                      <MaterialSymbol>info</MaterialSymbol>
                                    </IconButton>
                                  </ToggleTip>
                                  <Dialog.Root role={"alertdialog"}>
                                    <Dialog.Trigger asChild>
                                      <IconButton
                                        size={"xs"}
                                        variant={"ghost"}
                                        colorPalette={"red"}
                                        aria-label={t("impose.delete", {
                                          defaultValue: "Delete",
                                        })}
                                      >
                                        <MaterialSymbol>delete</MaterialSymbol>
                                      </IconButton>
                                    </Dialog.Trigger>
                                    <Portal>
                                      <Dialog.Backdrop />
                                      <Dialog.Positioner>
                                        <Dialog.Content>
                                          <Dialog.Header>
                                            <Dialog.Title>
                                              {t("impose.deleteTemplateTitle", {
                                                defaultValue:
                                                  "Are you sure you want to delete the template?",
                                              })}
                                            </Dialog.Title>
                                          </Dialog.Header>
                                          <Dialog.Body>
                                            <Text>
                                              {t(
                                                "impose.deleteTemplateDescription",
                                                {
                                                  defaultValue:
                                                    "This action cannot be undone. The template will be permanently deleted.",
                                                },
                                              )}
                                            </Text>
                                          </Dialog.Body>
                                          <Dialog.Footer>
                                            <Dialog.ActionTrigger asChild>
                                              <Button variant={"ghost"}>
                                                {t("common.cancel", {
                                                  defaultValue: "Cancel",
                                                })}
                                              </Button>
                                            </Dialog.ActionTrigger>
                                            <Dialog.ActionTrigger asChild>
                                              <Button
                                                colorPalette={"red"}
                                                onClick={() =>
                                                  onRemoveTemplate(
                                                    impositionWorkflow.id,
                                                  )
                                                }
                                              >
                                                {t("impose.delete", {
                                                  defaultValue: "Delete",
                                                })}
                                              </Button>
                                            </Dialog.ActionTrigger>
                                          </Dialog.Footer>
                                        </Dialog.Content>
                                      </Dialog.Positioner>
                                    </Portal>
                                  </Dialog.Root>
                                  <Button
                                    size={"xs"}
                                    colorPalette={"primary"}
                                    onClick={() =>
                                      onLoadTemplate(impositionWorkflow)
                                    }
                                  >
                                    {t("actions.loadTemplate", {
                                      defaultValue: "Load",
                                    })}
                                  </Button>
                                </HStack>
                              </HStack>
                              {(itemSizeLabel ||
                                sheetSizeLabel ||
                                layoutLabel) && (
                                <HStack gap={1} flexWrap={"wrap"}>
                                  {itemSizeLabel && (
                                    <Badge size={"xs"}>{itemSizeLabel}</Badge>
                                  )}
                                  {sheetSizeLabel && (
                                    <Badge size={"xs"} variant={"outline"}>
                                      {sheetSizeLabel}
                                    </Badge>
                                  )}
                                  {layoutLabel && (
                                    <Badge
                                      size={"xs"}
                                      colorPalette={"purple"}
                                    >
                                      {layoutLabel}
                                    </Badge>
                                  )}
                                </HStack>
                              )}
                            </Card.Body>
                          </Card.Root>
                        );
                      })}
                    </VStack>
                  </ScrollArea.Content>
                  <ScrollArea.Scrollbar />
                </ScrollArea.Viewport>
              </ScrollArea.Root>
            )}
          </Skeleton>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
