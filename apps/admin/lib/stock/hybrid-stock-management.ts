import "server-only";

import {
  Attribute,
  AttributeStockOperation,
  OrderItem,
  PriceTypeEnum,
  Product,
  StockOperation,
} from "@konfi/types";
import {
  calculateSheetsNeededForOrder,
  getStockTrackedAttributes,
  hasStockTrackedAttributes,
} from "@konfi/utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  deductAttributeStock,
  deductStock,
  getAttributes,
  getProduct,
  releaseAttributeStock,
  releaseStock,
  assertAttributeStockReservationAvailable,
  assertStockReservationAvailable,
  reserveAttributeStock,
  reserveStock,
} from "./stock-management-admin";

const logger = console;

type OrderStockOperation = StockOperation & {
  itemId?: string;
  orderId?: string;
};

type OrderAttributeStockOperation = AttributeStockOperation & {
  itemId?: string;
  orderId?: string;
};

type OrderItemWithProduct = OrderItem & {
  product: NonNullable<OrderItem["product"]>;
};

type ReservationOperations = {
  attributeOperations: OrderAttributeStockOperation[];
  productOperations: OrderStockOperation[];
};

type ProductFetchResult =
  | {
      error: unknown;
      productId: string;
      status: "rejected";
    }
  | {
      product: Product | null;
      productId: string;
      status: "fulfilled";
    };

async function fetchProductsForStockProcessing(
  channelId: string,
  productIds: readonly string[],
): Promise<Map<string, Product>> {
  const db = getAdminDb();
  const sortedProductIds = [...productIds].sort();
  const productFetchResults: ProductFetchResult[] = await Promise.all(
    sortedProductIds.map(async (productId): Promise<ProductFetchResult> => {
      try {
        return {
          product: await getProduct(db, channelId, productId),
          productId,
          status: "fulfilled",
        };
      } catch (error) {
        return {
          error,
          productId,
          status: "rejected",
        };
      }
    }),
  );
  const products = new Map<string, Product>();

  for (const result of productFetchResults) {
    if (result.status === "rejected") {
      logger.error(
        `Failed to fetch product ${result.productId}:`,
        result.error,
      );
      throw new Error(`Product ${result.productId} not found`, {
        cause: result.error,
      });
    }

    if (result.product) {
      products.set(result.productId, result.product);
    }
  }

  return products;
}

function getProductForStockProcessing(params: {
  item: OrderItemWithProduct;
  operation: "deduction" | "release" | "reservation";
  orderId?: string;
  products: Map<string, Product>;
}): Product {
  const product = params.products.get(params.item.product.id);

  if (product) {
    return product;
  }

  logger.warn(
    `Product ${params.item.product.id} not found during stock ${params.operation}; using order item snapshot`,
    {
      itemId: params.item.id,
      orderId: params.orderId,
      productId: params.item.product.id,
    },
  );

  return params.item.product as Product;
}

/**
 * Calculate the quantity needed for attribute stock based on sheet calculations
 */
function calculateAttributeStockQuantity(
  item: OrderItem,
  attribute: Attribute,
  attributes: Attribute[],
  selectedOptions: { [key: string]: string | number } | null,
): number {
  // If attribute doesn't use sheet-based calculation, return item quantity
  if (!attribute.calculateStockFromSheet?.enabled) {
    return item.quantity;
  }

  // Find format attribute to get dimensions
  const formatAttribute = attributes.find((attr) => attr.format);
  if (!formatAttribute || !selectedOptions) {
    return item.quantity;
  }

  const formatValue = selectedOptions[formatAttribute.id];
  const formatOption = formatAttribute.options.find(
    (opt) => opt.value === formatValue && opt.formatWidth && opt.formatHeight,
  );

  if (!formatOption?.formatWidth || !formatOption?.formatHeight) {
    return item.quantity;
  }

  return calculateSheetsNeededForOrder(
    item.quantity,
    formatOption,
    attribute,
    5, // 5% wastage default
  );
}

