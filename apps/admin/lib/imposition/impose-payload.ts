import { getPaperDimensions, ImposeSchema } from "@konfi/utils";
import type { InferType } from "yup";
import { resolveImpositionSourceSizing } from "./source-sizing";
import type { ImposePreviewRequest } from "@konfi/wasm";

export type ImposePayloadFormValues = InferType<typeof ImposeSchema>;

// All functions accept Partial<ImposePayloadFormValues> because preview feeds
// useWatch output which can have undefined fields.

export function normalizeImposeBoolean(value: unknown): boolean {
  if (typeof value === "string") {
    return value === "true";
  }
  return Boolean(value);
}

export function roundImposeDimension(value: number): number {
  return Math.round(Math.max(0, value));
}

export type ImposeDimensions = { width: number; height: number };

export function resolveImposeSheetDimensions(
  values: Partial<ImposePayloadFormValues>,
): ImposeDimensions {
  if (
    normalizeImposeBoolean(values.customSheetSize) &&
    values.customSheetSizeWidth &&
    values.customSheetSizeHeight
  ) {
    return {
      width: values.customSheetSizeWidth,
      height: values.customSheetSizeHeight,
    };
  }
  return getPaperDimensions(
    values.sheetSizeName || "A4",
    (values.sheetOrientation || "PORTRAIT") as "PORTRAIT" | "LANDSCAPE",
  );
}

export function resolveImposeItemDimensions(
  values: Partial<ImposePayloadFormValues>,
): ImposeDimensions {
  if (
    normalizeImposeBoolean(values.customItemSize) &&
    values.customItemSizeWidth &&
    values.customItemSizeHeight
  ) {
    return {
      width: values.customItemSizeWidth,
      height: values.customItemSizeHeight,
    };
  }
  return getPaperDimensions(
    values.itemSizeName || "A5",
    (values.itemOrientation || "PORTRAIT") as "PORTRAIT" | "LANDSCAPE",
  );
}

type SourceSizingParams = Parameters<typeof resolveImpositionSourceSizing>[0];

export function buildImposeRequestPayload(
  values: Partial<ImposePayloadFormValues>,
) {
  const sheet = resolveImposeSheetDimensions(values);
  const item = resolveImposeItemDimensions(values);

  return {
    automaticItemOrientation: normalizeImposeBoolean(
      values.automaticItemOrientation,
    ),
    automaticNumberOfHorizontalItems: normalizeImposeBoolean(
      values.automaticNumberOfHorizontalItems,
    ),
    automaticNumberOfVerticalItems: normalizeImposeBoolean(
      values.automaticNumberOfVerticalItems,
    ),
    automaticSheetOrientation: normalizeImposeBoolean(
      values.automaticSheetOrientation,
    ),
    automaticSpacingHorizontal: normalizeImposeBoolean(
      values.automaticSpacingHorizontal,
    ),
    automaticSpacingVertical: normalizeImposeBoolean(
      values.automaticSpacingVertical,
    ),
    backPageRotation: values.backPageRotation,
    bleed: values.bleed ?? 0,
    bleedType: values.bleedType,
    cropMarks: normalizeImposeBoolean(values.cropMarks),
    customItemSizeHeight: roundImposeDimension(item.height),
    customItemSizeWidth: roundImposeDimension(item.width),
    customSheetSizeHeight: roundImposeDimension(sheet.height),
    customSheetSizeWidth: roundImposeDimension(sheet.width),
    duplexMode: values.duplexMode,
    frontBackAlignment: normalizeImposeBoolean(values.frontBackAlignment),
    itemSizeName: values.itemSizeName || "",
    layout: values.layout,
    mirrorBack: normalizeImposeBoolean(values.mirrorBack),
    numItemsHorizontal: values.numItemsHorizontal || 0,
    numItemsVertical: values.numItemsVertical || 0,
    pagesPerSignature: values.pagesPerSignature || 0,
    sheetSizeName: values.sheetSizeName || "",
    sourceSizing: resolveImpositionSourceSizing({
      bleedType: values.bleedType as SourceSizingParams["bleedType"],
      sourceSizing: values.sourceSizing as SourceSizingParams["sourceSizing"],
    }),
    spacingHorizontal: values.spacingHorizontal || "",
    spacingVertical: values.spacingVertical || "",
  };
}

export type ImposeRequestPayload = ReturnType<typeof buildImposeRequestPayload>;

export function buildImposePreviewRequest(
  values: Partial<ImposePayloadFormValues>,
): ImposePreviewRequest | null {
  const sheet = resolveImposeSheetDimensions(values);
  const item = resolveImposeItemDimensions(values);

  if (
    sheet.width <= 0 ||
    sheet.height <= 0 ||
    item.width <= 0 ||
    item.height <= 0 ||
    !values.layout ||
    !values.bleedType
  ) {
    return null;
  }

  return {
    data: {
      additionalData: {
        customItemSize: normalizeImposeBoolean(values.customItemSize),
        customSheetSize: normalizeImposeBoolean(values.customSheetSize),
        files: [],
        itemOrientation: values.itemOrientation || "",
        itemSizeName: values.itemSizeName || "",
        saveAsTemplate: false,
        sheetOrientation: values.sheetOrientation || "",
        sheetSizeName: values.sheetSizeName || "",
      },
      ...buildImposeRequestPayload(values),
    },
  };
}
