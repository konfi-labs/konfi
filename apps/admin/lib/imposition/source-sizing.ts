import { bleedType, sourceSizing } from "@konfi/types";

type BleedTypeValue = keyof typeof bleedType | null | undefined;
type SourceSizingValue = keyof typeof sourceSizing | null | undefined;

export function supportsManualSourceSizing(currentBleedType: BleedTypeValue) {
  return (
    currentBleedType === bleedType.NO_BLEED ||
    currentBleedType === bleedType.BLEED_INCLUDED
  );
}

export function resolveImpositionSourceSizing(params: {
  bleedType: BleedTypeValue;
  sourceSizing: SourceSizingValue;
}): keyof typeof sourceSizing {
  if (!supportsManualSourceSizing(params.bleedType)) {
    return sourceSizing.FIT_OUTPUT_BOX;
  }

  return params.sourceSizing ?? sourceSizing.PRESERVE_ORIGINAL_SIZE;
}
