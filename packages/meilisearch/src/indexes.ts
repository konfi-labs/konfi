"use server";

import { FormattedOrderItem, isNestedCustomer, SearchType } from "@konfi/types";
import { Index } from "meilisearch";
import { getClient } from "./client";
import {
  AppSearchResult,
  getOrderSearchAttributes,
  IndexManager,
  MeilisearchConfig,
  OrdersSearchField,
  PaginatedSearchResult,
  SearchOptions,
} from "./types";

// Index cache
const indexCache: IndexManager = {
  customers: null,
  orders: null,
  products: null,
};

async function getIndex(
  indexName: string,
  config?: MeilisearchConfig,
): Promise<Index<Record<string, unknown>> | null> {
  const client = await getClient(config);
  if (!client) {
    return null;
  }

  const cacheKey = indexName as keyof IndexManager;
  if (indexCache[cacheKey] === null) {
    try {
      indexCache[cacheKey] = await client.getIndex(indexName);
    } catch (error) {
      console.error(`Failed to get index ${indexName}:`, error);
      return null;
    }
  }

  return indexCache[cacheKey];
}

export interface AppSearchScope {
  channelIds?: readonly string[];
  tenantId?: string;
}

function formatMeiliFilterValue(value: string): string {
  return JSON.stringify(value);
}

function fieldEqualsFilter(field: string, value: string): string {
  return `${field} = ${formatMeiliFilterValue(value)}`;
}

function tenantFilter(tenantId: string | undefined): string | undefined {
  return tenantId ? fieldEqualsFilter("tenantId", tenantId) : undefined;
}

function channelFilter(channelId: string): string {
  return fieldEqualsFilter("channelId", channelId);
}

function channelScopeFilter(
  channelIds: readonly string[] | undefined,
): string | undefined {
  if (!channelIds) {
    return undefined;
  }

  const uniqueChannelIds = [
    ...new Set(
      channelIds
        .map((channelId) => channelId.trim())
        .filter((channelId) => channelId.length > 0),
    ),
  ];

  if (uniqueChannelIds.length === 0) {
    return "__no_authorized_channels__ = true";
  }

  return uniqueChannelIds.map(channelFilter).join(" OR ");
}

