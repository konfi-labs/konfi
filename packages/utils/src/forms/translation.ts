import { FormData } from "@konfi/types";
import type { TFunction } from "i18next";
import { T_STORE_MDX_ROUTES, T_STORE_ROUTES } from "../routes";

export const productTranslationForm = (t: TFunction) => {
  const _productTranslationForm: FormData = {
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
            generate: {
              systemPrompt:
                "Translate `name` field to the specified locale. Return only the translated text.",
              context: ["locale", "name"],
            },
          },
          {
            name: "description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `description` field to the specified locale.  Preserve all formating and markdown/html syntax. Return only the translated text.",
              context: ["locale", "description"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.seo", { defaultValue: "SEO" }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "seo.title",
            label: t("forms.labels.title", { defaultValue: "Title" }),
            isRequired: false,
            placeholder: t("forms.placeholders.title", {
              defaultValue: "Title",
            }),
            generate: {
              systemPrompt:
                "Translate `seo.title` field to the specified locale. Return only the translated text.",
              context: ["locale", "seo.title"],
            },
          },
          {
            name: "seo.description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `seo.description` field to the specified locale. Return only the translated text.",
              context: ["locale", "seo.description"],
            },
          },
          {
            name: "seo.slug",
            label: t("forms.labels.slug", { defaultValue: "Slug" }),
            isRequired: false,
            placeholder: t("forms.placeholders.slug", { defaultValue: "slug" }),
            generate: {
              systemPrompt:
                "Translate `seo.slug` field to the specified locale. Preserve the slug format. Return only the translated text.",
              context: ["locale", "seo.slug"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.additionalInformation", {
          defaultValue: "Additional Information",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "specialNotes",
            label: t("forms.labels.specialNotes", {
              defaultValue: "Special Notes",
            }),
            isRequired: false,
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `specialNotes` field to the specified locale. Return only the translated text.",
              context: ["locale", "specialNotes"],
            },
          },
          {
            name: "active",
            isRequired: false,
            placeholder: t("forms.placeholders.active", {
              defaultValue: "Active",
            }),
            type: "checkbox",
          },
        ],
      },
    ],
  };
  return _productTranslationForm;
};

