import "server-only";

import { ToolLayerError } from "./errors";
import {
  normalizeLimit,
  requireChannelAccess,
  requireScopes,
} from "./permissions";
import {
  countSummary,
  customerSearchResult,
  summarizeCustomer,
  summarizeOrder,
} from "./summaries";
import { auditToolCall } from "./audit";
import type {
  CustomerToolSummary,
  OrderToolSummary,
  SearchResultSummary,
  ToolLayerRuntime,
} from "./types";
import { requireNonEmpty, resolveToolChannel } from "./tool-helpers";
import type {
  GetCustomerInput,
  ListCustomerOrdersInput,
  SearchCustomersInput,
} from "./tool-inputs";

export async function searchCustomers(
  runtime: ToolLayerRuntime,
  input: SearchCustomersInput,
): Promise<SearchResultSummary[]> {
  const query = requireNonEmpty(input.query, "query");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });

  return auditToolCall({
    inputSummary: { limit, query },
    operation: async () => {
      requireScopes(runtime.auth, ["customers:read"]);

      const customerIds = await runtime.readers.searchCustomers({
        limit,
        query,
      });
      const customers = await Promise.all(
        customerIds.map((customerId) =>
          runtime.readers.getCustomer(customerId),
        ),
      );

      return customers.flatMap((customer) =>
        customer ? [customerSearchResult(customer)] : [],
      );
    },
    outputSummary: (result) => countSummary(result.length),
    requestedScopes: ["customers:read"],
    runtime,
    toolName: "searchCustomers",
  });
}

export async function getCustomer(
  runtime: ToolLayerRuntime,
  input: GetCustomerInput,
): Promise<CustomerToolSummary> {
  const customerId = requireNonEmpty(input.customerId, "customerId");

  return auditToolCall({
    inputSummary: { customerId },
    operation: async () => {
      requireScopes(runtime.auth, ["customers:read"]);

      const customer = await runtime.readers.getCustomer(customerId);
      if (!customer) {
        throw new ToolLayerError("not_found", "Customer not found.");
      }

      return summarizeCustomer(customer);
    },
    outputSummary: () => ({ found: true }),
    requestedScopes: ["customers:read"],
    runtime,
    toolName: "getCustomer",
  });
}

export async function listCustomerOrders(
  runtime: ToolLayerRuntime,
  input: ListCustomerOrdersInput,
): Promise<OrderToolSummary[]> {
  const customerId = requireNonEmpty(input.customerId, "customerId");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 25,
  });

  return auditToolCall({
    inputSummary: {
      channelId: input.channelId ?? null,
      channelName: input.channelName ?? null,
      customerId,
      limit,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["orders:read", "customers:read"]);
      const channelId = await resolveToolChannel(runtime, input);
      requireChannelAccess(runtime.auth, channelId);

      const orders = await runtime.readers.getCustomerOrders({
        channelId,
        customerId,
        limit,
      });
      return orders.map(summarizeOrder);
    },
    outputSummary: (result) => countSummary(result.length),
    requestedScopes: ["orders:read", "customers:read"],
    runtime,
    toolName: "listCustomerOrders",
  });
}
