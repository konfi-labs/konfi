import { afterEach, describe, expect, it } from "vitest";
import {
  clearFileConversionRegistry,
  isRegisteredConversionOutput,
  registerConversionOutput,
  registerStagedPdfUpload,
  resolveStagedPdfUpload,
} from "./file-conversion-registry";

describe("file conversion registry", () => {
  afterEach(() => {
    clearFileConversionRegistry();
  });

  it("rejects conversion using an unknown staged upload id", () => {
    expect(resolveStagedPdfUpload("missing")).toBeNull();
  });

  it("resolves staged uploads and registered outputs", () => {
    const uploadId = registerStagedPdfUpload("C:\\tmp\\source.pdf");
    expect(resolveStagedPdfUpload(uploadId)).toBe("C:\\tmp\\source.pdf");

    registerConversionOutput("C:\\tmp\\source-1.tiff");
    expect(isRegisteredConversionOutput("C:\\tmp\\source-1.tiff")).toBe(true);
    expect(isRegisteredConversionOutput("C:\\tmp\\unknown.tiff")).toBe(false);
  });
});
