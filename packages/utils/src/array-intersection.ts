export function arrayIntersection<T>(
  ...arrays: readonly (readonly T[] | null | undefined)[]
): T[] {
  if (arrays.length === 0) return [];

  const [firstArray, ...remainingArrays] = arrays;
  if (!Array.isArray(firstArray)) return [];

  let allowed = new Set<T>(firstArray);

  for (const array of remainingArrays) {
    if (!Array.isArray(array)) return [];

    allowed = allowed.intersection(new Set(array));
  }

  return firstArray.filter((value) => allowed.has(value));
}
