import { PriceTypeEnum } from "@konfi/types";
import { reach } from "yup";
import { describe, expect, it } from "vitest";

import { ProductCreateSchema, ProductUpdateSchema } from "../../schemas";

describe("product productType schema", () => {
  it("allows matrix-like products without a selected product type", async () => {
    const createProductTypeSchema = reach(ProductCreateSchema, "productType");
    const updateProductTypeSchema = reach(ProductUpdateSchema, "productType");
    const validationOptions = {
      parent: { priceType: PriceTypeEnum.MATRIX },
    };

    await expect(
      createProductTypeSchema.validate(null, validationOptions),
    ).resolves.toBeNull();
    await expect(
      updateProductTypeSchema.validate(
        {
          attributes: [],
          id: "",
          isShippable: true,
          name: "",
        },
        validationOptions,
      ),
    ).resolves.toBeNull();
  });
});
