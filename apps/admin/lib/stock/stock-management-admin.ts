import "server-only";

import {
  Attribute,
  AttributeStock,
  AttributeStockOperation,
  InventoryMovement,
  InventoryMovementType,
  InventoryReservation,
  InventoryReservationSource,
  InventoryReservationStatus,
  NestedMember,
  Product,
  Stock,
  StockOperation,
  StockWithAvailable,
} from "@konfi/types";
import {
  consolidateStockOperations,
  getInventoryMovementDelta,
  getInventoryTargetFromAttributeStockOperation,
  getInventoryTargetFromStockOperation,
  getAttributeStockId,
  validateStockOperations,
} from "@konfi/utils";
import * as admin from "firebase-admin";

type StockLedgerOperation = StockOperation & {
  idempotencyKey?: string;
  itemId?: string;
  orderId?: string;
};

type AttributeStockLedgerOperation = AttributeStockOperation & {
  idempotencyKey?: string;
  itemId?: string;
  orderId?: string;
};

export type StockReservationErrorCode =
  | "INSUFFICIENT_STOCK"
  | "INVALID_STOCK_STATE"
  | "STOCK_NOT_CONFIGURED";

export type StockReservationErrorTarget =
  | {
      productId: string;
      type: "product";
    }
  | {
      attributeId: string;
      attributeOptionValue: string;
      type: "attribute";
    };

export class StockReservationError extends Error {
  readonly available: number;
  readonly code: StockReservationErrorCode;
  readonly requested: number;
  readonly target: StockReservationErrorTarget;

  constructor(params: {
    available: number;
    code: StockReservationErrorCode;
    requested: number;
    target: StockReservationErrorTarget;
  }) {
    super(createStockReservationErrorMessage(params));
    this.name = "StockReservationError";
    this.available = params.available;
    this.code = params.code;
    this.requested = params.requested;
    this.target = params.target;
  }
}

export function isStockReservationError(
  error: unknown,
): error is StockReservationError {
  return error instanceof StockReservationError;
}

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
  db: admin.firestore.Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
): admin.firestore.DocumentReference<Stock> {
  return db.doc(
    `channels/${channelId}/warehouses/${warehouseId}/stock/${productId}`,
  ) as admin.firestore.DocumentReference<Stock>;
}

/**
 * Get current stock for a product in a specific warehouse
 */
export async function getStock(
  db: admin.firestore.Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
): Promise<StockWithAvailable | null> {
  const stockRef = getStockDocRef(db, channelId, warehouseId, productId);
  const stockDoc = await stockRef.get();

  if (!stockDoc.exists) {
    return null;
  }

  const stock = stockDoc.data() as Stock;
  return {
    ...stock,
    available: stock.total - stock.allocated,
  };
}

// Helper to convert Admin SDK Timestamp to a compatible type for @konfi/types (uses client Timestamp)
type AdminTimestamp = Stock["updatedAt"] &
  InventoryMovement["createdAt"] &
  InventoryReservation["createdAt"];

function nowTs(): AdminTimestamp {
  return admin.firestore.Timestamp.now() as unknown as AdminTimestamp;
}

function createInventoryLedgerDocId(
  parts: readonly (number | string | undefined | null)[],
): string {
  return Buffer.from(
    parts.map((part) => String(part ?? "")).join("|"),
  ).toString("base64url");
}

function getStockLedgerTargetKey(operation: StockLedgerOperation): string {
  return ["product", operation.productId].join(":");
}

function getProductStockConfigKey(operation: StockLedgerOperation): string {
  return [operation.channelId, operation.warehouseId, operation.productId].join(
    ":",
  );
}

function getAttributeStockLedgerTargetKey(
  operation: AttributeStockLedgerOperation,
): string {
  return [
    "attribute",
    operation.attributeId,
    operation.attributeOptionValue,
  ].join(":");
}

function getAttributeStockConfigKey(
  operation: AttributeStockLedgerOperation,
): string {
  return [
    operation.channelId,
    operation.warehouseId,
    operation.attributeId,
    operation.attributeOptionValue,
  ].join(":");
}

