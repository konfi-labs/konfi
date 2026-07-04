import "server-only";

import { tenantFirestorePaths } from "@konfi/firebase";
import type { Product } from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";

import { getAdminDb } from "../firebase/serverApp";

function isProductBoundToChannel({
  channelId,
  product,
  productId,
}: {
  channelId: string;
  product: Product;
  productId: string;
}) {
  return (
    product.id === productId &&
    (!product.channelId || product.channelId === channelId)
  );
}

export async function resolveChannelProductsByIdForOrder({
  channelId,
  productIds,
  tenantContext,
}: {
  channelId: string;
  productIds: readonly string[];
  tenantContext: TenantContext;
}) {
  const adminDb = getAdminDb();
  const productSnapshots = await Promise.all(
    productIds.map(async (productId) => ({
      productId,
      snapshot: await adminDb
        .doc(
          tenantFirestorePaths.productDoc(tenantContext, channelId, productId),
        )
        .get(),
    })),
  );

  return productSnapshots.flatMap(({ productId, snapshot }) => {
    if (!snapshot.exists) {
      return [];
    }

    const product = snapshot.data() as Product;
    if (!isProductBoundToChannel({ channelId, product, productId })) {
      return [];
    }

    return [
      {
        ...product,
        channelId: product.channelId ?? channelId,
      },
    ];
  });
}
