"use client";

import { bleedType, bleedTypeAsOptions, type SelectOption } from "@konfi/types";

export const imposeWorkspaceMode = {
  LAYOUT: "layout",
  SPACING: "spacing",
  FINISHING: "finishing",
  BLEED_SIZING: "bleedSizing",
} as const;

export type ImposeWorkspaceMode =
  (typeof imposeWorkspaceMode)[keyof typeof imposeWorkspaceMode];

export const IMPOSE_WORKSPACE_MODE_ORDER: ImposeWorkspaceMode[] = [
  imposeWorkspaceMode.LAYOUT,
  imposeWorkspaceMode.SPACING,
  imposeWorkspaceMode.FINISHING,
  imposeWorkspaceMode.BLEED_SIZING,
];

export const selectableBleedTypeOptions: SelectOption[] = bleedTypeAsOptions.filter(
  (option) => option.value !== bleedType.DIFFERENTIAL_DIFFUSION,
);

export function parseSpacingValues(value?: string | null): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => {
      const parsed = Number.parseFloat(entry.trim());
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    })
    .filter((entry) => Number.isFinite(entry));
}

export function getSpacingValueAt(values: number[], index: number): number {
  if (values.length === 0) {
    return 0;
  }

  return values[Math.min(index, values.length - 1)] ?? 0;
}

function formatSingleSpacingValue(value: number): string {
  const normalized = Math.max(0, value);
  return Number.isInteger(normalized)
    ? normalized.toString()
    : normalized.toFixed(2).replace(/\.?0+$/, "");
}

export function buildUniformSpacing(value: number, gapCount: number): string {
  if (gapCount <= 0) {
    return "";
  }

  return Array.from({ length: gapCount }, () =>
    formatSingleSpacingValue(value),
  ).join(",");
}

export function getPrimarySpacingValue(rawValue?: string | null): number {
  return parseSpacingValues(rawValue)[0] ?? 0;
}
