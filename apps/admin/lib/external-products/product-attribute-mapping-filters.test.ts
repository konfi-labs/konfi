import { describe, expect, it } from "vitest";

import { filterProductAttributeMappings } from "./product-attribute-mapping-filters";

describe("filterProductAttributeMappings", () => {
  it("removes page count attributes because product page count is separate", () => {
    const mappings = filterProductAttributeMappings({
      mappings: [
        {
          externalAttributeName: "pageNumber",
          internalAttributeId: "format",
        },
        {
          externalAttributeName: "paperFormat",
          internalAttributeId: "format",
        },
      ],
      pageCountAttributeName: "pageNumber",
    });

    expect(mappings).toEqual([
      {
        externalAttributeName: "paperFormat",
        internalAttributeId: "format",
      },
    ]);
  });

  it("removes manually marked special-role attributes", () => {
    const mappings = filterProductAttributeMappings({
      mappings: [
        {
          externalAttributeName: "providerPages",
          specialRole: "pageCount",
        },
        {
          externalAttributeName: "paperFormat",
          internalAttributeId: "format",
        },
      ],
    });

    expect(mappings).toEqual([
      {
        externalAttributeName: "paperFormat",
        internalAttributeId: "format",
      },
    ]);
  });

  it("removes ranged dimensions because custom size is separate", () => {
    const mappings = filterProductAttributeMappings({
      mappings: [
        {
          externalAttributeName: "width",
          internalAttributeId: "szerokoscFotoobrazy",
        },
        {
          externalAttributeName: "height",
          internalAttributeId: "wysokoscFotoobrazy",
        },
        {
          externalAttributeName: "material",
          internalAttributeId: "material",
        },
      ],
      rangedDimensionAttributeNames: new Set(["width", "height"]),
    });

    expect(mappings).toEqual([
      {
        externalAttributeName: "material",
        internalAttributeId: "material",
      },
    ]);
  });
});