/**
 * Build stock reservation operations for an order with hybrid stock management.
 */
async function buildReservationOperations(
  channelId: string,
  warehouseId: string,
  orderItems: OrderItem[],
  orderId?: string,
): Promise<ReservationOperations> {
  const productOperations: OrderStockOperation[] = [];
  const attributeOperations: OrderAttributeStockOperation[] = [];
  const itemsWithProduct = orderItems.filter(
    (item) => item.product && item.product.id,
  ) as OrderItemWithProduct[];

  // Get all unique product IDs and fetch product data
  const productIds = [
    ...new Set(itemsWithProduct.map((item) => item.product.id)),
  ];
  const products = await fetchProductsForStockProcessing(channelId, productIds);

  // Get all attributes for the channel (needed for MATRIX products)
  let attributes: Attribute[] = [];
  try {
    attributes = await getAttributes(getAdminDb(), channelId);
  } catch (error) {
    logger.warn(
      "Failed to fetch attributes, MATRIX products may not work properly:",
      error,
    );
  }

  // Process each order item
  for (const item of itemsWithProduct) {
    const product = getProductForStockProcessing({
      item,
      operation: "reservation",
      orderId,
      products,
    });

    if (
      product.priceType === PriceTypeEnum.MATRIX &&
      hasStockTrackedAttributes(product, attributes)
    ) {
      // Handle attribute-based stock for MATRIX products
      const configuration = {
        productId: item.product.id,
        combination: item.combination || null,
        calculatedCombination: item.calculatedCombination || null,
        descriptionCombination: null,
        selectedAttributeOptions: extractSelectedAttributeOptions(item),
        quantity: item.quantity,
        volume: item.volume,
        customFormat: item.customFormat || false,
        width: item.width || 0,
        height: item.height || 0,
      };

      const stockTrackedAttributes = getStockTrackedAttributes(
        product,
        configuration,
        attributes,
      );

      if (stockTrackedAttributes.length > 0) {
        for (const attr of stockTrackedAttributes) {
          // Find the attribute to check if it needs sheet-based calculation
          const attribute = attributes.find((a) => a.id === attr.attributeId);
          const quantityToReserve = attribute
            ? calculateAttributeStockQuantity(
                item,
                attribute,
                attributes,
                configuration.selectedAttributeOptions,
              )
            : item.quantity;

          attributeOperations.push({
            channelId,
            warehouseId,
            attributeId: attr.attributeId,
            attributeOptionValue: attr.optionValue,
            itemId: item.id,
            orderId,
            quantity: quantityToReserve,
          });
        }
      } else {
        // Fallback to product-based stock if no tracked attributes
        productOperations.push({
          channelId,
          warehouseId,
          itemId: item.id,
          orderId,
          productId: item.product.id,
          quantity: item.quantity,
        });
      }
    } else {
      // Handle product-based stock for SINGLE/THRESHOLD products
      productOperations.push({
        channelId,
        warehouseId,
        itemId: item.id,
        orderId,
        productId: item.product.id,
        quantity: item.quantity,
      });
    }
  }

  return {
    attributeOperations,
    productOperations,
  };
}

/**
 * Process stock operations for an order with hybrid stock management
 * Handles both product-based and attribute-based stock depending on product type
 */
export async function processStockReservation(
  channelId: string,
  warehouseId: string,
  orderItems: OrderItem[],
  orderId?: string,
): Promise<void> {
  const { attributeOperations, productOperations } =
    await buildReservationOperations(
      channelId,
      warehouseId,
      orderItems,
      orderId,
    );
  const operations: Promise<void>[] = [];

  if (productOperations.length > 0) {
    operations.push(reserveStock(getAdminDb(), productOperations));
  }

  if (attributeOperations.length > 0) {
    operations.push(reserveAttributeStock(getAdminDb(), attributeOperations));
  }

  await Promise.all(operations);
}