function createStockReservationErrorMessage(params: {
  available: number;
  code: StockReservationErrorCode;
  requested: number;
  target: StockReservationErrorTarget;
}): string {
  if (params.target.type === "product") {
    if (params.code === "STOCK_NOT_CONFIGURED") {
      return `Stock is not configured for product ${params.target.productId}. Requested: ${params.requested}`;
    }

    if (params.code === "INVALID_STOCK_STATE") {
      return `Invalid stock state for product ${params.target.productId}. Available: ${params.available}, Requested: ${params.requested}`;
    }

    return `Insufficient stock for product ${params.target.productId}. Available: ${params.available}, Requested: ${params.requested}`;
  }

  const target = `${params.target.attributeId}:${params.target.attributeOptionValue}`;
  if (params.code === "STOCK_NOT_CONFIGURED") {
    return `Attribute stock is not configured for ${target}. Requested: ${params.requested}`;
  }

  if (params.code === "INVALID_STOCK_STATE") {
    return `Invalid attribute stock state for ${target}. Available: ${params.available}, Requested: ${params.requested}`;
  }

  return `Insufficient attribute stock for ${target}. Available: ${params.available}, Requested: ${params.requested}`;
}

function createProductStockReservationError(params: {
  available: number;
  code: StockReservationErrorCode;
  operation: StockLedgerOperation;
}): StockReservationError {
  return new StockReservationError({
    available: params.available,
    code: params.code,
    requested: params.operation.quantity,
    target: {
      productId: params.operation.productId,
      type: "product",
    },
  });
}

function createAttributeStockReservationError(params: {
  available: number;
  code: StockReservationErrorCode;
  operation: AttributeStockLedgerOperation;
}): StockReservationError {
  return new StockReservationError({
    available: params.available,
    code: params.code,
    requested: params.operation.quantity,
    target: {
      attributeId: params.operation.attributeId,
      attributeOptionValue: params.operation.attributeOptionValue,
      type: "attribute",
    },
  });
}

function assertProductStockOperationAvailable(params: {
  operation: StockLedgerOperation;
  stock: Stock | null;
}) {
  if (!params.stock) {
    throw createProductStockReservationError({
      available: 0,
      code: "STOCK_NOT_CONFIGURED",
      operation: params.operation,
    });
  }

  const available = params.stock.total - params.stock.allocated;

  if (available < 0) {
    throw createProductStockReservationError({
      available,
      code: "INVALID_STOCK_STATE",
      operation: params.operation,
    });
  }

  if (available < params.operation.quantity) {
    throw createProductStockReservationError({
      available,
      code: "INSUFFICIENT_STOCK",
      operation: params.operation,
    });
  }
}

function assertAttributeStockOperationAvailable(params: {
  operation: AttributeStockLedgerOperation;
  stock: AttributeStock | null;
}) {
  if (!params.stock) {
    throw createAttributeStockReservationError({
      available: 0,
      code: "STOCK_NOT_CONFIGURED",
      operation: params.operation,
    });
  }

  const available = params.stock.total - params.stock.allocated;

  if (available < 0) {
    throw createAttributeStockReservationError({
      available,
      code: "INVALID_STOCK_STATE",
      operation: params.operation,
    });
  }

  if (available < params.operation.quantity) {
    throw createAttributeStockReservationError({
      available,
      code: "INSUFFICIENT_STOCK",
      operation: params.operation,
    });
  }
}

function getStockMovementDocRef(
  db: admin.firestore.Firestore,
  operation: StockLedgerOperation,
  movementType: InventoryMovementType,
) {
  const id =
    operation.idempotencyKey ??
    createInventoryLedgerDocId([
      movementType,
      operation.orderId,
      operation.itemId,
      getStockLedgerTargetKey(operation),
      operation.quantity,
    ]);

  return db.doc(
    `channels/${operation.channelId}/warehouses/${operation.warehouseId}/inventoryMovements/${id}`,
  ) as admin.firestore.DocumentReference<InventoryMovement>;
}

function getAttributeStockMovementDocRef(
  db: admin.firestore.Firestore,
  operation: AttributeStockLedgerOperation,
  movementType: InventoryMovementType,
) {
  const id =
    operation.idempotencyKey ??
    createInventoryLedgerDocId([
      movementType,
      operation.orderId,
      operation.itemId,
      getAttributeStockLedgerTargetKey(operation),
      operation.quantity,
    ]);

  return db.doc(
    `channels/${operation.channelId}/warehouses/${operation.warehouseId}/inventoryMovements/${id}`,
  ) as admin.firestore.DocumentReference<InventoryMovement>;
}

