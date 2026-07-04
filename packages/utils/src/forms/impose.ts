import {
  backPageRotationAsOptions,
  bindingEdgeAsOptions,
  bleedType,
  bleedTypeAsOptions,
  duplexMode,
  duplexModeAsOptions,
  FormData,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
  IMPOSITION_SUPPORTED_FILE_TYPES,
  layoutType,
  layoutTypeAsOptions,
  paperOrientationAsOptions,

  sourceSizingAsOptions,
} from "@konfi/types";
import type { TFunction } from "i18next";
import { paperSizesAsOptions } from "../paper-sizes";

export const imposeForm = (t: TFunction): FormData => {
  const selectableBleedTypeOptions = bleedTypeAsOptions.filter(
    (option) => option.value !== bleedType.DIFFERENTIAL_DIFFUSION,
  );

  return {
    allowMultiple: false,
    allowToggle: false,
    sections: [
      {
        fieldArray: false,
        heading: t("forms.headings.settings", { defaultValue: "Settings" }),
        isDefaultExpanded: true,
        stackDirection: "column",
        fields: [
          {
            name: "files",
            label: t("forms.impose.labels.files", { defaultValue: "Files" }),
            helperText: t("forms.impose.helperTexts.fileUploadLimits", {
              defaultValue:
                "Up to {{maxFiles}} files, {{maxFileSize}} MB each, {{maxTotalSize}} MB total per batch.",
              maxFiles: IMPOSITION_MAX_FILES,
              maxFileSize: IMPOSITION_MAX_FILE_SIZE_MB,
              maxTotalSize: IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
            }),
            type: "fileInputDropzone",
            imageProps: {
              maxNumber: IMPOSITION_MAX_FILES,
              maxFileSize: IMPOSITION_MAX_FILE_SIZE_MB,
              maxTotalFileSize: IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
              acceptType: [...IMPOSITION_SUPPORTED_FILE_TYPES],
              rootProps: {
                maxW: "100%",
                w: "100%",
              },
              dropzoneProps: {
                minH: "80px",
                py: 3,
              },
            },
          },
          {
            name: "customSheetSize",
            label: t("forms.impose.labels.customSheetSize", {
              defaultValue: "Custom Sheet Size",
            }),
            type: "checkbox",
          },
          {
            name: "sheetSizeName",
            label: t("forms.impose.labels.sheetSize", {
              defaultValue: "Sheet Size",
            }),
            placeholder: t("forms.impose.placeholders.selectSheetSize", {
              defaultValue: "Select sheet size...",
            }),
            type: "select",
            options: paperSizesAsOptions,
            enumName: "PaperSizes",
            dependsOn: "customSheetSize",
            dependencyValue: "false",
          },
          {
            name: "customSheetSizeWidth",
            label: t("forms.impose.labels.sheetWidth", {
              defaultValue: "Sheet Width",
            }),
            type: "number",
            helperText: t("forms.impose.helperTexts.inMillimeters", {
              defaultValue: "In millimeters",
            }),
            dependsOn: "customSheetSize",
            dependencyValue: "true",
          },
          {
            name: "customSheetSizeHeight",
            label: t("forms.impose.labels.sheetHeight", {
              defaultValue: "Sheet Height",
            }),
            type: "number",
            helperText: t("forms.impose.helperTexts.inMillimeters", {
              defaultValue: "In millimeters",
            }),
            dependsOn: "customSheetSize",
            dependencyValue: "true",
          },
          {
            name: "automaticSheetOrientation",
            label: t("forms.impose.labels.automaticSheetOrientation", {
              defaultValue: "Automatic Sheet Orientation",
            }),
            type: "checkbox",
            helperText: t(
              "forms.impose.helperTexts.automaticSheetOrientation",
              {
                defaultValue:
                  "Automatically picks the sheet orientation (portrait or landscape) that maximizes the number of items.",
              },
            ),
          },
          {
            name: "sheetOrientation",
            label: t("forms.impose.labels.sheetOrientation", {
              defaultValue: "Sheet Orientation",
            }),
            placeholder: t("forms.impose.placeholders.selectSheetOrientation", {
              defaultValue: "Select sheet orientation...",
            }),
            type: "select",
            options: paperOrientationAsOptions,
            enumName: "PaperOrientations",
            dependsOn: "automaticSheetOrientation",
            dependencyValue: "false",
          },
          {
            name: "customItemSize",
            label: t("forms.impose.labels.customItemSize", {
              defaultValue: "Custom Item Size",
            }),
            type: "checkbox",
          },
          {
            name: "itemSizeName",
            label: t("forms.impose.labels.itemSize", {
              defaultValue: "Item Size",
            }),
            placeholder: t("forms.impose.placeholders.selectItemSize", {
              defaultValue: "Select item size...",
            }),
            type: "select",
            options: paperSizesAsOptions,
            enumName: "PaperSizes",
            dependsOn: "customItemSize",
            dependencyValue: "false",
          },
          {
            name: "customItemSizeWidth",
            label: t("forms.impose.labels.itemWidth", {
              defaultValue: "Item Width",
            }),
            type: "number",
            helperText: t("forms.impose.helperTexts.inMillimeters", {
              defaultValue: "In millimeters",
            }),
            dependsOn: "customItemSize",
            dependencyValue: "true",
          },
          {
            name: "customItemSizeHeight",
            label: t("forms.impose.labels.itemHeight", {
              defaultValue: "Item Height",
            }),
            type: "number",
            helperText: t("forms.impose.helperTexts.inMillimeters", {
              defaultValue: "In millimeters",
            }),
            dependsOn: "customItemSize",
            dependencyValue: "true",
          },
          {
            name: "automaticItemOrientation",
            label: t("forms.impose.labels.automaticItemOrientation", {
              defaultValue: "Automatic Item Orientation",
            }),
            type: "checkbox",
            helperText: t("forms.impose.helperTexts.automaticItemOrientation", {
              defaultValue:
                "If item width is greater than height, the orientation will be landscape, otherwise portrait.",
            }),
          },
          {
            name: "itemOrientation",
            label: t("forms.impose.labels.itemOrientation", {
              defaultValue: "Item Orientation",
            }),
            placeholder: t("forms.impose.placeholders.selectItemOrientation", {
              defaultValue: "Select item orientation...",
            }),
            type: "select",
            options: paperOrientationAsOptions,
            enumName: "PaperOrientations",
            dependsOn: "automaticItemOrientation",
            dependencyValue: "false",
          },
          {
            name: "automaticNumberOfHorizontalItems",
            label: t("forms.impose.labels.automaticNumberOfHorizontalItems", {
              defaultValue: "Automatic Number of Horizontal Items",
            }),
            type: "checkbox",
            helperText: t(
              "forms.impose.helperTexts.automaticNumberOfHorizontalItems",
              {
                defaultValue:
                  "Automatically calculate the number of horizontal items based on the width of the sheet and the item.",
              },
            ),
            watch: true,
          },
          {
            name: "numItemsHorizontal",
            label: t("forms.impose.labels.numItemsHorizontal", {
              defaultValue: "Number of Horizontal Items",
            }),
            type: "number",
            dependsOn: "automaticNumberOfHorizontalItems",
            dependencyValue: "false",
          },
          {
            name: "automaticNumberOfVerticalItems",
            label: t("forms.impose.labels.automaticNumberOfVerticalItems", {
              defaultValue: "Automatic Number of Vertical Items",
            }),
            type: "checkbox",
            helperText: t(
              "forms.impose.helperTexts.automaticNumberOfVerticalItems",
              {
                defaultValue:
                  "Automatically calculate the number of vertical items based on the height of the sheet and the item.",
              },
            ),
          },
          {
            name: "numItemsVertical",
            label: t("forms.impose.labels.numItemsVertical", {
              defaultValue: "Number of Vertical Items",
            }),
            type: "number",
            dependsOn: "automaticNumberOfVerticalItems",
            dependencyValue: "false",
          },
          {
            name: "automaticSpacingHorizontal",
            label: t("forms.impose.labels.automaticSpacingHorizontal", {
              defaultValue: "Automatic Spacing Between Items Horizontally",
            }),
            type: "checkbox",
          },
          {
            name: "spacingHorizontal",
            label: t("forms.impose.labels.spacingHorizontal", {
              defaultValue: "Spacing Between Items Horizontally",
            }),
            helperText: t("forms.impose.helperTexts.spacingHorizontal", {
              defaultValue: "In millimeters, separated by commas, e.g. 2,2",
            }),
            dependsOn: "automaticSpacingHorizontal",
            dependencyValue: "false",
          },
          {
            name: "automaticSpacingVertical",
            label: t("forms.impose.labels.automaticSpacingVertical", {
              defaultValue: "Automatic Spacing Between Items Vertically",
            }),
            type: "checkbox",
          },
          {
            name: "spacingVertical",
            label: t("forms.impose.labels.spacingVertical", {
              defaultValue: "Spacing Between Items Vertically",
            }),
            helperText: t("forms.impose.helperTexts.spacingVertical", {
              defaultValue: "In millimeters, separated by commas, e.g. 2,2",
            }),
            dependsOn: "automaticSpacingVertical",
            dependencyValue: "false",
          },
          {
            name: "bleed",
            label: t("forms.impose.labels.bleed", { defaultValue: "Bleed" }),
            isRequired: true,
            type: "number",
            helperText: t("forms.impose.helperTexts.bleed", {
              defaultValue: "Bleed value in millimeters",
            }),
          },
          {
            name: "bleedType",
            label: t("forms.impose.labels.bleedType", {
              defaultValue: "Bleed Type",
            }),
            placeholder: t("forms.impose.placeholders.selectBleedType", {
              defaultValue: "Select bleed type...",
            }),
            type: "select",
            options: selectableBleedTypeOptions,
            enumName: "BleedType",
          },
          {
            name: "sourceSizing",
            label: t("forms.impose.labels.sourceSizing", {
              defaultValue: "Source sizing",
            }),
            placeholder: t("forms.impose.placeholders.selectSourceSizing", {
              defaultValue: "Select source sizing...",
            }),
            type: "select",
            options: sourceSizingAsOptions,
            enumName: "SourceSizing",
            helperText: t("forms.impose.helperTexts.sourceSizing", {
              defaultValue:
                "Preserve original size keeps the source at 100%. Fit output box scales proportionally to cover the intended output area and crops any excess symmetrically.",
            }),
            dependsOn: "bleedType",
            dependencyValue: [bleedType.NO_BLEED, bleedType.BLEED_INCLUDED],
          },
          {
            name: "cropMarks",
            label: t("forms.impose.labels.cropMarks", {
              defaultValue: "Crop Marks",
            }),
            type: "checkbox",
          },
          {
            name: "layout",
            label: t("forms.impose.labels.layout", {
              defaultValue: "Layout Type",
            }),
            placeholder: t("forms.impose.placeholders.selectLayout", {
              defaultValue: "Select layout type...",
            }),
            type: "select",
            options: layoutTypeAsOptions,
            enumName: "LayoutType",
            helperText: t("forms.impose.helperTexts.layout", {
              defaultValue: "Select layout type...",
            }),
          },
          {
            name: "pagesPerSignature",
            label: t("forms.impose.labels.pagesPerSignature", {
              defaultValue: "Pages per Signature",
            }),
            type: "number",
            helperText: t("forms.impose.helperTexts.pagesPerSignature", {
              defaultValue:
                "Number of pages per sheet (usually 4, 8, 16, or 32)",
            }),
            dependsOn: "layout",
            dependencyValue: layoutType.BOOKLET,
          },
          {
            name: "bindingEdge",
            label: t("forms.impose.labels.bindingEdge", {
              defaultValue: "Binding Edge",
            }),
            placeholder: t("forms.impose.placeholders.selectBindingEdge", {
              defaultValue: "Select binding edge...",
            }),
            type: "select",
            options: bindingEdgeAsOptions,
            enumName: "BindingEdge",
            helperText: t("forms.impose.helperTexts.bindingEdge", {
              defaultValue: "Select binding edge for booklet layout",
            }),
            dependsOn: "layout",
            dependencyValue: layoutType.BOOKLET,
          },
          {
            name: "duplexMode",
            label: t("forms.impose.labels.duplexMode", {
              defaultValue: "Duplex Printing Mode",
            }),
            placeholder: t("forms.impose.placeholders.selectDuplexMode", {
              defaultValue: "Select duplex printing mode...",
            }),
            type: "select",
            options: duplexModeAsOptions,
            enumName: "DuplexMode",
            helperText: t("forms.impose.helperTexts.duplexMode", {
              defaultValue: "Specifies whether and how to print double-sided",
            }),
          },
          {
            name: "backPageRotation",
            label: t("forms.impose.labels.backPageRotation", {
              defaultValue: "Back Page Rotation",
            }),
            placeholder: t("forms.impose.placeholders.selectBackPageRotation", {
              defaultValue: "Select back page rotation...",
            }),
            type: "select",
            options: backPageRotationAsOptions,
            enumName: "BackPageRotation",
            helperText: t("forms.impose.helperTexts.backPageRotation", {
              defaultValue: "Back page rotation relative to front page",
            }),
            dependsOn: "duplexMode",
            dependencyValue: `${duplexMode.DUPLEX_LONG_EDGE},${duplexMode.DUPLEX_SHORT_EDGE}`,
          },
          {
            name: "frontBackAlignment",
            label: t("forms.impose.labels.frontBackAlignment", {
              defaultValue: "Front-Back Alignment",
            }),
            type: "checkbox",
            helperText: t("forms.impose.helperTexts.frontBackAlignment", {
              defaultValue: "Align front and back page positioning",
            }),
            dependsOn: "duplexMode",
            dependencyValue: `${duplexMode.DUPLEX_LONG_EDGE},${duplexMode.DUPLEX_SHORT_EDGE}`,
          },
          {
            name: "mirrorBack",
            label: t("forms.impose.labels.mirrorBack", {
              defaultValue: "Mirror Back Page",
            }),
            type: "checkbox",
            helperText: t("forms.impose.helperTexts.mirrorBack", {
              defaultValue: "Apply mirror effect to back page",
            }),
            dependsOn: "duplexMode",
            dependencyValue: `${duplexMode.DUPLEX_LONG_EDGE},${duplexMode.DUPLEX_SHORT_EDGE}`,
          },
          {
            name: "saveAsTemplate",
            label: t("forms.impose.labels.saveAsTemplate", {
              defaultValue: "Save as Template",
            }),
            type: "checkbox",
            helperText: t("forms.impose.helperTexts.saveAsTemplate", {
              defaultValue: "Do you want to save the settings as a template?",
            }),
          },
          {
            name: "templateName",
            label: t("forms.impose.labels.templateName", {
              defaultValue: "Template Name",
            }),
            dependsOn: "saveAsTemplate",
            dependencyValue: "true",
          },
        ],
      },
    ],
  };
};
