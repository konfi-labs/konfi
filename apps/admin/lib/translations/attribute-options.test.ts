import { describe, expect, it } from "vitest";
import { reconcileAttributeOptionTranslations } from "./attribute-options";

const attribute = {
  options: [
    {
      value: "matte",
      label: "Mat",
      customFormat: false,
      hidden: false,
    },
    {
      value: "glossy",
      label: "Polysk",
      customFormat: false,
      hidden: false,
    },
  ],
};

describe("reconcileAttributeOptionTranslations", () => {
  it("matches translated options by stable value after reordering", () => {
    expect(
      reconcileAttributeOptionTranslations(attribute, [
        { value: "glossy", label: "Glossy" },
        { value: "matte", label: "Matte" },
      ]),
    ).toEqual([
      { value: "matte", label: "Matte" },
      { value: "glossy", label: "Glossy" },
    ]);
  });

  it("falls back to legacy array index when value is missing", () => {
    expect(
      reconcileAttributeOptionTranslations(attribute, [
        { label: "Matte" },
        { label: "Glossy" },
      ]),
    ).toEqual([
      { value: "matte", label: "Matte" },
      { value: "glossy", label: "Glossy" },
    ]);
  });

  it("falls back to source labels for missing translation options", () => {
    expect(
      reconcileAttributeOptionTranslations(attribute, [
        { value: "matte", label: "Matte" },
      ]),
    ).toEqual([
      { value: "matte", label: "Matte" },
      { value: "glossy", label: "Polysk" },
    ]);
  });
});
