import {
  Discount,
  NestedProduct,
  OrderItem,
  PriceTypeEnum,
} from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { getRandomId } from "../getters/get-random-id";
import { isMatrixLikePriceType } from "../price-types";

export function formatOrderItems(orderItems: OrderItem[]) {
  let formattedOrderItems: OrderItem[] = [];
  for (let i = 0; i < orderItems.length; i++) {
    const orderItem: OrderItem = orderItems[i];
    formattedOrderItems.push(formatOrderItem(orderItem));
  }
  return formattedOrderItems as OrderItem[];
}

export function formatOrderItem(orderItem: OrderItem) {
  let formattedOrderItem: OrderItem;
  const product = orderItem.product as NestedProduct;
  const isMatrixLikeProduct = isMatrixLikePriceType(product.priceType);
  const formattedProduct: NestedProduct = {
    id: product.id,
    name: product.name,
    prices:
      product.priceType === PriceTypeEnum.SINGLE ||
        product.priceType === PriceTypeEnum.THRESHOLD
        ? product.prices
        : product.prices.filter(
          (price) =>
            price.combination?.id ===
            (isMatrixLikeProduct ? orderItem.calculatedCombination : null),
        ),
    defaultPrice: product.defaultPrice,
    lowPrice: product.lowPrice,
    highPrice: product.highPrice,
    customSize: product.customSize,
    description: isMatrixLikeProduct ? product.description : "",
    volumes: product.volumes,
    attributes: product.attributes,
    attributeOptions: product.attributeOptions,
    attributeDependencies: product.attributeDependencies,
    difficulty: !isUndefined(product.difficulty) ? product.difficulty : 5,
    spec: product.spec,
    productType: product.productType,
    category: product.category,
    priceType: product.priceType,
    allowCustomPrice: !isUndefined(product.allowCustomPrice)
      ? product.allowCustomPrice
      : false,
    recommended: !isUndefined(product.recommended)
      ? product.recommended
      : false,
    shipping: !isUndefined(product.shipping)
      ? product.shipping
      : {
        types: [],
      },
    prefferedUnit: product.prefferedUnit,
    threeDModel: product.threeDModel ?? null,
    designSpec: product.designSpec,
    pageCount: product.pageCount
      ? {
        ...product.pageCount,
        pricing:
          product.pageCount.pricing?.stepPrices &&
            product.pageCount.pricing.stepPrices.length > 0
            ? {
              ...product.pageCount.pricing,
              stepPrices: isMatrixLikeProduct
                ? product.pageCount.pricing.stepPrices.filter(
                  (price) =>
                    price.combination?.id ===
                    orderItem.calculatedCombination,
                )
                : product.pageCount.pricing.stepPrices,
            }
            : product.pageCount.pricing,
      }
      : undefined,
    channelId: product.channelId ?? "",
  };
  if (isUndefined(formattedProduct.attributeDependencies)) {
    delete formattedProduct.attributeDependencies;
  }
  formattedOrderItem = {
    id: orderItem.id || getRandomId(),
    name: !isUndefined(orderItem.name) ? orderItem.name : "",
    product: formattedProduct,
    combination: isMatrixLikeProduct ? orderItem.combination : null,
    calculatedCombination: isMatrixLikeProduct
      ? orderItem.calculatedCombination
      : null,
    description: orderItem.description,
    volume: isMatrixLikeProduct ? orderItem.volume : 0,
    customFormat: orderItem.customFormat,
    customPrice: !isUndefined(orderItem.customPrice)
      ? orderItem.customPrice
      : 0,
    totalPrice: Math.floor(orderItem.totalPrice),
    width: orderItem.width,
    height: orderItem.height,
    quantity: isMatrixLikeProduct ? 1 : orderItem.quantity,
    pageCount: orderItem.pageCount,
    customSizes: orderItem.customSizes,
    discount:
      (new Discount(orderItem.discount).object as Discount) ??
      orderItem.discount,
    unit: orderItem.unit,
    expressPercent: orderItem.expressPercent,
    advancedAttributeSelections: orderItem.advancedAttributeSelections,
  };
  return formattedOrderItem;
}

export function formatOrderItemAsAnalyticsItem(
  orderItem: OrderItem,
  index?: number,
) {
  if (index) {
    return {
      id: orderItem.product?.id ?? "",
      name: orderItem.product?.name ?? "",
      index,
      item_category: orderItem.product?.category?.name ?? "",
      item_variant: orderItem.description,
      price: (orderItem.totalPrice / 100).toFixed(2),
      quantity: orderItem.quantity,
    };
  } else {
    return {
      id: orderItem.product?.id ?? "",
      name: orderItem.product?.name ?? "",
      item_category: orderItem.product?.category?.name ?? "",
      item_variant: orderItem.description,
      price: (orderItem.totalPrice / 100).toFixed(2),
      quantity: orderItem.quantity,
    };
  }
}
