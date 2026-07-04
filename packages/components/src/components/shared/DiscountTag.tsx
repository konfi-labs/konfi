import {
  type CurrencyCode,
  CurrencyEnum,
  DiscountTypeEnum,
} from "@konfi/types";
import { formatPrice } from "@konfi/utils";
import { Tag } from "../ui/tag";

export const DiscountTag = ({
  discountValue,
  type,
  code,
  currency = CurrencyEnum.PLN,
  minorUnitDigits,
  label,
  locale,
  top,
  right,
  left,
  bottom,
  minified,
}: {
  discountValue: number;
  type: keyof typeof DiscountTypeEnum;
  code: string | null;
  currency?: CurrencyCode;
  minorUnitDigits?: number;
  label?: string;
  locale?: string;
  top?: number;
  right?: number;
  left?: number;
  bottom?: number;
  minified?: boolean;
}) => {
  return (
    <Tag
      position={"absolute"}
      top={top}
      right={right}
      left={left}
      bottom={bottom}
      borderRadius={"full"}
      px={2}
      py={0}
      minW={"fit-content"}
      fontWeight={600}
      fontSize={"sm"}
      border={"1px solid transparent"}
      borderColor={{ base: "blackAlpha.100", _dark: "whiteAlpha.100" }}
      bgColor={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
      backdropFilter={"saturate(125%) blur(10px)"}
    >
      {!minified && code && label ? `${label} ` : null}-
      {type === DiscountTypeEnum.PERCENTAGE
        ? discountValue
        : formatPrice(discountValue, currency, undefined, undefined, locale, {
            minorUnitDigits,
          })}
      {type === DiscountTypeEnum.PERCENTAGE ? "%" : null}
    </Tag>
  );
};
