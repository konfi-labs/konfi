// @vitest-environment jsdom

import React from "react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attribute, NestedProductType, Product } from "@konfi/types";
import { AttributeInputTypeEnum, PriceTypeEnum } from "@konfi/types";
import { useConfiguration } from "context/configuration";
import { Attributes } from "../Attributes";

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("@konfi/components", () => ({
  MaterialSymbol: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Tag: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  toaster: {
    create: vi.fn(),
  },
}));

vi.mock("context/configuration", () => ({
  useConfiguration: vi.fn(),
}));

const mockedUseConfiguration = vi.mocked(useConfiguration);

function createAttribute(id: string, name: string): Attribute {
  const timestamp = Timestamp.now();
  const member = {
    id: "member-1",
    name: "Admin",
  };

  return {
    active: true,
    calculated: true,
    createdAt: timestamp,
    createdBy: member,
    format: false,
    id,
    keywords: [],
    name,
    options: [
      {
        customFormat: false,
        hidden: false,
        label: `${name} option`,
        value: `${id}-option`,
      },
    ],
    required: false,
    trackStock: false,
    type: AttributeInputTypeEnum.DROPDOWN,
    updatedAt: timestamp,
    updatedBy: member,
  };
}

const productType: NestedProductType = {
  attributes: ["paper"],
  id: "product-type-1",
  isShippable: true,
  name: "Business cards",
};

function TestWrapper({
  children,
  priceType,
  productTypeValue = productType,
}: {
  children: React.ReactNode;
  priceType: Product["priceType"];
  productTypeValue?: Product["productType"];
}) {
  const methods = useForm({
    defaultValues: {
      attributeDependencies: {},
      attributeOptions: {},
      attributes: [],
      priceType,
      productType: productTypeValue,
    },
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>{children}</FormProvider>
    </ChakraProvider>
  );
}

describe("Attributes", () => {
  beforeEach(() => {
    mockedUseConfiguration.mockReturnValue({
      attributes: [
        createAttribute("paper", "Paper"),
        createAttribute("finish", "Finish"),
      ],
    } as ReturnType<typeof useConfiguration>);
  });

  it("renders product-form attribute controls for dynamic pricing", () => {
    render(
      <TestWrapper priceType={PriceTypeEnum.DYNAMIC}>
        <Attributes isProductForm />
      </TestWrapper>,
    );

    expect(screen.getByText("attributes.selectAttributes")).toBeInTheDocument();
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.queryByText("Finish")).not.toBeInTheDocument();
  });

  it("allows all loaded attributes when a matrix-like product has no product type", () => {
    render(
      <TestWrapper priceType={PriceTypeEnum.MATRIX} productTypeValue={null}>
        <Attributes isProductForm />
      </TestWrapper>,
    );

    expect(screen.getByText("attributes.selectAttributes")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No product type selected. Search or choose from all available attributes.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search available attributes..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.getByText("Finish")).toBeInTheDocument();
  });

  it("keeps product-form attribute controls hidden for non matrix-like pricing", () => {
    render(
      <TestWrapper priceType={PriceTypeEnum.SINGLE}>
        <Attributes isProductForm />
      </TestWrapper>,
    );

    expect(
      screen.queryByText("attributes.selectAttributes"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Paper")).not.toBeInTheDocument();
  });
});
