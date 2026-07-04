export type ProductUsageByChannel = Record<string, Record<string, number>>;

type OptionWithGroup = {
  value: string;
  label: string;
  group: string;
};

export const KONFI_PRODUCT_USAGE_STORAGE_KEY = "konfi:admin:product-usage:v1";
export const KONFI_PRODUCT_USAGE_LIMIT = 30;

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

export function pruneKonfiProductUsage(
  usage: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(usage)
      .filter(([, count]) => Number.isFinite(count) && count > 0)
      .sort((a, b) => {
        const countDiff = b[1] - a[1];
        if (countDiff !== 0) return countDiff;
        return a[0].localeCompare(b[0]);
      })
      .slice(0, KONFI_PRODUCT_USAGE_LIMIT),
  );
}

export function readKonfiProductUsageStorage(storage?: Storage): ProductUsageByChannel {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return {};

  try {
    const raw = targetStorage.getItem(KONFI_PRODUCT_USAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const next: ProductUsageByChannel = {};
    for (const [channelId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object") continue;
      const channelUsage: Record<string, number> = {};
      for (const [productId, rawCount] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const count = Number(rawCount);
        if (!Number.isFinite(count) || count <= 0) continue;
        channelUsage[productId] = Math.floor(count);
      }
      const pruned = pruneKonfiProductUsage(channelUsage);
      if (Object.keys(pruned).length > 0) {
        next[channelId] = pruned;
      }
    }

    return next;
  } catch (error) {
    console.error("Error reading Konfi product usage from localStorage:", error);
    return {};
  }
}

export function writeKonfiProductUsageStorage(
  usage: ProductUsageByChannel,
  storage?: Storage,
): void {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return;

  try {
    targetStorage.setItem(KONFI_PRODUCT_USAGE_STORAGE_KEY, JSON.stringify(usage));
  } catch (error) {
    console.error("Error writing Konfi product usage to localStorage:", error);
  }
}

export function readKonfiProductUsageForChannel(
  channelId: string | null | undefined,
  storage?: Storage,
): Record<string, number> {
  if (!channelId) return {};
  const usage = readKonfiProductUsageStorage(storage);
  return usage[channelId] ?? {};
}

export function incrementKonfiProductUsage(
  channelId: string | null | undefined,
  productId: string,
  storage?: Storage,
): Record<string, number> {
  if (!channelId || !productId) return {};
  const usage = readKonfiProductUsageStorage(storage);
  const channelUsage = { ...(usage[channelId] ?? {}) };
  channelUsage[productId] = (channelUsage[productId] ?? 0) + 1;
  const pruned = pruneKonfiProductUsage(channelUsage);
  usage[channelId] = pruned;
  writeKonfiProductUsageStorage(usage, storage);
  return pruned;
}

export function clearKonfiProductUsageForChannel(
  channelId: string | null | undefined,
  storage?: Storage,
): void {
  if (!channelId) return;
  const usage = readKonfiProductUsageStorage(storage);
  if (!(channelId in usage)) return;
  delete usage[channelId];
  writeKonfiProductUsageStorage(usage, storage);
}

export function prioritizeMostOftenChosenOptions<T extends OptionWithGroup>(
  baseOptions: T[],
  usageByProductId: Record<string, number>,
  mostOftenChosenGroup: string,
): T[] {
  const mostOftenChosenOptions = baseOptions
    .filter((option) => (usageByProductId[option.value] ?? 0) > 0)
    .sort((a, b) => {
      const usageDiff =
        (usageByProductId[b.value] ?? 0) - (usageByProductId[a.value] ?? 0);
      if (usageDiff !== 0) return usageDiff;
      return a.label.localeCompare(b.label);
    })
    .map((option) => ({ ...option, group: mostOftenChosenGroup }));

  if (!mostOftenChosenOptions.length) return baseOptions;

  const usedIds = new Set(mostOftenChosenOptions.map((option) => option.value));
  const remainingOptions = baseOptions.filter((option) => !usedIds.has(option.value));

  return [...mostOftenChosenOptions, ...remainingOptions];
}