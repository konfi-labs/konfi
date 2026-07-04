export const IMPOSITION_MAX_FILES = 20;
export const IMPOSITION_MAX_FILE_SIZE_MB = 512;
export const IMPOSITION_MAX_TOTAL_FILE_SIZE_MB = 2048;

export const IMPOSITION_MAX_FILE_SIZE_BYTES =
  IMPOSITION_MAX_FILE_SIZE_MB * 1024 * 1024;
export const IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES =
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB * 1024 * 1024;

export const IMPOSITION_SUPPORTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/webp",
] as const;

export type ImpositionSupportedFileType =
  (typeof IMPOSITION_SUPPORTED_FILE_TYPES)[number];

export function getImpositionTotalFileSize(
  files: ReadonlyArray<{ size: number }>,
): number {
  return files.reduce((totalSize, file) => totalSize + file.size, 0);
}
