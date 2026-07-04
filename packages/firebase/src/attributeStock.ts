import {
  AttributeStock,
  AttributeStockOperation,
  AttributeStockWithAvailable,
  NestedMember,
} from "@konfi/types";
import {
  getAttributeStockId,
  calculateSheetStockRequirements,
} from "@konfi/utils";
import {
  collection,
  doc,
  DocumentReference,
  Firestore,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  Timestamp,
} from "firebase/firestore";

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
 * Get attribute stock document reference
 */
export function getAttributeStockDocRef(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  attributeId: string,
  optionValue: string,
): DocumentReference<AttributeStock> {
  const stockId = getAttributeStockId(attributeId, optionValue);
  return doc(
    firestore,
    `channels/${channelId}/warehouses/${warehouseId}/attributeStock/${stockId}`,
  ) as DocumentReference<AttributeStock>;
}

/**
 * Get current attribute stock
 */
export async function getAttributeStock(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  attributeId: string,
  optionValue: string,
): Promise<AttributeStockWithAvailable | null> {
  const stockRef = getAttributeStockDocRef(
    firestore,
    channelId,
    warehouseId,
    attributeId,
    optionValue,
  );
  const stockDoc = await getDoc(stockRef);

  if (!stockDoc.exists()) {
    return null;
  }

  const stock = stockDoc.data() as AttributeStock;
  return {
    ...stock,
    available: stock.total - stock.allocated,
  };
}

/**
 * Get stock for multiple attribute combinations
 */
export async function getMultipleAttributeStock(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  attributeCombinations: { attributeId: string; optionValue: string }[],
): Promise<{ [key: string]: AttributeStockWithAvailable | null }> {
  const stockPromises = attributeCombinations.map(async (combo) => {
    const stock = await getAttributeStock(
      firestore,
      channelId,
      warehouseId,
      combo.attributeId,
      combo.optionValue,
    );
    const key = getAttributeStockId(combo.attributeId, combo.optionValue);
    return { key, stock };
  });

  const results = await Promise.all(stockPromises);
  const stockMap: { [key: string]: AttributeStockWithAvailable | null } = {};

  results.forEach(({ key, stock }) => {
    stockMap[key] = stock;
  });

  return stockMap;
}

/**
 * Reserve attribute stock for an order item
 */
