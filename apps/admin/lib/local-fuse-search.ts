import Fuse, { type FuseOptionKey, type IFuseOptions } from "fuse.js/basic";

const DEFAULT_LOCAL_FUSE_THRESHOLD = 0.35;

export interface LocalFuseSearchResult<T> {
  item: T;
  refIndex: number;
  score: number;
}

export interface LocalFuseSearchOptions<T> {
  keys: readonly FuseOptionKey<T>[];
  limit?: number;
  threshold?: number;
  compareItems?: (left: T, right: T) => number;
  fuseOptions?: Omit<
    IFuseOptions<T>,
    | "ignoreDiacritics"
    | "ignoreLocation"
    | "includeScore"
    | "keys"
    | "shouldSort"
    | "threshold"
  >;
}

export function normalizeLocalSearchText(
  value: null | string | undefined,
): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getLocalSearchTokens(value: string): string[] {
  return normalizeLocalSearchText(value)
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

export function getLocalSearchInitials(value: string): string {
  return getLocalSearchTokens(value)
    .map((token) => token[0])
    .join("");
}

export function isLocalSearchSubsequence(
  needle: string,
  haystack: string,
): boolean {
  let needleIndex = 0;

  for (
    let index = 0;
    index < haystack.length && needleIndex < needle.length;
    index++
  ) {
    if (haystack[index] === needle[needleIndex]) {
      needleIndex++;
    }
  }

  return needleIndex === needle.length;
}

export function rankLocalFuseItems<T>(
  items: readonly T[] | null | undefined,
  query: null | string | undefined,
  options: LocalFuseSearchOptions<T>,
): LocalFuseSearchResult<T>[] {
  if (!items || items.length === 0) {
    return [];
  }

  const normalizedQuery = normalizeLocalSearchText(query);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;

  if (!normalizedQuery) {
    return items.slice(0, limit).map((item, refIndex) => ({
      item,
      refIndex,
      score: 0,
    }));
  }

  const fuse = new Fuse(items, {
    ...options.fuseOptions,
    ignoreDiacritics: true,
    ignoreLocation: true,
    includeScore: true,
    keys: Array.from(options.keys),
    shouldSort: false,
    threshold: options.threshold ?? DEFAULT_LOCAL_FUSE_THRESHOLD,
  });

  const results = fuse
    .search(normalizedQuery)
    .map((result) => ({
      item: result.item,
      refIndex: result.refIndex,
      score: result.score ?? Number.POSITIVE_INFINITY,
    }))
    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 targets do not expose Array.prototype.toSorted types.
    .sort((left, right) => {
      const scoreDiff = left.score - right.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const itemDiff = options.compareItems?.(left.item, right.item) ?? 0;
      if (itemDiff !== 0) {
        return itemDiff;
      }

      return left.refIndex - right.refIndex;
    });

  return results.slice(0, limit);
}

export function filterLocalFuseItems<T>(
  items: readonly T[] | null | undefined,
  query: null | string | undefined,
  options: LocalFuseSearchOptions<T>,
): T[] {
  return rankLocalFuseItems(items, query, options).map((result) => result.item);
}
