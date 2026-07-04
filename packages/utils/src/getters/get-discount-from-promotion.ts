import {
  ApplicationMethodAllocationEnum,
  ApplicationMethodTargetTypeEnum,
  ApplicationMethodTypeEnum,
  type CurrencyCode,
  CurrencyEnum,
  DiscountTypeEnum,
  type PromotionRuleContext,
} from "@konfi/types";
import { calcPrice, validatePromotionRules } from "../price";
import { Discount } from "@konfi/types";
import { OrderItem } from "@konfi/types";
import { Promotion } from "@konfi/types";
import { getSubtotalPrice } from "./get-subtotal-price";

export function getDiscountFromPromotion(
  promotion: Promotion | Omit<Promotion, "createdAt" | "updatedAt">,
  price?: number,
  items?: OrderItem[],
  existingDiscount?: Discount | null,
  userId?: string,
  orderSubtotal?: number,
  currency?: CurrencyCode,
  ruleContext?: PromotionRuleContext,
): {
  discount?: Discount;
  itemsWithDiscount?: OrderItem[];
  removedCodes?: string[];
} {
  try {
    if (!promotion.active) return {};
    const { applicationMethod } = promotion;
    if (!applicationMethod) {
      return {};
    }
    const {
      type,
      targetType,
      allocation,
      value: discountValue,
      currencyCode,
    } = applicationMethod;
    const promotionCurrency = currency ?? currencyCode ?? CurrencyEnum.PLN;
    if (!discountValue) return {};

    const currentOrderSubtotal =
      orderSubtotal ??
      (items && items.length > 0
        ? getSubtotalPrice(items)
        : targetType === ApplicationMethodTargetTypeEnum.ORDER
          ? price
          : undefined);

    if (
      promotion.minimumOrderValue &&
      promotion.minimumOrderValue > 0 &&
      (currentOrderSubtotal === undefined ||
        currentOrderSubtotal < promotion.minimumOrderValue)
    ) {
      return {};
    }

    let _removedCodes: string[] = [];
    if (!promotion.rules) throw new Error("The promotion's rules are missing.");
    // Apply promotion to SHIPPING_METHODS
    if (targetType === ApplicationMethodTargetTypeEnum.SHIPPING_METHODS) {
      if (!price) return {};
      if (price <= 0) return {};
      if (existingDiscount) {
        if (existingDiscount.code) _removedCodes.push(existingDiscount.code);
      }
      const isMatching = validatePromotionRules(
        promotion.rules,
        "",
        "",
        promotionCurrency,
        userId,
        ruleContext,
      );
      if (!isMatching) return {};
      if (type === ApplicationMethodTypeEnum.PERCENTAGE) {
        const discountedAmount = Math.max(
          0,
          Math.floor(price * (discountValue / 100)),
        );
        return {
          discount: new Discount(
            undefined,
            DiscountTypeEnum.PERCENTAGE,
            discountValue,
            discountedAmount,
            promotion.code,
          ),
        };
      } else if (type === ApplicationMethodTypeEnum.FIXED) {
        const discountedAmount = Math.max(0, Math.floor(discountValue));
        return {
          discount: new Discount(
            undefined,
            DiscountTypeEnum.FIXED,
            discountValue,
            discountedAmount,
            promotion.code,
          ),
        };
      }
    }
    // Apply promotion to ORDER
    if (targetType === ApplicationMethodTargetTypeEnum.ORDER) {
      if (!price) return {};
      if (price <= 0) return {};
      if (existingDiscount) {
        if (existingDiscount.code) _removedCodes.push(existingDiscount.code);
      }
      const isMatching = validatePromotionRules(
        promotion.rules,
        "",
        "",
        promotionCurrency,
        userId,
        ruleContext,
      );
      if (!isMatching) return {};
      if (type === ApplicationMethodTypeEnum.PERCENTAGE) {
        const discountedAmount = Math.max(
          0,
          Math.floor(price * (discountValue / 100)),
        );
        return {
          discount: new Discount(
            undefined,
            DiscountTypeEnum.PERCENTAGE,
            discountValue,
            discountedAmount,
            promotion.code,
          ),
          removedCodes: _removedCodes,
        };
      } else if (type === ApplicationMethodTypeEnum.FIXED) {
        const discountedAmount = Math.max(0, Math.floor(discountValue));
        return {
          discount: new Discount(
            undefined,
            DiscountTypeEnum.FIXED,
            discountValue,
            discountedAmount,
            promotion.code,
          ),
          removedCodes: _removedCodes,
        };
      }
    }
    // Apply promotion to ITEMS
    if (targetType === ApplicationMethodTargetTypeEnum.ITEMS) {
      // Admin can set a discount for a specific item
      if (price) {
        if (type === ApplicationMethodTypeEnum.PERCENTAGE) {
          const discountedAmount = Math.max(
            0,
            Math.floor(price * (discountValue / 100)),
          );
          return {
            discount: new Discount(
              undefined,
              DiscountTypeEnum.PERCENTAGE,
              discountValue,
              discountedAmount,
              promotion.code,
            ),
            removedCodes: _removedCodes,
          };
        } else if (type === ApplicationMethodTypeEnum.FIXED) {
          const discountedAmount = Math.max(0, Math.floor(discountValue));
          return {
            discount: new Discount(
              undefined,
              DiscountTypeEnum.FIXED,
              discountValue,
              discountedAmount,
              promotion.code,
            ),
            removedCodes: _removedCodes,
          };
        }
      }
      if (!items) return {};
      let itemsWithDiscount: OrderItem[] = [];
      if (allocation === ApplicationMethodAllocationEnum.ACROSS) {
        const discountedValuePerItem = Math.max(
          0,
          Math.floor(discountValue / items.length),
        );
        items.forEach((item) => {
          let _item = item;
          if (!_item.product?.id)
            throw new Error("The item's product ID is missing.");
          if (!promotion.rules)
            throw new Error("The promotion's rules are missing.");

          const isMatching = validatePromotionRules(
            promotion.rules,
            _item.product.id,
            _item.product.category.id,
            promotionCurrency,
            userId,
            getItemPromotionRuleContext(_item, ruleContext),
          );
          if (isMatching) {
            const _itemTotalPrice = calcPrice(
              _item.quantity,
              _item.product.prices,
              _item.product.priceType,
              0,
              _item.calculatedCombination ?? undefined,
              _item.volume,
              _item.customFormat,
              _item.width,
              _item.height,
              _item.product.spec.minimumOrder,
              null,
              _item.product.designSpec?.includeBleed
                ? _item.product.designSpec.bleed
                : undefined,
              0,
              _item.customSizes,
              undefined,
              _item.expressPercent,
            ).result;
            if (!_itemTotalPrice)
              throw new Error("The item's total price is missing.");
            if (_item.discount) {
              if (_item.discount.code) _removedCodes.push(_item.discount.code);
            }
            if (type === ApplicationMethodTypeEnum.FIXED) {
              const discountedAmount = Math.max(
                0,
                Math.floor(discountedValuePerItem),
              );
              _item = {
                ..._item,
                totalPrice: Math.floor(_itemTotalPrice - discountedAmount),
                discount: new Discount(
                  undefined,
                  DiscountTypeEnum.FIXED,
                  discountedValuePerItem,
                  discountedAmount,
                  promotion.code,
                ),
              };
            } else if (type === ApplicationMethodTypeEnum.PERCENTAGE) {
              const discountedAmount = Math.max(
                Math.floor(_itemTotalPrice * (discountedValuePerItem / 100)),
              );
              _item = {
                ..._item,
                totalPrice: Math.floor(_itemTotalPrice - discountedAmount),
                discount: new Discount(
                  undefined,
                  DiscountTypeEnum.PERCENTAGE,
                  discountedValuePerItem,
                  discountedAmount,
                  promotion.code,
                ),
              };
            }
          }
          itemsWithDiscount.push(_item);
        });
        return { itemsWithDiscount, removedCodes: _removedCodes };
      } else if (allocation === ApplicationMethodAllocationEnum.EACH) {
        items.forEach((item) => {
          let _item = item;
          if (!promotion.rules)
            throw new Error("The promotion's rules are missing.");
          if (!_item.product?.id)
            throw new Error("The item's product ID is missing.");
          const isMatching = validatePromotionRules(
            promotion.rules,
            _item.product.id,
            _item.product.category.id,
            promotionCurrency,
            userId,
            getItemPromotionRuleContext(_item, ruleContext),
          );
          if (isMatching) {
            const _itemTotalPrice = calcPrice(
              _item.quantity,
              _item.product.prices,
              _item.product.priceType,
              0,
              _item.calculatedCombination ?? undefined,
              _item.volume,
              _item.customFormat,
              _item.width,
              _item.height,
              _item.product.spec.minimumOrder,
              null,
              _item.product.designSpec?.includeBleed
                ? _item.product.designSpec.bleed
                : undefined,
              0,
              _item.customSizes,
              undefined,
              _item.expressPercent,
            ).result;
            if (!_itemTotalPrice)
              throw new Error("The item's total price is missing.");
            if (_item.discount) {
              if (_item.discount.code) _removedCodes.push(_item.discount.code);
            }
            if (type === ApplicationMethodTypeEnum.FIXED) {
              const discountedAmount = Math.max(0, Math.floor(discountValue));
              _item = {
                ..._item,
                totalPrice: Math.floor(_itemTotalPrice - discountedAmount),
                discount: new Discount(
                  undefined,
                  DiscountTypeEnum.FIXED,
                  discountValue,
                  discountedAmount,
                  promotion.code,
                ),
              };
            } else if (type === ApplicationMethodTypeEnum.PERCENTAGE) {
              const discountedAmount = Math.max(
                Math.floor(_itemTotalPrice * (discountValue / 100)),
              );
              _item = {
                ..._item,
                totalPrice: Math.floor(_itemTotalPrice - discountedAmount),
                discount: new Discount(
                  undefined,
                  DiscountTypeEnum.PERCENTAGE,
                  discountValue,
                  discountedAmount,
                  promotion.code,
                ),
              };
            }
          }
          itemsWithDiscount.push(_item);
        });
        return { itemsWithDiscount, removedCodes: _removedCodes };
      }
    }
    return {};
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error(error);
    return {};
  }
}

function getItemPromotionRuleContext(
  item: OrderItem,
  ruleContext?: PromotionRuleContext,
): PromotionRuleContext | undefined {
  const channelId = ruleContext?.channelId ?? item.product?.channelId;
  const productTypeId =
    item.product?.productType?.id ?? ruleContext?.productTypeId;

  if (!ruleContext && !channelId && !productTypeId) {
    return undefined;
  }

  return {
    ...ruleContext,
    channelId,
    productTypeId,
  };
}