function getStockReservationDocRef(
  db: admin.firestore.Firestore,
  operation: StockLedgerOperation,
) {
  const id = createInventoryLedgerDocId([
    operation.orderId,
    operation.itemId,
    getStockLedgerTargetKey(operation),
  ]);

  return db.doc(
    `channels/${operation.channelId}/warehouses/${operation.warehouseId}/inventoryReservations/${id}`,
  ) as admin.firestore.DocumentReference<InventoryReservation>;
}

function getAttributeStockReservationDocRef(
  db: admin.firestore.Firestore,
  operation: AttributeStockLedgerOperation,
) {
  const id = createInventoryLedgerDocId([
    operation.orderId,
    operation.itemId,
    getAttributeStockLedgerTargetKey(operation),
  ]);

  return db.doc(
    `channels/${operation.channelId}/warehouses/${operation.warehouseId}/inventoryReservations/${id}`,
  ) as admin.firestore.DocumentReference<InventoryReservation>;
}

function getReservationSource(
  operation: StockLedgerOperation | AttributeStockLedgerOperation,
): InventoryReservationSource {
  return operation.orderId
    ? InventoryReservationSource.ORDER
    : InventoryReservationSource.MANUAL;
}

function getOptionalLedgerFields(
  operation: StockLedgerOperation | AttributeStockLedgerOperation,
): Partial<
  Pick<InventoryMovement, "idempotencyKey" | "orderId" | "orderItemId">
> {
  return {
    ...(operation.idempotencyKey
      ? { idempotencyKey: operation.idempotencyKey }
      : {}),
    ...(operation.orderId ? { orderId: operation.orderId } : {}),
    ...(operation.itemId ? { orderItemId: operation.itemId } : {}),
  };
}

function createInventoryMovement(params: {
  id: string;
  movementType: InventoryMovementType;
  operation: StockLedgerOperation;
  reservationId?: string;
}): InventoryMovement {
  const { id, movementType, operation, reservationId } = params;
  const delta = getInventoryMovementDelta(movementType, operation.quantity);
  const timestamp = nowTs();

  return {
    ...getInventoryTargetFromStockOperation(operation),
    ...delta,
    active: true,
    createdAt: timestamp,
    createdBy: SYSTEM_USER,
    id,
    movementType,
    name: `${movementType} ${operation.productId}`,
    quantity: operation.quantity,
    updatedAt: timestamp,
    updatedBy: SYSTEM_USER,
    ...getOptionalLedgerFields(operation),
    ...(reservationId ? { reservationId } : {}),
  };
}

function createAttributeInventoryMovement(params: {
  id: string;
  movementType: InventoryMovementType;
  operation: AttributeStockLedgerOperation;
  reservationId?: string;
}): InventoryMovement {
  const { id, movementType, operation, reservationId } = params;
  const delta = getInventoryMovementDelta(movementType, operation.quantity);
  const timestamp = nowTs();

  return {
    ...getInventoryTargetFromAttributeStockOperation(operation),
    ...delta,
    active: true,
    createdAt: timestamp,
    createdBy: SYSTEM_USER,
    id,
    movementType,
    name: `${movementType} ${operation.attributeId}:${operation.attributeOptionValue}`,
    quantity: operation.quantity,
    updatedAt: timestamp,
    updatedBy: SYSTEM_USER,
    ...getOptionalLedgerFields(operation),
    ...(reservationId ? { reservationId } : {}),
  };
}

function createInventoryReservation(
  ref: admin.firestore.DocumentReference<InventoryReservation>,
  operation: StockLedgerOperation,
): InventoryReservation {
  const timestamp = nowTs();

  return {
    ...getInventoryTargetFromStockOperation(operation),
    active: true,
    consumedQuantity: 0,
    createdAt: timestamp,
    createdBy: SYSTEM_USER,
    id: ref.id,
    name: `Reservation ${operation.productId}`,
    quantity: operation.quantity,
    releasedQuantity: 0,
    reservedQuantity: operation.quantity,
    source: getReservationSource(operation),
    status: InventoryReservationStatus.ACTIVE,
    updatedAt: timestamp,
    updatedBy: SYSTEM_USER,
    ...getOptionalLedgerFields(operation),
  };
}

