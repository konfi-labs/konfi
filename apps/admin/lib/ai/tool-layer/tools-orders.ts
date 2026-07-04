import "server-only";

import { suggestOrderItemsFromCatalog } from "@/lib/ai/product-search/product-discovery";
import { ToolLayerError } from "./errors";
import {
  normalizeLimit,
  normalizePage,
  requireChannelAccess,
  requireScopes,
} from "./permissions";
import { orderSearchResult, summarizeOrder } from "./summaries";
import { auditToolCall } from "./audit";
import type {
  OrderToolSummary,
  SuggestOrderItemsOutput,
  ToolLayerRuntime,
} from "./types";
import {
  requireNonEmpty,
  resolveToolChannel,
  resolveToolTenantId,
} from "./tool-helpers";
import type {
  GetOrderByNumberInput,
  GetOrderInput,
  ListOrdersInput,
  ListOrdersOutput,
  SearchOrdersInput,
  SearchOrdersOutput,
  SuggestOrderItemsInput,
} from "./tool-inputs";

function parseExactOrderNumberQuery(query: string): number | null {
  const normalized = query.trim().replace(/^#/, "");

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const orderNumber = Number(normalized);

  return Number.isSafeInteger(orderNumber) && orderNumber > 0
    ? orderNumber
    : null;
}

function normalizeOrderNumber(orderNumber: number): number {
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) {
    throw new ToolLayerError(
      "validation_error",
      "orderNumber must be a positive integer.",
      {
        details: { orderNumber },
      },
    );
  }

  return orderNumber;
}

export async function searchOrders(
  runtime: ToolLayerRuntime,
  input: SearchOrdersInput,
): Promise<SearchOrdersOutput> {
  const query = requireNonEmpty(input.query, "query");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });
  const page = normalizePage(input.page);

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      page,
      query,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["orders:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const exactOrderNumber = parseExactOrderNumberQuery(query);
      if (exactOrderNumber !== null) {
        const order = await runtime.readers.getOrderByNumber({
          channelId,
          orderNumber: exactOrderNumber,
        });

        return {
          results: order ? [orderSearchResult(order)] : [],
          totalHits: order ? 1 : 0,
        };
      }

      const result = await runtime.readers.searchOrders({
        channelId,
        limit,
        page,
        query,
      });
      const orders = await runtime.readers.listOrdersByIds({
        channelId,
        orderIds: result.orderIds,
      });

      return {
        results: orders.map(orderSearchResult),
        totalHits: result.totalHits,
      };
    },
    outputSummary: (result) => ({
      count: result.results.length,
      totalHits: result.totalHits,
    }),
    requestedScopes: ["orders:read"],
    runtime,
    toolName: "searchOrders",
  });
}

export async function listOrders(
  runtime: ToolLayerRuntime,
  input: ListOrdersInput,
): Promise<ListOrdersOutput> {
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });
  const page = normalizePage(input.page);
  const offset = page * limit;

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      page,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["orders:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const orders = await runtime.readers.listOrders({
        channelId,
        limit,
        offset,
      });

      return {
        limit,
        ...(orders.length === limit ? { nextPage: page + 1 } : {}),
        page,
        results: orders.map(summarizeOrder),
        totalReturned: orders.length,
      };
    },
    outputSummary: (result) => ({
      count: result.results.length,
      nextPage: result.nextPage ?? null,
    }),
    requestedScopes: ["orders:read"],
    runtime,
    toolName: "listOrders",
  });
}

export async function getOrder(
  runtime: ToolLayerRuntime,
  input: GetOrderInput,
): Promise<OrderToolSummary> {
  const orderId = requireNonEmpty(input.orderId, "orderId");

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      orderId,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["orders:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const order = await runtime.readers.getOrder({ channelId, orderId });
      if (!order) {
        throw new ToolLayerError("not_found", "Order not found.");
      }

      return summarizeOrder(order);
    },
    outputSummary: () => ({ found: true }),
    requestedScopes: ["orders:read"],
    runtime,
    toolName: "getOrder",
  });
}

export async function getOrderByNumber(
  runtime: ToolLayerRuntime,
  input: GetOrderByNumberInput,
): Promise<OrderToolSummary> {
  const orderNumber = normalizeOrderNumber(input.orderNumber);

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      orderNumber,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["orders:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const order = await runtime.readers.getOrderByNumber({
        channelId,
        orderNumber,
      });
      if (!order) {
        throw new ToolLayerError("not_found", "Order not found.");
      }

      return summarizeOrder(order);
    },
    outputSummary: () => ({ found: true }),
    requestedScopes: ["orders:read"],
    runtime,
    toolName: "getOrderByNumber",
  });
}

export async function suggestOrderItems(
  runtime: ToolLayerRuntime,
  input: SuggestOrderItemsInput,
): Promise<SuggestOrderItemsOutput> {
  const query = requireNonEmpty(input.query, "query");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 20,
    maximumLimit: 25,
  });

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      limit,
      query,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["products:read", "pricing:explain"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const tenantId = await resolveToolTenantId(runtime, channelId);
      const attributes = await runtime.readers.listAttributes();
      const result = await suggestOrderItemsFromCatalog({
        attributes,
        channelId,
        limit,
        query,
        ...(tenantId ? { tenantId } : {}),
      });

      return {
        catalogCandidateCount: result.catalogCandidateCount,
        count: result.count,
        items: result.items,
        notes: result.notes,
        totalAvailable: result.totalAvailable,
      };
    },
    outputSummary: (result) => ({
      catalogCandidateCount: result.catalogCandidateCount,
      count: result.count,
      totalAvailable: result.totalAvailable,
    }),
    requestedScopes: ["products:read", "pricing:explain"],
    runtime,
    toolName: "suggestOrderItems",
  });
}
