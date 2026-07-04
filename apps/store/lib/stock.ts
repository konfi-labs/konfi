import { getStock } from "@konfi/firebase";
import { firestore } from "@/lib/firebase/clientApp";

/**
 * Check if sufficient stock is available for a product
 */
export async function checkStockAvailability(
  channelId: string,
  warehouseId: string,
  productId: string,
  requestedQuantity: number,
): Promise<{ available: boolean; availableQuantity: number }> {
  try {
    const stock = await getStock(firestore, channelId, warehouseId, productId);

    if (!stock) {
      // No stock record - assume unavailable
      return {
        available: false,
        availableQuantity: 0,
      };
    }

    const availableQuantity = stock.available;

    return {
      available: availableQuantity >= requestedQuantity,
      availableQuantity,
    };
  } catch (error) {
    console.error("Error checking stock availability:", error);
    return {
      available: false,
      availableQuantity: 0,
    };
  }
}

/**
 * Get the main warehouse ID for a channel
 */
export async function getMainWarehouseId(
  channelId: string,
): Promise<string | null> {
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const channelDoc = await getDoc(doc(firestore, `channels/${channelId}`));

    if (!channelDoc.exists()) {
      return null;
    }

    const channelData = channelDoc.data();
    if (!channelData?.warehouses || channelData.warehouses.length === 0) {
      return null;
    }

    return channelData.warehouses[0]; // Return first warehouse
  } catch (error) {
    console.error("Error getting main warehouse:", error);
    return null;
  }
}

/**
 * Validate stock for multiple products (for cart validation)
 */
export async function validateCartStock(
  channelId: string,
  items: Array<{ productId: string; quantity: number }>,
): Promise<{
  valid: boolean;
  insufficientItems: Array<{
    productId: string;
    requested: number;
    available: number;
  }>;
}> {
  try {
    const warehouseId = await getMainWarehouseId(channelId);
    if (!warehouseId) {
      return {
        valid: false,
        insufficientItems: items.map((item) => ({
          productId: item.productId,
          requested: item.quantity,
          available: 0,
        })),
      };
    }

    const insufficientItems: Array<{
      productId: string;
      requested: number;
      available: number;
    }> = [];

    for (const item of items) {
      const stockCheck = await checkStockAvailability(
        channelId,
        warehouseId,
        item.productId,
        item.quantity,
      );

      if (!stockCheck.available) {
        insufficientItems.push({
          productId: item.productId,
          requested: item.quantity,
          available: stockCheck.availableQuantity,
        });
      }
    }

    return {
      valid: insufficientItems.length === 0,
      insufficientItems,
    };
  } catch (error) {
    console.error("Error validating cart stock:", error);
    return {
      valid: false,
      insufficientItems: items.map((item) => ({
        productId: item.productId,
        requested: item.quantity,
        available: 0,
      })),
    };
  }
}
