"use client";

import { useT } from "@/i18n/client";
import {
  stickerBleedFillMode,
  stickerCutShape,
  type StickerBleedFillMode,
  type StickerCutShape,
  type StickerImpositionItem,
} from "@/lib/sticker-imposition/types";
import {
  Badge,
  Box,
  Card,
  FileUpload,
  Grid,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  Field,
  MaterialSymbol,
  MiddleTruncatedText,
  Switch,
} from "@konfi/components";
import {
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
  IMPOSITION_SUPPORTED_FILE_TYPES,
  type SelectOption,
} from "@konfi/types";
import { useMemo } from "react";
import { NumberField, SelectField } from "../workspace/controls";
import { StickerCutLineSelectionDialog } from "./StickerCutLineSelectionDialog";

const STICKER_SUPPORTED_FILE_TYPES = [
  ...IMPOSITION_SUPPORTED_FILE_TYPES,
  "image/svg+xml",
  "image/webp",
] as const;

type StickerSourcesPanelProps = {
  files: File[];
  isMetadataLoading: boolean;
  items: StickerImpositionItem[];
  onFilesChange: (files: File[]) => void | Promise<void>;
  onItemChange: (itemId: string, patch: Partial<StickerImpositionItem>) => void;
  onItemSizeChange: (
    itemId: string,
    axis: "heightMm" | "widthMm",
    value: number,
  ) => void;
};

function hasSourceSize(item: StickerImpositionItem): boolean {
  return item.sourceWidthMm !== null && item.sourceHeightMm !== null;
}

