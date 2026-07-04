import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Attribute,
  AttributeInputTypeEnum,
  Configuration,
} from "@konfi/types";
import { render } from "../../../test-utils/render";
import { ProductOptionSelect } from "../OptionSelect";

const mockT = (key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key;

const mockI18n = { resolvedLanguage: "en" } as never;
const mockMember = {
  id: "member-1",
  name: "Test Member",
};
const mockTimestamp = {
  seconds: 0,
  nanoseconds: 0,
  toDate: () => new Date(0),
  toMillis: () => 0,
  isEqual: () => true,
} as Attribute["createdAt"];

function createAttribute(type: AttributeInputTypeEnum): Attribute {
  return {
    id: "format",
    name: "Format",
    createdBy: mockMember,
    createdAt: mockTimestamp,
    updatedBy: mockMember,
    updatedAt: mockTimestamp,
    active: true,
    calculated: false,
    required: true,
    format: true,
    options: [
      {
        label: "A4",
        value: "A4",
        customFormat: false,
        hidden: false,
        formatWidth: 210,
        formatHeight: 297,
      },
      {
        label: "Square",
        value: "square",
        customFormat: false,
        hidden: false,
        formatWidth: 210,
        formatHeight: 210,
      },
    ],
    keywords: [],
    type,
    trackStock: false,
  };
}

describe("ProductOptionSelect", () => {
  test("shows a size preview for dropdown options with format dimensions", async () => {
    const user = userEvent.setup();

    render(
      <ProductOptionSelect
        attribute={createAttribute(AttributeInputTypeEnum.DROPDOWN)}
        configuration={
          {
            selectedAttributeOptions: {
              format: "A4",
            },
          } as Configuration
        }
        updateConfiguration={vi.fn()}
        t={mockT}
        i18n={mockI18n}
      />,
    );

    expect(
      document.querySelector('[data-format-preview="true"]'),
    ).toBeInTheDocument();
    expect(screen.getAllByText("210 × 297 mm").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("combobox"));

    expect(screen.getAllByText("210 × 297 mm")).not.toHaveLength(0);
  });

  test("shows a size preview for radio options with format dimensions", () => {
    render(
      <ProductOptionSelect
        attribute={createAttribute(AttributeInputTypeEnum.RADIO_GROUP)}
        configuration={
          {
            selectedAttributeOptions: {
              format: "A4",
            },
          } as Configuration
        }
        updateConfiguration={vi.fn()}
        t={mockT}
        i18n={mockI18n}
      />,
    );

    expect(screen.getByText("210 × 297 mm")).toBeInTheDocument();
    expect(
      document.querySelector('[data-format-preview="true"]'),
    ).toBeInTheDocument();
  });
});
