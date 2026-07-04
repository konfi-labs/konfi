import "@testing-library/jest-dom";
import { waitFor } from "@testing-library/react";
import {
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  PrintingMethod,
  Product,
  Unit,
} from "@konfi/types";
import { Firestore } from "firebase/firestore";
import { render } from "../../../test-utils/render";
import { Quantity } from "../Quantity";

type SwrResult = {
  data:
    | {
        prices: Price[];
        pageCountStepPrices: Price[];
      }
    | undefined;
  isValidating: boolean;
  mutate: () => Promise<Price[] | undefined>;
};

type MockQuantityOption = {
  label: string;
  value: string;
  totalPrice: number;
  disabled?: boolean;
};

const { mockQuantityOptions, mockUseSWR, mockMutate } = vi.hoisted(() => ({
  mockQuantityOptions: {
    current: [
      { label: "50", value: "50", totalPrice: 1000 },
    ] as MockQuantityOption[],
  },
  mockUseSWR: vi.fn<(...args: unknown[]) => SwrResult>(),
  mockMutate: vi.fn<() => Promise<Price[] | undefined>>(),
}));

vi.mock("swr", () => ({
  default: mockUseSWR,
}));

vi.mock("../VolumeList", () => ({
  VolumeList: () => <div data-testid="volume-list" />,
}));

vi.mock("../Price", () => ({
  fetchPrices: vi.fn(),
}));

vi.mock("@konfi/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@konfi/utils")>("@konfi/utils");

  return {
    ...actual,
    validateQuantityOptions: vi.fn((prev, next, _options, setOptions) => {
      setOptions(mockQuantityOptions.current);
      return {
        ...prev,
        ...next,
      };
    }),
  };
});

