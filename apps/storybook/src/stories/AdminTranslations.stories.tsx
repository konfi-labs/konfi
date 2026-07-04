import { Box, Text, VStack } from "@chakra-ui/react";
import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import {
  TranslationPanelView,
  type TranslationPanelGenerationMode,
  type TranslationPanelTranslation,
} from "../../../admin/app/[lng]/components/translations/TranslationPanelView";
import { createManagedTranslationDescriptor } from "../../../admin/lib/translations";

type MockTranslation = TranslationPanelTranslation & {
  name?: string;
  description?: string;
  seo?: {
    title?: string;
    description?: string;
    slug?: string;
  };
  options?: Array<{
    value?: string;
    label?: string;
  }>;
};

const productSource = {
  id: "poster-a3",
  name: "Plakat A3 premium",
  description:
    "Drukowany na grubym papierze satynowym. Opis jest celowo dłuższy, żeby sprawdzić zachowanie panelu przy treściach wymagających kilku wierszy.",
  seo: {
    title: "Plakat A3 premium",
    description: "Wysokiej jakości plakat A3 do kampanii i wydarzeń.",
    slug: "plakat-a3-premium",
  },
  specialNotes: "Nie tłumacz wymiarów ani nazw formatów papieru.",
};

const attributeSource = {
  id: "paper-finish",
  name: "Wykończenie papieru",
  options: [
    { value: "matte", label: "Matowe" },
    { value: "gloss", label: "Błyszczące" },
    { value: "soft-touch", label: "Soft touch" },
  ],
};

function metaFor(
  status: "manual" | "ai_generated" | "reviewed",
  sourceHash: string,
) {
  return {
    sourceLocale: DEFAULT_LOCALE,
    sourceHash,
    status,
  };
}

const productDescriptor = createManagedTranslationDescriptor(
  "product",
  productSource,
);
const attributeDescriptor = createManagedTranslationDescriptor(
  "attribute",
  attributeSource,
);

function productTranslation(
  overrides: Partial<MockTranslation> = {},
): MockTranslation {
  return {
    locale: Locale.en,
    active: true,
    name: "Premium A3 poster",
    description: "Printed on thick satin paper.",
    seo: {
      title: "Premium A3 poster",
      description: "High-quality A3 poster for campaigns and events.",
      slug: "premium-a3-poster",
    },
    translationMeta: metaFor("reviewed", productDescriptor.sourceHash),
    ...overrides,
  };
}

function MockTranslationFields({
  translation,
  type,
}: {
  translation?: MockTranslation;
  type: "CREATE" | "UPDATE";
}) {
  return (
    <VStack align="stretch" gap={2}>
      <Text fontWeight="medium">{type} form preview</Text>
      <Box
        border="1px solid"
        borderColor="border.muted"
        borderRadius="md"
        p={3}
      >
        <Text color="fg.muted" fontSize="xs">
          Name
        </Text>
        <Text>{translation?.name ?? ""}</Text>
      </Box>
      <Box
        border="1px solid"
        borderColor="border.muted"
        borderRadius="md"
        p={3}
      >
        <Text color="fg.muted" fontSize="xs">
          Description
        </Text>
        <Text>{translation?.description ?? ""}</Text>
      </Box>
    </VStack>
  );
}

async function generateAction(params: {
  locale: Locale;
  mode: TranslationPanelGenerationMode;
}) {
  action("generate translation")(params);
}

async function reviewAction(params: { locale: Locale }) {
  action("mark reviewed")(params);
}

const meta = {
  title: "Admin/Translations",
  parameters: {
    appTheme: "admin",
    nextjs: {
      navigation: {
        segments: [["lng", "en"]],
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Missing: Story = {
  render: () => (
    <TranslationPanelView
      kind="product"
      source={productSource}
      translations={[] as MockTranslation[]}
      defaultOpen
      onGenerateTranslation={generateAction}
      onMarkReviewed={reviewAction}
      renderForm={({ translation, type }) => (
        <MockTranslationFields translation={translation} type={type} />
      )}
    />
  ),
};

export const AiDraft: Story = {
  render: () => (
    <TranslationPanelView
      kind="product"
      source={productSource}
      translations={[
        productTranslation({
          translationMeta: metaFor(
            "ai_generated",
            productDescriptor.sourceHash,
          ),
        }),
      ]}
      defaultOpen
      onGenerateTranslation={generateAction}
      onMarkReviewed={reviewAction}
      renderForm={({ translation, type }) => (
        <MockTranslationFields translation={translation} type={type} />
      )}
    />
  ),
};

export const Stale: Story = {
  render: () => (
    <TranslationPanelView
      kind="product"
      source={productSource}
      translations={[
        productTranslation({
          translationMeta: metaFor("manual", "source-before-edit"),
        }),
      ]}
      defaultOpen
      onGenerateTranslation={generateAction}
      onMarkReviewed={reviewAction}
      renderForm={({ translation, type }) => (
        <MockTranslationFields translation={translation} type={type} />
      )}
    />
  ),
};

export const Complete: Story = {
  render: () => (
    <TranslationPanelView
      kind="product"
      source={productSource}
      translations={[productTranslation()]}
      onGenerateTranslation={generateAction}
      onMarkReviewed={reviewAction}
      renderForm={({ translation, type }) => (
        <MockTranslationFields translation={translation} type={type} />
      )}
    />
  ),
};

export const LongText: Story = {
  render: () => (
    <TranslationPanelView
      kind="product"
      source={{
        ...productSource,
        description: `${productSource.description} Zachowaj tokeny {{customerName}}, linki https://konfi.local/products oraz formatowanie list:
- pierwsza linia
- druga linia`,
      }}
      translations={[
        productTranslation({
          description:
            "Printed on thick satin paper. Keep {{customerName}}, links, and list formatting unchanged.",
        }),
      ]}
      defaultOpen
      onGenerateTranslation={generateAction}
      onMarkReviewed={reviewAction}
      renderForm={({ translation, type }) => (
        <MockTranslationFields translation={translation} type={type} />
      )}
    />
  ),
};

export const AttributeOptions: Story = {
  render: () => (
    <TranslationPanelView
      kind="attribute"
      source={attributeSource}
      translations={[
        {
          locale: Locale.en,
          active: true,
          name: "Paper finish",
          options: [
            { value: "matte", label: "Matte" },
            { value: "gloss", label: "Gloss" },
            { value: "soft-touch", label: "Soft touch" },
          ],
          translationMeta: metaFor("reviewed", attributeDescriptor.sourceHash),
        },
      ]}
      defaultOpen
      onGenerateTranslation={generateAction}
      onMarkReviewed={reviewAction}
      renderForm={({ translation, type }) => (
        <MockTranslationFields translation={translation} type={type} />
      )}
    />
  ),
};
