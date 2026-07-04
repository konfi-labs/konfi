import type { Customer } from "@konfi/types";

const FUZZY_SEARCH_MIN_LENGTH = 3;

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim();
}

function tokenizeSearchValue(value: string): string[] {
  return normalizeSearchValue(value)
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function isSubsequence(needle: string, haystack: string): boolean {
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

function editDistanceWithin(
  left: string,
  right: string,
  maxDistance: number,
): number | null {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return null;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    let rowMinimum = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const nextDistance = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );

      current[rightIndex] = nextDistance;
      rowMinimum = Math.min(rowMinimum, nextDistance);
    }

    if (rowMinimum > maxDistance) {
      return null;
    }

    previous = current;
  }

  const distance = previous[right.length];
  return distance <= maxDistance ? distance : null;
}

function getCustomerSearchValues(customer: Customer): string[] {
  return [
    customer.name,
    customer.personName,
    customer.email,
    customer.nip,
    ...(customer.keywords ?? []),
    ...(customer.contacts ?? []).flatMap((contact) => [
      contact.name,
      contact.email,
      contact.phone,
    ]),
    ...(customer.addresses ?? []).flatMap((address) => [
      address.name,
      address.companyName,
      address.nip,
      address.jstRecipientName,
      address.jstRecipientNip,
      address.city,
      address.street,
    ]),
  ].filter((value): value is string => typeof value === "string");
}

function getValueFuzzyScore(query: string, value: string): number | null {
  const normalizedValue = normalizeSearchValue(value);

  if (!normalizedValue) {
    return null;
  }

  const tokens = tokenizeSearchValue(normalizedValue);

  if (normalizedValue === query || tokens.some((token) => token === query)) {
    return 0;
  }

  if (tokens.some((token) => token.startsWith(query))) {
    return 1;
  }

  if (normalizedValue.includes(query)) {
    return 2;
  }

  const maxDistance = query.length <= 4 ? 1 : 2;
  const editDistanceScores = tokens.flatMap((token) => {
    const distance = editDistanceWithin(query, token, maxDistance);
    return distance === null ? [] : [10 + distance];
  });

  if (editDistanceScores.length > 0) {
    return Math.min(...editDistanceScores);
  }

  const subsequenceScores = tokens.flatMap((token) => {
    if (token[0] !== query[0] || !isSubsequence(query, token)) {
      return [];
    }

    return [20 + token.length - query.length];
  });

  return subsequenceScores.length > 0 ? Math.min(...subsequenceScores) : null;
}

function getCustomerFuzzyScore(
  customer: Customer,
  query: string,
): number | null {
  const scores = getCustomerSearchValues(customer).flatMap((value) => {
    const score = getValueFuzzyScore(query, value);
    return score === null ? [] : [score];
  });

  return scores.length > 0 ? Math.min(...scores) : null;
}

export function getFuzzyCustomerSearchSeed(
  searchKey: string,
): string | undefined {
  const query = normalizeSearchValue(searchKey);

  if (query.length < FUZZY_SEARCH_MIN_LENGTH) {
    return undefined;
  }

  return query[0];
}

export function rankCustomersByFuzzySearch(
  customers: readonly Customer[],
  searchKey: string,
  limit = 99,
): Customer[] {
  const query = normalizeSearchValue(searchKey);

  if (query.length < FUZZY_SEARCH_MIN_LENGTH) {
    return [];
  }

  return customers
    .map((customer, index) => ({
      customer,
      index,
      score:
        customer.active === false
          ? null
          : getCustomerFuzzyScore(customer, query),
    }))
    .filter(
      (item): item is { customer: Customer; index: number; score: number } =>
        item.score !== null,
    )
    .toSorted(
      (left, right) =>
        left.score - right.score ||
        left.customer.name.localeCompare(right.customer.name) ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map((item) => item.customer);
}
