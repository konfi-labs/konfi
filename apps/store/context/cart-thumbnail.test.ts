import { describe, expect, it } from "vitest";

import { getCartThumbnailRenderSize } from "./cart-thumbnail";

describe("getCartThumbnailRenderSize", () => {
  it("keeps portrait A6 artwork rectangular instead of padding to a square", () => {
    expect(
      getCartThumbnailRenderSize({
        sourceHeight: 148,
        sourceWidth: 105,
      }),
    ).toEqual({
      height: 200,
      width: 142,
    });
  });

  it("keeps landscape A6 artwork rectangular instead of padding to a square", () => {
    expect(
      getCartThumbnailRenderSize({
        sourceHeight: 105,
        sourceWidth: 148,
      }),
    ).toEqual({
      height: 142,
      width: 200,
    });
  });

  it("caps square thumbnails at the maximum dimension", () => {
    expect(
      getCartThumbnailRenderSize({
        sourceHeight: 500,
        sourceWidth: 500,
      }),
    ).toEqual({
      height: 200,
      width: 200,
    });
  });
});
