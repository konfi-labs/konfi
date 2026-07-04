// @vitest-environment jsdom

import React from "react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attribute, Member, Price, Product } from "@konfi/types";
import {
  AttributeInputTypeEnum,
  CurrencyEnum,
  PriceTypeEnum,
} from "@konfi/types";
import { matrixPriceWorkerClient } from "@/lib/matrix-price-worker-client";
import PricesMatrix from "../PricesMatrix";

const { mockedUseConfiguration } = vi.hoisted(() => ({
  mockedUseConfiguration: vi.fn(),
}));
const { stableI18n, stableTranslate } = vi.hoisted(() => ({
  stableI18n: { resolvedLanguage: "en" },
  stableTranslate: (key: string, options?: { defaultValue?: string }) =>
    options?.defaultValue ?? key,
}));

vi.mock("@/actions/ai", () => ({
  generateAdminText: vi.fn(),
}));

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    i18n: stableI18n,
    t: stableTranslate,
  }),
}));

vi.mock("context/configuration", () => ({
  useConfiguration: mockedUseConfiguration,
}));

vi.mock("@/lib/matrix-price-worker-client", () => ({
  matrixPriceWorkerClient: {
    buildGridRows: vi.fn(),
    buildWorksheetData: vi.fn(),
    exportWorkbook: vi.fn(),
    parseGridRows: vi.fn(),
    parseWorksheetData: vi.fn(),
    readWorkbook: vi.fn(),
  },
}));

vi.mock("@konfi/components", () => ({
  MaterialSymbol: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  toaster: {
    error: vi.fn(),
    promise: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-data-grid", () => ({
  DataGrid: () => <div data-testid="matrix-grid" />,
  renderTextEditor: () => null,
}));

const mockedBuildGridRows = vi.mocked(matrixPriceWorkerClient.buildGridRows);

function createMember(id: string, name: string): Member {
  const timestamp = Timestamp.now();

  return {
    active: true,
    createdAt: timestamp,
    id,
    name,
    updatedAt: timestamp,
  };
}

function createAttribute(id: string, optionValues: string[]): Attribute {
  const member = createMember("member-1", "Admin");
  const timestamp = Timestamp.now();

  return {
    active: true,
    calculated: true,
    createdAt: timestamp,
    createdBy: member,
    format: false,
    id,
    keywords: [],
    name: id,
    options: optionValues.map((value) => ({
      customFormat: false,
      hidden: false,
      label: value,
      value,
    })),
    required: false,
    trackStock: false,
    type: AttributeInputTypeEnum.DROPDOWN,
    updatedAt: timestamp,
    updatedBy: member,
  };
}

const hydratedPrices: Price[] = [
  {
    combination: {
      active: true,
      customFormat: false,
      id: "matte-soft",
    },
    currency: CurrencyEnum.PLN,
    threshold: 0,
    value: 1200,
    volume: {
      deliveryTime: 2,
      value: 10,
    },
  },
];

const hydratedValues = {
  attributeDependencies: {},
  attributeOptions: {
    finish: ["soft", "hard"],
    paper: ["matte", "gloss"],
  },
  attributes: ["paper", "finish"],
  name: "Imported matrix product",
  priceType: PriceTypeEnum.MATRIX,
  prices: hydratedPrices,
  volumes: [{ value: 10 }],
} satisfies Partial<Product>;

function TestHarness() {
  const methods = useForm({
    defaultValues: {
      attributeDependencies: {},
      attributeOptions: {},
      attributes: [],
      name: "",
      priceType: PriceTypeEnum.MATRIX,
      prices: [],
      volumes: [{ value: 10 }],
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>
        <button
          type="button"
          onClick={() => {
            methods.reset(hydratedValues);
          }}
        >
          Hydrate prices
        </button>
        <PricesMatrix />
      </FormProvider>
    </ChakraProvider>
  );
}

function MissingWatchedValuesHarness() {
  const methods = useForm({
    defaultValues: {
      priceType: PriceTypeEnum.MATRIX,
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>
        <PricesMatrix />
      </FormProvider>
    </ChakraProvider>
  );
}

describe("PricesMatrix", () => {
  beforeEach(() => {
    mockedUseConfiguration.mockReturnValue({
      attributes: [
        createAttribute("paper", ["matte", "gloss"]),
        createAttribute("finish", ["soft", "hard"]),
      ],
    });

    mockedBuildGridRows.mockReset();
    mockedBuildGridRows.mockResolvedValue({
      activeRows: [],
      deliveryTimesRows: [],
      pricesRows: [],
      thresholdsRows: [],
      volumes: [{ value: 10 }],
    });
  });

  it("uses hydrated form prices when opening the matrix editor", async () => {
    const user = userEvent.setup();

    render(<TestHarness />);

    await user.click(screen.getByRole("button", { name: "Hydrate prices" }));
    await user.click(screen.getByRole("button", { name: /Edit Table/i }));

    await waitFor(() => {
      expect(mockedBuildGridRows).toHaveBeenCalledTimes(1);
    });

    expect(mockedBuildGridRows).toHaveBeenCalledWith(
      expect.objectContaining({
        combinations: ["matte-soft"],
        prices: hydratedPrices,
      }),
    );
  });

  it("renders with undefined watched matrix fields", () => {
    render(<MissingWatchedValuesHarness />);

    expect(
      screen.getByRole("button", { name: /Edit Table/i }),
    ).toBeInTheDocument();
  });
});
