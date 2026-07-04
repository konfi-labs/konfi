import {
  getLocalSearchInitials,
  getLocalSearchTokens,
  isLocalSearchSubsequence,
  normalizeLocalSearchText,
  rankLocalFuseItems,
} from "@/lib/local-fuse-search";

export interface ProductGroupedLocalSearchOption {
  attributeText?: string;
  channelId?: string;
  channelName?: string;
  group: string;
  label: string;
  value: string;
}

interface ProductGroupedSearchEntry<
  TOption extends ProductGroupedLocalSearchOption,
> {
  fuseScore: number;
  index: number;
  option: TOption;
  rank: number;
}

const PRODUCT_GROUPED_FUZZY_RANK = 10;

const productGroupedFuseKeys = [
  { name: "label", weight: 0.62 },
  { name: "channelName", weight: 0.18 },
  { name: "attributeText", weight: 0.2 },
] as const;

export function getProductGroupedSearchOptionKey(
  option: Pick<ProductGroupedLocalSearchOption, "channelId" | "value">,
): string {
  return `${option.channelId ?? ""}::${option.value}`;
}

function productOptionSearchText(
  option: ProductGroupedLocalSearchOption,
): string {
  return [option.label, option.channelName, option.attributeText]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function getExplicitProductSearchRank(
  option: ProductGroupedLocalSearchOption,
  query: string,
): number | null {
  if (!query) {
    return 0;
  }

  const target = normalizeLocalSearchText(productOptionSearchText(option));
  const words = getLocalSearchTokens(target);

  if (!target || words.length === 0) {
    return null;
  }

  if (target === query || words.some((word) => word === query)) {
    return 0;
  }

  if (words.some((word) => word.startsWith(query))) {
    return 1;
  }

  if (target.includes(query)) {
    return 2;
  }

  const queryTokens = getLocalSearchTokens(query);
  if (
    queryTokens.length > 1 &&
    queryTokens.every((token) => words.some((word) => word.includes(token)))
  ) {
    return 3;
  }

  const initials = getLocalSearchInitials(target);
  if (
    query.length <= initials.length &&
    isLocalSearchSubsequence(query, initials)
  ) {
    return 4;
  }

  return null;
}

export function rankProductGroupedLocalSearchOptions<
  TOption extends ProductGroupedLocalSearchOption,
>(
  options: readonly TOption[],
  search: string,
  usageByProductId: Readonly<Record<string, number>> = {},
): TOption[] {
  const query = normalizeLocalSearchText(search);

  if (!query) {
    return Array.from(options);
  }

  const fuseMatches = rankLocalFuseItems(options, query, {
    keys: productGroupedFuseKeys,
    fuseOptions: {
      fieldNormWeight: 0.7,
      minMatchCharLength: 2,
    },
    threshold: 0.38,
  });
  const fuseScoreByIndex = new Map(
    fuseMatches.map((match) => [match.refIndex, match.score]),
  );

  const entries = options
    .flatMap((option, index): ProductGroupedSearchEntry<TOption>[] => {
      const explicitRank = getExplicitProductSearchRank(option, query);
      const fuseScore = fuseScoreByIndex.get(index);

      if (explicitRank === null && typeof fuseScore !== "number") {
        return [];
      }

      return [
        {
          fuseScore: fuseScore ?? Number.POSITIVE_INFINITY,
          index,
          option,
          rank: explicitRank ?? PRODUCT_GROUPED_FUZZY_RANK,
        },
      ];
    })
    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 targets do not expose Array.prototype.toSorted types.
    .sort((left, right) => {
      const rankDiff = left.rank - right.rank;
      if (rankDiff !== 0) {
        return rankDiff;
      }

      if (
        left.rank === PRODUCT_GROUPED_FUZZY_RANK &&
        left.fuseScore !== right.fuseScore
      ) {
        return left.fuseScore - right.fuseScore;
      }

      const usageDiff =
        (usageByProductId[right.option.value] ?? 0) -
        (usageByProductId[left.option.value] ?? 0);
      if (usageDiff !== 0) {
        return usageDiff;
      }

      const labelDiff = left.option.label.localeCompare(right.option.label);
      if (labelDiff !== 0) {
        return labelDiff;
      }

      return left.index - right.index;
    });

  return entries.map((entry) => entry.option);
}

export function getSemanticSupplementalProductOptions<
  TOption extends ProductGroupedLocalSearchOption,
>({
  localOptions,
  semanticGroup,
  semanticOptions,
}: {
  localOptions: readonly TOption[];
  semanticGroup: string;
  semanticOptions: readonly TOption[];
}): TOption[] {
  if (semanticOptions.length === 0) {
    return [];
  }

  const localKeys = new Set(
    localOptions.map((option) => getProductGroupedSearchOptionKey(option)),
  );

  return semanticOptions
    .filter(
      (option) => !localKeys.has(getProductGroupedSearchOptionKey(option)),
    )
    .map((option) => ({ ...option, group: semanticGroup }) as TOption);
}
