import { describe, expect, it } from "vitest";
import type { AttributeMapping } from "@konfi/types";
import {
  getDuplicateInternalAttributeMappings,
  getUniqueInternalAttributeId,
} from "./attribute-mapping-validation";

describe("attribute mapping validation", () => {
  it("detects when the same internal attribute is mapped more than once", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "Size",
        internalAttributeId: "format",
      },
      {
        externalAttributeName: "Trim",
        internalAttributeId: "format",
      },
      {
        externalAttributeName: "Paper",
        internalAttributeId: "paper",
      },
    ];

    expect(getDuplicateInternalAttributeMappings(mappings)).toEqual([
      {
        internalAttributeId: "format",
        externalAttributeNames: ["Size", "Trim"],
      },
    ]);
  });

  it("ignores provider-only, ignored, and blank mappings when checking duplicates", () => {
    const mappings: AttributeMapping[] = [
      {
        externalAttributeName: "Delivery",
        internalAttributeId: "shipping",
        providerOnlyPricing: true,
      },
      {
        externalAttributeName: "Warehouse",
        internalAttributeId: "shipping",
        ignored: true,
      },
      {
        externalAttributeName: "Paper",
        internalAttributeId: "paper",
      },
      {
        externalAttributeName: "Finish",
        internalAttributeId: " ",
      },
    ];

    expect(getDuplicateInternalAttributeMappings(mappings)).toEqual([]);
  });

  it("only returns active customer-facing internal attribute ids", () => {
    expect(
      getUniqueInternalAttributeId({
        externalAttributeName: "Delivery",
        internalAttributeId: "shipping",
        providerOnlyPricing: true,
      }),
    ).toBeUndefined();

    expect(
      getUniqueInternalAttributeId({
        externalAttributeName: "Paper",
        internalAttributeId: "paper",
      }),
    ).toBe("paper");
  });
});
