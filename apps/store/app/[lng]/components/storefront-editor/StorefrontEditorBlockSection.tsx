"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Field,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { MaterialSymbol, Tooltip } from "@konfi/components";
import {
  Locale,
  STOREFRONT_HOME_BLOCK_VARIANTS,
  type StorefrontHomeBlock,
  type StorefrontHomeBlockType,
  type StorefrontHomeBlockVariant,
} from "@konfi/types";
import { useState } from "react";
import { StorefrontBlockVariantIcon } from "./StorefrontBlockVariantIcon";
import {
  StorefrontEditorImageField,
  uploadStorefrontImage,
} from "./StorefrontEditorImageField";

const presetLabels: Record<StorefrontHomeBlockType, string> = {
  assistant: "Assistant",
  campaigns: "Campaigns",
  "featured-products": "Featured",
  hero: "Hero",
  "how-it-works": "How It Works",
  newsletter: "Newsletter",
  "popular-products": "Popular",
  "rich-text-cta": "Text & CTA",
  testimonials: "Testimonials",
  "trust-grid": "Trust Grid",
};

const presetLabelKey = (type: StorefrontHomeBlockType) =>
  `store.editor.presets.${type}`;
const variantLabelKey = (
  type: StorefrontHomeBlockType,
  variant: StorefrontHomeBlockVariant,
) => `store.editor.block.variants.${type}.${variant}`;
const languages = Object.values(Locale);
const languageLabelKeys: Record<Locale, string> = {
  cs: "store.editor.languages.cs",
  de: "store.editor.languages.de",
  en: "store.editor.languages.en",
  fr: "store.editor.languages.fr",
  pl: "store.editor.languages.pl",
  sk: "store.editor.languages.sk",
  uk: "store.editor.languages.uk",
};
const languageLabels: Record<Locale, string> = {
  cs: "Czech",
  de: "German",
  en: "English",
  fr: "French",
  pl: "Polish",
  sk: "Slovak",
  uk: "Ukrainian",
};
type EditableLanguage = Locale;

const maxContentImageFileSizeBytes = 5 * 1024 * 1024;
const contentImageFileTypes = ["image/png", "image/jpeg", "image/webp"];

const getInitialLanguage = (lng: string): EditableLanguage =>
  languages.find((language) => lng.toLowerCase().startsWith(language)) ??
  Locale.pl;

const getBlockText = (
  block: StorefrontHomeBlock,
  language: EditableLanguage,
  field: "body" | "ctaLabel" | "subtitle" | "title",
) => block.translations?.[language]?.[field] ?? block[field];

type TranslatedBlockField = "body" | "ctaLabel" | "subtitle" | "title";

interface TranslatedFieldConfig {
  control: "input" | "textarea";
  defaultLabel: string;
  field: TranslatedBlockField;
  labelKey: string;
}

const translatedFieldsByBlockType: Record<
  StorefrontHomeBlockType,
  readonly TranslatedFieldConfig[]
