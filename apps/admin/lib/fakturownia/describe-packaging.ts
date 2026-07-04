import type { FakturowniaCostPackaging, FakturowniaCostUnit } from "@konfi/types";
import type { TFunction } from "i18next";

/**
 * Builds a short, localised human-readable phrase describing the purchase
 * packaging of a cost entry, e.g. "from a 1050 × 50 m roll" or
 * "sheet 320×450 mm · ream of 250 · 80 µm".
 *
 * Returns `undefined` when no useful information is present.
 *
 * i18n keys used (under "admin.costPackaging.*", resolvable via fallbackNS
 * from both the configurator panel and the /fakturownia/costs review page):
 *   fromRoll  – roll description
 *   sheet     – sheet dimensions
 *   ream      – sheets-per-pack suffix
 *   micron    – thickness suffix
 */
export function describeCostPackaging(
  packaging: FakturowniaCostPackaging | undefined | null,
  _costUnit: FakturowniaCostUnit | undefined,
  t: TFunction,
): string | undefined {
  if (!packaging) {
    return undefined;
  }

  const parts: string[] = [];

  const rollWidth =
    typeof packaging.rollWidthMm === "number" && packaging.rollWidthMm > 0
      ? packaging.rollWidthMm
      : undefined;
  const rollLength =
    typeof packaging.rollLengthM === "number" && packaging.rollLengthM > 0
      ? packaging.rollLengthM
      : undefined;

  const sheetWidth =
    typeof packaging.sheetWidthMm === "number" && packaging.sheetWidthMm > 0
      ? packaging.sheetWidthMm
      : undefined;
  const sheetHeight =
    typeof packaging.sheetHeightMm === "number" && packaging.sheetHeightMm > 0
      ? packaging.sheetHeightMm
      : undefined;

  const sheetsPerPack =
    typeof packaging.sheetsPerPack === "number" && packaging.sheetsPerPack > 0
      ? packaging.sheetsPerPack
      : undefined;

  const thickness =
    typeof packaging.thicknessMicron === "number" &&
    packaging.thicknessMicron > 0
      ? packaging.thicknessMicron
      : undefined;

  if (rollWidth !== undefined && rollLength !== undefined) {
    parts.push(
      t("admin.costPackaging.fromRoll", {
        defaultValue: "from a {{width}} × {{length}} m roll",
        width: rollWidth,
        length: rollLength,
      }),
    );
  } else {
    if (sheetWidth !== undefined && sheetHeight !== undefined) {
      parts.push(
        t("admin.costPackaging.sheet", {
          defaultValue: "sheet {{width}} × {{height}} mm",
          width: sheetWidth,
          height: sheetHeight,
        }),
      );
    }

    if (sheetsPerPack !== undefined) {
      parts.push(
        t("admin.costPackaging.ream", {
          // Use `sheets`, not `count`, so i18next does not treat this as a
          // plural key (which would look up ream_one/ream_other first).
          defaultValue: "ream of {{sheets}}",
          sheets: sheetsPerPack,
        }),
      );
    }
  }

  if (thickness !== undefined) {
    parts.push(
      t("admin.costPackaging.micron", {
        defaultValue: "{{micron}} µm",
        micron: thickness,
      }),
    );
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(" · ");
}