const mockT = (key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key;

const product = {
  id: "product-1",
  name: "Test product",
  priceType: PriceTypeEnum.MATRIX,
  disablePriceFetch: false,
  volumes: [{ value: 50, printType: PrintingMethod.DIGITAL }],
  spec: {
    minimumOrder: 50,
    maximumOrder: 2500,
    step: 50,
  },
  designSpec: {},
} as Product;

describe("Quantity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue(undefined);
    mockQuantityOptions.current = [
      { label: "50", value: "50", totalPrice: 1000 },
    ];
  });

  test("retries once when the first matrix price load resolves empty", async () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      isValidating: false,
      mutate: mockMutate,
    });

    render(
      <Quantity
        updateConfiguration={vi.fn()}
        product={product}
        firestore={{} as Firestore}
        volume={50}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });

  test("does not retry when prices are already available", async () => {
    mockUseSWR.mockReturnValue({
      data: {
        prices: [{ value: 1000 } as Price],
        pageCountStepPrices: [],
      },
      isValidating: false,
      mutate: mockMutate,
    });

    render(
      <Quantity
        updateConfiguration={vi.fn()}
        product={product}
        firestore={{} as Firestore}
        volume={50}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  test("includes price offsets in the SWR cache key", () => {
    mockUseSWR.mockReturnValue({
      data: {
        prices: [{ value: 1000 } as Price],
        pageCountStepPrices: [],
      },
      isValidating: false,
      mutate: mockMutate,
    });

    const rendered = render(
      <Quantity
        updateConfiguration={vi.fn()}
        product={product}
        firestore={{} as Firestore}
        volume={50}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    rendered.rerender(
      <Quantity
        updateConfiguration={vi.fn()}
        product={{
          ...product,
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
        firestore={{} as Firestore}
        volume={50}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    const firstKey = mockUseSWR.mock.calls[0]?.[0];
    const lastKey = mockUseSWR.mock.calls.at(-1)?.[0];

    expect(firstKey).not.toEqual(lastKey);
    expect(JSON.stringify(lastKey)).toContain("fixedValue");
  });

  test("promotes the first available matrix volume when the current one is unavailable", async () => {
    mockUseSWR.mockReturnValue({
      data: {
        prices: [{ value: 1000 } as Price],
        pageCountStepPrices: [],
      },
      isValidating: false,
      mutate: mockMutate,
    });
    mockQuantityOptions.current = [
      { label: "300", value: "300", totalPrice: 3000 },
      { label: "500", value: "500", totalPrice: 5000 },
    ];

    const updateConfiguration = vi.fn();

    render(
      <Quantity
        updateConfiguration={updateConfiguration}
        product={{
          ...product,
          volumes: [
            { value: 50, printType: PrintingMethod.DIGITAL },
            { value: 100, printType: PrintingMethod.DIGITAL },
            { value: 300, printType: PrintingMethod.OFFSET },
          ],
        }}
        firestore={{} as Firestore}
        volume={50}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    await waitFor(() => {
      expect(updateConfiguration).toHaveBeenCalledWith({
        volume: 300,
        selectedAttributeOptions: {
          volume: 300,
        },
      });
    });
  });

  test("promotes the first usable matrix volume when the current volume still exists in options but its exact price is null", async () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      isValidating: false,
      mutate: mockMutate,
    });
    mockQuantityOptions.current = [
      { label: "50", value: "50", disabled: true, totalPrice: undefined },
      { label: "300", value: "300", totalPrice: 3000 },
      { label: "500", value: "500", totalPrice: 5000 },
    ];

    const updateConfiguration = vi.fn();

    render(
      <Quantity
        updateConfiguration={updateConfiguration}
        product={{
          ...product,
          disablePriceFetch: true,
          volumes: [
            { value: 50, printType: PrintingMethod.DIGITAL },
            { value: 100, printType: PrintingMethod.DIGITAL },
            { value: 300, printType: PrintingMethod.OFFSET },
            { value: 500, printType: PrintingMethod.OFFSET },
          ],
        }}
        resolvedPrices={[
          {
            value: null,
            combination: {
              id: "format-paper-colors",
              active: false,
              customFormat: false,
            },
            volume: { value: 50, deliveryTime: 2 },
            currency: CurrencyEnum.PLN,
          },
          {
            value: null,
            combination: {
              id: "format-paper-colors",
              active: false,
              customFormat: false,
            },
            volume: { value: 100, deliveryTime: 2 },
            currency: CurrencyEnum.PLN,
          },
          {
            value: 3000,
            combination: {
              id: "format-paper-colors",
              active: true,
              customFormat: false,
            },
            volume: { value: 300, deliveryTime: 3 },
            currency: CurrencyEnum.PLN,
          },
        ]}
        firestore={{} as Firestore}
        volume={50}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    await waitFor(() => {
      expect(updateConfiguration).toHaveBeenCalledWith({
        volume: 300,
        selectedAttributeOptions: {
          volume: 300,
        },
      });
    });
  });

  test("keeps the current matrix volume when only fallback rows exist and no exact row marks it unavailable", async () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      isValidating: false,
      mutate: mockMutate,
    });
    mockQuantityOptions.current = [
      { label: "50", value: "50", totalPrice: 3000 },
      { label: "300", value: "300", totalPrice: 3000 },
    ];

    const updateConfiguration = vi.fn();

    render(
      <Quantity
        updateConfiguration={updateConfiguration}
        product={{
          ...product,
          disablePriceFetch: true,
          volumes: [
            { value: 50, printType: PrintingMethod.DIGITAL },
            { value: 300, printType: PrintingMethod.OFFSET },
          ],
        }}
        resolvedPrices={[
          {
            value: 3000,
            combination: {
              id: "format-paper-colors",
              active: true,
              customFormat: false,
            },
            volume: { value: 300, deliveryTime: 3 },
            currency: CurrencyEnum.PLN,
          },
        ]}
        firestore={{} as Firestore}
        volume={50}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    await waitFor(() => {
      expect(updateConfiguration).not.toHaveBeenCalled();
    });
  });

  test("promotes the first enabled matrix volume when the current custom option is disabled", async () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      isValidating: false,
      mutate: mockMutate,
    });
    mockQuantityOptions.current = [
      { label: "7", value: "7", totalPrice: 700, disabled: true },
      { label: "20", value: "20", totalPrice: 2000 },
    ];

    const updateConfiguration = vi.fn();

    render(
      <Quantity
        updateConfiguration={updateConfiguration}
        product={{
          ...product,
          disablePriceFetch: true,
          volumes: [
            { value: 5, printType: PrintingMethod.DIGITAL },
            { value: 10, printType: PrintingMethod.DIGITAL },
            { value: 20, printType: PrintingMethod.OFFSET },
          ],
        }}
        resolvedPrices={[
          {
            value: null,
            combination: {
              id: "format-paper-colors",
              active: false,
              customFormat: false,
            },
            volume: { value: 5, deliveryTime: 2 },
            currency: CurrencyEnum.PLN,
          },
          {
            value: null,
            combination: {
              id: "format-paper-colors",
              active: false,
              customFormat: false,
            },
            volume: { value: 10, deliveryTime: 3 },
            currency: CurrencyEnum.PLN,
          },
          {
            value: 2000,
            combination: {
              id: "format-paper-colors",
              active: true,
              customFormat: false,
            },
            volume: { value: 20, deliveryTime: 4 },
            currency: CurrencyEnum.PLN,
          },
        ]}
        firestore={{} as Firestore}
        volume={7}
        quantity={1}
        calculatedCombination="format-paper-colors"
        width={0}
        height={0}
        customFormat={false}
        unit={Unit.PCS}
        t={mockT}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    await waitFor(() => {
      expect(updateConfiguration).toHaveBeenCalledWith({
        volume: 20,
        selectedAttributeOptions: {
          volume: 20,
        },
      });
    });
  });
});
