import { PriceTypeEnum } from "@konfi/types";

export function isMatrixLikePriceType(priceType?: PriceTypeEnum | null): boolean {
  return (
    priceType === PriceTypeEnum.MATRIX || priceType === PriceTypeEnum.DYNAMIC
  );
}