function createAttributeInventoryReservation(
  ref: admin.firestore.DocumentReference<InventoryReservation>,
  operation: AttributeStockLedgerOperation,
): InventoryReservation {
  const timestamp = nowTs();

  return {
    ...getInventoryTargetFromAttributeStockOperation(operation),
    active: true,
    consumedQuantity: 0,
    createdAt: timestamp,
    createdBy: SYSTEM_USER,
    id: ref.id,
    name: `Reservation ${operation.attributeId}:${operation.attributeOptionValue}`,
    quantity: operation.quantity,
    releasedQuantity: 0,
    reservedQuantity: operation.quantity,
    source: getReservationSource(operation),
    status: InventoryReservationStatus.ACTIVE,
    updatedAt: timestamp,
    updatedBy: SYSTEM_USER,
    ...getOptionalLedgerFields(operation),
  };
}

function updateReservationForMovement(
  transaction: admin.firestore.Transaction,
  ref: admin.firestore.DocumentReference<InventoryReservation>,
  movementType: InventoryMovementType,
  quantity: number,
) {
  if (movementType === InventoryMovementType.RESERVATION_CREATED) {
    return;
  }

  const timestamp = nowTs();
  const update: Record<string, unknown> = {
    active: false,
    status:
      movementType === InventoryMovementType.RESERVATION_CONSUMED
        ? InventoryReservationStatus.CONSUMED
        : InventoryReservationStatus.RELEASED,
    updatedAt: timestamp,
    updatedBy: SYSTEM_USER,
  };

  if (movementType === InventoryMovementType.RESERVATION_CONSUMED) {
    update.consumedQuantity = admin.firestore.FieldValue.increment(quantity);
  }

  if (movementType === InventoryMovementType.RESERVATION_RELEASED) {
    update.releasedQuantity = admin.firestore.FieldValue.increment(quantity);
  }

  transaction.set(
    ref as admin.firestore.DocumentReference<admin.firestore.DocumentData>,
    update,
    { merge: true },
  );
}

/**
 * Reserve stock for an order item (Admin Firestore version)
 * This prevents overselling by marking stock as allocated
 */
export async function reserveStock(
  db: admin.firestore.Firestore,
  operations: StockLedgerOperation[],
): Promise<void> {
  if (!validateStockOperations(operations)) {
    throw new Error("Invalid stock operations");
  }

  const movementRefs = operations.map((operation) =>
    getStockMovementDocRef(
      db,
      operation,
      InventoryMovementType.RESERVATION_CREATED,
    ),
  );

  await db.runTransaction(async (transaction) => {
    const movementDocs = await Promise.all(
      movementRefs.map((ref) => transaction.get(ref)),
    );
    const pendingOperations = operations.filter(
      (_, index) => !movementDocs[index].exists,
    );

    if (pendingOperations.length === 0) {
      return;
    }

    // Consolidate operations for the same product
    const consolidatedOperations =
      consolidateStockOperations(pendingOperations);
    const stockRefs = consolidatedOperations.map((op) =>
      getStockDocRef(db, op.channelId, op.warehouseId, op.productId),
    );

    // Read all stock documents first
    const stockDocs = await Promise.all(
      stockRefs.map((ref) => transaction.get(ref)),
    );

    const configuredStockKeys = new Set<string>();

    for (let i = 0; i < consolidatedOperations.length; i++) {
      const operation = consolidatedOperations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      const currentStock = stockDoc.exists ? (stockDoc.data() as Stock) : null;

      if (!currentStock) {
        continue;
      }

      configuredStockKeys.add(getProductStockConfigKey(operation));

      transaction.update(stockRef, {
        allocated: admin.firestore.FieldValue.increment(operation.quantity),
        updatedAt: nowTs(),
        updatedBy: SYSTEM_USER,
      });
    }

    const reservableOperations = pendingOperations.filter((operation) =>
      configuredStockKeys.has(getProductStockConfigKey(operation)),
    );

    for (const operation of reservableOperations) {
      const movementRef = getStockMovementDocRef(
        db,
        operation,
        InventoryMovementType.RESERVATION_CREATED,
      );
      const reservationRef = getStockReservationDocRef(db, operation);

      transaction.set(
        reservationRef,
        createInventoryReservation(reservationRef, operation),
      );
      transaction.set(
        movementRef,
        createInventoryMovement({
          id: movementRef.id,
          movementType: InventoryMovementType.RESERVATION_CREATED,
          operation,
          reservationId: reservationRef.id,
        }),
      );
    }
  });
}

