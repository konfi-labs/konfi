import "server-only";

import { z } from "zod";
import {
  STICKER_DEFAULT_SETTINGS,
  stickerBleedFillMode,
  stickerCutShape,
  stickerPackingMode,
  type StickerImpositionItem,
  type StickerImpositionSettings,
} from "./types";

export type StickerImpositionPayload = {
  items: StickerImpositionItem[];
  settings: StickerImpositionSettings;
};

const stickerSettingsSchema = z
  .object({
    allowLongSheets: z
      .boolean()
      .default(STICKER_DEFAULT_SETTINGS.allowLongSheets),
    fillRows: z.boolean().default(STICKER_DEFAULT_SETTINGS.fillRows),
    groupMaxDistinctItems: z
      .number()
      .int()
      .positive()
      .default(STICKER_DEFAULT_SETTINGS.groupMaxDistinctItems),
    manualCutMarkLengthMm: z
      .number()
      .finite()
      .positive()
      .default(STICKER_DEFAULT_SETTINGS.manualCutMarkLengthMm),
    manualCutMarksEnabled: z
      .boolean()
      .default(STICKER_DEFAULT_SETTINGS.manualCutMarksEnabled),
    mediaWidthMm: z.number().finite().positive(),
    minSpacingMm: z.number().finite().min(0),
    packingMode: z.enum([
      stickerPackingMode.GROUPED_PARTS,
      stickerPackingMode.SINGLE_CUT_ROWS,
    ]),
    partGapMm: z
      .number()
      .finite()
      .min(0)
      .default(STICKER_DEFAULT_SETTINGS.partGapMm),
    partMarginMm: z
      .number()
      .finite()
      .min(0)
      .default(STICKER_DEFAULT_SETTINGS.partMarginMm),
    preferredSheetLengthMm: z
      .number()
      .finite()
      .positive()
      .default(STICKER_DEFAULT_SETTINGS.preferredSheetLengthMm),
    previewMarginMm: z
      .number()
      .finite()
      .min(0)
      .default(STICKER_DEFAULT_SETTINGS.previewMarginMm),
    sheetGapMm: z
      .number()
      .finite()
      .min(0)
      .default(STICKER_DEFAULT_SETTINGS.sheetGapMm),
    oposMarksEnabled: z
      .boolean()
      .default(STICKER_DEFAULT_SETTINGS.oposMarksEnabled),
    oposMarkSizeMm: z
      .number()
      .finite()
      .positive()
      .default(STICKER_DEFAULT_SETTINGS.oposMarkSizeMm),
    oposMarkMarginMm: z
      .number()
      .finite()
      .min(0)
      .default(STICKER_DEFAULT_SETTINGS.oposMarkMarginMm),
    oposMarkSpacingMm: z
      .number()
      .finite()
      .positive()
      .default(STICKER_DEFAULT_SETTINGS.oposMarkSpacingMm),
    oposMarkClearanceMm: z
      .number()
      .finite()
      .min(0)
      .default(STICKER_DEFAULT_SETTINGS.oposMarkClearanceMm),
  })
  .strip();

const stickerItemSchema = z
  .object({
    bleedMm: z.number().finite().min(0).default(0),
    bleedFillMode: z
      .enum([
        stickerBleedFillMode.MIRROR,
        stickerBleedFillMode.CONTENT_AWARE_FAST,
      ])
      .default(stickerBleedFillMode.MIRROR),
    cutOffsetMm: z.number().finite(),
    cutShape: z.enum([
      stickerCutShape.CIRCLE,
      stickerCutShape.DIE_CUT,
      stickerCutShape.READY_SHEET,
      stickerCutShape.RECTANGLE,
    ]),
    filename: z.string().trim().min(1),
    heightMm: z.number().finite().positive(),
    id: z.string().trim().min(1),
    mirrorBleedEnabled: z.boolean().default(false),
    pageNumber: z.number().int().positive(),
    quantity: z.number().int().positive(),
    sourceHeightMm: z.number().finite().positive().nullable().default(null),
    sourceFileIndex: z.number().int().nonnegative(),
    sourceWidthMm: z.number().finite().positive().nullable().default(null),
    widthMm: z.number().finite().positive(),
  })
  .strip();

const stickerPayloadSchema = z
  .object({
    items: z.array(stickerItemSchema).min(1),
    settings: stickerSettingsSchema,
  })
  .strip();

export function parseStickerImpositionPayload(
  value: unknown,
): StickerImpositionPayload {
  const result = stickerPayloadSchema.safeParse(value);

  if (!result.success) {
    throw new Error(
      `Invalid sticker imposition payload: ${formatValidationIssues(result.error)}`,
    );
  }

  return result.data;
}

function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
