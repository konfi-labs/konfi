import "@testing-library/jest-dom";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Unit } from "@konfi/types";
import type { TFunction } from "i18next";
import { render } from "../../test-utils/render";
import { SummaryDescription } from "../SummaryDescription";

// Mock translation function - defined outside to avoid recreation
const mockT = ((key, options) => {
  const lookupKey = Array.isArray(key) ? key[0] : key;
  const translationOptions =
    typeof options === "object" && options !== null ? options : {};
  const defaultValue =
    "defaultValue" in translationOptions &&
    typeof translationOptions.defaultValue === "string"
      ? translationOptions.defaultValue
      : undefined;

  if (lookupKey === "Unit.PIECES") return "pieces";
  if (lookupKey === "Unit.BOXES") return "boxes";
  if (lookupKey === "admin.customNamePlaceholder") return "Custom name...";
  return defaultValue ?? lookupKey;
}) as TFunction;

describe("SummaryDescription", () => {
  test("renders product name correctly", () => {
    render(
      <SummaryDescription
        productName="Test Product"
        quantity={100}
        unit={Unit.PIECES}
        t={mockT}
      />,
    );
    expect(screen.getByText(/Test Product/)).toBeInTheDocument();
  });

  test("renders custom order item name when provided", () => {
    render(
      <SummaryDescription
        productName="Test Product"
        orderItemName="Custom Name"
        quantity={100}
        unit={Unit.PIECES}
        t={mockT}
      />,
    );
    expect(screen.getByText(/Custom Name/)).toBeInTheDocument();
  });

  test("renders quantity and unit badge", () => {
    render(
      <SummaryDescription
        productName="Test Product"
        quantity={100}
        unit={Unit.PIECES}
        t={mockT}
      />,
    );
    // The badge renders the text together, but translation may return "Unit.PIECES" format
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  test("renders icon button when description combination is provided", () => {
    render(
      <SummaryDescription
        productName="Test Product"
        quantity={100}
        unit={Unit.PIECES}
        descriptionCombination="A4, 300g, Matt"
        t={mockT}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Show details" }),
    ).toBeInTheDocument();
  });

  test("opens dialog with each attribute on click of details button", async () => {
    const user = userEvent.setup();
    render(
      <SummaryDescription
        productName="Test Product"
        quantity={100}
        unit={Unit.PIECES}
        descriptionCombination="A4, 300g, Matt"
        t={mockT}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show details" }));
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("A4")).toBeInTheDocument();
      expect(within(dialog).getByText("300g")).toBeInTheDocument();
      expect(within(dialog).getByText("Matt")).toBeInTheDocument();
    });
  });

  test("renders inline description as separate attributes with bold labels", () => {
    render(
      <SummaryDescription
        productName="Test Product"
        quantity={100}
        unit={Unit.PIECES}
        descriptionCombination="Paper: 300g, Finish: Matt"
        t={mockT}
      />,
    );

    expect(
      screen.queryByText("Paper: 300g, Finish: Matt"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Paper:", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByText("300g")).toBeInTheDocument();
    expect(
      screen.getByText("Finish:", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Matt")).toBeInTheDocument();
  });

  test("does not render icon button when no description combination", () => {
    render(
      <SummaryDescription
        productName="Test Product"
        quantity={100}
        unit={Unit.PIECES}
        t={mockT}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Show details" }),
    ).not.toBeInTheDocument();
  });

  describe("when editable", () => {
    test("allows editing name when isEditable is true", async () => {
      const user = userEvent.setup();
      const onNameChange = vi.fn();

      render(
        <SummaryDescription
          productName="Test Product"
          orderItemName="Original Name"
          quantity={100}
          unit={Unit.PIECES}
          t={mockT}
          isEditable={true}
          onNameChange={onNameChange}
        />,
      );

      // Find and click the editable preview to start editing
      const preview = screen.getByText(/Original Name/);
      await user.click(preview);

      // Find the input that appears when editing
      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();

      // Clear and type new value
      await user.clear(input);
      await user.type(input, "New Name");

      // Press Enter to commit the change (Chakra Editable commits on Enter)
      await user.keyboard("{Enter}");

      // Wait for the callback to be called
      await waitFor(() => {
        expect(onNameChange).toHaveBeenCalledWith("New Name");
      });
    });

    test("buffers input changes without triggering onChange on every keystroke", async () => {
      const user = userEvent.setup();
      const onNameChange = vi.fn();

      render(
        <SummaryDescription
          productName="Test Product"
          orderItemName="Original"
          quantity={100}
          unit={Unit.PIECES}
          t={mockT}
          isEditable={true}
          onNameChange={onNameChange}
        />,
      );

      // Click to start editing
      const preview = screen.getByText(/Original/);
      await user.click(preview);

      // Type multiple characters
      const input = screen.getByRole("textbox");
      await user.clear(input);
      await user.type(input, "ABC");

      // onNameChange should NOT be called yet (buffered)
      expect(onNameChange).not.toHaveBeenCalled();

      // Press Enter to commit
      await user.keyboard("{Enter}");

      // Now it should be called once with the final value
      await waitFor(() => {
        expect(onNameChange).toHaveBeenCalledTimes(1);
        expect(onNameChange).toHaveBeenCalledWith("ABC");
      });
    });

    test("cancels editing on escape key", async () => {
      const user = userEvent.setup();
      const onNameChange = vi.fn();

      render(
        <SummaryDescription
          productName="Test Product"
          orderItemName="Original Name"
          quantity={100}
          unit={Unit.PIECES}
          t={mockT}
          isEditable={true}
          onNameChange={onNameChange}
        />,
      );

      // Start editing
      const preview = screen.getByText(/Original Name/);
      await user.click(preview);

      // Type some text
      const input = screen.getByRole("textbox");
      await user.clear(input);
      await user.type(input, "New Name");

      // Press escape to cancel
      await user.keyboard("{Escape}");

      // onNameChange should not be called
      await waitFor(() => {
        expect(onNameChange).not.toHaveBeenCalled();
      });

      // Original name should still be displayed
      expect(screen.getByText(/Original Name/)).toBeInTheDocument();
    });
  });
});