> = {
  assistant: [],
  campaigns: [],
  "featured-products": [
    {
      control: "input",
      defaultLabel: "Section Heading",
      field: "title",
      labelKey: "store.editor.block.fields.featuredProductsTitle",
    },
    {
      control: "textarea",
      defaultLabel: "Section Description",
      field: "subtitle",
      labelKey: "store.editor.block.fields.featuredProductsDescription",
    },
  ],
  hero: [],
  "how-it-works": [
    {
      control: "input",
      defaultLabel: "Section Heading",
      field: "title",
      labelKey: "store.editor.block.fields.howItWorksTitle",
    },
    {
      control: "textarea",
      defaultLabel: "Section Description",
      field: "subtitle",
      labelKey: "store.editor.block.fields.howItWorksDescription",
    },
  ],
  newsletter: [
    {
      control: "input",
      defaultLabel: "Newsletter Heading",
      field: "title",
      labelKey: "store.editor.block.fields.newsletterTitle",
    },
    {
      control: "textarea",
      defaultLabel: "Newsletter Description",
      field: "subtitle",
      labelKey: "store.editor.block.fields.newsletterDescription",
    },
    {
      control: "input",
      defaultLabel: "Subscribe Button Text",
      field: "ctaLabel",
      labelKey: "store.editor.block.fields.newsletterCtaLabel",
    },
    {
      control: "input",
      defaultLabel: "Disclaimer",
      field: "body",
      labelKey: "store.editor.block.fields.newsletterDisclaimer",
    },
  ],
  "popular-products": [
    {
      control: "input",
      defaultLabel: "Section Heading",
      field: "title",
      labelKey: "store.editor.block.fields.popularTitle",
    },
    {
      control: "textarea",
      defaultLabel: "Section Description",
      field: "subtitle",
      labelKey: "store.editor.block.fields.popularDescription",
    },
  ],
  "rich-text-cta": [
    {
      control: "input",
      defaultLabel: "Heading",
      field: "title",
      labelKey: "store.editor.block.fields.richTextTitle",
    },
    {
      control: "textarea",
      defaultLabel: "Text",
      field: "body",
      labelKey: "store.editor.block.fields.richTextBody",
    },
    {
      control: "input",
      defaultLabel: "Button Text",
      field: "ctaLabel",
      labelKey: "store.editor.block.fields.richTextCtaLabel",
    },
  ],
  testimonials: [
    {
      control: "input",
      defaultLabel: "Section Heading",
      field: "title",
      labelKey: "store.editor.block.fields.testimonialsTitle",
    },
    {
      control: "textarea",
      defaultLabel: "Section Description",
      field: "subtitle",
      labelKey: "store.editor.block.fields.testimonialsDescription",
    },
  ],
  "trust-grid": [
    {
      control: "input",
      defaultLabel: "Section Heading",
      field: "title",
      labelKey: "store.editor.block.fields.trustGridTitle",
    },
    {
      control: "textarea",
      defaultLabel: "Section Description",
      field: "subtitle",
      labelKey: "store.editor.block.fields.trustGridDescription",
    },
  ],
};

const variantLabels: Record<
  StorefrontHomeBlockType,
  Partial<Record<StorefrontHomeBlockVariant, string>>
> = {
  assistant: {
    compact: "Compact Prompt",
    default: "Default",
    panel: "Framed Panel",
  },
  campaigns: {
    compact: "Compact Promos",
    default: "Default",
    featured: "Featured Promos",
  },
  "featured-products": {
    compact: "Compact Grid",
    default: "Default",
    spotlight: "Spotlight Grid",
  },
  hero: {
    default: "Default",
    editorial: "Editorial Split",
    fullscreen: "Fullscreen",
  },
  "how-it-works": {
    compact: "Compact Steps",
    default: "Default",
    timeline: "Timeline",
  },
  newsletter: {
    default: "Default",
    inline: "Inline",
    minimal: "Minimal",
  },
  "popular-products": {
    compact: "Compact Grid",
    default: "Default",
    editorial: "Editorial Grid",
  },
  "rich-text-cta": {
    centered: "Centered",
    default: "Default",
    split: "Split",
  },
  testimonials: {
    compact: "Compact Reviews",
    default: "Default",
    spotlight: "Spotlight",
  },
  "trust-grid": {
    cards: "Cards",
    default: "Default",
    strip: "Icon Strip",
  },
};

