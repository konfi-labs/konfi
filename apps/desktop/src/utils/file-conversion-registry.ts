import { randomUUID } from "node:crypto";

const stagedPdfUploads = new Map<string, string>();
const conversionOutputs = new Set<string>();

export const registerStagedPdfUpload = (filePath: string) => {
  const uploadId = randomUUID();
  stagedPdfUploads.set(uploadId, filePath);
  return uploadId;
};

export const resolveStagedPdfUpload = (uploadId: string) =>
  stagedPdfUploads.get(uploadId) ?? null;

export const registerConversionOutput = (filePath: string) => {
  conversionOutputs.add(filePath);
};

export const isRegisteredConversionOutput = (filePath: string) =>
  conversionOutputs.has(filePath);

export const clearFileConversionRegistry = () => {
  stagedPdfUploads.clear();
  conversionOutputs.clear();
};
