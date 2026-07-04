import {
  AttributeInputTypeEnum,
  enumToSearchOptions,
  FormData,
  type FakturowniaCostUnit,
} from "@konfi/types";
import type { TFunction } from "i18next";

export const attributeForm = (t: TFunction): FormData => ({
  allowMultiple: true,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "id",
          label: t("forms.labels.identifier", { defaultValue: "Identifier" }),
          helperText: t("forms.helperTexts.identifier", {
            defaultValue:
              "No spaces, no Polish characters, each subsequent word with a capital letter (except the first), e.g. decorativePaper",
          }),
          isRequired: true,
          placeholder: t("forms.placeholders.identifier", {
            defaultValue: "Identifier",
          }),
          updateDisabled: true,
        },
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.name", { defaultValue: "Name" }),
        },
        {
          name: "calculated",
          placeholder: t("forms.placeholders.attributeAffectsPrice", {
            defaultValue: "Attribute affects price",
          }),
          type: "checkbox",
          updateDisabled: true,
        },
        {
          name: "required",
          placeholder: t("forms.placeholders.requireThisAttribute", {
            defaultValue: "Require this attribute",
          }),
          type: "checkbox",
          updateDisabled: true,
        },
        {
          name: "format",
          placeholder: t("forms.placeholders.attributeContainsSizes", {
            defaultValue: "Attribute contains sizes",
          }),
          type: "checkbox",
          updateDisabled: true,
        },
        {
          name: "pages",
          placeholder: t("forms.placeholders.decidesRequiredPages", {
            defaultValue: "Decides on the number of required pages",
          }),
          type: "checkbox",
        },
        {
          name: "type",
          placeholder: t("forms.placeholders.selectAttributeType", {
            defaultValue: "Select attribute type...",
          }),
          isRequired: true,
          type: "select",
          options: enumToSearchOptions(AttributeInputTypeEnum),
          enumName: "AttributeInputTypeEnum",
        },
        {
          name: "trackStock",
          placeholder: t("forms.placeholders.trackStock", {
            defaultValue: "Track stock",
          }),
          type: "checkbox",
        },
        {
          name: "calculateStockFromSheet.enabled",
          placeholder: t("forms.placeholders.calculateStockFromSheet", {
            defaultValue: "Calculate stock from sheet",
          }),
          type: "checkbox",
          dependsOn: "format",
          dependencyValue: "false",
        },
        {
          name: "calculateStockFromSheet.sheetWidth",
          placeholder: t("forms.placeholders.sheetWidth", {
            defaultValue: "Sheet width",
          }),
          type: "number",
          dependsOn: "calculateStockFromSheet.enabled",
          dependencyValue: "true",
        },
        {
          name: "calculateStockFromSheet.sheetHeight",
          placeholder: t("forms.placeholders.sheetHeight", {
            defaultValue: "Sheet height",
          }),
          type: "number",
          dependsOn: "calculateStockFromSheet.enabled",
          dependencyValue: "true",
        },
        {
          name: "calculateStockFromSheet.margin",
          label: t("forms.labels.margin", { defaultValue: "Margin" }),
          placeholder: t("forms.placeholders.margin", {
            defaultValue: "Margin",
          }),
          type: "number",
          dependsOn: "calculateStockFromSheet.enabled",
          dependencyValue: "true",
        },
        {
          name: "calculateStockFromSheet.bleed",
          label: t("forms.labels.bleed", { defaultValue: "Bleed" }),
          placeholder: t("forms.placeholders.bleed", { defaultValue: "Bleed" }),
          type: "number",
          dependsOn: "calculateStockFromSheet.enabled",
          dependencyValue: "true",
        },
        {
          name: "costUnit",
          label: t("forms.labels.costUnit", { defaultValue: "Cost unit (override)" }),
          placeholder: t("forms.placeholders.costUnitAuto", { defaultValue: "Auto (from invoice)" }),
          type: "select",
          options: [
            {
              label: t("forms.options.costUnit.piece", { defaultValue: "Piece (szt)" }),
              value: "piece" satisfies FakturowniaCostUnit,
            },
            {
              label: t("forms.options.costUnit.area_m2", { defaultValue: "Area (m²)" }),
              value: "area_m2" satisfies FakturowniaCostUnit,
            },
            {
              label: t("forms.options.costUnit.sheet", { defaultValue: "Sheet (ark)" }),
              value: "sheet" satisfies FakturowniaCostUnit,
            },
            {
              label: t("forms.options.costUnit.metre", { defaultValue: "Linear metre (mb)" }),
              value: "metre" satisfies FakturowniaCostUnit,
            },
          ],
        },
      ],
    },
    {
      fieldArray: true,
      name: "options",
      initialValues: {
        label: "",
        value: "",
        customFormat: false,
        hidden: false,
        formatWidth: null,
        formatHeight: null,
        pages: null,
      },
      heading: t("forms.headings.options", { defaultValue: "Options" }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "label",
          label: t("forms.labels.label", { defaultValue: "Label" }),
          isRequired: true,
          placeholder: t("forms.placeholders.exampleA4", {
            defaultValue: "A4",
          }),
        },
        {
          name: "value",
          label: t("forms.labels.value", { defaultValue: "Value" }),
          isRequired: true,
          placeholder: t("forms.placeholders.exampleA4Lowercase", {
            defaultValue: "a4",
          }),
          updateDisabled: true,
        },
        {
          name: "customFormat",
          placeholder: t("forms.placeholders.customDimension", {
            defaultValue: "Custom dimension",
          }),
          type: "checkbox",
          dependsOn: "format",
          dependencyValue: "true",
        },
        {
          name: "hidden",
          placeholder: t("forms.placeholders.hideOption", {
            defaultValue: "Hide option",
          }),
          type: "checkbox",
        },
        {
          name: "formatWidth",
          label: t("forms.labels.width", { defaultValue: "Width" }),
          placeholder: t("forms.placeholders.enterWidth", {
            defaultValue: "Enter width...",
          }),
          type: "number",
          dependsOn: "format",
          dependencyValue: "true",
        },
        {
          name: "formatHeight",
          label: t("forms.labels.height", { defaultValue: "Height" }),
          placeholder: t("forms.placeholders.enterHeight", {
            defaultValue: "Enter height...",
          }),
          type: "number",
          dependsOn: "format",
          dependencyValue: "true",
        },
        {
          name: "pages",
          label: t("forms.labels.pages", { defaultValue: "Pages" }),
          placeholder: t("forms.placeholders.enterPageCount", {
            defaultValue: "Enter number of pages...",
          }),
          type: "number",
          dependsOn: "pages",
          dependencyValue: "true",
        },
        {
          name: "cost",
          label: t("forms.labels.cost", { defaultValue: "Cost" }),
          placeholder: t("forms.placeholders.enterOptionCost", {
            defaultValue: "Enter option cost...",
          }),
          type: "number",
          dependsOn: "calculated",
          dependencyValue: "true",
        },
        {
          name: "unitsPerSheet",
          label: t("forms.labels.unitsPerSheet", {
            defaultValue: "Units per sheet",
          }),
          placeholder: t("forms.placeholders.enterUnitsPerSheet", {
            defaultValue: "Enter units per sheet...",
          }),
          type: "number",
          dependsOn: "format",
          dependencyValue: "true",
        },
        {
          name: "image",
          label: t("forms.labels.photo", { defaultValue: "Photo" }),
          isRequired: false,
          type: "fileManager",
          imageProps: {
            prefix: "attributeOptionImages",
            maxNumber: 1,
            maxFiles: 10,
            maxFileSize: 5,
            acceptType: ["jpeg", "jpg", "png"],
          },
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.RADIO_GROUP_IMAGE,
        },
        {
          name: "color",
          label: t("forms.labels.color", { defaultValue: "Color" }),
          isRequired: false,
          type: "colorPicker",
          dependsOn: "type",
          dependencyValue: [
            AttributeInputTypeEnum.RADIO_GROUP_COLOR,
            AttributeInputTypeEnum.DROPDOWN_COLOR,
          ],
        },
        {
          name: "advancedPreset.reinforcementSides",
          label: t("forms.labels.reinforcementSides", {
            defaultValue: "Reinforcement sides",
          }),
          type: "multiSelect",
          options: [
            {
              label: t("forms.options.sides.top", { defaultValue: "Top" }),
              value: "top",
            },
            {
              label: t("forms.options.sides.right", { defaultValue: "Right" }),
              value: "right",
            },
            {
              label: t("forms.options.sides.bottom", {
                defaultValue: "Bottom",
              }),
              value: "bottom",
            },
            {
              label: t("forms.options.sides.left", { defaultValue: "Left" }),
              value: "left",
            },
          ],
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.ADVANCED_FINISHING,
        },
        {
          name: "advancedPreset.tunnelSides",
          label: t("forms.labels.tunnelSides", {
            defaultValue: "Tunnel sides",
          }),
          type: "multiSelect",
          options: [
            {
              label: t("forms.options.sides.top", { defaultValue: "Top" }),
              value: "top",
            },
            {
              label: t("forms.options.sides.right", { defaultValue: "Right" }),
              value: "right",
            },
            {
              label: t("forms.options.sides.bottom", {
                defaultValue: "Bottom",
              }),
              value: "bottom",
            },
            {
              label: t("forms.options.sides.left", { defaultValue: "Left" }),
              value: "left",
            },
          ],
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.ADVANCED_FINISHING,
        },
        {
          name: "advancedPreset.grommets.sides",
          label: t("forms.labels.grommetsSides", {
            defaultValue: "Grommets sides",
          }),
          type: "multiSelect",
          options: [
            {
              label: t("forms.options.sides.top", { defaultValue: "Top" }),
              value: "top",
            },
            {
              label: t("forms.options.sides.right", { defaultValue: "Right" }),
              value: "right",
            },
            {
              label: t("forms.options.sides.bottom", {
                defaultValue: "Bottom",
              }),
              value: "bottom",
            },
            {
              label: t("forms.options.sides.left", { defaultValue: "Left" }),
              value: "left",
            },
          ],
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.ADVANCED_FINISHING,
        },
        {
          name: "advancedPreset.grommets.spacing",
          label: t("forms.labels.grommetsSpacingCm", {
            defaultValue: "Grommets spacing (cm)",
          }),
          placeholder: t("forms.placeholders.grommetsSpacingCm", {
            defaultValue: "e.g. 50",
          }),
          type: "number",
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.ADVANCED_FINISHING,
        },
        {
          name: "advancedPreset.grommets.offsetStart",
          label: t("forms.labels.grommetsOffsetStart", {
            defaultValue: "Grommets start offset (cm)",
          }),
          placeholder: t("forms.placeholders.grommetsOffsetStart", {
            defaultValue: "e.g. 5",
          }),
          type: "number",
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.ADVANCED_FINISHING,
        },
        {
          name: "advancedPreset.grommets.offsetEnd",
          label: t("forms.labels.grommetsOffsetEnd", {
            defaultValue: "Grommets end offset (cm)",
          }),
          placeholder: t("forms.placeholders.grommetsOffsetEnd", {
            defaultValue: "e.g. 5",
          }),
          type: "number",
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.ADVANCED_FINISHING,
        },
        {
          name: "advancedPreset.cutToSize",
          placeholder: t("forms.placeholders.cutToSize", {
            defaultValue: "Cut to size",
          }),
          type: "checkbox",
          dependsOn: "type",
          dependencyValue: AttributeInputTypeEnum.ADVANCED_FINISHING,
        },
      ],
    },
  ],
});