export async function assertStockReservationAvailableForOrder(
  channelId: string,
  warehouseId: string,
  orderItems: OrderItem[],
  orderId?: string,
): Promise<void> {
  const { attributeOperations, productOperations } =
    await buildReservationOperations(
      channelId,
      warehouseId,
      orderItems,
      orderId,
    );
  const operations: Promise<void>[] = [];

  if (productOperations.length > 0) {
    operations.push(
      assertStockReservationAvailable(getAdminDb(), productOperations),
    );
  }

  if (attributeOperations.length > 0) {
    operations.push(
      assertAttributeStockReservationAvailable(
        getAdminDb(),
        attributeOperations,
      ),
    );
  }

  await Promise.all(operations);
}

/**
 * Process stock deduction for fulfilled order items
 */
export async function processStockDeduction(
  channelId: string,
  warehouseId: string,
  orderItems: OrderItem[],
  orderId?: string,
): Promise<void> {
  const productOperations: OrderStockOperation[] = [];
  const attributeOperations: OrderAttributeStockOperation[] = [];
  const itemsWithProduct = orderItems.filter(
    (item) => item.product && item.product.id,
  ) as OrderItemWithProduct[];

  // Get all unique product IDs and fetch product data
  const productIds = [
    ...new Set(itemsWithProduct.map((item) => item.product.id)),
  ];
  const products = await fetchProductsForStockProcessing(channelId, productIds);

  // Get all attributes for the channel
  let attributes: Attribute[] = [];
  try {
    attributes = await getAttributes(getAdminDb(), channelId);
  } catch (error) {
    logger.warn(
      "Failed to fetch attributes, MATRIX products may not work properly:",
      error,
    );
  }

  // Process each order item
  for (const item of itemsWithProduct) {
    const product = getProductForStockProcessing({
      item,
      operation: "deduction",
      orderId,
      products,
    });

    if (
      product.priceType === PriceTypeEnum.MATRIX &&
      hasStockTrackedAttributes(product, attributes)
    ) {
      // Handle attribute-based stock
      const configuration = {
        productId: item.product.id,
        combination: item.combination || null,
        calculatedCombination: item.calculatedCombination || null,
        descriptionCombination: null,
        selectedAttributeOptions: extractSelectedAttributeOptions(item),
        quantity: item.quantity,
        volume: item.volume,
        customFormat: item.customFormat || false,
        width: item.width || 0,
        height: item.height || 0,
      };

      const stockTrackedAttributes = getStockTrackedAttributes(
        product,
        configuration,
        attributes,
      );

      if (stockTrackedAttributes.length > 0) {
        for (const attr of stockTrackedAttributes) {
          // Find the attribute to check if it needs sheet-based calculation
          const attribute = attributes.find((a) => a.id === attr.attributeId);
          const quantityToDeduct = attribute
            ? calculateAttributeStockQuantity(
                item,
                attribute,
                attributes,
                configuration.selectedAttributeOptions,
              )
            : item.quantity;

          attributeOperations.push({
            channelId,
            warehouseId,
            attributeId: attr.attributeId,
            attributeOptionValue: attr.optionValue,
            itemId: item.id,
            orderId,
            quantity: quantityToDeduct,
          });
        }
      } else {
        // Fallback to product-based stock
        productOperations.push({
          channelId,
          warehouseId,
          itemId: item.id,
          orderId,
          productId: item.product.id,
          quantity: item.quantity,
        });
      }
    } else {
      // Handle product-based stock
      productOperations.push({
        channelId,
        warehouseId,
        itemId: item.id,
        orderId,
        productId: item.product.id,
        quantity: item.quantity,
      });
    }
  }

  // Execute stock operations
  const operations: Promise<void>[] = [];

  if (productOperations.length > 0) {
    operations.push(deductStock(getAdminDb(), productOperations));
  }

  if (attributeOperations.length > 0) {
    operations.push(deductAttributeStock(getAdminDb(), attributeOperations));
  }

  await Promise.all(operations);
}

