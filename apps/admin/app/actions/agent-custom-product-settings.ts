"use server";

import {
  getTenantAdminChannelAccessContext,
  getTenantAdminScopeTenantId,
  requireAdminAuth,
  tenantAdminChannelAccessAllows,
} from "@/actions/auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { PriceTypeEnum, Product } from "@konfi/types";

export interface AgentCustomProductCandidateProduct {
  allowCustomPrice: boolean;
  channelId: string;
  id: string;
  name: string;
  priceType: PriceTypeEnum;
}

export interface AgentCustomProductSearchCandidate {
  channelId: string;
  product: AgentCustomProductCandidateProduct;
}

export type AgentCustomProductSearchResult =
  | { ok: true; products: AgentCustomProductSearchCandidate[] }
  | { ok: false; error: string; products: [] };

const SEARCH_SCAN_LIMIT = 1000;

function getDb() {
  return getAdminDb();
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .trim();
}

function getSourceChannelId(data: Product, refPath: string): string {
  if (data.channelId?.trim()) {
    return data.channelId;
  }

  const match = refPath.match(/^channels\/([^/]+)\/products\//);
  return match?.[1] ?? "";
}

function productSearchFields(product: Product): string[] {
  return [
    product.id,
    product.name,
    product.description,
    product.category?.name,
    product.seo?.title,
    product.seo?.description,
    product.specialNotes,
    ...(product.keywords ?? []),
  ]
    .map(normalizeSearchText)
    .filter(Boolean);
}

function scoreProduct(query: string, product: Product): number {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = normalizedQuery
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  const fields = productSearchFields(product);

  let score = 0;
  for (const field of fields) {
    if (field === normalizedQuery) {
      score += 100;
    } else if (field.includes(normalizedQuery)) {
      score += 50;
    }

    for (const token of queryTokens) {
      if (field.split(/[^a-z0-9]+/).includes(token)) {
        score += 15;
      } else if (field.includes(token)) {
        score += 5;
      }
    }
  }

  return score;
}

function toClientCandidateProduct({
  channelId,
  product,
}: {
  channelId: string;
  product: Product;
}): AgentCustomProductCandidateProduct {
  return {
    allowCustomPrice: Boolean(product.allowCustomPrice),
    channelId,
    id: product.id,
    name: product.name,
    priceType: product.priceType,
  };
}

export async function searchAgentCustomProductCandidatesAction({
  query,
  limit = 20,
}: {
  query: string;
  limit?: number;
}): Promise<AgentCustomProductSearchResult> {
  await requireAdminAuth();

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { ok: true, products: [] };
  }

  try {
    const db = getDb();
    const { channelAccess, tenantContext } =
      await getTenantAdminChannelAccessContext();
    const tenantId = getTenantAdminScopeTenantId(tenantContext);
    const productsCollection = db
      .collectionGroup("products")
      .where("active", "==", true);
    const productsQuery = tenantId
      ? productsCollection.where("tenantId", "==", tenantId)
      : productsCollection;
    const snapshot = await productsQuery.limit(SEARCH_SCAN_LIMIT).get();
    const scored = snapshot.docs
      .map((doc) => {
        const data = doc.data() as Product;
        const channelId = getSourceChannelId(data, doc.ref.path);
        const product: Product = {
          ...data,
          id: data.id || doc.id,
          channelId,
        };

        return {
          channelId,
          product,
          score: scoreProduct(trimmedQuery, product),
        };
      })
      .filter(
        (item) =>
          item.channelId &&
          item.score > 0 &&
          tenantAdminChannelAccessAllows(channelAccess, item.channelId),
      )
      .toSorted((left, right) => right.score - left.score)
      .slice(0, Math.min(Math.max(1, Math.floor(limit)), 50));

    return {
      ok: true,
      products: scored.map(({ channelId, product }) => ({
        channelId,
        product: toClientCandidateProduct({ channelId, product }),
      })),
    };
  } catch (error) {
    console.error("[searchAgentCustomProductCandidatesAction] Failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to search agent custom product candidates",
      products: [],
    };
  }
}
