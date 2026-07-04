export interface SuggestedCustomSize {
  width: number;
  height: number;
  quantity: number;
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function getArea(size: Pick<SuggestedCustomSize, "width" | "height">): number {
  return size.width * size.height;
}

export function normalizeSuggestedCustomSizes(
  sizes: SuggestedCustomSize[],
): SuggestedCustomSize[] {
  const normalized: SuggestedCustomSize[] = [];

  for (const size of sizes) {
    if (
      !isPositiveFiniteNumber(size.width) ||
      !isPositiveFiniteNumber(size.height) ||
      !isPositiveFiniteNumber(size.quantity)
    ) {
      continue;
    }

    const existing = normalized.find(
      (candidate) =>
        candidate.width === size.width && candidate.height === size.height,
    );

    if (existing) {
      existing.quantity += size.quantity;
      continue;
    }

    normalized.push({
      width: size.width,
      height: size.height,
      quantity: size.quantity,
    });
  }

  return normalized;
}

export function getPrimaryCustomSize(
  sizes: SuggestedCustomSize[],
): SuggestedCustomSize | undefined {
  return sizes.reduce<SuggestedCustomSize | undefined>((smallest, size) => {
    if (!smallest) {
      return size;
    }

    return getArea(size) < getArea(smallest) ? size : smallest;
  }, undefined);
}
