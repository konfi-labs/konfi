import "server-only";

import { getStoreVertexClient } from "@/lib/ai/server-vertex";
import {
  DEFAULT_LOCALE,
  Locale,
  type StorefrontHomeBlock,
  type StorefrontHomeBlockTranslation,
  type StorefrontHomePage,
} from "@konfi/types";
import { MODELS } from "@konfi/firebase";
import { Output, generateText } from "ai";
import { z } from "zod";

const storefrontContentLocales = Object.values(Locale);
const translationFields = [
  "body",
  "ctaLabel",
  "subtitle",
  "title",
] as const satisfies readonly (keyof StorefrontHomeBlockTranslation)[];

type StorefrontContentLocale = Locale;
type TranslationField = (typeof translationFields)[number];

interface TranslationRequestItem {
  blockId: string;
  field: TranslationField;
  text: string;
}

interface StorefrontTranslationOutputItem {
  blockId: string;
  field: TranslationField;
  translatedText: string;
}

const storefrontTranslationSchema = z.object({
  items: z.array(
    z.object({
      blockId: z.string(),
      field: z.enum(translationFields),
      translatedText: z.string(),
    }),
  ),
});

const languageNames: Record<StorefrontContentLocale, string> = {
  cs: "Czech",
  de: "German",
  en: "English",
  fr: "French",
  pl: "Polish",
  sk: "Slovak",
  uk: "Ukrainian",
};

const normalizeText = (value: string | undefined) => {
  const text = value?.trim();

  return text ? text : undefined;
};

const translationHasText = (
  translation: StorefrontHomeBlockTranslation | undefined,
  field: TranslationField,
) => Boolean(normalizeText(translation?.[field]));

const getSourceText = (
  block: StorefrontHomeBlock,
  sourceLocale: StorefrontContentLocale,
  field: TranslationField,
) =>
  normalizeText(block.translations?.[sourceLocale]?.[field]) ??
  normalizeText(block[field]);

export function normalizeStorefrontContentLocale(
  value: string | null | undefined,
): StorefrontContentLocale {
  const normalized = value?.toLowerCase().trim();
  const matchedLocale = storefrontContentLocales.find((locale) =>
    normalized?.startsWith(locale),
  );

  return matchedLocale ?? DEFAULT_LOCALE;
}

export function ensureStorefrontSourceTranslations(params: {
  homePage: StorefrontHomePage;
  sourceLocale: StorefrontContentLocale;
}): StorefrontHomePage {
  return {
    ...params.homePage,
    blocks: params.homePage.blocks.map((block) => {
      const sourceTranslation =
        translationFields.reduce<StorefrontHomeBlockTranslation>(
          (result, field) => {
            const text = getSourceText(block, params.sourceLocale, field);

            if (text) {
              result[field] = text;
            }

            return result;
          },
          {},
        );

      if (!Object.keys(sourceTranslation).length) {
        return block;
      }

      return {
        ...block,
        translations: {
          ...block.translations,
          [params.sourceLocale]: {
            ...block.translations?.[params.sourceLocale],
            ...sourceTranslation,
          },
        },
      };
    }),
    sourceLocale: params.sourceLocale,
  };
}

function collectMissingTranslations(params: {
  homePage: StorefrontHomePage;
  sourceLocale: StorefrontContentLocale;
  targetLocale: StorefrontContentLocale;
}): TranslationRequestItem[] {
  return params.homePage.blocks.flatMap((block) =>
    translationFields.flatMap((field) => {
      const text = getSourceText(block, params.sourceLocale, field);

      if (
        !text ||
        translationHasText(block.translations?.[params.targetLocale], field)
      ) {
        return [];
      }

      return [
        {
          blockId: block.id,
          field,
          text,
        },
      ];
    }),
  );
}

function applyStorefrontTranslations(params: {
  homePage: StorefrontHomePage;
  items: readonly StorefrontTranslationOutputItem[];
  targetLocale: StorefrontContentLocale;
}): StorefrontHomePage {
  const itemsByBlockId = params.items.reduce<
    Map<string, StorefrontTranslationOutputItem[]>
  >((result, item) => {
    const currentItems = result.get(item.blockId) ?? [];
    currentItems.push(item);
    result.set(item.blockId, currentItems);

    return result;
  }, new Map());

  return {
    ...params.homePage,
    blocks: params.homePage.blocks.map((block) => {
      const blockItems = itemsByBlockId.get(block.id);

      if (!blockItems?.length) {
        return block;
      }

      const translatedFields =
        blockItems.reduce<StorefrontHomeBlockTranslation>((result, item) => {
          const translatedText = normalizeText(item.translatedText);

          if (translatedText) {
            result[item.field] = translatedText;
          }

          return result;
        }, {});

      if (!Object.keys(translatedFields).length) {
        return block;
      }

      return {
        ...block,
        translations: {
          ...block.translations,
          [params.targetLocale]: {
            ...block.translations?.[params.targetLocale],
            ...translatedFields,
          },
        },
      };
    }),
  };
}

async function translateStorefrontItems(params: {
  items: readonly TranslationRequestItem[];
  sourceLocale: StorefrontContentLocale;
  targetLocale: StorefrontContentLocale;
}) {
  const vertex = await getStoreVertexClient();
  const { output } = await generateText({
    model: vertex(MODELS.GEMINI_3_FLASH_LITE),
    output: Output.object({ schema: storefrontTranslationSchema }),
    prompt: JSON.stringify({
      items: params.items,
      sourceLanguage: languageNames[params.sourceLocale],
      targetLanguage: languageNames[params.targetLocale],
    }),
    instructions: [
      "Translate public storefront block copy for a small e-commerce print store.",
      "Keep the meaning, formatting, numbers, brand names, and placeholders unchanged.",
      "Return one item for every input item with the same blockId and field.",
      "Do not add marketing claims, explanations, markdown wrappers, or extra items.",
    ].join(" "),
    temperature: 0,
  });

  return output.items;
}

export async function autoTranslateStorefrontHomePage(params: {
  homePage: StorefrontHomePage;
  sourceLocale: StorefrontContentLocale;
  targetLocales?: readonly StorefrontContentLocale[];
}): Promise<StorefrontHomePage> {
  let homePage = ensureStorefrontSourceTranslations({
    homePage: params.homePage,
    sourceLocale: params.sourceLocale,
  });
  const targetLocales =
    params.targetLocales ??
    storefrontContentLocales.filter((locale) => locale !== params.sourceLocale);

  for (const targetLocale of targetLocales) {
    const items = collectMissingTranslations({
      homePage,
      sourceLocale: params.sourceLocale,
      targetLocale,
    });

    if (!items.length) {
      continue;
    }

    try {
      const translatedItems = await translateStorefrontItems({
        items,
        sourceLocale: params.sourceLocale,
        targetLocale,
      });

      homePage = applyStorefrontTranslations({
        homePage,
        items: translatedItems,
        targetLocale,
      });
    } catch (error) {
      console.error("Error auto-translating storefront home page:", error);
    }
  }

  return homePage;
}
