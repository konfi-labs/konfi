import { Index, SearchResponse, MultiSearchResponse } from "meilisearch";
import { FormattedOrderItem, SearchType } from "@konfi/types";

export interface MeilisearchConfig {
  host: string;
  apiKey?: string;
  indexes: {
    customers?: string;
    orders?: string;
    products?: string;
    [key: string]: string | undefined;
  };
  defaultSearchOptions?: SearchOptions;
}

export type OrdersSearchField =
  | "contactName"
  | "contactPhone"
  | "customerName"
  | "shippingName"
  | "shippingCompany"
  | "billingCompany"
  | "billingName"
  | "billingNip"
  | "orderNumber"
  | "email"
  | "paymentDocumentId"
  | "proformaDocumentId"
  | "externalOrderId"
  | "externalBuyerLogin"
  | "specialNotes"
  | "totalPrice";

const orderSearchFieldAttributes: Record<OrdersSearchField, string[]> = {
  contactName: ["contact.name"],
  contactPhone: ["contact.phone"],
  customerName: ["customer.name"],
  shippingName: ["shipping.name"],
  shippingCompany: ["shipping.companyName"],
  billingCompany: ["billing.companyName"],
  billingName: ["billing.name"],
  billingNip: ["billing.nip"],
  orderNumber: ["number"],
  email: ["email", "contact.email"],
  paymentDocumentId: ["paymentDocumentId"],
  proformaDocumentId: ["proformaDocumentId"],
  externalOrderId: ["externalSource.externalOrderId"],
  externalBuyerLogin: ["externalSource.externalBuyerLogin"],
  specialNotes: ["specialNotes"],
  totalPrice: [],
};

export function getOrderSearchAttributes(
  searchFields: OrdersSearchField[] = [],
): string[] | undefined {
  if (searchFields.length === 0) {
    return undefined;
  }

  return [
    ...new Set(
      searchFields.flatMap((field) => orderSearchFieldAttributes[field]),
    ),
  ];
}

/**
 * Parse user input as a price and return the value in minor currency (cents).
 * Accepts "142", "142.00", "142,50", "1 234,56", etc.
 * Returns `undefined` if the input is not a valid price.
 */
export function parsePriceSearchInput(input: string): number | undefined {
  // Strip whitespace / thin-space thousand separators
  const cleaned = input.replace(/[\s\u00A0]/g, "");
  if (cleaned === "") return undefined;

  // Determine decimal separator: last comma or last dot
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;
  if (lastComma > lastDot) {
    // Comma is the decimal separator (e.g. "142,50" or "1.234,56")
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is the decimal separator or no decimal (e.g. "142.50" or "142")
    normalized = cleaned.replace(/,/g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return undefined;

  return Math.round(value * 100);
}

/**
 * Get text-searchable fields, filtering out numeric-only fields like totalPrice.
 */
export function getTextSearchFields(
  searchFields: OrdersSearchField[],
): OrdersSearchField[] {
  return searchFields.filter(
    (field) => orderSearchFieldAttributes[field].length > 0,
  );
}

export interface SearchOptions {
  attributesToRetrieve?: string[];
  attributesToSearchOn?: string[];
  hitsPerPage?: number;
  limit?: number;
  offset?: number;
  page?: number;
  filter?: string[];
  matchingStrategy?: "last" | "all" | "frequency";
  sort?: string[];
}

export interface SearchResult<T = Record<string, unknown>> {
  hits: T[];
  query: string;
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits?: number;
}

export interface MultiSearchQuery {
  indexUid: string;
  q: string;
  attributesToRetrieve?: string[];
  limit?: number;
  offset?: number;
  filter?: string[];
}

export interface MultiSearchResult {
  results: SearchResponse<Record<string, unknown>>[];
}

export interface PaginatedSearchResult {
  results: string[];
  totalHits: number;
}

export interface AppSearchResult {
  id: string;
  name: string;
  type: SearchType;
  channelId?: string;
  email?: string;
  customer?: string;
  images?: string[];
  items?: FormattedOrderItem[];
}

export interface IndexManager {
  customers: Index<Record<string, unknown>> | null;
  orders: Index<Record<string, unknown>> | null;
  products: Index<Record<string, unknown>> | null;
}
