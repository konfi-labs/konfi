import { render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { useForm, FormProvider } from "react-hook-form";
import { SelectInput } from "../Select";
import {
  Address,
  AddressTypeEnum,
  FieldData,
  SelectOption,
} from "@konfi/types";

function TestWrapper({
  children,
  defaultValues = { testField: "" },
}: {
  children: React.ReactNode;
  defaultValues?: { testField: unknown };
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
  placeholder: "Select an option...",
};

const mockOptions: SelectOption[] = [
  { label: "Option 1", value: "option1" },
  { label: "Option 2", value: "option2" },
  { label: "Option 3", value: "option3" },
];

const mockAddress: Address = {
  name: "Warehouse HQ",
  type: AddressTypeEnum.BILLING,
  street: "Example Street",
  number: "10",
  zip: "00-001",
  city: "Example City",
  country: "Poland",
  active: true,
};

const objectOptions: SelectOption[] = [
  {
    label: "Warehouse HQ",
    value: "warehouse:1",
    object: mockAddress,
  },
];

describe("SelectInput", () => {
  test("renders with options", () => {
    render(
      <TestWrapper>
        <SelectInput field={mockField} options={mockOptions} disabled={false} />
      </TestWrapper>,
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  test("renders in disabled state when no options", () => {
    render(
      <TestWrapper>
        <SelectInput field={mockField} options={null} disabled={false} />
      </TestWrapper>,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  test("renders in disabled state when explicitly disabled", () => {
    render(
      <TestWrapper>
        <SelectInput field={mockField} options={mockOptions} disabled={true} />
      </TestWrapper>,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  test("preserves object-backed selections when option values are opaque", async () => {
    render(
      <TestWrapper defaultValues={{ testField: { ...mockAddress } }}>
        <SelectInput
          field={mockField}
          options={objectOptions}
          disabled={false}
        />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("Warehouse HQ");
    });
  });

  test("keeps legacy object name fallback matching", async () => {
    render(
      <TestWrapper defaultValues={{ testField: { name: "option2" } }}>
        <SelectInput field={mockField} options={mockOptions} disabled={false} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("Option 2");
    });
  });

  test("keeps legacy object value fallback matching", async () => {
    render(
      <TestWrapper defaultValues={{ testField: { value: "option3" } }}>
        <SelectInput field={mockField} options={mockOptions} disabled={false} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("Option 3");
    });
  });
});
