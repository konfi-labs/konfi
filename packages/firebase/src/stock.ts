import {
  Stock,
  StockOperation,
  StockWithAvailable,
  NestedMember,
} from "@konfi/types";
import {
  doc,
  getDoc,
  runTransaction,
  Timestamp,
  increment,
  DocumentReference,
  Firestore,
  setDoc,
} from "firebase/firestore";
import { firestore } from "./lib";

// System user for automated operations
const SYSTEM_USER: NestedMember = {
  id: "system",
  name: "System",
};

// Admin user for manual operations
const ADMIN_USER: NestedMember = {
  id: "admin",
  name: "Admin",
};

/**
 * Get stock document reference for a product in a specific warehouse
 */
export function getStockDocRef(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
): DocumentReference<Stock> {
  return doc(
    firestore,
    `channels/${channelId}/warehouses/${warehouseId}/stock/${productId}`,
  ) as DocumentReference<Stock>;
}

/**
 * Get current stock for a product in a specific warehouse
 */
export async function getStock(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
): Promise<StockWithAvailable | null> {
  const stockRef = getStockDocRef(firestore, channelId, warehouseId, productId);
  const stockDoc = await getDoc(stockRef);

  if (!stockDoc.exists()) {
    return null;
  }

  const stock = stockDoc.data() as Stock;
  return {
    ...stock,
    available: stock.total - stock.allocated,
  };
}

/**
 * Reserve stock for an order item
 * This prevents overselling by marking stock as allocated
 */
export async function reserveStock(
  firestore: Firestore,
  operations: StockOperation[],
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const stockRefs = operations.map((op) =>
      getStockDocRef(firestore, op.channelId, op.warehouseId, op.productId),
    );

    // Read all stock documents first
    const stockDocs = await Promise.all(
      stockRefs.map((ref) => transaction.get(ref)),
    );

    // Validate stock availability and prepare updates
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      if (!stockDoc.exists()) {
        // Initialize stock if it doesn't exist
        const initialStock: Stock = {
          id: operation.productId,
          name: `Stock for ${operation.productId}`,
          total: 0,
          allocated: operation.quantity,
          updatedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          createdBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
          active: true,
        };
        transaction.set(stockRef, initialStock);
      } else {
        const currentStock = stockDoc.data() as Stock;
        const available = currentStock.total - currentStock.allocated;

        if (available < operation.quantity) {
          throw new Error(
            `Insufficient stock for product ${operation.productId}. Available: ${available}, Requested: ${operation.quantity}`,
          );
        }

        // Update allocated stock
        transaction.update(stockRef, {
          allocated: increment(operation.quantity),
          updatedAt: Timestamp.now(),
          updatedBy: SYSTEM_USER,
        });
      }
    }
  });
}

/**
 * Deduct stock when order is fulfilled
 * This reduces both total and allocated stock
 */
export async function deductStock(
  firestore: Firestore,
  operations: StockOperation[],
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const stockRefs = operations.map((op) =>
      getStockDocRef(firestore, op.channelId, op.warehouseId, op.productId),
    );

    // Read all stock documents first
    const stockDocs = await Promise.all(
      stockRefs.map((ref) => transaction.get(ref)),
    );

    // Validate and prepare updates
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      if (!stockDoc.exists()) {
        throw new Error(
          `Stock document not found for product ${operation.productId}`,
        );
      }

      const currentStock = stockDoc.data() as Stock;

      if (currentStock.allocated < operation.quantity) {
        throw new Error(
          `Cannot deduct more than allocated stock for product ${operation.productId}. Allocated: ${currentStock.allocated}, Requested: ${operation.quantity}`,
        );
      }

      if (currentStock.total < operation.quantity) {
        throw new Error(
          `Cannot deduct more than total stock for product ${operation.productId}. Total: ${currentStock.total}, Requested: ${operation.quantity}`,
        );
      }

      // Update both total and allocated stock
      transaction.update(stockRef, {
        total: increment(-operation.quantity),
        allocated: increment(-operation.quantity),
        updatedAt: Timestamp.now(),
        updatedBy: SYSTEM_USER,
      });
    }
  });
}

/**
 * Release stock when order is cancelled
 * This reduces allocated stock without affecting total stock
 */
export async function releaseStock(
  firestore: Firestore,
  operations: StockOperation[],
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const stockRefs = operations.map((op) =>
      getStockDocRef(firestore, op.channelId, op.warehouseId, op.productId),
    );

    // Read all stock documents first
    const stockDocs = await Promise.all(
      stockRefs.map((ref) => transaction.get(ref)),
    );

    // Validate and prepare updates
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      if (!stockDoc.exists()) {
        throw new Error(
          `Stock document not found for product ${operation.productId}`,
        );
      }

      const currentStock = stockDoc.data() as Stock;

      if (currentStock.allocated < operation.quantity) {
        throw new Error(
          `Cannot release more than allocated stock for product ${operation.productId}. Allocated: ${currentStock.allocated}, Requested: ${operation.quantity}`,
        );
      }

      // Update allocated stock only
      transaction.update(stockRef, {
        allocated: increment(-operation.quantity),
        updatedAt: Timestamp.now(),
        updatedBy: SYSTEM_USER,
      });
    }
  });
}

/**
 * Set initial stock for a product in a warehouse
 * This is typically used by admin to initialize or adjust stock levels
 */
export async function setStock(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
  totalStock: number,
): Promise<void> {
  const stockRef = getStockDocRef(firestore, channelId, warehouseId, productId);

  await runTransaction(firestore, async (transaction) => {
    const stockDoc = await transaction.get(stockRef);

    if (!stockDoc.exists()) {
      // Create new stock document
      const newStock: Stock = {
        id: productId,
        name: `Stock for ${productId}`,
        total: totalStock,
        allocated: 0,
        updatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        createdBy: ADMIN_USER,
        updatedBy: ADMIN_USER,
        active: true,
      };
      transaction.set(stockRef, newStock);
    } else {
      // Update existing stock, keeping allocated unchanged
      const currentStock = stockDoc.data() as Stock;
      transaction.update(stockRef, {
        total: totalStock,
        updatedAt: Timestamp.now(),
        updatedBy: ADMIN_USER,
      });
    }
  });
}

/**
 * Get stock for multiple products across all warehouses in a channel
 */
export async function getChannelStock(
  firestore: Firestore,
  channelId: string,
): Promise<{
  [productId: string]: { [warehouseId: string]: StockWithAvailable };
}> {
  // This would require a more complex query - for now, return empty object
  // In a real implementation, you'd need to query all warehouses and their stock
  return {};
}
