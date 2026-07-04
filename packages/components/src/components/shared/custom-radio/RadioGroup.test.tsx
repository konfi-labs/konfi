import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import { CurrencyEnum, Unit } from "@konfi/types";
import { render } from "../../test-utils/render";
import { RadioGroup } from "./RadioGroup";

const t = (
  key: string,
  options?: {
    defaultValue?: string;
    threshold?: string;
    unit?: string;
    unitPrice?: string;
    remaining?: string;
  },
) => {
  if (key === "common.gross") return "gross";
  if (key === "common.orderBy") return "Order by";
  if (key === "Unit.PCS") return "pcs.";
  return options?.defaultValue ?? key;
};

describe("RadioGroup", () => {
  it("keeps threshold metadata out of individual priced option cards", () => {
    render(
      <RadioGroup
        name="volume"
        value="250"
        handleChange={vi.fn()}
        options={[
          {
            label: "250",
            value: "250",
            totalPrice: 25000,
            currency: CurrencyEnum.PLN,
            unit: Unit.PCS,
            priceThreshold: {
              value: 250,
              unitPrice: 100,
              currency: CurrencyEnum.PLN,
              unit: Unit.PCS,
              calculatedQuantity: 250,
              tiers: [
                {
                  value: 250,
                  unitPrice: 100,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.PCS,
                },
                {
                  value: 500,
                  unitPrice: 90,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.PCS,
                },
              ],
              next: {
                value: 500,
                unitPrice: 90,
                currency: CurrencyEnum.PLN,
                unit: Unit.PCS,
                remainingQuantity: 250,
              },
              tierCount: 2,
            },
          },
        ]}
        t={t}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    expect(screen.getAllByText("250").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Next tier/)).not.toBeInTheDocument();
  });
});