/**
 * Deduct stock when order is fulfilled (Admin Firestore version)
 * This reduces both total and allocated stock
 */
export async function deductStock(
  db: admin.firestore.Firestore,
  operations: StockLedgerOperation[],
): Promise<void> {
  if (!validateStockOperations(operations)) {
    throw new Error("Invalid stock operations");
  }

  const movementRefs = operations.map((operation) =>
    getStockMovementDocRef(
      db,
      operation,
      InventoryMovementType.RESERVATION_CONSUMED,
    ),
  );

  await db.runTransaction(async (transaction) => {
    const movementDocs = await Promise.all(
      movementRefs.map((ref) => transaction.get(ref)),
    );
    const pendingOperations = operations.filter(
      (_, index) => !movementDocs[index].exists,
    );

    if (pendingOperations.length === 0) {
      return;
    }

    // Consolidate operations for the same product
    const consolidatedOperations =
      consolidateStockOperations(pendingOperations);
    const stockRefs = consolidatedOperations.map((op) =>
      getStockDocRef(db, op.channelId, op.warehouseId, op.productId),
    );

    // Read all stock documents first
    const stockDocs = await Promise.all(
      stockRefs.map((ref) => transaction.get(ref)),
    );

    // Validate and prepare updates
    for (let i = 0; i < consolidatedOperations.length; i++) {
      const operation = consolidatedOperations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      if (!stockDoc.exists) {
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
        total: admin.firestore.FieldValue.increment(-operation.quantity),
        allocated: admin.firestore.FieldValue.increment(-operation.quantity),
        updatedAt: nowTs(),
        updatedBy: SYSTEM_USER,
      });
    }

    for (const operation of pendingOperations) {
      const movementRef = getStockMovementDocRef(
        db,
        operation,
        InventoryMovementType.RESERVATION_CONSUMED,
      );
      const reservationRef = getStockReservationDocRef(db, operation);

      updateReservationForMovement(
        transaction,
        reservationRef,
        InventoryMovementType.RESERVATION_CONSUMED,
        operation.quantity,
      );
      transaction.set(
        movementRef,
        createInventoryMovement({
          id: movementRef.id,
          movementType: InventoryMovementType.RESERVATION_CONSUMED,
          operation,
          reservationId: reservationRef.id,
        }),
      );
    }
  });
}

export async function assertStockReservationAvailable(
  db: admin.firestore.Firestore,
  operations: StockLedgerOperation[],
): Promise<void> {
  if (operations.length === 0) {
    return;
  }

  if (!validateStockOperations(operations)) {
    throw new Error("Invalid stock operations");
  }

  const consolidatedOperations = consolidateStockOperations(operations);
  const stockRefs = consolidatedOperations.map((op) =>
    getStockDocRef(db, op.channelId, op.warehouseId, op.productId),
  );
  const stockDocs = await Promise.all(stockRefs.map((ref) => ref.get()));

  for (let i = 0; i < consolidatedOperations.length; i++) {
    const operation = consolidatedOperations[i];
    const stockDoc = stockDocs[i];
    const currentStock = stockDoc.exists ? (stockDoc.data() as Stock) : null;

    assertProductStockOperationAvailable({
      operation,
      stock: currentStock,
    });
  }
}

/**
 * Release stock when order is cancelled (Admin Firestore version)
 * This reduces allocated stock without affecting total stock
 */
