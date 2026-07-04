import { Configuration, NestedProduct, Product } from "@konfi/types";
import { isUndefined } from "es-toolkit";

export function isValidSize(
  width: number,
  height: number,
  product: Product | NestedProduct,
  configuration: Configuration,
): boolean {
  const { customFormat } = configuration;

  if (customFormat) {
    return (
      isValidHeight(height, product, configuration) &&
      isValidWidth(width, product, configuration)
    );
  }

  return true;
}

export function isValidWidth(
  width: number,
  product: Product | NestedProduct,
  configuration: Configuration,
): boolean {
  const { spec } = product;
  const { customFormat } = configuration;
  const { minimumWidth, maximumWidth, widthStep } = spec;

  if (isUndefined(widthStep)) {
    console.error("widthStep is not defined");
    return false;
  }

  if (isUndefined(minimumWidth) || isUndefined(maximumWidth)) {
    console.error("minimumWidth or maximumWidth is not defined");
    return false;
  }

  if (customFormat) {
    const remainder = Math.abs((width - minimumWidth) % widthStep);
    const isValidStep =
      remainder < 0.0001 || Math.abs(remainder - widthStep) < 0.0001;

    return width >= minimumWidth && width <= maximumWidth && isValidStep;
  }

  return true;
}

export function isValidHeight(
  height: number,
  product: Product | NestedProduct,
  configuration: Configuration,
): boolean {
  const { spec } = product;
  const { customFormat } = configuration;
  const { minimumHeight, maximumHeight, heightStep } = spec;

  if (isUndefined(heightStep)) {
    console.error("widthStep is not defined");
    return false;
  }

  if (isUndefined(minimumHeight) || isUndefined(maximumHeight)) {
    console.error("minimumHeight or maximumHeight is not defined");
    return false;
  }

  if (customFormat) {
    const remainder = Math.abs((height - minimumHeight) % heightStep);
    const isValidStep =
      remainder < 0.0001 || Math.abs(remainder - heightStep) < 0.0001;

    return height >= minimumHeight && height <= maximumHeight && isValidStep;
  }

  return true;
}
