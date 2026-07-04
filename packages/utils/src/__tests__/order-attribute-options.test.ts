import { describe, expect, it } from "vitest";

import type { Option } from "@konfi/types";

import { orderAttributeOptions } from "../order-attribute-options";

describe("orderAttributeOptions", () => {
  const optionFactory = (value: string, label = value): Option => ({
    value,
    label,
    customFormat: false,
    hidden: false,
  });

  it("returns options ordered according to the selected values", () => {
    const attributeOptions = [
      optionFactory("a"),
      optionFactory("b"),
      optionFactory("c"),
    ];
    const ordered = orderAttributeOptions(attributeOptions, ["c", "a"]);

    expect(ordered).toEqual([optionFactory("c"), optionFactory("a")]);
  });

  it("omits values that are not present in attribute options", () => {
    const attributeOptions = [optionFactory("a"), optionFactory("b")];
    const ordered = orderAttributeOptions(attributeOptions, ["missing", "b"]);

    expect(ordered).toEqual([optionFactory("b")]);
  });

  it("ignores duplicate selected values", () => {
    const attributeOptions = [optionFactory("a"), optionFactory("b")];
    const ordered = orderAttributeOptions(attributeOptions, [
      "a",
      "a",
      "b",
      "a",
    ]);

    expect(ordered).toEqual([optionFactory("a"), optionFactory("b")]);
  });

  it("returns an empty array when attribute options are missing", () => {
    const ordered = orderAttributeOptions(undefined, ["a"]);

    expect(ordered).toEqual([]);
  });

  it("returns an empty array when selected values are missing", () => {
    const ordered = orderAttributeOptions([optionFactory("a")], undefined);

    expect(ordered).toEqual([]);
  });
});