export async function releaseStock(
  db: admin.firestore.Firestore,
  operations: StockLedgerOperation[],
): Promise<void> {
  if (!validateStockOperations(operations)) {
    throw new Error("Invalid stock operations");
  }

  const movementRefs = operations.map((operation) =>
    getStockMovementDocRef(
      db,
      operation,
      InventoryMovementType.RESERVATION_RELEASED,
    ),
  );

  await db.runTransaction(async (transaction) => {
    const movementDocs = await Promise.all(
      movementRefs.map((ref) => transaction.get(ref)),
    );
    const pendingOperations = operations.filter(
      (_, index) => !movementDocs[index].exists,
    );

    if (pendingOperations.length === 0) {
      return;
    }

    // Consolidate operations for the same product
    const consolidatedOperations =
      consolidateStockOperations(pendingOperations);
    const stockRefs = consolidatedOperations.map((op) =>
      getStockDocRef(db, op.channelId, op.warehouseId, op.productId),
    );

    // Read all stock documents first
    const stockDocs = await Promise.all(
      stockRefs.map((ref) => transaction.get(ref)),
    );

    // Validate and prepare updates
    for (let i = 0; i < consolidatedOperations.length; i++) {
      const operation = consolidatedOperations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      if (!stockDoc.exists) {
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
        allocated: admin.firestore.FieldValue.increment(-operation.quantity),
        updatedAt: nowTs(),
        updatedBy: SYSTEM_USER,
      });
    }

    for (const operation of pendingOperations) {
      const movementRef = getStockMovementDocRef(
        db,
        operation,
        InventoryMovementType.RESERVATION_RELEASED,
      );
      const reservationRef = getStockReservationDocRef(db, operation);

      updateReservationForMovement(
        transaction,
        reservationRef,
        InventoryMovementType.RESERVATION_RELEASED,
        operation.quantity,
      );
      transaction.set(
        movementRef,
        createInventoryMovement({
          id: movementRef.id,
          movementType: InventoryMovementType.RESERVATION_RELEASED,
          operation,
          reservationId: reservationRef.id,
        }),
      );
    }
  });
}

/**
 * Set initial stock for a product in a warehouse (Admin Firestore version)
 * This is typically used by admin to initialize or adjust stock levels
 */
export async function setStock(
  db: admin.firestore.Firestore,
  channelId: string,
  warehouseId: string,
  productId: string,
  totalStock: number,
): Promise<void> {
  const stockRef = getStockDocRef(db, channelId, warehouseId, productId);
  const movementRef = db
    .collection(
      `channels/${channelId}/warehouses/${warehouseId}/inventoryMovements`,
    )
    .doc() as admin.firestore.DocumentReference<InventoryMovement>;

  await db.runTransaction(async (transaction) => {
    const stockDoc = await transaction.get(stockRef);
    const currentTotal = stockDoc.exists ? (stockDoc.data() as Stock).total : 0;
    const totalDelta = totalStock - currentTotal;

    if (!stockDoc.exists) {
      // Create new stock document
      const newStock: Stock = {
        id: productId,
        name: `Stock for ${productId}`,
        total: totalStock,
        allocated: 0,
        updatedAt: nowTs(),
        createdAt: nowTs(),
        createdBy: ADMIN_USER,
        updatedBy: ADMIN_USER,
        active: true,
      };
      transaction.set(stockRef, newStock);
    } else {
      // Update existing stock, keeping allocated unchanged
      transaction.update(stockRef, {
        total: totalStock,
        updatedAt: nowTs(),
        updatedBy: ADMIN_USER,
      });
    }

    if (totalDelta !== 0) {
      transaction.set(
        movementRef,
        createInventoryMovement({
          id: movementRef.id,
          movementType: InventoryMovementType.STOCK_ADJUSTED,
          operation: {
            channelId,
            productId,
            quantity: totalDelta,
            warehouseId,
          },
        }),
      );
    }
  });
}

/**
 * Get a product from Firestore
 */
export async function getProduct(
  db: admin.firestore.Firestore,
  channelId: string,
  productId: string,
): Promise<Product | null> {
  const productDoc = await db
    .doc(`channels/${channelId}/products/${productId}`)
    .get();
  if (!productDoc.exists) {
    return null;
  }
  return productDoc.data() as Product;
}

/**
 * Get all attributes for a channel
 */
export async function getAttributes(
  db: admin.firestore.Firestore,
  channelId: string,
): Promise<Attribute[]> {
  const attributesSnapshot = await db
    .collection(`channels/${channelId}/attributes`)
    .get();
  const attributes: Attribute[] = [];

  attributesSnapshot.forEach((doc) => {
    attributes.push(doc.data() as Attribute);
  });

  return attributes;
}

/**
 * Get attribute stock document reference
 */
export function getAttributeStockDocRef(
  db: admin.firestore.Firestore,
  channelId: string,
  warehouseId: string,
  attributeId: string,
  optionValue: string,
): admin.firestore.DocumentReference<AttributeStock> {
  const stockId = getAttributeStockId(attributeId, optionValue);
  return db.doc(
    `channels/${channelId}/warehouses/${warehouseId}/attributeStock/${stockId}`,
  ) as admin.firestore.DocumentReference<AttributeStock>;
}

/**
 * Reserve attribute stock for order items
 */
