import { describe, expect, it } from "vitest";

import { normalizeProductionGroupingSettings } from "../production-grouping";

describe("production-grouping", () => {
  it("keeps the default profile axis-only so AI handles inferred values", () => {
    const settings = normalizeProductionGroupingSettings();

    expect(settings.profile.primaryAxis).toMatchObject({
      allowAiSuggestedValues: true,
      id: "material",
      label: "Material",
    });
    expect(settings.profile.primaryAxis.aliases).toEqual([]);
    expect(settings.profile.primaryAxis.allowedValues).toBeUndefined();
    expect(settings.profile.secondaryAxis).toMatchObject({
      allowAiSuggestedValues: true,
      id: "finish",
      label: "Finish",
    });
    expect(settings.profile.secondaryAxis?.aliases).toEqual([]);
    expect(settings.profile.secondaryAxis?.allowedValues).toBeUndefined();
  });
});
