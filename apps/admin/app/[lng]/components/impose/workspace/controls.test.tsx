// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { NumberField } from "./controls";

function renderWithChakra(ui: ReactNode) {
  return render(<ChakraProvider value={defaultSystem}>{ui}</ChakraProvider>);
}

function ControlledNumberField() {
  const [value, setValue] = useState(0);

  return (
    <>
      <NumberField
        label="Cut Offset"
        value={value}
        min={-100}
        step={0.1}
        onChange={(nextValue) => {
          if (typeof nextValue === "number") {
            setValue(nextValue);
          }
        }}
      />
      <output data-testid="current-value">{value}</output>
    </>
  );
}

describe("NumberField", () => {
  it("keeps a typed minus sign while editing signed values", () => {
    renderWithChakra(<ControlledNumberField />);

    const input = screen.getByRole("textbox", { name: "Cut Offset" });

    fireEvent.change(input, { target: { value: "-" } });

    expect(input).toHaveValue("-");
    expect(screen.getByTestId("current-value")).toHaveTextContent("0");
  });

  it("commits a negative number after the minus sign", () => {
    renderWithChakra(<ControlledNumberField />);

    const input = screen.getByRole("textbox", { name: "Cut Offset" });

    fireEvent.change(input, { target: { value: "-" } });
    fireEvent.change(input, { target: { value: "-2.5" } });

    expect(input).toHaveValue("-2.5");
    expect(screen.getByTestId("current-value")).toHaveTextContent("-2.5");
  });
});
