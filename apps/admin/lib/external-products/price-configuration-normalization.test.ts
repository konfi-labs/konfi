import type { ExternalPriceConfiguration } from "@konfi/types";
import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
  createSyntheticEmptyBranchExternalOptionValue,
} from "./option-mapping-utils";
import {
  normalizeExternalPriceConfigurationSelection,
  normalizeExternalPriceConfigurations,
} from "./price-configuration-normalization";

describe("price configuration normalization", () => {
  it("omits generic synthetic empty selections from stored configurations", () => {
    expect(
      normalizeExternalPriceConfigurationSelection({
        Delivery: "standard",
        Foil: SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
      }),
    ).toEqual({
      Delivery: "standard",
    });
  });

  it("keeps branch-specific synthetic selections intact", () => {
    const branchValue =
      createSyntheticEmptyBranchExternalOptionValue("Standardowy");
    const configurations: ExternalPriceConfiguration[] = [
      {
        configuration: {
          Delivery: branchValue,
          Foil: SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
        },
        priceInfo: {
          currency: "PLN",
          priceRanges: [{ quantity: 10, price: 12.5, deliveryTime: 3 }],
        },
      },
    ];

    expect(normalizeExternalPriceConfigurations(configurations)).toEqual([
      {
        configuration: {
          Delivery: branchValue,
        },
        priceInfo: {
          currency: "PLN",
          priceRanges: [{ quantity: 10, price: 12.5, deliveryTime: 3 }],
        },
      },
    ]);
  });
});
