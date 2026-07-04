import { MODELS } from "@konfi/firebase";
import { type ImageGenerationRequest } from "@konfi/types";

export function normalizeMimeType(mimeType: string | undefined): string {
  const raw = (mimeType ?? "").trim().toLowerCase();
  const base = raw.split(";")[0]?.trim() ?? "";
  if (base === "image/jpg") return "image/jpeg";
  return base;
}

export function guessMimeTypeFromFileName(fileName: string): string | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return null;
}

export type FileNameAndType = {
  name: string;
  type?: string;
};

export function getEffectiveReferenceMimeType(file: FileNameAndType): string {
  const fromType = normalizeMimeType(file.type);
  if (fromType) return fromType;
  return guessMimeTypeFromFileName(file.name) ?? "";
}

export function getMaxReferenceImagesForModel(
  model: ImageGenerationRequest["model"],
): number {
  // Reference image INPUT limits (not output count).
  // Kept model-specific because Vertex/Gemini has different limits depending on the model.
  switch (model) {
    case MODELS.NANO_BANANA_2_LITE:
    case MODELS.NANO_BANANA_2:
      return 14;
    case MODELS.GPT_IMAGE_2:
      return 4;
    case MODELS.FLUX_2_KLEIN:
      return 10;
    case MODELS.QUIVER_ARROW:
      return 0;
    default:
      return 1;
  }
}
