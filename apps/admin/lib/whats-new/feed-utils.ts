import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import {
  WhatsNewChange,
  WHATS_NEW_CHANGE_KIND,
  WHATS_NEW_CHANGE_SOURCE,
} from "./types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getUtcDate(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function getWeekStart(date: Date) {
  const utcDate = getUtcDate(date);
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - day + 1);
  return utcDate;
}

export function getMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function getWeekPeriodKey(date: Date) {
  const utcDate = getUtcDate(date);
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - (utcDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const diffDays =
    Math.floor((utcDate.getTime() - yearStart.getTime()) / ONE_DAY_MS) + 1;
  const weekNumber = Math.ceil(diffDays / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

export function getMonthPeriodKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function sortWhatsNewChanges(changes: WhatsNewChange[]) {
  return [...changes].sort((left, right) => {
    return (
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    );
  });
}

export function mergeWhatsNewChanges(
  manualChanges: WhatsNewChange[],
  generatedChanges: WhatsNewChange[],
  limitCount: number = 12,
) {
  const uniqueChanges = new Map<string, WhatsNewChange>();

  for (const change of [...generatedChanges, ...manualChanges]) {
    uniqueChanges.set(change.id, normalizeWhatsNewChange(change));
  }

  return sortWhatsNewChanges(Array.from(uniqueChanges.values())).slice(
    0,
    limitCount,
  );
}

export function normalizeWhatsNewChange(
  change: WhatsNewChange,
): WhatsNewChange {
  return {
    ...change,
    title: ensureLocaleMap(change.title),
    description: ensureLocaleMap(change.description),
    highlightFeatures: change.highlightFeatures ?? [],
    kind: change.kind ?? WHATS_NEW_CHANGE_KIND.MANUAL,
    source: change.source ?? WHATS_NEW_CHANGE_SOURCE.MANUAL,
  };
}

function ensureLocaleMap(values: Record<string, string>) {
  const normalized = { ...values };
  const fallback =
    normalized[Locale.en] ??
    normalized[Locale.pl] ??
    normalized[DEFAULT_LOCALE] ??
    Object.values(normalized)[0];

  if (!normalized[DEFAULT_LOCALE]) {
    if (fallback) {
      normalized[DEFAULT_LOCALE] = fallback;
    }
  }

  if (!normalized[Locale.en] && normalized[DEFAULT_LOCALE]) {
    normalized[Locale.en] = normalized[DEFAULT_LOCALE];
  }

  if (!normalized[Locale.pl] && normalized[DEFAULT_LOCALE]) {
    normalized[Locale.pl] = normalized[DEFAULT_LOCALE];
  }

  return normalized;
}
