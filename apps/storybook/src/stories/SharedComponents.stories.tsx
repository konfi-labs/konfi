import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import {
  ButtonLink,
  CardSections,
  CustomDialog,
  Empty,
  MaterialSymbol,
  SpecialNotes,
  SpecialNotesPanel,
  Tooltip,
  VolumeList,
} from "@konfi/components";
import { CurrencyEnum, Unit } from "@konfi/types";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type ComponentProps, useState } from "react";

const meta = {
  title: "Shared/Components",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
type VolumeListProps = ComponentProps<typeof VolumeList>;
type SpecialNotesProps = ComponentProps<typeof SpecialNotes>;

const t = ((
  key: string,
  options?: {
    defaultValue?: string;
    threshold?: string;
    unit?: string;
    unitPrice?: string;
    remaining?: string;
  },
) => {
  if (key === "common.gross") return "gross";
  if (key === "common.orderBy") return "Order by";
  if (key === "common.unavailable") return "Unavailable";
  if (key === "Unit.PCS") return "pcs.";
  if (key === "Unit.M2") return "m²";
  if (key === "price.thresholdSummaryLabel") return "Price tiers";
  if (key === "price.thresholdSummaryItem") {
    return `> ${options?.threshold} ${options?.unit} ${options?.unitPrice}`;
  }
  return options?.defaultValue ?? key;
}) as VolumeListProps["t"];

const specialNotesT = ((
  key: string,
  options?: {
    defaultValue?: string;
  },
) => {
  if (key === "orderPage.specialNotes.heading") return "Special Notes";
  if (key === "orderPage.specialNotes.empty") return "No special notes";
  if (key === "orderPage.specialNotes.placeholder") {
    return "Enter special notes...";
  }
  if (key === "common.edit") return "Edit";
  if (key === "common.cancel") return "Cancel";
  if (key === "common.save") return "Save";
  return options?.defaultValue ?? key;
}) as SpecialNotesProps["t"];

export const EmptyState: Story = {
  render: () => (
    <Empty
      title="No products yet"
      description="Create a configurable product to preview shared empty states."
      icon="inventory_2"
      fontSize="120px"
    >
      <Button colorPalette="primary" mt={4} rounded="full">
        <MaterialSymbol>add</MaterialSymbol>
        Create product
      </Button>
    </Empty>
  ),
};

export const IconAndTooltip: Story = {
  render: () => (
    <VStack align="start" gap={4} maxW="md">
      <HStack gap={3} color="primary.solid" fontWeight="semibold">
        <MaterialSymbol fontSize={24}>auto_awesome</MaterialSymbol>
        Shared icon wrapper backed by Lucide icons
      </HStack>
      <Tooltip content="This tooltip comes from @konfi/components/ui">
        <Button variant="outline" colorPalette="primary">
          Hover for tooltip
        </Button>
      </Tooltip>
    </VStack>
  ),
};

export const AiButton: Story = {
  render: () => (
    <VStack align="start" gap={6} p={8}>
      <Button variant="ai">
        <MaterialSymbol>auto_awesome</MaterialSymbol>
        Generate with AI
      </Button>
      <Button variant="ai" size="xs">
        <MaterialSymbol>auto_awesome</MaterialSymbol>
        Suggest
      </Button>
    </VStack>
  ),
};

export const NavigationCards: Story = {
  render: () => (
    <Box maxW="4xl">
      <CardSections
        sectionCards={[
          {
            heading: "Catalog operations",
            cards: [
              {
                route: "/products",
                icon: "inventory_2",
                title: "Products",
                description:
                  "Manage configurable products, matrix prices, and storefront visibility.",
              },
              {
                route: "/orders",
                icon: "receipt_long",
                title: "Orders",
                description:
                  "Review production-ready files, delivery details, and customer notes.",
              },
            ],
          },
        ]}
      />
    </Box>
  ),
};

function DialogPreview() {
  const [open, setOpen] = useState(false);

  return (
    <VStack align="start" gap={4}>
      <Button colorPalette="primary" onClick={() => setOpen(true)}>
        <MaterialSymbol>visibility</MaterialSymbol>
        Preview shared dialog
      </Button>
      <CustomDialog header="Production note" open={open} setOpen={setOpen}>
        <VStack align="start" gap={3}>
          <Text>
            Shared dialogs should preserve Konfi spacing, close behavior, and
            light/dark theme contrast.
          </Text>
          <ButtonLink
            href="/orders"
            lng="en"
            ariaLabel="Open orders"
            colorPalette="primary"
            variant="outline"
          >
            <MaterialSymbol>open_in_new</MaterialSymbol>
            Open orders
          </ButtonLink>
        </VStack>
      </CustomDialog>
    </VStack>
  );
}

export const DialogAndButtonLink: Story = {
  render: () => <DialogPreview />,
};

export const SpecialNotesNotice: Story = {
  render: () => (
    <Box maxW="3xl">
      <SpecialNotes
        specialNotes={
          "Artwork files must stay in the original folder.\nUse matte laminate and confirm fold direction before production.\nCustomer confirmed that the small legal footer must remain readable at 6 pt, even on the narrow side panel. If the exported PDF changes scale, pause the job and request a new proof before printing the full batch."
        }
        t={specialNotesT}
      />
    </Box>
  ),
};

export const SpecialNotesPanelCompactInvoiceNotes: Story = {
  render: () => (
    <Box maxW="md">
      <SpecialNotesPanel
        heading="Invoice notes"
        specialNotes={
          "Split the invoice into two positions.\nSend a copy to accounting@example.com.\nAdd the purchasing reference from the customer email and keep the internal production comment out of the invoice description."
        }
        density="compact"
      />
    </Box>
  ),
};

export const SpecialNotesPanelCustomContent: Story = {
  render: () => (
    <Box maxW="3xl">
      <SpecialNotesPanel heading="Weekly production summary">
        <VStack align="start" gap={2}>
          <Text fontWeight="bold">Rendered from custom children</Text>
          <Text>
            The panel accepts arbitrary content, e.g. markdown previews on the
            notes page. Longer notes should stay readable on the orange
            background when they include multiple paragraphs, links, or
            production handoff details.
          </Text>
        </VStack>
      </SpecialNotesPanel>
    </Box>
  ),
};

function PriceThresholdVolumePreview() {
  const [value, setValue] = useState<VolumeListProps["value"]>({
    label: "1000",
    value: "1000",
  });

  return (
    <VolumeList
      value={value}
      handleOnChange={setValue}
      options={[
        {
          label: "250",
          value: "250",
          totalPrice: 42500,
          currency: CurrencyEnum.PLN,
          unit: Unit.PCS,
          deliveryTime: 2,
          priceThreshold: {
            value: 250,
            unitPrice: 170,
            currency: CurrencyEnum.PLN,
            unit: Unit.PCS,
            calculatedQuantity: 250,
            tiers: [
              {
                value: 250,
                unitPrice: 170,
                currency: CurrencyEnum.PLN,
                unit: Unit.PCS,
              },
              {
                value: 1000,
                unitPrice: 128,
                currency: CurrencyEnum.PLN,
                unit: Unit.PCS,
              },
            ],
            next: {
              value: 1000,
              unitPrice: 128,
              currency: CurrencyEnum.PLN,
              unit: Unit.PCS,
              remainingQuantity: 750,
            },
            tierCount: 2,
          },
        },
        {
          label: "1000",
          value: "1000",
          totalPrice: 128000,
          currency: CurrencyEnum.PLN,
          unit: Unit.PCS,
          deliveryTime: 4,
          priceThreshold: {
            value: 1000,
            unitPrice: 128,
            currency: CurrencyEnum.PLN,
            unit: Unit.PCS,
            calculatedQuantity: 1000,
            tiers: [
              {
                value: 250,
                unitPrice: 170,
                currency: CurrencyEnum.PLN,
                unit: Unit.PCS,
              },
              {
                value: 1000,
                unitPrice: 128,
                currency: CurrencyEnum.PLN,
                unit: Unit.PCS,
              },
            ],
            tierCount: 2,
          },
        },
        {
          label: "Very long custom quantity option 2500",
          value: "2500",
          totalPrice: undefined,
          currency: CurrencyEnum.PLN,
          unit: Unit.PCS,
          disabled: true,
        },
      ]}
      t={t}
      i18n={{ resolvedLanguage: "en" } as never}
    />
  );
}

export const PriceThresholdVolumeCards: Story = {
  render: () => (
    <Box maxW="3xl">
      <PriceThresholdVolumePreview />
    </Box>
  ),
};