export async function reserveAttributeStock(
  firestore: Firestore,
  operations: AttributeStockOperation[],
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const stockRefs = operations.map((op) =>
      getAttributeStockDocRef(
        firestore,
        op.channelId,
        op.warehouseId,
        op.attributeId,
        op.attributeOptionValue,
      ),
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
        // Initialize attribute stock if it doesn't exist
        const stockId = getAttributeStockId(
          operation.attributeId,
          operation.attributeOptionValue,
        );
        const initialStock: AttributeStock = {
          id: stockId,
          name: `Stock for ${operation.attributeId}:${operation.attributeOptionValue}`,
          attributeId: operation.attributeId,
          attributeOptionValue: operation.attributeOptionValue,
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
        const currentStock = stockDoc.data() as AttributeStock;
        const available = currentStock.total - currentStock.allocated;

        if (available < operation.quantity) {
          throw new Error(
            `Insufficient attribute stock for ${operation.attributeId}:${operation.attributeOptionValue}. Available: ${available}, Requested: ${operation.quantity}`,
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
 * Deduct attribute stock when order is fulfilled
 */
export async function deductAttributeStock(
  firestore: Firestore,
  operations: AttributeStockOperation[],
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const stockRefs = operations.map((op) =>
      getAttributeStockDocRef(
        firestore,
        op.channelId,
        op.warehouseId,
        op.attributeId,
        op.attributeOptionValue,
      ),
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
          `Attribute stock document not found for ${operation.attributeId}:${operation.attributeOptionValue}`,
        );
      }

      const currentStock = stockDoc.data() as AttributeStock;

      if (currentStock.allocated < operation.quantity) {
        throw new Error(
          `Cannot deduct more than allocated attribute stock for ${operation.attributeId}:${operation.attributeOptionValue}. Allocated: ${currentStock.allocated}, Requested: ${operation.quantity}`,
        );
      }

      if (currentStock.total < operation.quantity) {
        throw new Error(
          `Cannot deduct more than total attribute stock for ${operation.attributeId}:${operation.attributeOptionValue}. Total: ${currentStock.total}, Requested: ${operation.quantity}`,
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
 * Release attribute stock when order is cancelled
 */
export async function releaseAttributeStock(
  firestore: Firestore,
  operations: AttributeStockOperation[],
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const stockRefs = operations.map((op) =>
      getAttributeStockDocRef(
        firestore,
        op.channelId,
        op.warehouseId,
        op.attributeId,
        op.attributeOptionValue,
      ),
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
          `Attribute stock document not found for ${operation.attributeId}:${operation.attributeOptionValue}`,
        );
      }

      const currentStock = stockDoc.data() as AttributeStock;

      if (currentStock.allocated < operation.quantity) {
        throw new Error(
          `Cannot release more than allocated attribute stock for ${operation.attributeId}:${operation.attributeOptionValue}. Allocated: ${currentStock.allocated}, Requested: ${operation.quantity}`,
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
 * Set initial attribute stock
 */
export async function setAttributeStock(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
  attributeId: string,
  optionValue: string,
  totalStock: number,
): Promise<void> {
  const stockRef = getAttributeStockDocRef(
    firestore,
    channelId,
    warehouseId,
    attributeId,
    optionValue,
  );

  await runTransaction(firestore, async (transaction) => {
    const stockDoc = await transaction.get(stockRef);

    if (!stockDoc.exists()) {
      // Create new attribute stock document
      const stockId = getAttributeStockId(attributeId, optionValue);
      const newStock: AttributeStock = {
        id: stockId,
        name: `Stock for ${attributeId}:${optionValue}`,
        attributeId,
        attributeOptionValue: optionValue,
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
      transaction.update(stockRef, {
        total: totalStock,
        updatedAt: Timestamp.now(),
        updatedBy: ADMIN_USER,
      });
    }
  });
}

/**
 * Get all attribute stock for a warehouse
 */
export async function getWarehouseAttributeStock(
  firestore: Firestore,
  channelId: string,
  warehouseId: string,
): Promise<AttributeStockWithAvailable[]> {
  const stockCollection = collection(
    firestore,
    `channels/${channelId}/warehouses/${warehouseId}/attributeStock`,
  );
  const stockQuery = query(stockCollection);
  const stockSnapshot = await getDocs(stockQuery);

  const stocks: AttributeStockWithAvailable[] = [];
  stockSnapshot.forEach((doc) => {
    const stock = doc.data() as AttributeStock;
    stocks.push({
      ...stock,
      available: stock.total - stock.allocated,
    });
  });

  return stocks;
}

/**
 * Calculate attribute stock operations based on product configuration and sheet calculations
 */
export function calculateAttributeStockOperations(
  quantity: number,
  formatOption: { formatWidth?: number; formatHeight?: number },
  paperAttribute: {
    id: string;
    calculateStockFromSheet: {
      enabled: boolean;
      sheetWidth: number;
      sheetHeight: number;
      margin?: number;
      bleed?: number;
    };
  },
  channelId: string,
  warehouseId: string,
  wastagePercent: number = 5,
): AttributeStockOperation[] {
  if (!paperAttribute.calculateStockFromSheet?.enabled) {
    return [];
  }

  if (!formatOption.formatWidth || !formatOption.formatHeight) {
    return [];
  }

  const { sheetWidth, sheetHeight, margin, bleed } =
    paperAttribute.calculateStockFromSheet;

  const calculation = calculateSheetStockRequirements(
    quantity,
    sheetWidth,
    sheetHeight,
    formatOption.formatWidth,
    formatOption.formatHeight,
    {
      margin,
      bleed,
      wastagePercent,
      allowRotation: true,
    },
  );

  return [
    {
      channelId,
      warehouseId,
      attributeId: paperAttribute.id,
      attributeOptionValue: "default", // This could be dynamic based on paper type
      quantity: calculation.sheetsNeeded,
    },
  ];
}
