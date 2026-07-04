import { ThreeDModels } from "@konfi/types";
import { reach } from "yup";
import { describe, expect, it } from "vitest";

import { ProductCreateSchema } from "../../schemas";

describe("ProductCreateSchema threeDModel", () => {
  it("accepts every configured 3D preview template enum value", async () => {
    const threeDModelSchema = reach(ProductCreateSchema, "threeDModel");

    for (const value of Object.values(ThreeDModels)) {
      await expect(threeDModelSchema.isValid(value)).resolves.toBe(true);
    }
  });
});
