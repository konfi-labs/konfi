import type { StickerImpositionPlan } from "./types";

const STICKER_BAD_REQUEST_PREFIXES = [
  "At least one sticker source file",
  "File ",
  "Invalid sticker imposition payload",
  "Missing required sticker form field",
  "Missing source file",
  "PDF page ",
  "Sticker imposition exceeds",
  "Sticker imposition supports",
  "Sticker sheet ",
] as const;

const FLOAT_EPSILON = 0.001;

export function isStickerBadRequestMessage(message: string): boolean {
  return STICKER_BAD_REQUEST_PREFIXES.some((prefix) =>
    message.startsWith(prefix),
  );
}

export function validateStickerImpositionPlan(
  plan: StickerImpositionPlan,
): void {
  for (const sheet of plan.sheets) {
    if (sheet.exportWidthMm - sheet.mediaWidthMm > FLOAT_EPSILON) {
      throw new Error(
        `Sticker sheet ${sheet.index + 1} is wider than the selected media. Increase the media width or reduce sticker size or cut offset.`,
      );
    }
  }
}
