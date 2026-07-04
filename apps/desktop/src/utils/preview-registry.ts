import { randomUUID } from "node:crypto";

const previewFiles = new Map<string, string>();

export interface RegisteredPreview {
  readonly previewId: string;
  readonly previewUrl: string;
}

export const registerPreviewFile = (filePath: string): RegisteredPreview => {
  const previewId = randomUUID();
  previewFiles.set(previewId, filePath);
  return {
    previewId,
    previewUrl: `konfi-preview://preview/${previewId}`,
  };
};

export const resolvePreviewFile = (previewId: string): string | null => {
  return previewFiles.get(previewId) ?? null;
};

export const releasePreviewFile = (previewId: string): string | null => {
  const filePath = previewFiles.get(previewId) ?? null;
  previewFiles.delete(previewId);
  return filePath;
};

export const clearPreviewRegistry = () => {
  previewFiles.clear();
};
