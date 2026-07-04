export function normalizeToLargest(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }
  const maxValue = Math.max(...values);

  if (maxValue === 0) {
    // Handle the case where all values are zero to avoid division by zero.
    // You can return an array of zeros or handle it differently based on your needs.
    return values.map(() => 0);
  }

  return values.map((value) => value / maxValue);
}
