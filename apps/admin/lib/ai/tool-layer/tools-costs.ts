import "server-only";

import { normalizeLimit, requireScopes } from "./permissions";
import { countSummary } from "./summaries";
import { auditToolCall } from "./audit";
import type { ToolLayerRuntime } from "./types";
import {
  costReadNotes,
  optionalIsoDate,
  optionalNonEmpty,
  requireNonEmpty,
} from "./tool-helpers";
import type {
  GetAttributeOptionCostsInput,
  GetProductCostsInput,
  ListProductCostMappingsInput,
  ProductCostMappingsOutput,
  ProductCostsOutput,
  SearchCostEvidenceInput,
  SearchMaterialCostsInput,
  SearchMaterialCostsOutput,
} from "./tool-inputs";

export async function getProductCosts(
  runtime: ToolLayerRuntime,
  input: GetProductCostsInput,
): Promise<ProductCostsOutput> {
  const productId = requireNonEmpty(input.productId, "productId");
  const attributeId = optionalNonEmpty(input.attributeId, "attributeId");
  const optionValue = optionalNonEmpty(input.optionValue, "optionValue");
  const dateFrom = optionalIsoDate(input.dateFrom, "dateFrom");
  const dateTo = optionalIsoDate(input.dateTo, "dateTo");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 25,
    maximumLimit: 100,
  });

  return auditToolCall({
    inputSummary: {
      attributeId: attributeId ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      optionValue: optionValue ?? null,
      productId,
      limit,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["costs:read"]);

      const costs = await runtime.readers.getProductCosts({
        ...(attributeId ? { attributeId } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        limit,
        ...(optionValue ? { optionValue } : {}),
        productId,
      });

      return {
        costs,
        notes: costReadNotes(),
        totalReturned: costs.length,
      };
    },
    outputSummary: (result) => countSummary(result.totalReturned),
    requestedScopes: ["costs:read"],
    runtime,
    toolName: "getProductCosts",
  });
}

export async function listProductCostMappings(
  runtime: ToolLayerRuntime,
  input: ListProductCostMappingsInput,
): Promise<ProductCostMappingsOutput> {
  const productId = optionalNonEmpty(input.productId, "productId");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 25,
    maximumLimit: 100,
  });

  return auditToolCall({
    inputSummary: {
      productId: productId ?? null,
      limit,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["costs:read"]);

      const mappings = await runtime.readers.listProductCostMappings({
        limit,
        ...(productId ? { productId } : {}),
      });

      return {
        mappings,
        notes: costReadNotes(),
        totalReturned: mappings.length,
      };
    },
    outputSummary: (result) => countSummary(result.totalReturned),
    requestedScopes: ["costs:read"],
    runtime,
    toolName: "listProductCostMappings",
  });
}

export async function getAttributeOptionCosts(
  runtime: ToolLayerRuntime,
  input: GetAttributeOptionCostsInput,
): Promise<ProductCostsOutput> {
  const attributeId = requireNonEmpty(input.attributeId, "attributeId");
  const optionValue = requireNonEmpty(input.optionValue, "optionValue");
  const productId = optionalNonEmpty(input.productId, "productId");
  const dateFrom = optionalIsoDate(input.dateFrom, "dateFrom");
  const dateTo = optionalIsoDate(input.dateTo, "dateTo");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 25,
    maximumLimit: 100,
  });

  return auditToolCall({
    inputSummary: {
      attributeId,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      optionValue,
      productId: productId ?? null,
      limit,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["costs:read"]);

      const costs = await runtime.readers.getAttributeOptionCosts({
        attributeId,
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        limit,
        optionValue,
        ...(productId ? { productId } : {}),
      });

      return {
        costs,
        notes: costReadNotes(),
        totalReturned: costs.length,
      };
    },
    outputSummary: (result) => countSummary(result.totalReturned),
    requestedScopes: ["costs:read"],
    runtime,
    toolName: "getAttributeOptionCosts",
  });
}

export async function searchCostEvidence(
  runtime: ToolLayerRuntime,
  input: SearchCostEvidenceInput,
): Promise<ProductCostsOutput> {
  const query = optionalNonEmpty(input.query, "query");
  const productId = optionalNonEmpty(input.productId, "productId");
  const dateFrom = optionalIsoDate(input.dateFrom, "dateFrom");
  const dateTo = optionalIsoDate(input.dateTo, "dateTo");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 25,
    maximumLimit: 100,
  });

  return auditToolCall({
    inputSummary: {
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      productId: productId ?? null,
      query: query ?? null,
      limit,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["costs:read"]);

      const costs = await runtime.readers.searchCostEvidence({
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        limit,
        ...(productId ? { productId } : {}),
        ...(query ? { query } : {}),
      });

      return {
        costs,
        notes: costReadNotes(),
        totalReturned: costs.length,
      };
    },
    outputSummary: (result) => countSummary(result.totalReturned),
    requestedScopes: ["costs:read"],
    runtime,
    toolName: "searchCostEvidence",
  });
}

export async function searchMaterialCostsByQuery(
  runtime: ToolLayerRuntime,
  input: SearchMaterialCostsInput,
): Promise<SearchMaterialCostsOutput> {
  const query = requireNonEmpty(input.query, "query");
  const productId = optionalNonEmpty(input.productId, "productId");
  const dateFrom = optionalIsoDate(input.dateFrom, "dateFrom");
  const dateTo = optionalIsoDate(input.dateTo, "dateTo");
  const limit = normalizeLimit(input.limit, {
    defaultLimit: 10,
    maximumLimit: 50,
  });

  return auditToolCall({
    inputSummary: {
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      productId: productId ?? null,
      query,
      limit,
    },
    operation: async () => {
      requireScopes(runtime.auth, ["costs:read"]);

      const result = await runtime.readers.searchMaterialCostsByQuery({
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        limit,
        ...(productId ? { productId } : {}),
        query,
      });

      return {
        ...result,
        notes: costReadNotes(),
      };
    },
    outputSummary: (result) => countSummary(result.totalReturned),
    requestedScopes: ["costs:read"],
    runtime,
    toolName: "searchMaterialCostsByQuery",
  });
}
