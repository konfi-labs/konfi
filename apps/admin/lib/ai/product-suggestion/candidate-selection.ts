import type { FormattedOrderItem } from "@konfi/types";
import type { MultipleSizesDetectionResult } from "./types";

export interface ProductSuggestionCandidate {
  deliveryTime: number | null;
  item: FormattedOrderItem;
  requestedMultipleSizes?: MultipleSizesDetectionResult;
}

function getRequestedSizeCount(
  requestedMultipleSizes?: MultipleSizesDetectionResult,
): number {
  return requestedMultipleSizes?.hasMultipleSizes
    ? Math.max(2, requestedMultipleSizes.sizesCount)
    : 0;
}

function preservesRequestedSizes(
  candidate: ProductSuggestionCandidate,
  requestedMultipleSizes?: MultipleSizesDetectionResult,
): boolean {
  const requestedSizeCount = getRequestedSizeCount(requestedMultipleSizes);
  if (requestedSizeCount === 0) {
    return true;
  }

  return (candidate.item.customSizes?.length ?? 0) >= requestedSizeCount;
}

function hasKnownLongerDelivery(
  candidate: ProductSuggestionCandidate,
  reference: ProductSuggestionCandidate,
): boolean {
  return (
    candidate.deliveryTime !== null &&
    reference.deliveryTime !== null &&
    candidate.deliveryTime > reference.deliveryTime
  );
}

function pickCheapest(
  candidates: readonly ProductSuggestionCandidate[],
): ProductSuggestionCandidate {
  return candidates.reduce((selected, candidate) =>
    candidate.item.totalPrice < selected.item.totalPrice ? candidate : selected,
  );
}

export function selectBestProductSuggestionCandidate({
  candidates,
  primaryProductId,
  requestedMultipleSizes,
}: {
  candidates: readonly ProductSuggestionCandidate[];
  primaryProductId: string;
  requestedMultipleSizes?: MultipleSizesDetectionResult;
}): ProductSuggestionCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const completeCandidates = candidates.filter((candidate) =>
    preservesRequestedSizes(candidate, requestedMultipleSizes),
  );
  const eligibleCandidates =
    completeCandidates.length > 0 ? completeCandidates : candidates;

  const primaryCandidate = eligibleCandidates.find(
    (candidate) => candidate.item.product.id === primaryProductId,
  );

  if (primaryCandidate) {
    const notSlowerThanPrimary = eligibleCandidates.filter(
      (candidate) => !hasKnownLongerDelivery(candidate, primaryCandidate),
    );
    return pickCheapest(notSlowerThanPrimary);
  }

  return (
    eligibleCandidates
      .toSorted((left, right) => {
        const leftDelivery = left.deliveryTime ?? Number.POSITIVE_INFINITY;
        const rightDelivery = right.deliveryTime ?? Number.POSITIVE_INFINITY;
        const deliveryDiff = leftDelivery - rightDelivery;
        return deliveryDiff !== 0
          ? deliveryDiff
          : left.item.totalPrice - right.item.totalPrice;
      })
      .at(0) ?? null
  );
}
