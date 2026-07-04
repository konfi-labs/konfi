"use server";

import {
  requireAdminAuth,
  requireSuperAdminAuth,
  requireTenantAdminChannelAccess,
  requireTenantPermission,
} from "@/actions/auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";
import {
  backfillProductSemanticSearchIndex,
  type ProductSearchIndexBackfillResult,
  type ProductSemanticSearchIndexSyncResult,
  searchSemanticProductIndex,
  type SemanticProductSearchHit,
  syncProductSemanticSearchIndexForProductWrite,
} from "@/lib/product-search/semantic-product-index";
import { syncProductWriteSideEffects } from "@/lib/catalog/product-write-side-effects";
import type { Product } from "@konfi/types";

export type ProductSearchIndexBackfillActionResult =
  | ({ ok: true } & ProductSearchIndexBackfillResult)
  | { ok: false; error: string };

export type ProductSearchIndexSearchHit = Pick<
  SemanticProductSearchHit,
  "channelId" | "distance" | "indexDocId" | "productId" | "sourceChannelId"
>;

export type ProductSearchIndexSearchActionResult =
  | { ok: true; hits: ProductSearchIndexSearchHit[] }
  | { ok: false; error: string; hits: [] };

export type ProductSearchIndexSyncActionResult =
  | ({ ok: true } & ProductSemanticSearchIndexSyncResult)
  | { ok: false; error: string };

export async function backfillProductSearchIndexAction({
  channelId,
  force = false,
}: {
  channelId: string;
  force?: boolean;
}): Promise<ProductSearchIndexBackfillActionResult> {
  await requireSuperAdminAuth();

  if (!channelId.trim()) {
    return {
      ok: false,
      error: "Channel ID is required",
    };
  }

  try {
    const result = await backfillProductSemanticSearchIndex({
      channelId: channelId.trim(),
      force,
    });

    return {
      ok: true,
      ...result,
    };
  } catch (error) {
    console.error("[backfillProductSearchIndexAction] Failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to backfill product search index",
    };
  }
}

export async function searchProductSearchIndexAction({
  channelId,
  query,
  limit = 12,
}: {
  channelId: string;
  query: string;
  limit?: number;
}): Promise<ProductSearchIndexSearchActionResult> {
  await requireAdminAuth();

  const trimmedChannelId = await requireTenantAdminChannelAccess(channelId);
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      ok: true,
      hits: [],
    };
  }

  try {
    const hits = await searchSemanticProductIndex({
      channelId: trimmedChannelId,
      query: trimmedQuery,
      limit: Math.min(Math.max(1, Math.floor(limit)), 20),
    });

    return {
      ok: true,
      hits,
    };
  } catch (error) {
    console.error("[searchProductSearchIndexAction] Failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to search product search index",
      hits: [],
    };
  }
}

export async function syncProductSearchIndexAction({
  channelId,
  productId,
  previousLinkedChannelIds = [],
  deletedProductState,
  previousProductState,
}: {
  channelId: string;
  productId: string;
  previousLinkedChannelIds?: readonly string[];
  deletedProductState?: {
    active?: boolean;
    published?: boolean;
    slug?: string;
    id?: string;
  };
  previousProductState?: {
    active?: boolean;
    published?: boolean;
    slug?: string;
    id?: string;
  };
}): Promise<ProductSearchIndexSyncActionResult> {
  await requireTenantPermission("catalog.products.update");

  const trimmedChannelId = await requireTenantAdminChannelAccess(channelId);
  const trimmedProductId = productId.trim();

  if (!trimmedProductId) {
    return {
      ok: false,
      error: "Product ID is required",
    };
  }

  try {
    const result = await syncProductSemanticSearchIndexForProductWrite({
      channelId: trimmedChannelId,
      productId: trimmedProductId,
      previousLinkedChannelIds,
    });
    try {
      const productSnapshot = await getAdminDb()
        .collection(`channels/${trimmedChannelId}/products`)
        .doc(trimmedProductId)
        .get();
      const product = productSnapshot.exists
        ? ({
            ...(productSnapshot.data() as Product),
            id: trimmedProductId,
            channelId: trimmedChannelId,
          } satisfies Product)
        : null;

      await syncProductWriteSideEffects({
        channelId: trimmedChannelId,
        productId: trimmedProductId,
        product,
        previousProductState: deletedProductState ?? previousProductState,
      });
    } catch (error) {
      console.error(
        "[syncProductSearchIndexAction] Product write side effects failed",
        {
          error,
          channelId: trimmedChannelId,
          productId: trimmedProductId,
        },
      );
    }

    return {
      ok: true,
      ...result,
    };
  } catch (error) {
    console.error("[syncProductSearchIndexAction] Failed", {
      error,
      channelId: trimmedChannelId,
      productId: trimmedProductId,
      previousLinkedChannelIds,
    });
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `Failed to sync product search index: ${String(error)}`,
    };
  }
}