function combineFilters(
  ...filters: Array<string | undefined>
): string[] | undefined {
  const activeFilters = filters.filter((filter): filter is string =>
    Boolean(filter),
  );

  if (activeFilters.length === 0) {
    return undefined;
  }

  return [activeFilters.map((filter) => `(${filter})`).join(" AND ")];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readOrderItems(value: unknown): FormattedOrderItem[] {
  return Array.isArray(value)
    ? value.filter((item): item is FormattedOrderItem =>
        Boolean(item && typeof item === "object"),
      )
    : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function searchCustomersIndex(
  query: string,
  page: number = 0,
  hitsPerPage: number = 30,
  config?: MeilisearchConfig,
  tenantId?: string,
): Promise<string[]> {
  const index = await getIndex("customers", config);
  if (!index) {
    console.error("MeiliSearch customers index is not available.");
    return [];
  }

  try {
    const searchResults = await index.search(query, {
      attributesToRetrieve: ["_firestore_id"],
      filter: combineFilters(tenantFilter(tenantId)),
      limit: hitsPerPage,
      offset: page * hitsPerPage,
    });
    return searchResults.hits.flatMap((hit) => {
      const id = readString(hit._firestore_id);
      return id ? [id] : [];
    });
  } catch (error) {
    console.error("Error searching customers index:", error);
    return [];
  }
}

export async function searchOrdersIndex(
  query: string,
  channelId: string,
  page: number = 0,
  hitsPerPage: number = 30,
  searchFields: OrdersSearchField[] = [],
  config?: MeilisearchConfig,
  tenantId?: string,
): Promise<PaginatedSearchResult> {
  const index = await getIndex("orders", config);
  if (!index) {
    console.error("MeiliSearch orders index is not available.");
    return { results: [], totalHits: 0 };
  }

  try {
    const searchResults = await index.search(query, {
      attributesToRetrieve: ["_firestore_id"],
      attributesToSearchOn: getOrderSearchAttributes(searchFields),
      filter: combineFilters(channelFilter(channelId), tenantFilter(tenantId)),
      hitsPerPage,
      page: page + 1,
    });

    const results = searchResults.hits.flatMap((hit) => {
      const id = readString(hit._firestore_id);
      return id ? [id] : [];
    });
    return {
      results,
      totalHits: searchResults.totalHits || searchResults.hits.length,
    };
  } catch (error) {
    console.error("Error searching orders index:", error);
    return { results: [], totalHits: 0 };
  }
}

export async function searchProductsIndex(
  query: string,
  channelId: string,
  config?: MeilisearchConfig,
  tenantId?: string,
): Promise<string[]> {
  const index = await getIndex("products", config);
  if (!index) {
    console.error("MeiliSearch products index is not available.");
    return [];
  }

  try {
    const searchResults = await index.search(query, {
      attributesToRetrieve: ["_firestore_id"],
      filter: combineFilters(channelFilter(channelId), tenantFilter(tenantId)),
    });
    return searchResults.hits.flatMap((hit) => {
      const id = readString(hit._firestore_id);
      return id ? [id] : [];
    });
  } catch (error) {
    console.error("Error searching products index:", error);
    return [];
  }
}

export async function searchApp(
  query: string,
  config?: MeilisearchConfig,
  scope: AppSearchScope = {},
): Promise<AppSearchResult[]> {
  const client = await getClient(config);
  if (!client) {
    return [];
  }

  try {
    const response = await client.multiSearch({
      queries: [
        {
          indexUid: "customers",
          q: query,
          attributesToRetrieve: ["_firestore_id", "name", "email"],
          filter: combineFilters(tenantFilter(scope.tenantId)),
          limit: 3,
        },
        {
          indexUid: "orders",
          q: query,
          attributesToRetrieve: [
            "_firestore_id",
            "number",
            "channelId",
            "customer",
            "items",
          ],
          filter: combineFilters(
            tenantFilter(scope.tenantId),
            channelScopeFilter(scope.channelIds),
          ),
          limit: 5,
        },
        {
          indexUid: "products",
          q: query,
          attributesToRetrieve: [
            "_firestore_id",
            "name",
            "channelId",
            "spec.images",
          ],
          filter: combineFilters(
            tenantFilter(scope.tenantId),
            channelScopeFilter(scope.channelIds),
          ),
          limit: 3,
        },
      ],
    });

    const customersResults = response.results[0].hits.map((hit) => ({
      id: readString(hit._firestore_id),
      name: readString(hit.name),
      type: SearchType.CUSTOMERS,
      email: readString(hit.email),
    }));

    const ordersResults = response.results[1].hits.map((hit) => ({
      id: readString(hit._firestore_id),
      name: readString(hit.number),
      type: SearchType.ORDERS,
      channelId: readString(hit.channelId),
      customer: isNestedCustomer(hit.customer)
        ? hit.customer.name
        : readString(hit.customer),
      items: readOrderItems(hit.items),
    }));

    const productsResults = response.results[2].hits.map((hit) => ({
      id: readString(hit._firestore_id),
      name: readString(hit.name),
      type: SearchType.PRODUCTS,
      channelId: readString(hit.channelId),
      images: readStringArray(readRecord(hit.spec).images),
    }));

    return [...customersResults, ...ordersResults, ...productsResults];
  } catch (error) {
    console.error("Error in multi-search:", error);
    return [];
  }
}

export async function genericSearch<T = Record<string, unknown>>(
  indexName: string,
  query: string,
  options: SearchOptions = {},
  config?: MeilisearchConfig,
): Promise<T[]> {
  const client = await getClient(config);
  if (!client) {
    return [];
  }

  const index = await getIndex(indexName, config);
  if (!index) {
    console.error(`MeiliSearch index ${indexName} is not available.`);
    return [];
  }

  try {
    const searchResults = await index.search(query, options);
    return searchResults.hits as T[];
  } catch (error) {
    console.error(`Error searching ${indexName} index:`, error);
    return [];
  }
}

export async function resetIndexCache(): Promise<void> {
  indexCache.customers = null;
  indexCache.orders = null;
  indexCache.products = null;
}