function isPdfFile(file: File | undefined): file is File {
  if (!file) {
    return false;
  }

  const contentType = file.type.trim().toLowerCase();
  return (
    contentType === "application/pdf" ||
    contentType === "application/x-pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function formatMillimeters(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function resolveActualCutDimensions(item: StickerImpositionItem):
  | {
      diameterMm: number;
      kind: "circle";
    }
  | {
      heightMm: number;
      kind: "rectangle";
      widthMm: number;
    }
  | null {
  if ((item.selectedPdfCutLineIds?.length ?? 0) > 0) {
    return null;
  }

  if (item.cutShape === stickerCutShape.CIRCLE) {
    return {
      diameterMm: Math.max(
        1,
        Math.max(item.widthMm, item.heightMm) + 2 * item.cutOffsetMm,
      ),
      kind: "circle",
    };
  }

  if (item.cutShape !== stickerCutShape.RECTANGLE) {
    return null;
  }

  if (item.cutOffsetMm < 0) {
    const inset = Math.min(
      -item.cutOffsetMm,
      Math.max(0, item.widthMm - 1) / 2,
      Math.max(0, item.heightMm - 1) / 2,
    );

    return {
      heightMm: Math.max(1, item.heightMm - 2 * inset),
      kind: "rectangle",
      widthMm: Math.max(1, item.widthMm - 2 * inset),
    };
  }

  return {
    heightMm: item.heightMm + 2 * item.cutOffsetMm,
    kind: "rectangle",
    widthMm: item.widthMm + 2 * item.cutOffsetMm,
  };
}

export function StickerSourcesPanel({
  files,
  isMetadataLoading,
  items,
  onFilesChange,
  onItemChange,
  onItemSizeChange,
}: StickerSourcesPanelProps) {
  const { t } = useT(["impose", "translation"]);
  const cutShapeOptions = useMemo<SelectOption[]>(
    () => [
      {
        label: t("impose.stickers.cutShapes.rectangle", {
          defaultValue: "Rectangle",
        }),
        value: stickerCutShape.RECTANGLE,
      },
      {
        label: t("impose.stickers.cutShapes.circle", {
          defaultValue: "Circle",
        }),
        value: stickerCutShape.CIRCLE,
      },
      {
        label: t("impose.stickers.cutShapes.dieCut", {
          defaultValue: "Die-Cut",
        }),
        value: stickerCutShape.DIE_CUT,
      },
      {
        label: t("impose.stickers.cutShapes.readySheet", {
          defaultValue: "Ready Sheet",
        }),
        value: stickerCutShape.READY_SHEET,
      },
    ],
    [t],
  );
  const bleedFillModeOptions = useMemo<SelectOption[]>(
    () => [
      {
        label: t("impose.stickers.bleedFillModes.mirror", {
          defaultValue: "Mirror",
        }),
        value: stickerBleedFillMode.MIRROR,
      },
      {
        label: t("impose.stickers.bleedFillModes.contentAwareFast", {
          defaultValue: "Fast content-aware",
        }),
        value: stickerBleedFillMode.CONTENT_AWARE_FAST,
      },
    ],
    [t],
  );

  return (
    <Card.Root size="sm" overflow="hidden">
      <Card.Header pb={0}>
        <HStack justify="space-between" align="start" wrap="wrap" gap={4}>
          <VStack align="start" gap={1} flex="1" minW={0}>
            <Card.Title fontSize="lg">
              {t("impose.stickers.sources", {
                defaultValue: "Sticker Sources",
              })}
            </Card.Title>
            <Card.Description>
              {t("impose.stickers.sourcesDescription", {
                defaultValue:
                  "Upload sticker files and fine-tune quantity, size, and cut behavior for each source.",
              })}
            </Card.Description>
          </VStack>
          <HStack gap={2} wrap="wrap" justify="flex-end">
            {isMetadataLoading && (
              <Badge colorPalette="blue" borderRadius="full" px={3} py={1}>
                {t("impose.stickers.readingFiles", {
                  defaultValue: "Reading Files",
                })}
              </Badge>
            )}
            <Badge colorPalette="gray" borderRadius="full" px={3} py={1}>
              {t("impose.workspace.filesSelected", {
                defaultValue: "{{count}} file(s)",
                count: files.length,
              })}
            </Badge>
          </HStack>
        </HStack>
      </Card.Header>

      <Card.Body pt={4}>
        <VStack align="stretch" gap={4}>
          <Field>
            <FileUpload.Root
              acceptedFiles={files}
              maxFiles={IMPOSITION_MAX_FILES}
              maxFileSize={IMPOSITION_MAX_FILE_SIZE_MB * 1024 * 1024}
              accept={Array.from(STICKER_SUPPORTED_FILE_TYPES)}
              onFileChange={(details) => {
                void onFilesChange(details.acceptedFiles);
              }}
            >
              <FileUpload.HiddenInput name="sticker-sources" />
              <FileUpload.Dropzone
                w="full"
                borderRadius="2xl"
                minH="10rem"
                borderStyle="dashed"
                borderColor={{ base: "gray.300", _dark: "gray.700" }}
                bg={{ base: "gray.50", _dark: "gray.900" }}
              >
                <MaterialSymbol>upload</MaterialSymbol>
                <FileUpload.DropzoneContent>
                  <Text fontWeight="medium">
                    {t("impose.stickers.dropzoneTitle", {
                      defaultValue:
                        "Drop sticker PDFs, images, or ready sheets here",
                    })}
                  </Text>
                  <Text color={{ base: "gray.600", _dark: "gray.400" }}>
                    {t("forms.impose.helperTexts.fileUploadLimits", {
                      defaultValue:
                        "Up to {{maxFiles}} files, {{maxFileSize}} MB each, {{maxTotalSize}} MB total per batch.",
                      maxFileSize: IMPOSITION_MAX_FILE_SIZE_MB,
                      maxFiles: IMPOSITION_MAX_FILES,
                      maxTotalSize: IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
                    })}
                  </Text>
                </FileUpload.DropzoneContent>
              </FileUpload.Dropzone>
              <FileUpload.Context>
                {({ acceptedFiles }) =>
                  acceptedFiles.length > 0 ? (
                    <FileUpload.ItemGroup
                      mt={2}
                      w="full"
                      maxH="10rem"
                      overflowY="auto"
                    >
                      {acceptedFiles.map((file) => (
                        <FileUpload.Item key={file.name} file={file}>
                          <FileUpload.ItemPreview asChild>
                            <MaterialSymbol>draft</MaterialSymbol>
                          </FileUpload.ItemPreview>
                          <FileUpload.ItemContent
                            minW={0}
                            flex="1"
                            overflow="hidden"
                          >
                            <FileUpload.ItemName truncate />
                            <FileUpload.ItemSizeText />
                          </FileUpload.ItemContent>
                          <FileUpload.ItemDeleteTrigger asChild>
                            <IconButton
                              variant="ghost"
                              color="fg.muted"
                              size="xs"
                            >
                              <MaterialSymbol>close</MaterialSymbol>
                            </IconButton>
                          </FileUpload.ItemDeleteTrigger>
                        </FileUpload.Item>
                      ))}
                    </FileUpload.ItemGroup>
                  ) : null
                }
              </FileUpload.Context>
            </FileUpload.Root>
          </Field>

          <VStack align="stretch" gap={3} maxH="36rem" overflowY="auto" pe={1}>
            {items.length === 0 ? (
              <Box
                borderWidth="1px"
                borderStyle="dashed"
                borderColor="gray.muted"
                borderRadius="2xl"
                p={4}
                bg="gray.subtle"
                color="fg.muted"
              >
                <Text fontSize="sm">
                  {t("impose.stickers.emptySources", {
                    defaultValue: "Add files to build the sticker listing.",
                  })}
                </Text>
              </Box>
            ) : (
              items.map((item) => {
                const actualCutDimensions = resolveActualCutDimensions(item);
                const isSizeLinked = item.preserveAspectRatio !== false;
                const sourceFile = files[item.sourceFileIndex];

                return (
                  <Box
                    key={item.id}
                    borderWidth="1px"
                    borderColor="gray.muted"
                    borderRadius="2xl"
                    p={4}
                    bg={{ base: "gray.50", _dark: "gray.900" }}
                    minW={0}
                  >
                    <VStack align="stretch" gap={4}>
                      <HStack
                        justify="space-between"
                        gap={3}
                        align="start"
                        wrap="wrap"
                      >
                        <VStack align="start" gap={0.5} flex="1" minW={0}>
                          <MiddleTruncatedText
                            fontSize="sm"
                            fontWeight="semibold"
                            value={item.filename}
                          />
                          <Text fontSize="xs" color="fg.muted">
                            {t("impose.stickers.pageLabel", {
                              defaultValue: "p. {{page}}",
                              page: item.pageNumber,
                            })}
                          </Text>
                          {hasSourceSize(item) ? (
                            <Text fontSize="xs" color="fg.muted">
                              {t("impose.stickers.sourceSize", {
                                defaultValue:
                                  "Source: {{width}} × {{height}} mm",
                                height: item.sourceHeightMm,
                                width: item.sourceWidthMm,
                              })}
                            </Text>
                          ) : null}
                        </VStack>
                        <Badge
                          variant="outline"
                          colorPalette={
                            isMetadataLoading
                              ? "gray"
                              : item.sizeSource === "file"
                                ? "blue"
                                : item.sizeSource === "fallback" ||
                                    !item.sizeSource
                                  ? "orange"
                                  : "gray"
                          }
                          borderRadius="full"
                          px={2}
                          py={1}
                          flexShrink={0}
                          title={
                            !isMetadataLoading && item.sizeSource === "file"
                              ? t("impose.stickers.sizeDetectedFromFile", {
                                  defaultValue: "Size detected from file",
                                })
                              : !isMetadataLoading &&
                                  (item.sizeSource === "fallback" ||
                                    !item.sizeSource)
                                ? t("impose.stickers.sizeNotDetected", {
                                    defaultValue:
                                      "Size not detected. Enter manually.",
                                  })
                                : undefined
                          }
                        >
                          {item.widthMm} × {item.heightMm} mm
                        </Badge>
                      </HStack>

                      <Grid
                        templateColumns={{
                          base: "1fr",
                          sm: "repeat(2, minmax(0, 1fr))",
                        }}
                        gap={3}
                      >
                        <NumberField
                          label={t("impose.stickers.quantity", {
                            defaultValue: "Quantity",
                          })}
                          value={item.quantity}
                          width="full"
                          min={1}
                          step={1}
                          onChange={(value) => {
                            if (typeof value === "number") {
                              onItemChange(item.id, {
                                quantity: Math.max(1, Math.round(value)),
                              });
                            }
                          }}
                        />
                        <Box gridColumn={{ base: "auto", sm: "1 / -1" }}>
                          <Grid
                            templateColumns={{
                              base: "1fr",
                              md: "minmax(0, 1fr) auto minmax(0, 1fr)",
                            }}
                            gap={3}
                            alignItems="end"
                          >
                            <NumberField
                              label={t("impose.stickers.width", {
                                defaultValue: "Width",
                              })}
                              value={item.widthMm}
                              width="full"
                              min={1}
                              step={0.1}
                              onChange={(value) => {
                                if (typeof value === "number") {
                                  onItemSizeChange(item.id, "widthMm", value);
                                }
                              }}
                            />
                            <IconButton
                              size="sm"
                              variant={isSizeLinked ? "solid" : "outline"}
                              colorPalette={isSizeLinked ? "primary" : "gray"}
                              borderRadius="full"
                              aria-label={t(
                                isSizeLinked
                                  ? "impose.stickers.unlinkAspectRatio"
                                  : "impose.stickers.linkAspectRatio",
                                {
                                  defaultValue: isSizeLinked
                                    ? "Unlock aspect ratio"
                                    : "Link aspect ratio",
                                },
                              )}
                              aria-pressed={isSizeLinked}
                              title={t(
                                isSizeLinked
                                  ? "impose.stickers.unlinkAspectRatio"
                                  : "impose.stickers.linkAspectRatio",
                                {
                                  defaultValue: isSizeLinked
                                    ? "Unlock aspect ratio"
                                    : "Link aspect ratio",
                                },
                              )}
                              alignSelf={{ base: "center", md: "end" }}
                              onClick={() =>
                                onItemChange(item.id, {
                                  preserveAspectRatio: !isSizeLinked,
                                })
                              }
                            >
                              <MaterialSymbol>
                                {isSizeLinked ? "link" : "link_off"}
                              </MaterialSymbol>
                            </IconButton>
                            <NumberField
                              label={t("impose.stickers.height", {
                                defaultValue: "Height",
                              })}
                              value={item.heightMm}
                              width="full"
                              min={1}
                              step={0.1}
                              onChange={(value) => {
                                if (typeof value === "number") {
                                  onItemSizeChange(item.id, "heightMm", value);
                                }
                              }}
                            />
                          </Grid>
                        </Box>
                        {item.cutShape === stickerCutShape.READY_SHEET ? (
                          <Box
                            borderWidth="1px"
                            borderColor="gray.muted"
                            borderRadius="xl"
                            px={3}
                            py={2.5}
                            bg="bg.panel"
                            minW={0}
                          >
                            <Text fontSize="sm" fontWeight="medium">
                              {t("impose.stickers.cutOffset", {
                                defaultValue: "Cut Offset",
                              })}
                            </Text>
                            <Text fontSize="xs" color="fg.muted" mt={1}>
                              {t("impose.stickers.readySheetHint", {
                                defaultValue:
                                  "Ready sheets keep the original sheet bounds for manual trimming.",
                              })}
                            </Text>
                          </Box>
                        ) : (
                          <>
                            <NumberField
                              label={t("impose.stickers.bleed", {
                                defaultValue: "Bleed",
                              })}
                              value={item.bleedMm}
                              width="full"
                              min={0}
                              step={0.1}
                              helperText={t("impose.stickers.bleedHint", {
                                defaultValue:
                                  "Printed artwork extends this far outside the requested sticker size.",
                              })}
                              onChange={(value) => {
                                if (typeof value === "number") {
                                  const bleedMm = Math.max(0, value);
                                  onItemChange(item.id, {
                                    bleedMm,
                                    mirrorBleedEnabled:
                                      bleedMm > 0
                                        ? item.mirrorBleedEnabled
                                        : false,
                                  });
                                }
                              }}
                            />
                            {!isPdfFile(sourceFile) && item.bleedMm > 0 ? (
                              <SelectField
                                label={t("impose.stickers.bleedFillMode", {
                                  defaultValue: "Bleed Fill",
                                })}
                                placeholder={t("common.select", {
                                  defaultValue: "Select",
                                })}
                                options={bleedFillModeOptions}
                                value={item.bleedFillMode}
                                width="full"
                                onChange={(value) =>
                                  onItemChange(item.id, {
                                    bleedFillMode:
                                      value as StickerBleedFillMode,
                                  })
                                }
                              />
                            ) : null}
                            {isPdfFile(sourceFile) ? (
                              <Box gridColumn={{ base: "auto", sm: "1 / -1" }}>
                                <VStack
                                  align="start"
                                  gap={1}
                                  borderWidth="1px"
                                  borderColor="gray.muted"
                                  bg="gray.subtle"
                                  borderRadius="xl"
                                  px={3}
                                  py={2.5}
                                >
                                  <Switch
                                    size="sm"
                                    colorPalette="primary"
                                    checked={item.mirrorBleedEnabled}
                                    disabled={item.bleedMm <= 0}
                                    onCheckedChange={({ checked }) =>
                                      onItemChange(item.id, {
                                        mirrorBleedEnabled: Boolean(checked),
                                      })
                                    }
                                  >
                                    {t("impose.stickers.mirrorBleed", {
                                      defaultValue: "Create mirrored bleed",
                                    })}
                                  </Switch>
                                  <Text fontSize="xs" color="fg.muted">
                                    {t("impose.stickers.mirrorBleedHint", {
                                      defaultValue:
                                        "Reflects the PDF trim edges into the bleed area during export.",
                                    })}
                                  </Text>
                                </VStack>
                              </Box>
                            ) : null}
                            <NumberField
                              label={t("impose.stickers.cutOffset", {
                                defaultValue: "Cut Offset",
                              })}
                              value={item.cutOffsetMm}
                              width="full"
                              min={-100}
                              step={0.1}
                              helperText={t("impose.stickers.cutOffsetHint", {
                                defaultValue:
                                  "Positive values enlarge the cut line; negative values inset it.",
                              })}
                              onChange={(value) => {
                                if (typeof value === "number") {
                                  onItemChange(item.id, {
                                    cutOffsetMm: value,
                                  });
                                }
                              }}
                            />
                            {actualCutDimensions ? (
                              <Text fontSize="xs" color="fg.muted">
                                {actualCutDimensions.kind === "circle"
                                  ? t("impose.stickers.actualCutDiameter", {
                                      defaultValue:
                                        "Actual cut diameter: {{diameter}} mm",
                                      diameter: formatMillimeters(
                                        actualCutDimensions.diameterMm,
                                      ),
                                    })
                                  : t("impose.stickers.actualCutSize", {
                                      defaultValue:
                                        "Actual cut size: {{width}} × {{height}} mm",
                                      height: formatMillimeters(
                                        actualCutDimensions.heightMm,
                                      ),
                                      width: formatMillimeters(
                                        actualCutDimensions.widthMm,
                                      ),
                                    })}
                              </Text>
                            ) : null}
                          </>
                        )}
                      </Grid>

                      <SelectField
                        label={t("impose.stickers.cutShape", {
                          defaultValue: "Cut Shape",
                        })}
                        placeholder={t("common.select", {
                          defaultValue: "Select",
                        })}
                        options={cutShapeOptions}
                        value={item.cutShape}
                        width="full"
                        onChange={(value) => {
                          const cutShape = value as StickerCutShape;

                          onItemChange(item.id, {
                            bleedMm:
                              cutShape === stickerCutShape.READY_SHEET
                                ? 0
                                : item.bleedMm,
                            cutOffsetMm:
                              cutShape === stickerCutShape.READY_SHEET
                                ? 0
                                : item.cutOffsetMm,
                            cutShape,
                            mirrorBleedEnabled:
                              cutShape === stickerCutShape.READY_SHEET
                                ? false
                                : item.mirrorBleedEnabled,
                          });
                        }}
                      />
                      {isPdfFile(sourceFile) ? (
                        <VStack align="stretch" gap={2}>
                          <StickerCutLineSelectionDialog
                            file={sourceFile}
                            item={item}
                            onItemChange={onItemChange}
                          />
                          {(item.selectedPdfCutLineIds?.length ?? 0) > 0 ? (
                            <Text fontSize="xs" color="fg.muted">
                              {t("impose.stickers.cutLines.selectedHint", {
                                count: item.selectedPdfCutLineIds?.length ?? 0,
                                defaultValue:
                                  "{{count}} PDF object(s) will replace the generated cut shape.",
                              })}
                            </Text>
                          ) : null}
                        </VStack>
                      ) : null}
                    </VStack>
                  </Box>
                );
              })
            )}
          </VStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
