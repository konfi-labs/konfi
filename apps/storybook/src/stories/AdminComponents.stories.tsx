import { Box, Heading, Text, VStack } from "@chakra-ui/react";
import { Locale } from "@konfi/types";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import { SampleMessages } from "../../../admin/app/[lng]/components/assistant/SampleMessages";
import { TranslationStatus } from "../../../admin/app/[lng]/components/blog/TranslationStatus";
import { DraftFakturowniaInvoiceDialogTrigger } from "../../../admin/app/[lng]/components/fakturownia/DraftFakturowniaInvoiceDialogTrigger";
import { FakturowniaInvoiceFormSkeleton } from "../../../admin/app/[lng]/components/fakturownia/FakturowniaInvoiceFormSkeleton";

const meta = {
  title: "Admin/Components",
  component: TranslationStatus,
  parameters: {
    appTheme: "admin",
  },
} satisfies Meta<typeof TranslationStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {
  args: {
    existingLocales: [Locale.en],
    size: "sm",
  },
  render: (args) => (
    <VStack align="start" gap={3}>
      <Box>
        <Heading size="md">Blog post translations</Heading>
        <Text color="fg.muted" fontSize="sm">
          Admin theme, compact operational surface.
        </Text>
      </Box>
      <TranslationStatus {...args} />
    </VStack>
  ),
};

export const MissingEnglish: Story = {
  args: {
    existingLocales: [],
    size: "sm",
  },
};

export const AssistantSampleMessages: Story = {
  args: {
    existingLocales: [Locale.en],
    size: "sm",
  },
  parameters: {
    nextjs: {
      navigation: {
        segments: [["lng", "en"]],
      },
    },
  },
  render: () => (
    <VStack align="stretch" gap={4} maxW="3xl">
      <Box>
        <Heading size="md">Assistant quick prompts</Heading>
        <Text color="fg.muted" fontSize="sm">
          High-traffic admin surface for starting operational AI tasks.
        </Text>
      </Box>
      <SampleMessages
        isLoading={false}
        onSendMessage={action("send-message")}
        onSetInputValue={action("set-input-value")}
      />
    </VStack>
  ),
};

export const AssistantSampleMessagesLoading: Story = {
  args: {
    existingLocales: [Locale.en],
    size: "sm",
  },
  render: () => (
    <Box maxW="3xl">
      <SampleMessages
        isLoading
        onSendMessage={action("send-message")}
        onSetInputValue={action("set-input-value")}
      />
    </Box>
  ),
};

export const DraftInvoiceDialogTrigger: Story = {
  args: {
    existingLocales: [Locale.en],
    size: "sm",
  },
  render: () => (
    <VStack align="stretch" gap={3} maxW="sm">
      <Box>
        <Heading size="md">Draft invoice action</Heading>
        <Text color="fg.muted" fontSize="sm">
          Empty draft state keeps the action disabled until items exist.
        </Text>
      </Box>
      <DraftFakturowniaInvoiceDialogTrigger disabled={true} />
    </VStack>
  ),
};

export const InvoiceFormSkeleton: Story = {
  args: {
    existingLocales: [Locale.en],
    size: "sm",
  },
  render: () => (
    <VStack align="stretch" gap={3} maxW="6xl">
      <Box>
        <Heading size="md">Fakturownia invoice form skeleton</Heading>
        <Text color="fg.muted" fontSize="sm">
          Loading state for the invoice form page and draft invoice dialog.
        </Text>
      </Box>
      <FakturowniaInvoiceFormSkeleton />
    </VStack>
  ),
};
