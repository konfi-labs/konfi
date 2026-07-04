import { describe, expect, it } from "vitest";

import {
  PREVIEW_3D_TEMPLATE_DEFINITIONS,
  PREVIEW_3D_TEMPLATES,
  getPreview3DModelUrl,
  resolvePreview3DTemplate,
  resolvePreview3DVariant,
} from "../src/templates";

describe("preview 3D template manifest", () => {
  it("defines every public template", () => {
    expect(Object.keys(PREVIEW_3D_TEMPLATE_DEFINITIONS).sort()).toEqual(
      [...PREVIEW_3D_TEMPLATES].sort(),
    );
  });

  it("resolves missing templates to booklet for multi-page products", () => {
    expect(resolvePreview3DTemplate(undefined, 12)).toBe("BOOKLET");
    expect(resolvePreview3DTemplate(undefined, 1)).toBe("FLAT");
  });

  it("exposes model URLs for all GLTF templates", () => {
    for (const definition of Object.values(PREVIEW_3D_TEMPLATE_DEFINITIONS)) {
      if (definition.kind !== "gltf") {
        continue;
      }

      expect(getPreview3DModelUrl(definition)).toContain(
        `/models/${definition.fileName}`,
      );
    }
  });

  it("selects nearest dimension variants for size-based templates", () => {
    expect(
      resolvePreview3DVariant({
        definition: PREVIEW_3D_TEMPLATE_DEFINITIONS.ROLLUP_STANDARD,
        height: 200,
        width: 118,
      })?.id,
    ).toBe("120x200");
    expect(
      resolvePreview3DVariant({
        definition: PREVIEW_3D_TEMPLATE_DEFINITIONS.XBANNER,
        height: 170,
        width: 68,
      })?.id,
    ).toBe("60x160");
    expect(
      resolvePreview3DVariant({
        definition: PREVIEW_3D_TEMPLATE_DEFINITIONS.CANVAS,
        height: 103,
        width: 72,
      })?.id,
    ).toBe("70x100");
    expect(
      resolvePreview3DVariant({
        definition: PREVIEW_3D_TEMPLATE_DEFINITIONS.PIN,
        height: 55,
        width: 55,
      })?.id,
    ).toBe("56");
    expect(
      resolvePreview3DVariant({
        definition: PREVIEW_3D_TEMPLATE_DEFINITIONS.TOOTHPICK,
        height: 48,
        width: 48,
      })?.id,
    ).toBe("50");
    expect(
      resolvePreview3DVariant({
        definition: PREVIEW_3D_TEMPLATE_DEFINITIONS.FLYERS,
        height: 297,
        width: 210,
      })?.id,
    ).toBe("A4");
  });
});