export const categoryTranslationForm = (t: TFunction) => {
  const _categoryTranslationForm: FormData = {
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
            generate: {
              systemPrompt:
                "Translate `name` field to the specified locale. Return only the translated text.",
              context: ["locale", "name"],
            },
          },
          {
            name: "description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `description` field to the specified locale.  Preserve all formating and markdown/html syntax. Return only the translated text.",
              context: ["locale", "description"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.seo", { defaultValue: "SEO" }),
        isDefaultExpanded: false,
        fields: [
          {
            name: "seo.title",
            label: t("forms.labels.title", { defaultValue: "Title" }),
            isRequired: false,
            placeholder: t("forms.placeholders.title", {
              defaultValue: "Title",
            }),
            generate: {
              systemPrompt:
                "Translate `seo.title` field to the specified locale. Return only the translated text.",
              context: ["locale", "seo.title"],
            },
          },
          {
            name: "seo.description",
            label: t("forms.labels.description", {
              defaultValue: "Description",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.description", {
              defaultValue: "Description",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `seo.description` field to the specified locale. Return only the translated text.",
              context: ["locale", "seo.description"],
            },
          },
          {
            name: "seo.slug",
            label: t("forms.labels.slug", { defaultValue: "Slug" }),
            isRequired: false,
            placeholder: t("forms.placeholders.slug", { defaultValue: "slug" }),
            generate: {
              systemPrompt:
                "Translate `seo.slug` field to the specified locale. Preserve the slug format. Return only the translated text.",
              context: ["locale", "seo.slug"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.additionalInformation", {
          defaultValue: "Additional Information",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "active",
            isRequired: false,
            placeholder: t("forms.placeholders.active", {
              defaultValue: "Active",
            }),
            type: "checkbox",
          },
        ],
      },
    ],
  };
  return _categoryTranslationForm;
};

export const heroTranslationForm = (t: TFunction) => {
  const _heroTranslationForm: FormData = {
    allowMultiple: true,
    allowToggle: true,
    sections: [
      {
        fieldArray: true,
        name: "cards",
        heading: t("forms.headings.cards", { defaultValue: "Cards" }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "title",
            label: t("forms.labels.title", { defaultValue: "Title" }),
            isRequired: true,
            placeholder: t("forms.placeholders.myTitle", {
              defaultValue: "My title",
            }),
            generate: {
              systemPrompt:
                "Translate `cards[i].title` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "title"],
            },
          },
          {
            name: "subtitle",
            label: t("forms.labels.subtitle", { defaultValue: "Subtitle" }),
            isRequired: false,
            placeholder: t("forms.placeholders.mySubtitle", {
              defaultValue: "My subtitle",
            }),
            type: "textarea",
            generate: {
              systemPrompt:
                "Translate `cards[i].subtitle` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "subtitle"],
            },
          },
          {
            name: "buttonUrl",
            label: t("forms.labels.buttonUrl", { defaultValue: "Button URL" }),
            isRequired: false,
            placeholder: t("forms.placeholders.buttonUrl", {
              defaultValue:
                "https://www.example.com/products?campaignId=campaignId",
            }),
            generate: {
              systemPrompt:
                "Translate `cards[i].buttonUrl` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "buttonUrl"],
            },
          },
          {
            name: "buttonLabel",
            label: t("forms.labels.buttonLabel", {
              defaultValue: "Button Label",
            }),
            isRequired: false,
            placeholder: t("forms.placeholders.myTitle", {
              defaultValue: "My title",
            }),
            generate: {
              systemPrompt:
                "Translate `cards[i].buttonLabel` field to the specified locale. Return only the translated text.",
              context: ["root.locale", "buttonLabel"],
            },
          },
        ],
      },
      {
        fieldArray: false,
        heading: t("forms.headings.additionalInformation", {
          defaultValue: "Additional Information",
        }),
        isDefaultExpanded: true,
        fields: [
          {
            name: "active",
            isRequired: false,
            placeholder: t("forms.placeholders.active", {
              defaultValue: "Active",
            }),
            type: "checkbox",
          },
        ],
      },
    ],
  };
  return _heroTranslationForm;
};

export const storePageContentTranslationForm = (
  t: TFunction,
  routes: string[] = T_STORE_MDX_ROUTES,
): FormData => ({
  allowMultiple: false,
  allowToggle: false,
  sections: routes.map((route: string) => ({
    fieldArray: true,
    name: `${route}.content`,
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
        type: "textarea" as const,
        mdxPreview: true,
        watch: true,
        generate: {
          systemPrompt:
            "Translate `value` field to the specified locale. Preserve all formating and markdown/html syntax. Return only the translated text.",
          context: [`root.${route}.locale`, "value"],
        },
      },
    ],
  })),
});

export const storeMetadataTranslationForm = (
  t: TFunction,
  routes: string[] = T_STORE_ROUTES,
): FormData => ({
  allowMultiple: false,
  allowToggle: false,
  sections: routes.map((route: string) => ({
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
        generate: {
          systemPrompt:
            "Translate `title` field to the specified locale. Return only the translated text.",
          context: [`root.${route}.locale`, `${route}.title`],
        },
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
        generate: {
          systemPrompt:
            "Translate `description` field to the specified locale. Return only the translated text.",
          context: [`root.${route}.locale`, `${route}.description`],
        },
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
        generate: {
          systemPrompt:
            "Translate `keywords` field to the specified locale. Return only the translated text.",
          context: [`root.${route}.locale`, `${route}.keywords`],
        },
      },
      {
        name: `${route}.ogTitle`,
        label: t("forms.metadata.labels.ogTitle", { defaultValue: "OG Title" }),
        helperText:
          t("forms.metadata.helperTexts.ogTitle", {
            defaultValue: "Social media title for",
          }) + ` ${route.replaceAll("_", "/")}`,
        generate: {
          systemPrompt:
            "Translate `ogTitle` field to the specified locale. Return only the translated text.",
          context: [`root.${route}.locale`, `${route}.ogTitle`],
        },
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
        generate: {
          systemPrompt:
            "Translate `ogDescription` field to the specified locale. Return only the translated text.",
          context: [`root.${route}.locale`, `${route}.ogDescription`],
        },
      },
    ],
  })),
});

export const attributeTranslationForm = (t: TFunction): FormData => ({
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
          generate: {
            systemPrompt:
              "Translate `name` field to the specified locale. Return only the translated text.",
            context: ["locale", "name"],
          },
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
          generate: {
            systemPrompt:
              "Translate `label` field to the specified locale. Return only the translated text.",
            context: ["root.locale", "label"],
          },
        },
      ],
    },
  ],
});
