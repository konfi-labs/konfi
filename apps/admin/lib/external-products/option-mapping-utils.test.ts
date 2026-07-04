import { describe, expect, it } from "vitest";
import {
  OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE,
  SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
  createSyntheticEmptyBranchExternalOptionValue,
  isSyntheticEmptyBranchExternalOptionValue,
  isSyntheticExternalOptionValue,
  resolveExternalRequestValue,
} from "./option-mapping-utils";

describe("synthetic external option helpers", () => {
  it("creates and detects synthetic empty branch values", () => {
    const value = createSyntheticEmptyBranchExternalOptionValue("Standardowy");

    expect(value).toBe("konfiSyntheticEmptyBranch_standardowy");
    expect(isSyntheticEmptyBranchExternalOptionValue(value)).toBe(true);
    expect(isSyntheticExternalOptionValue(value)).toBe(true);
    expect(
      isSyntheticExternalOptionValue(SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE),
    ).toBe(true);
  });

  it("omits generic synthetic empty values by default", () => {
    expect(
      resolveExternalRequestValue({
        rawValue: SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
      }),
    ).toEqual({ type: "omit" });
  });

  it("requires an explicit mapping for synthetic empty branch values", () => {
    expect(
      resolveExternalRequestValue({
        rawValue: createSyntheticEmptyBranchExternalOptionValue("Standardowy"),
      }),
    ).toEqual({ type: "unresolved" });
  });

  it("supports explicit provider values and omit mappings for synthetic branches", () => {
    const rawValue = createSyntheticEmptyBranchExternalOptionValue(
      "Standardowy",
    );

    expect(
      resolveExternalRequestValue({
        rawValue,
        mappedValue: "std-paper",
      }),
    ).toEqual({ type: "set", value: "std-paper" });

    expect(
      resolveExternalRequestValue({
        rawValue,
        mappedValue: OMIT_EXTERNAL_ATTRIBUTE_REQUEST_VALUE,
      }),
    ).toEqual({ type: "omit" });
  });
});