import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import {
  CurrencyEnum,
  PriceTypeEnum,
  PrintingMethod,
  Product,
} from "@konfi/types";
import { Firestore } from "firebase/firestore";
import { render } from "../../../test-utils/render";
import { Price } from "../Price";

type SwrResult = {
  data:
    | {
        prices: Product["prices"];
        pageCountStepPrices: Product["prices"];
      }
    | undefined;
  isValidating: boolean;
};

const { mockUseSWR } = vi.hoisted(() => ({
  mockUseSWR: vi.fn<(...args: unknown[]) => SwrResult>(),
}));

vi.mock("swr", () => ({
  default: mockUseSWR,
}));

const mockT = (key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key;

const dynamicProduct = {
  id: "dynamic-product-1",
  name: "Dynamic product",
  priceType: PriceTypeEnum.DYNAMIC,
  disablePriceFetch: false,
  volumes: [{ value: 50, printType: PrintingMethod.DIGITAL }],
  spec: {
    minimumOrder: 50,
    maximumOrder: 2500,
    step: 50,
  },
  designSpec: {},
  category: { id: "cat-1", name: "Category" },
  dynamicPricing: {
    enabled: true,
    basePrice: 1000,
    baseDeliveryTime: 2,
    linkedPresetIds: [],
    attributeRules: [],
    globalRules: [],
  },
} as Product;

describe("Price", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSWR.mockReturnValue({
      data: {
        prices: [
          {
            value: 1000,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "paper",
              active: true,
              customFormat: false,
            },
            volume: {
              value: 50,
              deliveryTime: 2,
            },
          },
        ],
        pageCountStepPrices: [],
      },
      isValidating: false,
    });
  });

  test("fetches dynamic prices without db and getDoc in preview contexts", () => {
    render(
      <Price
        product={dynamicProduct}
        combination="paper"
        calculatedCombination="paper"
        resolvedPrices={[]}
        customFormat={false}
        width={0}
        height={0}
        quantity={1}
        volume={50}
        selectedAttributeOptions={{ paper: "paper" }}
        descriptionCombination="paper"
        channelId="channel-1"
        firestore={{} as Firestore}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(mockUseSWR).toHaveBeenCalledTimes(1);
    expect(mockUseSWR.mock.calls[0]?.[0]).not.toBeNull();
  });

  test("renders a resolved zero price instead of staying in loading state", () => {
    mockUseSWR.mockReturnValue({
      data: {
        prices: [
          {
            value: 0,
            currency: CurrencyEnum.PLN,
            combination: {
              id: "paper",
              active: true,
              customFormat: false,
            },
            volume: {
              value: 50,
              deliveryTime: 2,
            },
          },
        ],
        pageCountStepPrices: [],
      },
      isValidating: false,
    });

    render(
      <Price
        product={dynamicProduct}
        combination="paper"
        calculatedCombination="paper"
        resolvedPrices={[]}
        customFormat={false}
        width={0}
        height={0}
        quantity={1}
        volume={50}
        selectedAttributeOptions={{ paper: "paper" }}
        descriptionCombination="paper"
        channelId="channel-1"
        firestore={{} as Firestore}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  test("includes selected attribute options in the dynamic SWR cache key", () => {
    const firstSelection = { paper: "paper" };
    const secondSelection = { paper: "foil" };

    const rendered = render(
      <Price
        product={dynamicProduct}
        combination="paper"
        calculatedCombination="paper"
        resolvedPrices={[]}
        customFormat={false}
        width={0}
        height={0}
        quantity={1}
        volume={50}
        selectedAttributeOptions={firstSelection}
        descriptionCombination="paper"
        channelId="channel-1"
        firestore={{} as Firestore}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    rendered.rerender(
      <Price
        product={dynamicProduct}
        combination="paper"
        calculatedCombination="paper"
        resolvedPrices={[]}
        customFormat={false}
        width={0}
        height={0}
        quantity={1}
        volume={50}
        selectedAttributeOptions={secondSelection}
        descriptionCombination="paper"
        channelId="channel-1"
        firestore={{} as Firestore}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(mockUseSWR).toHaveBeenCalledTimes(2);
    expect(mockUseSWR.mock.calls[0]?.[0]).not.toEqual(
      mockUseSWR.mock.calls[1]?.[0],
    );
  });

  test("includes price offsets in the SWR cache key", () => {
    const rendered = render(
      <Price
        product={dynamicProduct}
        combination="paper"
        calculatedCombination="paper"
        resolvedPrices={[]}
        customFormat={false}
        width={0}
        height={0}
        quantity={1}
        volume={50}
        selectedAttributeOptions={{ paper: "paper" }}
        descriptionCombination="paper"
        channelId="channel-1"
        firestore={{} as Firestore}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    rendered.rerender(
      <Price
        product={{
          ...dynamicProduct,
          priceOffsets: {
            enabled: true,
            rules: [
              {
                enabled: true,
                fixedValue: 100,
                id: "offset",
                scope: "product",
              },
            ],
          },
        }}
        combination="paper"
        calculatedCombination="paper"
        resolvedPrices={[]}
        customFormat={false}
        width={0}
        height={0}
        quantity={1}
        volume={50}
        selectedAttributeOptions={{ paper: "paper" }}
        descriptionCombination="paper"
        channelId="channel-1"
        firestore={{} as Firestore}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(mockUseSWR).toHaveBeenCalledTimes(2);
    expect(mockUseSWR.mock.calls[0]?.[0]).not.toEqual(
      mockUseSWR.mock.calls[1]?.[0],
    );
  });

  test("marks matrix-like dynamic configurations as invalid when fetched prices are empty", async () => {
    const setBadConfiguration = vi.fn();

    mockUseSWR.mockReturnValue({
      data: {
        prices: [],
        pageCountStepPrices: [],
      },
      isValidating: false,
    });

    render(
      <Price
        product={dynamicProduct}
        combination="paper"
        calculatedCombination="paper"
        resolvedPrices={[]}
        customFormat={false}
        width={0}
        height={0}
        quantity={1}
        volume={50}
        selectedAttributeOptions={{ paper: "paper" }}
        descriptionCombination="paper"
        channelId="channel-1"
        firestore={{} as Firestore}
        setBadConfiguration={setBadConfiguration}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    await waitFor(() => {
      expect(setBadConfiguration).toHaveBeenCalledWith(true);
    });
  });
});
