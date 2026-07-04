"use client";

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldData, SelectOption } from "@konfi/types";
import { TFunction } from "i18next";
import { FormProvider, useForm } from "react-hook-form";
import { MultiOptionSelectFieldController } from "../MultiOptionSelect";

function TestWrapper({
  children,
  defaultValues = { testField: [] as string[] },
}: {
  children: React.ReactNode;
  defaultValues?: { testField: string[] };
}) {
  const methods = useForm({
    defaultValues,
  });

  return (
    <ChakraProvider value={defaultSystem}>
      <FormProvider {...methods}>{children}</FormProvider>
    </ChakraProvider>
  );
}

const mockField: FieldData = {
  name: "testField",
  placeholder: "Select options...",
};

const mockOptions: SelectOption[] = [
  { label: "Option 1", value: "option1" },
  { label: "Option 2", value: "option2" },
  { label: "Option 3", value: "option3" },
];

const t = ((key: string) => key) as TFunction;

describe("MultiOptionSelectFieldController", () => {
  test("renders selected values as tags", () => {
    render(
      <TestWrapper defaultValues={{ testField: ["option1", "option2"] }}>
        <MultiOptionSelectFieldController
          _field={mockField}
          options={mockOptions}
          t={t}
        />
      </TestWrapper>,
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete tag option1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete tag option2" }),
    ).toBeInTheDocument();
  });

  test("shows the placeholder when nothing is selected", () => {
    render(
      <TestWrapper>
        <MultiOptionSelectFieldController
          _field={mockField}
          options={mockOptions}
          t={t}
        />
      </TestWrapper>,
    );

    expect(
      screen.getByPlaceholderText("Select options..."),
    ).toBeInTheDocument();
  });

  test("keeps the first selected option when starting empty", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <MultiOptionSelectFieldController
          _field={mockField}
          options={mockOptions}
          t={t}
        />
      </TestWrapper>,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Option 2"));

    expect(
      await screen.findByRole("button", { name: "Delete tag option2" }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Select options...")).toBeNull();
  });

  test("does not mark optional empty fields as browser-required", () => {
    render(
      <TestWrapper>
        <MultiOptionSelectFieldController
          _field={mockField}
          options={mockOptions}
          t={t}
        />
      </TestWrapper>,
    );

    expect(screen.getByPlaceholderText("Select options...")).not.toBeRequired();
  });

  test("keeps required multi-select fields browser-required until a value is chosen", () => {
    render(
      <TestWrapper>
        <MultiOptionSelectFieldController
          _field={{ ...mockField, isRequired: true }}
          options={mockOptions}
          t={t}
        />
      </TestWrapper>,
    );

    expect(screen.getByPlaceholderText("Select options...")).toBeRequired();
  });

  test("renders in disabled state when no options are available", () => {
    render(
      <TestWrapper>
        <MultiOptionSelectFieldController
          _field={mockField}
          options={null}
          t={t}
        />
      </TestWrapper>,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
