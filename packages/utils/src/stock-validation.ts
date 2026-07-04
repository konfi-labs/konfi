import {
  Product,
  NestedProduct,
  Configuration,
  Attribute,
  PriceTypeEnum,
  StockWithAvailable,
  AttributeStockWithAvailable,
} from "@konfi/types";
import { Firestore } from "firebase/firestore";

// Import functions that will need to be injected
export interface StockFunctions {
  getStock: (
    firestore: Firestore,
    channelId: string,
    warehouseId: string,
    productId: string,
  ) => Promise<StockWithAvailable | null>;
  getMultipleAttributeStock: (
    firestore: Firestore,
    channelId: string,
    warehouseId: string,
    attributeCombinations: { attributeId: string; optionValue: string }[],
  ) => Promise<{ [key: string]: AttributeStockWithAvailable | null }>;
}

export interface StockValidationResult {
  available: boolean;
  availableQuantity: number;
  reason?: string;
  details?: {
    productStock?: StockWithAvailable;
    attributeStock?: { [key: string]: AttributeStockWithAvailable | null };
    requiredAttributes?: { attributeId: string; optionValue: string }[];
  };
}

/**
 * Check stock availability for a product configuration
 * Handles both product-based stock (SINGLE/THRESHOLD) and attribute-based stock (MATRIX)
 */
export async function checkStockAvailability(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  product: Product | NestedProduct,
  configuration: Configuration,
  attributes: Attribute[],
  requestedQuantity: number,
  stockFunctions: StockFunctions,
  utilityFunctions: {
    getStockTrackedAttributes: (
      product: Product | NestedProduct,
      configuration: Configuration,
      attributes: Attribute[],
    ) => { attributeId: string; optionValue: string }[];
    hasStockTrackedAttributes: (
      product: Product | NestedProduct,
      attributes: Attribute[],
    ) => boolean;
  },
): Promise<StockValidationResult> {
  try {
    // For MATRIX products with stock-tracked attributes
    if (
      product.priceType === PriceTypeEnum.MATRIX &&
      utilityFunctions.hasStockTrackedAttributes(product, attributes)
    ) {
      return await checkAttributeStockAvailability(
        firestore,
        channelId,
        warehouseId,
        product,
        configuration,
        attributes,
        requestedQuantity,
        stockFunctions,
        utilityFunctions,
      );
    }

    // For SINGLE/THRESHOLD products or MATRIX products without stock-tracked attributes
    return await checkProductStockAvailability(
      firestore,
      channelId,
      warehouseId,
      product.id,
      requestedQuantity,
      stockFunctions,
    );
  } catch (error) {
    return {
      available: false,
      availableQuantity: 0,
      reason: `Stock validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Check product-based stock availability
 */
async function checkProductStockAvailability(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
  requestedQuantity: number,
  stockFunctions: StockFunctions,
): Promise<StockValidationResult> {
  const productStock = await stockFunctions.getStock(
    firestore,
    channelId,
    warehouseId,
    productId,
  );

  if (!productStock) {
    return {
      available: false,
      availableQuantity: 0,
      reason: "No stock record found for product",
      details: { productStock: undefined },
    };
  }

  const isAvailable = productStock.available >= requestedQuantity;

  return {
    available: isAvailable,
    availableQuantity: productStock.available,
    reason: isAvailable ? undefined : "Insufficient product stock",
    details: { productStock },
  };
}

/**
 * Check attribute-based stock availability for MATRIX products
 */
async function checkAttributeStockAvailability(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  product: Product | NestedProduct,
  configuration: Configuration,
  attributes: Attribute[],
  requestedQuantity: number,
  stockFunctions: StockFunctions,
  utilityFunctions: {
    getStockTrackedAttributes: (
      product: Product | NestedProduct,
      configuration: Configuration,
      attributes: Attribute[],
    ) => { attributeId: string; optionValue: string }[];
  },
): Promise<StockValidationResult> {
  const requiredAttributes = utilityFunctions.getStockTrackedAttributes(
    product,
    configuration,
    attributes,
  );

  if (requiredAttributes.length === 0) {
    return {
      available: false,
      availableQuantity: 0,
      reason: "No stock-tracked attributes found for configuration",
      details: { requiredAttributes },
    };
  }

  const attributeStock = await stockFunctions.getMultipleAttributeStock(
    firestore,
    channelId,
    warehouseId,
    requiredAttributes,
  );

  // Find the minimum available stock across all required attributes
  let minAvailableStock = Infinity;
  let limitingAttribute: string | null = null;
  const missingAttributes: string[] = [];

  for (const attr of requiredAttributes) {
    const stockKey = `${attr.attributeId}_${attr.optionValue}`;
    const stock = attributeStock[stockKey];

    if (!stock) {
      missingAttributes.push(stockKey);
      minAvailableStock = 0;
    } else if (stock.available < minAvailableStock) {
      minAvailableStock = stock.available;
      limitingAttribute = stockKey;
    }
  }

  if (missingAttributes.length > 0) {
    return {
      available: false,
      availableQuantity: 0,
      reason: `Missing stock records for attributes: ${missingAttributes.join(", ")}`,
      details: {
        attributeStock,
        requiredAttributes,
      },
    };
  }

  const isAvailable = minAvailableStock >= requestedQuantity;

  return {
    available: isAvailable,
    availableQuantity: Math.max(0, minAvailableStock),
    reason: isAvailable
      ? undefined
      : `Insufficient stock for attribute: ${limitingAttribute}`,
    details: {
      attributeStock,
      requiredAttributes,
    },
  };
}

/**
 * Simple stock availability check (backward compatibility)
 */
export async function checkSimpleStockAvailability(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
  requestedQuantity: number,
  stockFunctions: StockFunctions,
): Promise<{ available: boolean; availableQuantity: number }> {
  const result = await checkProductStockAvailability(
    firestore,
    channelId,
    warehouseId,
    productId,
    requestedQuantity,
    stockFunctions,
  );

  return {
    available: result.available,
    availableQuantity: result.availableQuantity,
  };
}
