import { ListResults, OrderItem } from "@konfi/types";
import { isPreviewAvailable } from "../../validators/is-preview-available";

describe("isPreviewAvailable", () => {
  // Set up mock data
  const validItem: OrderItem = {
    product: {
      threeDModel: "BOX",
    },
    width: 100,
    height: 200,
  } as unknown as OrderItem;

  const validPreviewURLs: string[] = ["preview-url-1"];
  const validListResults = [{}] as unknown as ListResults[];

  it("should return false when listResults is undefined", () => {
    expect(
      isPreviewAvailable(
        validItem,
        undefined as unknown as ListResults[],
        validPreviewURLs,
      ),
    ).toBe(false);
  });

  it("should return false when listResults is empty", () => {
    expect(isPreviewAvailable(validItem, [], validPreviewURLs)).toBe(false);
  });

  it("should return true without a selected 3D template when preview inputs exist", () => {
    expect(
      isPreviewAvailable(
        {
          ...validItem,
          product: {
            ...validItem.product,
            threeDModel: null,
          },
        } as OrderItem,
        validListResults,
        validPreviewURLs,
      ),
    ).toBe(true);
  });
});