/**
 * Process stock release for cancelled order items
 */
export async function processStockRelease(
  channelId: string,
  warehouseId: string,
  orderItems: OrderItem[],
  orderId?: string,
): Promise<void> {
  const productOperations: OrderStockOperation[] = [];
  const attributeOperations: OrderAttributeStockOperation[] = [];
  const itemsWithProduct = orderItems.filter(
    (item) => item.product && item.product.id,
  ) as OrderItemWithProduct[];

  // Get all unique product IDs and fetch product data
  const productIds = [
    ...new Set(itemsWithProduct.map((item) => item.product.id)),
  ];
  const products = await fetchProductsForStockProcessing(channelId, productIds);

  // Get all attributes for the channel
  let attributes: Attribute[] = [];
  try {
    attributes = await getAttributes(getAdminDb(), channelId);
  } catch (error) {
    logger.warn(
      "Failed to fetch attributes, MATRIX products may not work properly:",
      error,
    );
  }

  // Process each order item
  for (const item of itemsWithProduct) {
    const product = getProductForStockProcessing({
      item,
      operation: "release",
      orderId,
      products,
    });

    if (
      product.priceType === PriceTypeEnum.MATRIX &&
      hasStockTrackedAttributes(product, attributes)
    ) {
      // Handle attribute-based stock
      const configuration = {
        productId: item.product.id,
        combination: item.combination || null,
        calculatedCombination: item.calculatedCombination || null,
        descriptionCombination: null,
        selectedAttributeOptions: extractSelectedAttributeOptions(item),
        quantity: item.quantity,
        volume: item.volume,
        customFormat: item.customFormat || false,
        width: item.width || 0,
        height: item.height || 0,
      };

      const stockTrackedAttributes = getStockTrackedAttributes(
        product,
        configuration,
        attributes,
      );

      if (stockTrackedAttributes.length > 0) {
        for (const attr of stockTrackedAttributes) {
          // Find the attribute to check if it needs sheet-based calculation
          const attribute = attributes.find((a) => a.id === attr.attributeId);
          const quantityToRelease = attribute
            ? calculateAttributeStockQuantity(
                item,
                attribute,
                attributes,
                configuration.selectedAttributeOptions,
              )
            : item.quantity;

          attributeOperations.push({
            channelId,
            warehouseId,
            attributeId: attr.attributeId,
            attributeOptionValue: attr.optionValue,
            itemId: item.id,
            orderId,
            quantity: quantityToRelease,
          });
        }
      } else {
        // Fallback to product-based stock
        productOperations.push({
          channelId,
          warehouseId,
          itemId: item.id,
          orderId,
          productId: item.product.id,
          quantity: item.quantity,
        });
      }
    } else {
      // Handle product-based stock
      productOperations.push({
        channelId,
        warehouseId,
        itemId: item.id,
        orderId,
        productId: item.product.id,
        quantity: item.quantity,
      });
    }
  }

  // Execute stock operations
  const operations: Promise<void>[] = [];

  if (productOperations.length > 0) {
    operations.push(releaseStock(getAdminDb(), productOperations));
  }

  if (attributeOperations.length > 0) {
    operations.push(releaseAttributeStock(getAdminDb(), attributeOperations));
  }

  await Promise.all(operations);
}

/**
 * Extract selected attribute options from order item combination
 */
function extractSelectedAttributeOptions(
  item: OrderItem,
): { [key: string]: string | number } | null {
  // Try to extract from combination first
  if (
    item.combination &&
    typeof item.combination === "object" &&
    !Array.isArray(item.combination)
  ) {
    return item.combination as { [key: string]: string | number };
  }

  // Try to extract from calculatedCombination
  if (
    item.calculatedCombination &&
    typeof item.calculatedCombination === "object" &&
    !Array.isArray(item.calculatedCombination)
  ) {
    return item.calculatedCombination as { [key: string]: string | number };
  }

  return null;
}
