import { DiscountTypeEnum } from "./enums";

interface IDiscount {
  type: keyof typeof DiscountTypeEnum;
  discountValue: number;
  discountedAmount: number;
  code: string | null;
}

class Discount implements IDiscount {
  readonly type: keyof typeof DiscountTypeEnum;
  readonly discountValue: number;
  readonly discountedAmount: number;
  readonly code: string | null;

  constructor();
  constructor(discount: IDiscount);
  constructor(
    discount?: IDiscount,
    type?: keyof typeof DiscountTypeEnum,
    discountValue?: number,
    discountedAmount?: number,
    code?: string | null,
  );
  constructor(
    discount?: IDiscount,
    type?: keyof typeof DiscountTypeEnum,
    discountValue?: number,
    discountedAmount?: number,
    code?: string | null,
  ) {
    this.type = discount?.type ?? type ?? DiscountTypeEnum.PERCENTAGE;
    this.discountValue = discount?.discountValue ?? discountValue ?? 0;
    this.discountedAmount = discount?.discountedAmount ?? discountedAmount ?? 0;
    this.code = discount?.code ?? code ?? "";
  }

  get object(): IDiscount {
    return {
      type: this.type,
      discountValue: this.discountValue,
      discountedAmount: this.discountedAmount,
      code: this.code,
    };
  }
}

export { Discount };
export type { IDiscount };
