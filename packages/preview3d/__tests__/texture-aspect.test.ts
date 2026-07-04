import { describe, expect, it } from "vitest";

import {
  IDENTITY_TEXTURE_ASPECT_TRANSFORM,
  getTextureAspectTransform,
} from "../src/texture-aspect";

describe("getTextureAspectTransform", () => {
  it("crops centered square thumbnails to portrait A6 aspect", () => {
    expect(
      getTextureAspectTransform({
        sourceHeight: 200,
        sourceWidth: 200,
        targetHeight: 148,
        targetWidth: 105,
      }),
    ).toEqual({
      offset: [expect.closeTo(0.14527027027027029), 0],
      repeat: [expect.closeTo(0.7094594594594594), 1],
    });
  });

  it("crops centered square thumbnails to landscape A6 aspect", () => {
    expect(
      getTextureAspectTransform({
        sourceHeight: 200,
        sourceWidth: 200,
        targetHeight: 105,
        targetWidth: 148,
      }),
    ).toEqual({
      offset: [0, expect.closeTo(0.14527027027027029)],
      repeat: [1, expect.closeTo(0.7094594594594594)],
    });
  });

  it("keeps matching aspect ratio textures unchanged", () => {
    expect(
      getTextureAspectTransform({
        sourceHeight: 296,
        sourceWidth: 210,
        targetHeight: 148,
        targetWidth: 105,
      }),
    ).toBe(IDENTITY_TEXTURE_ASPECT_TRANSFORM);
  });
});
