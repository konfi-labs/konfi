import type { AgentInteractionSpec } from "../../../admin/lib/ai/agent-harness";
import { AgentInteractionPanel } from "../../../admin/app/[lng]/tools/tasks/components/AgentInteractionPanel";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

const customerSelectionInteraction: AgentInteractionSpec = {
  body: "Którego klienta 'Example Customer' mam wybrać do tej oferty?\n\nZnaleziono dwóch klientów o tej samej nazwie.",
  fields: [
    {
      id: "customerId",
      kind: "select",
      label: "Klient",
      options: [
        {
          description: "customer.one@example.com • NIP: 000000000",
          label: "1. Example Customer",
          value: "exampleCustomer1",
        },
        {
          description: "customer.two@example.com • B2B",
          label: "2. Example Customer",
          value: "exampleCustomer2",
        },
      ],
      required: true,
    },
  ],
  kind: "form",
  title: "Wybór klienta",
  version: "konfi.agent-interaction.v1",
};

const meta = {
  component: AgentInteractionPanel,
  title: "Admin/Agents/AgentInteractionPanel",
  parameters: {
    appTheme: "admin",
  },
  args: {
    interaction: customerSelectionInteraction,
    labels: {
      prefilledData: "Prefilled data",
      selected: "Selected",
      titleFallback: "Agent question",
      valueLabel: "ID",
    },
    onSelectValue: fn(),
  },
} satisfies Meta<typeof AgentInteractionPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CustomerSelection: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("2. Example Customer"));
    await expect(args.onSelectValue).toHaveBeenCalledWith("exampleCustomer2");
  },
};
