"use client";

import { STICKER_MEDIA_WIDTH_PRESETS_MM } from "@/lib/sticker-imposition/types";
import { useEffect, useMemo, useState } from "react";

export type StickerMediaWidthSelectorValue = `${number}` | "custom";

export function resolveStickerMediaWidthSelectorValue(
  mediaWidthMm: number,
): StickerMediaWidthSelectorValue {
  return STICKER_MEDIA_WIDTH_PRESETS_MM.includes(
    mediaWidthMm as (typeof STICKER_MEDIA_WIDTH_PRESETS_MM)[number],
  )
    ? `${mediaWidthMm}`
    : "custom";
}

export function useStickerMediaWidthSelector(mediaWidthMm: number) {
  const resolvedMediaValue = useMemo(
    () => resolveStickerMediaWidthSelectorValue(mediaWidthMm),
    [mediaWidthMm],
  );
  const [selectedMediaValue, setSelectedMediaValue] =
    useState<StickerMediaWidthSelectorValue>(resolvedMediaValue);

  useEffect(() => {
    setSelectedMediaValue(resolvedMediaValue);
  }, [resolvedMediaValue]);

  return {
    selectedMediaValue,
    setSelectedMediaValue,
  };
}
