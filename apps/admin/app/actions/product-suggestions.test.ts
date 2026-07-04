import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormattedOrderItem } from "@konfi/types";
import type { ProductsSuggestionInput } from "@/lib/ai/product-suggestion";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  productsSuggestionFlow: vi.fn(),
  requireTenantAdminChannelAccess: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireTenantAdminChannelAccess: mocks.requireTenantAdminChannelAccess,
}));

vi.mock("@/lib/ai/product-suggestion", () => ({
  productsSuggestionFlow: mocks.productsSuggestionFlow,
}));

const generatedItem: FormattedOrderItem = {
  id: "item-1",
  name: "",
  product: {
    id: "product-1",
    name: "Poster",
    channelId: "channel-a",
    spec: {
      images: [],
    },
  },
  description: "Poster A3",
  combination: "mat",
  calculatedCombination: "Mat",
  volume: 0,
  customFormat: false,
  totalPrice: 1200,
  customPrice: null,
  width: 0,
  height: 0,
  quantity: 10,
  discount: {
    active: false,
    name: "",
    value: 0,
    discountedAmount: 0,
  },
  unit: "pcs",
};

function createInput(overrides?: Partial<ProductsSuggestionInput>) {
  return {
    channelId: " channel-a ",
    question: " 10 posters ",
    productNamesWithAttributes: [
      {
        productId: " product-1 ",
        productName: " Poster ",
        attributesWithOptions: [
          {
            attributeName: " Finish ",
            options: [" Mat ", "", " Gloss "],
          },
        ],
      },
      {
        productId: " ",
        productName: " Empty ",
        attributesWithOptions: [],
      },
    ],
    ...overrides,
  } satisfies ProductsSuggestionInput;
}

describe("generateOrderItemsFromClientInformationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantAdminChannelAccess.mockImplementation(
      (channelId: string) => Promise.resolve(channelId.trim()),
    );
  });

  it("authorizes the channel and runs product suggestions with normalized input", async () => {
    mocks.productsSuggestionFlow.mockResolvedValue([generatedItem]);
    const { generateOrderItemsFromClientInformationAction } =
      await import("./product-suggestions");

    const result =
      await generateOrderItemsFromClientInformationAction(createInput());

    expect(mocks.requireTenantAdminChannelAccess).toHaveBeenCalledWith(
      " channel-a ",
    );
    expect(mocks.productsSuggestionFlow).toHaveBeenCalledWith({
      channelId: "channel-a",
      question: "10 posters",
      productNamesWithAttributes: [
        {
          productId: "product-1",
          productName: "Poster",
          attributesWithOptions: [
            {
              attributeName: "Finish",
              options: ["Mat", "Gloss"],
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      ok: true,
      items: [generatedItem],
    });
  });

  it("returns a controlled error for empty client information", async () => {
    const { generateOrderItemsFromClientInformationAction } =
      await import("./product-suggestions");

    const result = await generateOrderItemsFromClientInformationAction(
      createInput({ question: " " }),
    );

    expect(mocks.productsSuggestionFlow).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "Customer information is required.",
    });
  });

  it("returns a controlled error when product suggestion fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.productsSuggestionFlow.mockRejectedValue(new Error("AI failed"));
    const { generateOrderItemsFromClientInformationAction } =
      await import("./product-suggestions");

    const result =
      await generateOrderItemsFromClientInformationAction(createInput());

    expect(result).toEqual({
      ok: false,
      error: "AI failed",
    });

    consoleError.mockRestore();
  });
});