export const categoryForm = (t: TFunction): FormData => ({
  allowMultiple: true,
  allowToggle: true,
  sections: [
    {
      fieldArray: false,
      heading: t("forms.headings.basicInformation", {
        defaultValue: "Basic Information",
      }),
      isDefaultExpanded: true,
      fields: [
        {
          name: "name",
          label: t("forms.labels.name", { defaultValue: "Name" }),
          isRequired: true,
          placeholder: t("forms.placeholders.name", { defaultValue: "Name" }),
          updateDisabled: true,
        },
        {
          name: "description",
          label: t("forms.labels.description", { defaultValue: "Description" }),
          isRequired: false,
          placeholder: t("forms.placeholders.description", {
            defaultValue: "Description",
          }),
          type: "textarea",
        },
        {
          name: "parentId",
          label: t("forms.labels.parentCategory", {
            defaultValue: "Parent category",
          }),
          isRequired: false,
          placeholder: t("forms.placeholders.parentCategory", {
            defaultValue: "Search existing category...",
          }),
          searchFor: "categories",
          searchResult: "id",
          type: "search",
        },
      ],
    },
    {
      fieldArray: false,
      heading: t("forms.headings.seo", { defaultValue: "SEO" }),
      isDefaultExpanded: false,
      fields: [
        {
          name: "seo.slug",
          label: t("forms.labels.slug", { defaultValue: "Slug" }),
          isRequired: false,
          placeholder: t("forms.placeholders.slug", { defaultValue: "slug" }),
        },
        {
          name: "seo.title",
          label: t("forms.labels.title", { defaultValue: "Title" }),
          isRequired: false,
          placeholder: t("forms.placeholders.title", { defaultValue: "Title" }),
        },
        {
          name: "seo.description",
          label: t("forms.labels.description", { defaultValue: "Description" }),
          isRequired: false,
          placeholder: t("forms.placeholders.description", {
            defaultValue: "Description",
          }),
          type: "textarea",
        },
      ],
    },
  ],
});
