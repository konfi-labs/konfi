import { afterEach, describe, expect, it } from "vitest";
import {
  clearPreviewRegistry,
  registerPreviewFile,
  releasePreviewFile,
  resolvePreviewFile,
} from "./preview-registry";

describe("preview registry", () => {
  afterEach(() => {
    clearPreviewRegistry();
  });

  it("rejects unknown preview ids", () => {
    expect(resolvePreviewFile("missing")).toBeNull();
  });

  it("registers and releases preview files by opaque id", () => {
    const preview = registerPreviewFile("C:\\tmp\\preview.png");
    expect(preview.previewUrl).toBe(`konfi-preview://preview/${preview.previewId}`);
    expect(resolvePreviewFile(preview.previewId)).toBe("C:\\tmp\\preview.png");
    expect(releasePreviewFile(preview.previewId)).toBe("C:\\tmp\\preview.png");
    expect(resolvePreviewFile(preview.previewId)).toBeNull();
  });
});