export const StorefrontEditorBlockSection = ({
  adminCmsUrl,
  block,
  initialLanguage,
  onChangeBlock,
}: {
  adminCmsUrl?: string;
  block: StorefrontHomeBlock;
  initialLanguage: string;
  onChangeBlock: (block: StorefrontHomeBlock) => void;
}) => {
  const { t } = useT();
  const [editingLanguage, setEditingLanguage] = useState<EditableLanguage>(
    getInitialLanguage(initialLanguage),
  );
  const blockLabel = t(presetLabelKey(block.type), {
    defaultValue: presetLabels[block.type],
  });
  const translatedFields = translatedFieldsByBlockType[block.type];
  const isRichTextCta = block.type === "rich-text-cta";
  const blockVariants = STOREFRONT_HOME_BLOCK_VARIANTS[block.type];
  const selectedVariant = block.variant ?? "default";
  const hasEditableFields = translatedFields.length > 0 || isRichTextCta;
  const updateBlock = (
    field: keyof StorefrontHomeBlock,
    value: string | boolean | undefined,
  ) => onChangeBlock({ ...block, [field]: value });
  const updateTranslatedText = (field: TranslatedBlockField, value: string) =>
    onChangeBlock({
      ...block,
      translations: {
        ...block.translations,
        [editingLanguage]: {
          ...block.translations?.[editingLanguage],
          [field]: value,
        },
      },
    });

  return (
    <Stack gap={3}>
      <HStack justify="space-between">
        <Box minW={0}>
          <Text fontWeight="medium" fontSize="sm">
            {t("store.editor.block.title", {
              defaultValue: "Selected Block",
            })}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {blockLabel}
          </Text>
        </Box>
        <Badge variant={block.enabled ? "solid" : "subtle"}>
          {block.enabled
            ? t("store.editor.block.visible", {
                defaultValue: "Visible",
              })
            : t("store.editor.block.hidden", {
                defaultValue: "Hidden",
              })}
        </Badge>
      </HStack>
      <Stack gap={2}>
        <Text fontSize="sm">
          {t("store.editor.block.variant", {
            defaultValue: "Layout Variation",
          })}
        </Text>
        <SimpleGrid columns={3} gap={1}>
          {blockVariants.map((variant) => (
            <Button
              key={variant}
              flexDirection="column"
              gap={1}
              h="auto"
              py={2}
              size="xs"
              variant={selectedVariant === variant ? "solid" : "outline"}
              whiteSpace="normal"
              onClick={() => updateBlock("variant", variant)}
            >
              <StorefrontBlockVariantIcon type={block.type} variant={variant} />
              <Text fontSize="2xs" lineHeight="short">
                {t(variantLabelKey(block.type, variant), {
                  defaultValue: variantLabels[block.type][variant] ?? variant,
                })}
              </Text>
            </Button>
          ))}
        </SimpleGrid>
      </Stack>
      {block.type === "hero" ? (
        <Box
          bg={{ base: "blackAlpha.50", _dark: "whiteAlpha.100" }}
          borderRadius="2xl"
          px={3}
          py={2}
        >
          <Text fontSize="sm" fontWeight="medium">
            {t("store.editor.block.heroCmsTitle", {
              defaultValue: "Hero Content Managed in CMS",
            })}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {t("store.editor.block.heroCmsDescription", {
              defaultValue:
                "Edit hero slides, text, links, and media in Admin CMS. This panel controls the hero layout.",
            })}
          </Text>
          {adminCmsUrl ? (
            <Button asChild mt={2} size="xs" variant="outline">
              <a href={adminCmsUrl} rel="noreferrer" target="_blank">
                <MaterialSymbol fontSize="1rem">open_in_new</MaterialSymbol>
                {t("store.editor.block.heroCmsLink", {
                  defaultValue: "Open Admin CMS",
                })}
              </a>
            </Button>
          ) : null}
        </Box>
      ) : null}
      {translatedFields.length > 0 ? (
        <Stack gap={2}>
          <HStack gap={1}>
            <Text fontSize="sm">
              {t("store.editor.block.language", {
                defaultValue: "Editing Language",
              })}
            </Text>
            <Tooltip
              content={t("store.editor.block.autoTranslationTooltip", {
                defaultValue:
                  "Write this block in the selected language. When you publish, missing Polish or English text is generated automatically, and existing manual translations are kept.",
              })}
              contentProps={{ maxW: "260px", lineHeight: "short" }}
              showArrow
            >
              <IconButton
                aria-label={t("store.editor.block.autoTranslationInfo", {
                  defaultValue: "How automatic translation works",
                })}
                colorPalette="gray"
                size="2xs"
                variant="ghost"
              >
                <MaterialSymbol fontSize="1rem">info</MaterialSymbol>
              </IconButton>
            </Tooltip>
          </HStack>
          <HStack flexWrap="wrap">
            {languages.map((language) => (
              <Button
                key={language}
                size="xs"
                variant={editingLanguage === language ? "solid" : "outline"}
                onClick={() => setEditingLanguage(language)}
              >
                {t(languageLabelKeys[language], {
                  defaultValue: languageLabels[language],
                })}
              </Button>
            ))}
          </HStack>
        </Stack>
      ) : null}
      {translatedFields.map((fieldConfig) => (
        <Field.Root key={fieldConfig.field}>
          <Field.Label
            htmlFor={`storefront-editor-block-${block.type}-${fieldConfig.field}`}
          >
            {t(fieldConfig.labelKey, {
              defaultValue: fieldConfig.defaultLabel,
            })}
          </Field.Label>
          {fieldConfig.control === "textarea" ? (
            <Textarea
              id={`storefront-editor-block-${block.type}-${fieldConfig.field}`}
              name={`storefront-editor-block-${block.type}-${fieldConfig.field}`}
              onChange={(event) =>
                updateTranslatedText(fieldConfig.field, event.target.value)
              }
              rows={4}
              value={
                getBlockText(block, editingLanguage, fieldConfig.field) ?? ""
              }
            />
          ) : (
            <Input
              id={`storefront-editor-block-${block.type}-${fieldConfig.field}`}
              name={`storefront-editor-block-${block.type}-${fieldConfig.field}`}
              onChange={(event) =>
                updateTranslatedText(fieldConfig.field, event.target.value)
              }
              value={
                getBlockText(block, editingLanguage, fieldConfig.field) ?? ""
              }
            />
          )}
        </Field.Root>
      ))}
      {isRichTextCta ? (
        <>
          <Field.Root>
            <Field.Label
              htmlFor={`storefront-editor-block-${block.type}-ctaHref`}
            >
              {t("store.editor.block.fields.richTextCtaHref", {
                defaultValue: "Button Link",
              })}
            </Field.Label>
            <Input
              id={`storefront-editor-block-${block.type}-ctaHref`}
              name={`storefront-editor-block-${block.type}-ctaHref`}
              onChange={(event) =>
                updateBlock("ctaHref", event.target.value || undefined)
              }
              type="url"
              value={block.ctaHref ?? ""}
            />
          </Field.Root>
          <StorefrontEditorImageField
            accept={contentImageFileTypes}
            description={t("store.editor.block.imageDropzoneDescription", {
              defaultValue: "PNG, JPG, or WebP under 5 MB.",
            })}
            id="storefront-editor-block-image"
            label={t("store.editor.block.fields.richTextImageUrl", {
              defaultValue: "Image",
            })}
            maxFileSize={maxContentImageFileSizeBytes}
            previewRatio={16 / 9}
            upload={(file) =>
              uploadStorefrontImage({
                endpoint: "/api/storefront-editor/media",
                file,
                fileField: "image",
                responseField: "imageUrl",
              })
            }
            value={block.imageUrl}
            onChange={(imageUrl) => updateBlock("imageUrl", imageUrl)}
          />
        </>
      ) : null}
      {!hasEditableFields && block.type !== "hero" ? (
        <Box
          bg={{ base: "blackAlpha.50", _dark: "whiteAlpha.100" }}
          borderRadius="2xl"
          px={3}
          py={2}
        >
          <Text fontSize="sm" fontWeight="medium">
            {t("store.editor.block.builtInTitle", {
              defaultValue: "Built-In Section",
            })}
          </Text>
          <Text color="fg.muted" fontSize="xs">
            {t("store.editor.block.builtInDescription", {
              defaultValue:
                "This section uses store data or existing translations. Use the controls on the section itself to move, hide, or remove it.",
            })}
          </Text>
        </Box>
      ) : null}
    </Stack>
  );
};
