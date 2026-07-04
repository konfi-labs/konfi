import {
  getImpositionTotalFileSize,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  layoutType,
  sourceSizing,
} from "@konfi/types";
import { ImposeSchema } from "../../schemas";

function createMockFile(params?: {
  name?: string;
  size?: number;
  type?: string;
}): File {
  return {
    name: params?.name ?? "sheet.pdf",
    size: params?.size ?? 1024,
    type: params?.type ?? "application/pdf",
  } as File;
}

describe("ImposeSchema", () => {
  describe("files validation", () => {
    it("accepts files within the configured batch limits", () => {
      const files = [
        createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
        createMockFile({
          name: "second.pdf",
          size: IMPOSITION_MAX_FILE_SIZE_BYTES,
        }),
        createMockFile({
          name: "third.pdf",
          size: IMPOSITION_MAX_FILE_SIZE_BYTES,
        }),
        createMockFile({
          name: "fourth.pdf",
          size:
            IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES -
            getImpositionTotalFileSize([
              createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
              createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
              createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
            ]),
        }),
      ];

      const result = ImposeSchema.validateSyncAt("files", { files });

      expect(result).toEqual(files);
    });

    it("rejects files when the total batch size exceeds the configured limit", () => {
      const files = [
        createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
        createMockFile({
          name: "second.pdf",
          size: IMPOSITION_MAX_FILE_SIZE_BYTES,
        }),
        createMockFile({
          name: "third.pdf",
          size: IMPOSITION_MAX_FILE_SIZE_BYTES,
        }),
        createMockFile({
          name: "fourth.pdf",
          size: IMPOSITION_MAX_FILE_SIZE_BYTES,
        }),
        createMockFile({
          name: "fifth.pdf",
          size:
            IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES -
            getImpositionTotalFileSize([
              createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
              createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
              createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
              createMockFile({ size: IMPOSITION_MAX_FILE_SIZE_BYTES }),
            ]) +
            1,
        }),
      ];

      expect(() => {
        ImposeSchema.validateSyncAt("files", { files });
      }).toThrow(/Łączny rozmiar plików nie może przekroczyć/);
    });
  });

  describe("sourceSizing validation", () => {
    it("accepts known source sizing values", () => {
      const result = ImposeSchema.validateSyncAt("sourceSizing", {
        sourceSizing: sourceSizing.FIT_OUTPUT_BOX,
      });

      expect(result).toBe(sourceSizing.FIT_OUTPUT_BOX);
    });
  });

  describe("pagesPerSignature validation", () => {
    it("accepts booklet signatures that are positive multiples of 4", () => {
      const result = ImposeSchema.validateSyncAt("pagesPerSignature", {
        layout: layoutType.BOOKLET,
        pagesPerSignature: 8,
      });

      expect(result).toBe(8);
    });

    it("rejects booklet signatures that are not multiples of 4", () => {
      expect(() =>
        ImposeSchema.validateSyncAt("pagesPerSignature", {
          layout: layoutType.BOOKLET,
          pagesPerSignature: 6,
        }),
      ).toThrow(/wielokrotnością 4/);
    });

    it("ignores non-booklet signatures that are not multiples of 4", () => {
      const result = ImposeSchema.validateSyncAt("pagesPerSignature", {
        layout: layoutType.STEP_AND_REPEAT,
        pagesPerSignature: 1,
      });

      expect(result).toBe(1);
    });
  });
});
