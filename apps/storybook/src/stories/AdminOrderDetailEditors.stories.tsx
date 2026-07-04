import { Badge, Box, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { Payment } from "@konfi/components";
import {
  NestedCustomer,
  Order,
  PaymentStatus,
  PaymentStatusAsOptions,
  PaymentType,
  PrintingMethod,
  type PrintingMethodId,
  type PrintingMethodsSettings,
  SelectOption,
  ShippingOptions,
} from "@konfi/types";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { ComponentProps, useMemo, useState } from "react";
import { action } from "storybook/actions";
import { OrderDeadlineInlineEditor } from "../../../admin/app/[lng]/components/orders/OrderDeadlineInlineEditor";
import { OrderExecutionInlineEditor } from "../../../admin/app/[lng]/components/orders/OrderExecutionInlineEditor";
import { StatusSelect } from "../../../admin/app/[lng]/components/orders/status-select";

const meta = {
  title: "Admin/Order Detail Editors",
  parameters: {
    appTheme: "admin",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function humanizeKey(key: string) {
  const token = key.split(".").pop() ?? key;
  return token
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function interpolateTemplate(
  template: string,
  values: Record<string, unknown>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, placeholder: string) => {
    return String(values[placeholder] ?? "");
  });
}

function storyTranslate(key: unknown, options?: unknown) {
  const resolvedKey =
    typeof key === "string"
      ? key
      : Array.isArray(key)
        ? String(key[0] ?? "")
        : String(key);
  const resolvedOptions =
    typeof options === "object" && options !== null
      ? (options as Record<string, unknown>)
      : {};
  const translation =
    typeof resolvedOptions.defaultValue === "string"
      ? resolvedOptions.defaultValue
      : humanizeKey(resolvedKey);

  return interpolateTemplate(translation, {
    ...(typeof resolvedOptions.values === "object" && resolvedOptions.values
      ? (resolvedOptions.values as Record<string, unknown>)
      : {}),
    ...resolvedOptions,
  });
}

const storyT = storyTranslate as unknown as ComponentProps<
  typeof OrderDeadlineInlineEditor
>["t"];

const storyI18n = {
  resolvedLanguage: "en",
} as unknown as ComponentProps<typeof OrderDeadlineInlineEditor>["i18n"];

const demoCustomer = {
  id: "customer-story-1",
  name: "Acme Print Studio",
  allowedBankPayments: true,
  allowedDefferedPayments: true,
  allowedOnPickupPayments: true,
} as NestedCustomer;

const demoPrintingMethodsSettings: PrintingMethodsSettings = {
  methods: [
    {
      id: PrintingMethod.DIGITAL,
      name: "Digital",
      icon: "print",
      colorPalette: "cyan",
      enabled: true,
      archived: false,
      isDefault: true,
      order: 0,
    },
    {
      id: PrintingMethod.CUTTING,
      name: "Cutting",
      icon: "content_cut",
      colorPalette: "red",
      enabled: true,
      archived: false,
      isDefault: true,
      order: 1,
    },
    {
      id: "archived-foil",
      name: "Archived Foil",
      icon: "auto_awesome",
      colorPalette: "purple",
      enabled: false,
      archived: true,
      order: 2,
    },
    {
      id: "wide-format-production-with-an-extra-long-name",
      name: "Wide Format Production With an Extra Long Name",
      icon: "wall_art",
      colorPalette: "green",
      enabled: true,
      archived: false,
      order: 3,
    },
  ],
};

function OrderDetailEditorsPreview() {
  const [deadlineString, setDeadlineString] = useState("2026-05-06");
  const [exactTime, setExactTime] = useState(false);
  const [printingMethods, setPrintingMethods] = useState<PrintingMethodId[]>([
    PrintingMethod.DIGITAL,
    PrintingMethod.CUTTING,
    "archived-foil",
    "UNKNOWN_METHOD",
    "wide-format-production-with-an-extra-long-name",
  ]);
  const [paymentType, setPaymentType] = useState(PaymentType.BANK_TRANSFER);
  const [paymentStatus, setPaymentStatus] = useState(PaymentStatus.NEW);

  const paymentStatusOptions = useMemo<SelectOption[]>(
    () =>
      PaymentStatusAsOptions.map((option) => ({
        label: storyT(`PaymentStatus.${option.label}`),
        value: option.value,
      })),
    [],
  );

  const deadline = useMemo(() => {
    const normalizedValue = deadlineString.includes("T")
      ? deadlineString
      : `${deadlineString}T12:00:00`;

    return {
      toDate: () => new Date(normalizedValue),
    } as Order["deadline"];
  }, [deadlineString]);

  const interactiveOrder = useMemo(
    () =>
      ({
        activities: [],
        anonymousPackageShipping: false,
        isFromStore: false,
        paymentStatus,
        paymentType,
        shippingOption: ShippingOptions.PERSONAL_COLLECTION,
        totalPrice: 12900,
      }) as unknown as Order,
    [paymentStatus, paymentType],
  );

  return (
    <VStack align="stretch" gap={6} maxW="4xl">
      <Box>
        <Heading size="md">Order detail quick editors</Heading>
        <Text color="fg.muted" fontSize="sm">
          Badge-triggered deadline and execution popovers, plus the inline
          payment method change flow.
        </Text>
      </Box>

      <Box borderRadius="3xl" borderWidth="1px" p={6}>
        <VStack align="stretch" gap={4}>
          <Text fontSize="sm" fontWeight="semibold">
            Header metadata row
          </Text>
          <HStack flexWrap="wrap" gap={2}>
            <Badge pl={3} pr={4} size="lg">
              Created on: 04/28/2026
            </Badge>
            <OrderDeadlineInlineEditor
              deadline={deadline}
              deadlineString={deadlineString}
              exactTime={exactTime}
              priority={1}
              onSave={async (value) => {
                action("save-deadline")(value);
                setDeadlineString(value.deadlineString);
                setExactTime(value.exactTime);
              }}
              t={storyT}
              i18n={storyI18n}
            />
          </HStack>
        </VStack>
      </Box>

      <Box borderRadius="3xl" borderWidth="1px" p={6}>
        <VStack align="stretch" gap={4}>
          <HStack gap={3} flexWrap="wrap">
            <Text as="h2" fontSize="lg" fontWeight="bold">
              Items
            </Text>
            <OrderExecutionInlineEditor
              printingMethods={printingMethods}
              printingMethodsSettings={demoPrintingMethodsSettings}
              onSave={async (value) => {
                action("save-execution")(value);
                setPrintingMethods(value.printingMethods);
              }}
              t={storyT}
            />
          </HStack>
        </VStack>
      </Box>

      <Box borderRadius="3xl" borderWidth="1px" p={6}>
        <Payment
          order={interactiveOrder}
          checkoutSessionUrl="https://example.com/pay/story-order-1"
          customer={demoCustomer}
          paymentStatus={paymentStatus}
          paymentType={paymentType}
          items={[]}
          shippingPrice={1900}
          totalPrice={12900}
          totalPriceWithoutDiscount={14900}
          currency={interactiveOrder.currency}
          paymentStatusControl={
            <HStack align="center" className="noprint" gap={2} flexWrap="wrap">
              <Text fontSize="sm" fontWeight="semibold">
                Payment status
              </Text>
              <Box minW="160px" maxW="220px">
                <StatusSelect
                  name="paymentStatus"
                  value={paymentStatus}
                  options={paymentStatusOptions}
                  onChange={(value) => {
                    if (value) {
                      setPaymentStatus(value as PaymentStatus);
                    }
                  }}
                  size="sm"
                />
              </Box>
            </HStack>
          }
          onPaymentMethodChange={async (nextPaymentType) => {
            action("change-payment-method")(nextPaymentType);
            setPaymentType(nextPaymentType as PaymentType);
            setPaymentStatus(PaymentStatus.NEW);
          }}
          t={storyT}
          i18n={storyI18n}
        />
      </Box>
    </VStack>
  );
}

export const Interactive: Story = {
  render: () => <OrderDetailEditorsPreview />,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit deadline" }),
    );

    await expect(
      within(document.body).getByText("Edit deadline"),
    ).toBeInTheDocument();

    const popover = within(document.body);
    await userEvent.click(popover.getByText("Exact time of realization"));
    await userEvent.click(popover.getByRole("button", { name: "Deadline" }));

    const timeButton = popover.getByRole("button", { name: "Time: 15:00" });
    await expect(timeButton).toBeInTheDocument();
    await userEvent.click(timeButton);
    await userEvent.click(popover.getByRole("button", { name: /Save/i }));

    await expect(
      canvas.getByRole("button", { name: "Edit deadline" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText(/Delivery time/i)).toBeInTheDocument();
  },
};
