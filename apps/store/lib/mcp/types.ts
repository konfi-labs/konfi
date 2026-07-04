import "server-only";

import type { Attribute, Category, Order, Product } from "@konfi/types";

export const STORE_MCP_SCOPES = [
  "store:context",
  "store:catalog:read",
  "store:orders:read",
] as const;

export type StoreMcpScope = (typeof STORE_MCP_SCOPES)[number];

export type StoreMcpActor = {
  displayName?: string;
  email?: string;
  kind: "customer";
  signInProvider?: string;
  uid: string;
};

export interface StoreMcpAuthContext {
  actor: StoreMcpActor;
  permissions: {
    scopes: StoreMcpScope[];
  };
  request: {
    requestId: string;
    source: "store-mcp";
  };
  token: {
    clientId?: string;
    expiresAtMs: number;
    jti?: string;
    resource?: string;
    scopes: StoreMcpScope[];
  };
}

export interface PublicProductRecord {
  product: Product;
  sourceChannelId: string;
  targetChannelId: string;
}

export interface StoreMcpReaders {
  getCustomerOrder(input: {
    customerId: string;
    orderId: string;
  }): Promise<Order | null>;
  getProduct(input: {
    productId?: string;
    slug?: string;
  }): Promise<PublicProductRecord | null>;
  listAttributes(attributeIds: readonly string[]): Promise<Attribute[]>;
  listCategories(input: { limit: number }): Promise<Category[]>;
  listCustomerOrders(input: {
    customerId: string;
    limit: number;
  }): Promise<Order[]>;
  searchProducts(input: {
    limit: number;
    query?: string;
  }): Promise<PublicProductRecord[]>;
}

export interface StoreMcpRuntime {
  auth: StoreMcpAuthContext;
  readers: StoreMcpReaders;
}
