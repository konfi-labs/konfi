import { Timestamp } from "firebase/firestore";
import { Base } from "./base";

export interface Stock extends Base {
  total: number; // Physical quantity in warehouse
  allocated: number; // Reserved for open/unfulfilled orders
  updatedAt: Timestamp;
}

// Attribute-based stock for MATRIX products
export interface AttributeStock extends Base {
  attributeId: string;
  attributeOptionValue: string; // The specific option value (e.g., "A4", "White", etc.)
  total: number;
  allocated: number;
  updatedAt: Timestamp;
}

export interface StockCreateForm extends Omit<
  Stock,
  "id" | "createdAt" | "updatedAt" | "updatedBy" | "active"
> {
  productId: string;
  warehouseId: string;
  channelId: string;
}

export interface AttributeStockCreateForm extends Omit<
  AttributeStock,
  "id" | "createdAt" | "updatedAt" | "updatedBy" | "active"
> {
  warehouseId: string;
  channelId: string;
}

export interface StockUpdateForm extends Omit<
  Stock,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "active"
> {
  productId: string;
  warehouseId: string;
  channelId: string;
}

export interface AttributeStockUpdateForm extends Omit<
  AttributeStock,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "active"
> {
  warehouseId: string;
  channelId: string;
}

// Computed property - not stored in database
export interface StockWithAvailable extends Stock {
  available: number; // Computed as total - allocated
}

// Computed property for attribute stock
export interface AttributeStockWithAvailable extends AttributeStock {
  available: number; // Computed as total - allocated
}

// Stock operation request
export interface StockOperation {
  channelId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
}

// Attribute stock operation request
export interface AttributeStockOperation {
  channelId: string;
  warehouseId: string;
  attributeId: string;
  attributeOptionValue: string;
  quantity: number;
}

// Stock reservation for order items
export interface StockReservation extends StockOperation {
  orderId: string;
  itemId: string;
}

// Attribute stock reservation for order items
export interface AttributeStockReservation extends AttributeStockOperation {
  orderId: string;
  itemId: string;
}
