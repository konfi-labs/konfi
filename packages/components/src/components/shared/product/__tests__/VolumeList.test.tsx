import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import { CurrencyEnum, Unit } from "@konfi/types";
import { render } from "../../../test-utils/render";
import { VolumeList } from "../VolumeList";

const t = (
  key: string,
  options?: {
    defaultValue?: string;
    threshold?: string;
    unit?: string;
    unitPrice?: string;
  },
) => {
  if (key === "common.gross") return "gross";
  if (key === "common.orderBy") return "Order by";
  if (key === "common.unavailable") return "Unavailable";
  if (key === "Unit.PCS") return "pcs.";
  if (key === "Unit.M2") return "m²";
  if (key === "price.thresholdSummaryLabel") return "Price tiers";
  if (key === "price.thresholdSummaryItem") {
    return `> ${options?.threshold} ${options?.unit} ${options?.unitPrice}`;
  }
  return options?.defaultValue ?? key;
};

describe("VolumeList", () => {
  it("renders threshold tiers once above the volume cards", () => {
    render(
      <VolumeList
        value={{ label: "250", value: "250" }}
        handleOnChange={vi.fn()}
        options={[
          {
            label: "250",
            value: "250",
            totalPrice: 42500,
            currency: CurrencyEnum.PLN,
            unit: Unit.PCS,
            priceThreshold: {
              value: 250,
              unitPrice: 170,
              currency: CurrencyEnum.PLN,
              unit: Unit.PCS,
              calculatedQuantity: 250,
              tiers: [
                {
                  value: 250,
                  unitPrice: 170,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.PCS,
                },
                {
                  value: 1000,
                  unitPrice: 128,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.PCS,
                },
              ],
              next: {
                value: 1000,
                unitPrice: 128,
                currency: CurrencyEnum.PLN,
                unit: Unit.PCS,
                remainingQuantity: 750,
              },
              tierCount: 2,
            },
          },
          {
            label: "1000",
            value: "1000",
            totalPrice: 128000,
            currency: CurrencyEnum.PLN,
            unit: Unit.PCS,
            priceThreshold: {
              value: 1000,
              unitPrice: 128,
              currency: CurrencyEnum.PLN,
              unit: Unit.PCS,
              calculatedQuantity: 1000,
              tiers: [
                {
                  value: 250,
                  unitPrice: 170,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.PCS,
                },
                {
                  value: 1000,
                  unitPrice: 128,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.PCS,
                },
              ],
              tierCount: 2,
            },
          },
        ]}
        t={t}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    const hasNormalizedText =
      (text: string) => (_: string, element: Element | null) =>
        Boolean(element?.textContent?.replace(/\u00a0/g, " ").includes(text));

    expect(screen.getByText(/Price tiers/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Price tiers:/)).toBeInTheDocument();
    expect(
      screen.getAllByText(hasNormalizedText("> 250 pcs. PLN 1.70/pcs.")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(hasNormalizedText("> 1,000 pcs. PLN 1.28/pcs."))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/&#x2F;/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Next tier/)).not.toBeInTheDocument();
  });

  it("includes area units in compact threshold tiers", () => {
    render(
      <VolumeList
        value={{ label: "1", value: "1" }}
        handleOnChange={vi.fn()}
        options={[
          {
            label: "1",
            value: "1",
            totalPrice: 6000,
            currency: CurrencyEnum.PLN,
            unit: Unit.M2,
            priceThreshold: {
              value: 5,
              unitPrice: 6000,
              currency: CurrencyEnum.PLN,
              unit: Unit.M2,
              calculatedQuantity: 5,
              tiers: [
                {
                  value: 5,
                  unitPrice: 6000,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.M2,
                },
                {
                  value: 25,
                  unitPrice: 4700,
                  currency: CurrencyEnum.PLN,
                  unit: Unit.M2,
                },
              ],
              tierCount: 2,
            },
          },
        ]}
        t={t}
        i18n={{ resolvedLanguage: "en" } as never}
      />,
    );

    const hasNormalizedText =
      (text: string) => (_: string, element: Element | null) =>
        Boolean(element?.textContent?.replace(/\u00a0/g, " ").includes(text));

    expect(
      screen.getAllByText(hasNormalizedText("> 5 m² PLN 60.00/m²")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(hasNormalizedText("> 25 m² PLN 47.00/m²")).length,
    ).toBeGreaterThan(0);
  });
});
