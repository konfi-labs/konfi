import { StockOperation } from "@konfi/types";

/**
 * Validate stock operations to ensure they are valid
 */
export function validateStockOperations(operations: StockOperation[]): boolean {
  for (const operation of operations) {
    // Check required fields
    if (
      !operation.channelId ||
      !operation.warehouseId ||
      !operation.productId
    ) {
      return false;
    }

    // Check quantity is positive
    if (operation.quantity <= 0) {
      return false;
    }

    // Check quantity is a whole number
    if (!Number.isInteger(operation.quantity)) {
      return false;
    }
  }

  return true;
}

/**
 * Group stock operations by product to handle bulk operations
 */
export function groupStockOperationsByProduct(
  operations: StockOperation[],
): Map<string, StockOperation[]> {
  const groupedOperations = new Map<string, StockOperation[]>();

  for (const operation of operations) {
    const key = `${operation.channelId}:${operation.warehouseId}:${operation.productId}`;

    if (!groupedOperations.has(key)) {
      groupedOperations.set(key, []);
    }

    groupedOperations.get(key)!.push(operation);
  }

  return groupedOperations;
}

/**
 * Consolidate multiple stock operations for the same product into a single operation
 */
export function consolidateStockOperations(
  operations: StockOperation[],
): StockOperation[] {
  const consolidated = new Map<string, StockOperation>();

  for (const operation of operations) {
    const key = `${operation.channelId}:${operation.warehouseId}:${operation.productId}`;

    if (consolidated.has(key)) {
      const existing = consolidated.get(key)!;
      existing.quantity += operation.quantity;
    } else {
      consolidated.set(key, { ...operation });
    }
  }

  return Array.from(consolidated.values());
}