export async function reserveAttributeStock(
  db: admin.firestore.Firestore,
  operations: AttributeStockLedgerOperation[],
): Promise<void> {
  const validatedOperations = validateAttributeStockOperations(operations);
  const movementRefs = validatedOperations.map((operation) =>
    getAttributeStockMovementDocRef(
      db,
      operation,
      InventoryMovementType.RESERVATION_CREATED,
    ),
  );

  await db.runTransaction(async (transaction) => {
    const movementDocs = await Promise.all(
      movementRefs.map((ref) => transaction.get(ref)),
    );
    const pendingOperations = validatedOperations.filter(
      (_, index) => !movementDocs[index].exists,
    );

    if (pendingOperations.length === 0) {
      return;
    }

    const consolidatedOperations =
      consolidateAttributeStockOperations(pendingOperations);
    const stockRefs = consolidatedOperations.map((op) =>
      getAttributeStockDocRef(
        db,
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

    const configuredStockKeys = new Set<string>();

    for (let i = 0; i < consolidatedOperations.length; i++) {
      const operation = consolidatedOperations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      const currentStock = stockDoc.exists
        ? (stockDoc.data() as AttributeStock)
        : null;

      if (!currentStock) {
        continue;
      }

      configuredStockKeys.add(getAttributeStockConfigKey(operation));

      transaction.update(stockRef, {
        allocated: admin.firestore.FieldValue.increment(operation.quantity),
        updatedAt: nowTs(),
        updatedBy: SYSTEM_USER,
      });
    }

    const reservableOperations = pendingOperations.filter((operation) =>
      configuredStockKeys.has(getAttributeStockConfigKey(operation)),
    );

    for (const operation of reservableOperations) {
      const movementRef = getAttributeStockMovementDocRef(
        db,
        operation,
        InventoryMovementType.RESERVATION_CREATED,
      );
      const reservationRef = getAttributeStockReservationDocRef(db, operation);

      transaction.set(
        reservationRef,
        createAttributeInventoryReservation(reservationRef, operation),
      );
      transaction.set(
        movementRef,
        createAttributeInventoryMovement({
          id: movementRef.id,
          movementType: InventoryMovementType.RESERVATION_CREATED,
          operation,
          reservationId: reservationRef.id,
        }),
      );
    }
  });
}

/**
 * Deduct attribute stock when order is fulfilled
 */
export async function deductAttributeStock(
  db: admin.firestore.Firestore,
  operations: AttributeStockLedgerOperation[],
): Promise<void> {
  const validatedOperations = validateAttributeStockOperations(operations);
  const movementRefs = validatedOperations.map((operation) =>
    getAttributeStockMovementDocRef(
      db,
      operation,
      InventoryMovementType.RESERVATION_CONSUMED,
    ),
  );

  await db.runTransaction(async (transaction) => {
    const movementDocs = await Promise.all(
      movementRefs.map((ref) => transaction.get(ref)),
    );
    const pendingOperations = validatedOperations.filter(
      (_, index) => !movementDocs[index].exists,
    );

    if (pendingOperations.length === 0) {
      return;
    }

    const consolidatedOperations =
      consolidateAttributeStockOperations(pendingOperations);
    const stockRefs = consolidatedOperations.map((op) =>
      getAttributeStockDocRef(
        db,
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
    for (let i = 0; i < consolidatedOperations.length; i++) {
      const operation = consolidatedOperations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      if (!stockDoc.exists) {
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
        total: admin.firestore.FieldValue.increment(-operation.quantity),
        allocated: admin.firestore.FieldValue.increment(-operation.quantity),
        updatedAt: nowTs(),
        updatedBy: SYSTEM_USER,
      });
    }

    for (const operation of pendingOperations) {
      const movementRef = getAttributeStockMovementDocRef(
        db,
        operation,
        InventoryMovementType.RESERVATION_CONSUMED,
      );
      const reservationRef = getAttributeStockReservationDocRef(db, operation);

      updateReservationForMovement(
        transaction,
        reservationRef,
        InventoryMovementType.RESERVATION_CONSUMED,
        operation.quantity,
      );
      transaction.set(
        movementRef,
        createAttributeInventoryMovement({
          id: movementRef.id,
          movementType: InventoryMovementType.RESERVATION_CONSUMED,
          operation,
          reservationId: reservationRef.id,
        }),
      );
    }
  });
}

export async function assertAttributeStockReservationAvailable(
  db: admin.firestore.Firestore,
  operations: AttributeStockLedgerOperation[],
): Promise<void> {
  const validatedOperations = validateAttributeStockOperations(operations);

  if (validatedOperations.length === 0) {
    return;
  }

  const consolidatedOperations =
    consolidateAttributeStockOperations(validatedOperations);
  const stockRefs = consolidatedOperations.map((op) =>
    getAttributeStockDocRef(
      db,
      op.channelId,
      op.warehouseId,
      op.attributeId,
      op.attributeOptionValue,
    ),
  );
  const stockDocs = await Promise.all(stockRefs.map((ref) => ref.get()));

  for (let i = 0; i < consolidatedOperations.length; i++) {
    const operation = consolidatedOperations[i];
    const stockDoc = stockDocs[i];
    const currentStock = stockDoc.exists
      ? (stockDoc.data() as AttributeStock)
      : null;

    assertAttributeStockOperationAvailable({
      operation,
      stock: currentStock,
    });
  }
}

/**
 * Release attribute stock when order is cancelled
 */
export async function releaseAttributeStock(
  db: admin.firestore.Firestore,
  operations: AttributeStockLedgerOperation[],
): Promise<void> {
  const validatedOperations = validateAttributeStockOperations(operations);
  const movementRefs = validatedOperations.map((operation) =>
    getAttributeStockMovementDocRef(
      db,
      operation,
      InventoryMovementType.RESERVATION_RELEASED,
    ),
  );

  await db.runTransaction(async (transaction) => {
    const movementDocs = await Promise.all(
      movementRefs.map((ref) => transaction.get(ref)),
    );
    const pendingOperations = validatedOperations.filter(
      (_, index) => !movementDocs[index].exists,
    );

    if (pendingOperations.length === 0) {
      return;
    }

    const consolidatedOperations =
      consolidateAttributeStockOperations(pendingOperations);
    const stockRefs = consolidatedOperations.map((op) =>
      getAttributeStockDocRef(
        db,
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
    for (let i = 0; i < consolidatedOperations.length; i++) {
      const operation = consolidatedOperations[i];
      const stockDoc = stockDocs[i];
      const stockRef = stockRefs[i];

      if (!stockDoc.exists) {
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
        allocated: admin.firestore.FieldValue.increment(-operation.quantity),
        updatedAt: nowTs(),
        updatedBy: SYSTEM_USER,
      });
    }

    for (const operation of pendingOperations) {
      const movementRef = getAttributeStockMovementDocRef(
        db,
        operation,
        InventoryMovementType.RESERVATION_RELEASED,
      );
      const reservationRef = getAttributeStockReservationDocRef(db, operation);

      updateReservationForMovement(
        transaction,
        reservationRef,
        InventoryMovementType.RESERVATION_RELEASED,
        operation.quantity,
      );
      transaction.set(
        movementRef,
        createAttributeInventoryMovement({
          id: movementRef.id,
          movementType: InventoryMovementType.RESERVATION_RELEASED,
          operation,
          reservationId: reservationRef.id,
        }),
      );
    }
  });
}

// Helper functions for attribute stock operations
function validateAttributeStockOperations(
  operations: AttributeStockLedgerOperation[],
): AttributeStockLedgerOperation[] {
  if (!operations.length) {
    throw new Error("No stock operations provided");
  }

  return operations.filter((op) => {
    if (
      !op.channelId ||
      !op.warehouseId ||
      !op.attributeId ||
      !op.attributeOptionValue
    ) {
      console.warn("Invalid attribute stock operation:", op);
      return false;
    }
    if (op.quantity <= 0) {
      console.warn("Invalid quantity in attribute stock operation:", op);
      return false;
    }
    return true;
  });
}

function consolidateAttributeStockOperations(
  operations: AttributeStockLedgerOperation[],
): AttributeStockLedgerOperation[] {
  const consolidated = new Map<string, AttributeStockLedgerOperation>();

  for (const operation of operations) {
    const key = `${operation.channelId}-${operation.warehouseId}-${operation.attributeId}-${operation.attributeOptionValue}`;

    if (consolidated.has(key)) {
      const existing = consolidated.get(key)!;
      existing.quantity += operation.quantity;
    } else {
      consolidated.set(key, { ...operation });
    }
  }

  return Array.from(consolidated.values());
}
