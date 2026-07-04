import type { Product } from "@konfi/types";
import {
  buildRangedDimensionSpec,
  type InferredExternalRangedDimensions,
} from "./ranged-dimensions";

export function buildImportedProductSpec(options: {
  defaultOrder: number;
  rangedDimensions?: InferredExternalRangedDimensions | null;
}): Product["spec"] {
  const { defaultOrder, rangedDimensions } = options;

  return {
    images: [],
    defaultOrder,
    minimumOrder: defaultOrder,
    maximumOrder: 10000,
    step: 1,
    ...(rangedDimensions ? buildRangedDimensionSpec(rangedDimensions) : {}),
  };
}
