import { FormData } from "@konfi/types";
import type { TFunction } from "i18next";
import { T_STORE_MDX_ROUTES, T_STORE_ROUTES } from "../routes";

export const storeMetadataForm = (t: TFunction): FormData => ({
  allowMultiple: false,
  allowToggle: false,
  sections: T_STORE_ROUTES.map((route: string) => ({
    fieldArray: false,
    heading: route.replaceAll("_", "/"),
    isDefaultExpanded: true,
    fields: [
      {
        name: `${route}.title`,
        label: t("forms.metadata.labels.title", { defaultValue: "Title" }),
        helperText:
          t("forms.metadata.helperTexts.pageTitle", {
            defaultValue: "Page title for",
          }) + ` ${route.replaceAll("_", "/")}`,
      },
      {
        name: `${route}.description`,
        label: t("forms.metadata.labels.description", {
          defaultValue: "Description",
        }),
        helperText:
          t("forms.metadata.helperTexts.pageDescription", {
            defaultValue: "Page description for",
          }) + ` ${route.replaceAll("_", "/")}`,
      },
      {
        name: `${route}.keywords`,
        label: t("forms.metadata.labels.keywords", {
          defaultValue: "Keywords",
        }),
        helperText:
          t("forms.metadata.helperTexts.pageKeywords", {
            defaultValue: "Page keywords for, separated by comma",
          }) + ` ${route.replaceAll("_", "/")}`,
      },
      {
        name: `${route}.ogTitle`,
        label: t("forms.metadata.labels.ogTitle", { defaultValue: "OG Title" }),
        helperText:
          t("forms.metadata.helperTexts.ogTitle", {
            defaultValue: "Social media title for",
          }) + ` ${route.replaceAll("_", "/")}`,
      },
      {
        name: `${route}.ogDescription`,
        label: t("forms.metadata.labels.ogDescription", {
          defaultValue: "OG Description",
        }),
        helperText:
          t("forms.metadata.helperTexts.ogDescription", {
            defaultValue: "Social media description for",
          }) + ` ${route.replaceAll("_", "/")}`,
      },
    ],
  })),
});

export const storePageContentForm = (t: TFunction): FormData => ({
  allowMultiple: false,
  allowToggle: false,
  sections: T_STORE_MDX_ROUTES.map((route: string) => ({
    fieldArray: true,
    name: `${route}.content`,
    initialValues: {
      value: "",
    },
    heading: route.replaceAll("_", "/"),
    isDefaultExpanded: true,
    fields: [
      {
        name: `value`,
        label: t("forms.page_content.labels.content", {
          defaultValue: "Content",
        }),
        helperText:
          t("forms.pageContent.helperTexts.page_content", {
            defaultValue: "Page content for",
          }) + ` ${route.replaceAll("_", "/")}`,
        type: "textarea",
        mdxPreview: true,
        watch: true,
      },
    ],
  })),
});
