import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { Address, AddressTypeEnum } from "@konfi/types";
import { generateAddressOptions } from "@konfi/utils";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RadioGridController } from "../RadioGridController";

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

const duplicateName = "Example Agency Sp. z o.o.";

const duplicateAddresses: Address[] = [
  {
    name: duplicateName,
    type: AddressTypeEnum.BILLING,
    street: "Example Street",
    number: "10",
    zip: "00-001",
    city: "Example City",
    country: "Poland",
    active: true,
  },
  {
    name: duplicateName,
    type: AddressTypeEnum.BILLING,
    street: "Example Avenue",
    number: "24",
    zip: "00-002",
    city: "Example City",
    country: "Poland",
    active: true,
  },
];

describe("RadioGridController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders duplicate address labels without duplicate React keys", () => {
    const options = generateAddressOptions(
      duplicateAddresses,
      AddressTypeEnum.BILLING,
    );
    const onChange = vi.fn();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { container } = render(
      <TestWrapper>
        <RadioGridController
          name="billing"
          options={options}
          value={duplicateAddresses[1]}
          onChange={onChange}
        />
      </TestWrapper>,
    );

    expect(screen.getAllByText(duplicateName)).toHaveLength(2);

    const radioInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    );
    const selectedRadio = radioInputs.find(
      (input) => input.value === options[1].value,
    );
    const duplicateKeyWarnings = consoleErrorSpy.mock.calls.filter(
      ([message]) =>
        typeof message === "string" &&
        message.includes("Encountered two children with the same key"),
    );

    expect(new Set(options.map((option) => option.value)).size).toBe(2);
    expect(selectedRadio?.checked).toBe(true);
    expect(duplicateKeyWarnings).toHaveLength(0);
  });

  it("checks a saved billing card when the selected value has normalized blank fields", async () => {
    const options = generateAddressOptions(
      duplicateAddresses,
      AddressTypeEnum.BILLING,
    );
    const onChange = vi.fn();

    const { container } = render(
      <TestWrapper>
        <RadioGridController
          name="billing"
          options={options}
          value={{
            ...duplicateAddresses[0],
            companyName: "",
            nip: "",
            jstRecipientEnabled: false,
            jstRecipientName: "",
            jstRecipientNip: "",
            jstRecipientStreet: "",
            jstRecipientZip: "",
            jstRecipientCity: "",
          }}
          onChange={onChange}
        />
      </TestWrapper>,
    );

    const selectedRadio = container.querySelector<HTMLInputElement>(
      `input[type="radio"][value="${options[0].value}"]`,
    );

    await waitFor(() => {
      expect(selectedRadio?.checked).toBe(true);
    });
  });

  it("handles a null initial value without crashing", async () => {
    const options = generateAddressOptions(
      duplicateAddresses,
      AddressTypeEnum.BILLING,
    );
    const onChange = vi.fn();

    const { container } = render(
      <TestWrapper>
        <RadioGridController
          name="billing"
          options={options}
          value={null}
          onChange={onChange}
        />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(duplicateName)).toHaveLength(2);
      expect(
        container.querySelectorAll('input[type="radio"]:checked'),
      ).toHaveLength(0);
    });
  });
});
