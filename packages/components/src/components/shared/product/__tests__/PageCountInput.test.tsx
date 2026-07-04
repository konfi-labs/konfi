import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Configuration, Product } from "@konfi/types";
import { render } from "../../../test-utils/render";
import { PageCountInput } from "../PageCountInput";

const mockT = (
  key: string,
  options?: {
    defaultValue?: string;
    innerPages?: number;
    coverPages?: number;
    minimum?: number;
    maximum?: number;
    step?: number;
  },
) => {
  if (key === "translation:forms.pageCountBreakdown") {
    return `${options?.innerPages} inner + ${options?.coverPages} cover`;
  }

  return options?.defaultValue ?? key;
};

const product = {
  id: "product-1",
  pageCount: {
    enabled: true,
    minimum: 8,
    maximum: 64,
    step: 4,
    coverPages: 4,
  },
} as Product;

describe("PageCountInput", () => {
  it("allows clearing the field and typing a replacement page count", async () => {
    const user = userEvent.setup();
    const updateConfiguration = vi.fn();

    render(
      <PageCountInput
        configuration={{ pageCount: 8 } as Configuration}
        product={product}
        updateConfiguration={updateConfiguration}
        t={mockT as never}
        i18n={{ resolvedLanguage: "en", language: "en" } as never}
      />,
    );

    const input = screen.getByRole("spinbutton");

    await user.clear(input);

    expect(input).toHaveValue(null);
    expect(updateConfiguration).not.toHaveBeenCalled();

    await user.type(input, "16");

    expect(input).toHaveValue(16);
    expect(updateConfiguration).toHaveBeenLastCalledWith({ pageCount: 16 });
  });

  it("normalizes the typed value on blur", async () => {
    const user = userEvent.setup();
    const updateConfiguration = vi.fn();

    render(
      <PageCountInput
        configuration={{ pageCount: 8 } as Configuration}
        product={product}
        updateConfiguration={updateConfiguration}
        t={mockT as never}
        i18n={{ resolvedLanguage: "en", language: "en" } as never}
      />,
    );

    const input = screen.getByRole("spinbutton");

    await user.clear(input);
    await user.type(input, "10");
    await user.tab();

    expect(input).toHaveValue(12);
    expect(updateConfiguration).toHaveBeenLastCalledWith({ pageCount: 12 });
  });
});
