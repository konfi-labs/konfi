import {
  getAdminDb,
  getStoreRuntimeConfigForRequest,
} from "@/lib/firebase/serverApp";
import { isAdminProductPreviewAllowed } from "@/lib/product-preview.server";
import type {
  Attribute,
  DynamicPricingConfig,
  DynamicPricingPreset,
  Product,
} from "@konfi/types";
import {
  isSameOriginRequest,
  MAX_DYNAMIC_PRICING_ROUTE_BODY_BYTES,
  resolveDynamicPricingRoutePrices,
  sanitizeDynamicPricingRouteBody,
  type DynamicPricingRouteBody,
} from "@konfi/utils";
import type { Firestore as AdminFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const MAX_DYNAMIC_PRICING_BATCH_ITEMS = 20;
const MAX_DYNAMIC_PRICING_BATCH_BODY_BYTES =
  MAX_DYNAMIC_PRICING_ROUTE_BODY_BYTES * MAX_DYNAMIC_PRICING_BATCH_ITEMS;

function createForbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function createBadRequestResponse(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function isAdminDynamicPricingPreviewAllowed(request: NextRequest) {
  return isAdminProductPreviewAllowed(request.headers);
}

function createDocumentKey(channelId: string, documentId: string) {
  return `${channelId}/${documentId}`;
}

function sanitizeDynamicPricingBatchBody(
  rawBody: unknown,
): DynamicPricingRouteBody[] | null {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return null;
  }

  const items = (rawBody as { items?: unknown }).items;
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > MAX_DYNAMIC_PRICING_BATCH_ITEMS
  ) {
    return null;
  }

  const sanitizedItems = items.map((item) =>
    sanitizeDynamicPricingRouteBody(item),
  );

  return sanitizedItems.every((item): item is DynamicPricingRouteBody =>
    Boolean(item),
  )
    ? sanitizedItems
    : null;
}

async function prefetchDynamicPricingDocuments({
  bodies,
  firestore,
}: {
  bodies: DynamicPricingRouteBody[];
  firestore: AdminFirestore;
}) {
  const productKeys = Array.from(
    new Set(
      bodies.flatMap((body) =>
        body.channelId && body.productId
          ? [createDocumentKey(body.channelId, body.productId)]
          : [],
      ),
    ),
  );
  const productRefs = productKeys.map((key) => {
    const [channelId, productId] = key.split("/");
    return firestore.doc(`/channels/${channelId}/products/${productId}`);
  });
  const productSnapshots =
    productRefs.length > 0 ? await firestore.getAll(...productRefs) : [];
  const productsByKey = new Map<string, Product | undefined>(
    productSnapshots.map((snapshot, index) => [
      productKeys[index],
      snapshot.exists ? (snapshot.data() as Product) : undefined,
    ]),
  );

  const configKeys = productKeys.filter((key) => {
    const product = productsByKey.get(key);
    return product?.priceType === "DYNAMIC" && !product.dynamicPricing;
  });
  const configRefs = configKeys.map((key) => {
    const [channelId, productId] = key.split("/");
    return firestore.doc(
      `/channels/${channelId}/products/${productId}/dynamicPricing/config`,
    );
  });
  const configSnapshots =
    configRefs.length > 0 ? await firestore.getAll(...configRefs) : [];
  const configsByKey = new Map<string, DynamicPricingConfig | undefined>(
    configSnapshots.map((snapshot, index) => [
      configKeys[index],
      snapshot.exists ? (snapshot.data() as DynamicPricingConfig) : undefined,
    ]),
  );

  const presetKeys = Array.from(
    new Set(
      productKeys.flatMap((key) => {
        const [channelId] = key.split("/");
        const product = productsByKey.get(key);
        const config = product?.dynamicPricing ?? configsByKey.get(key);

        return (config?.linkedPresetIds ?? []).flatMap((presetId) =>
          presetId ? [createDocumentKey(channelId, presetId)] : [],
        );
      }),
    ),
  );
  const presetRefs = presetKeys.map((key) => {
    const [channelId, presetId] = key.split("/");
    return firestore.doc(
      `/channels/${channelId}/dynamicPricingPresets/${presetId}`,
    );
  });
  const presetSnapshots =
    presetRefs.length > 0 ? await firestore.getAll(...presetRefs) : [];
  const presetsByKey = new Map<string, DynamicPricingPreset | undefined>(
    presetSnapshots.map((snapshot, index) => [
      presetKeys[index],
      snapshot.exists ? (snapshot.data() as DynamicPricingPreset) : undefined,
    ]),
  );

  const attributeIds = Array.from(
    new Set(
      productKeys.flatMap((key) => productsByKey.get(key)?.attributes ?? []),
    ),
  );
  const attributeRefs = attributeIds.map((attributeId) =>
    firestore.doc(`/attributes/${attributeId}`),
  );
  const attributeSnapshots =
    attributeRefs.length > 0 ? await firestore.getAll(...attributeRefs) : [];
  const attributesById = new Map<string, Attribute | undefined>(
    attributeSnapshots.map((snapshot, index) => [
      attributeIds[index],
      snapshot.exists ? (snapshot.data() as Attribute) : undefined,
    ]),
  );

  return {
    attributesById,
    configsByKey,
    presetsByKey,
    productsByKey,
  };
}

export async function POST(request: NextRequest) {
  try {
    const sameOrigin = isSameOriginRequest({
      headers: request.headers,
      requestOrigin: request.nextUrl.origin,
      allowMissingHeaders: process.env.NODE_ENV !== "production",
    });

    if (!sameOrigin) {
      return createForbiddenResponse();
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_DYNAMIC_PRICING_BATCH_BODY_BYTES
    ) {
      return createBadRequestResponse("Request body too large");
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createBadRequestResponse("Invalid JSON body");
    }

    const bodies = sanitizeDynamicPricingBatchBody(rawBody);
    if (!bodies) {
      return createBadRequestResponse("Invalid request body");
    }

    const allowAdminPreview = isAdminDynamicPricingPreviewAllowed(request);
    const runtimeConfig = await getStoreRuntimeConfigForRequest();
    if (!runtimeConfig) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    if (
      !allowAdminPreview &&
      bodies.some(
        (body) => body.channelId && body.channelId !== runtimeConfig.channelId,
      )
    ) {
      return createForbiddenResponse();
    }

    const firestore = getAdminDb();
    const { attributesById, configsByKey, presetsByKey, productsByKey } =
      await prefetchDynamicPricingDocuments({
        bodies,
        firestore,
      });

    const results = await Promise.all(
      bodies.map(async (body) => {
        const result = await resolveDynamicPricingRoutePrices({
          allowAdminPreview,
          body,
          readers: {
            getDynamicPricingAttributes: async (attributes) =>
              attributes.flatMap((attributeId) => {
                const attribute = attributesById.get(attributeId);
                return attribute ? [attribute] : [];
              }),
            getDynamicPricingPresetsByIds: async (channelId, presetIds) =>
              presetIds.flatMap((presetId) => {
                const preset = presetsByKey.get(
                  createDocumentKey(channelId, presetId),
                );
                return preset ? [preset] : [];
              }),
            getProduct: async (channelId, productId) =>
              productsByKey.get(createDocumentKey(channelId, productId)),
            getProductDynamicPricing: async (channelId, productId) =>
              configsByKey.get(createDocumentKey(channelId, productId)),
          },
        });

        return result.kind === "prices"
          ? { prices: result.prices }
          : { error: result.error };
      }),
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error resolving batched dynamic pricing:", error);
    return NextResponse.json(
      { error: "Failed to resolve dynamic pricing" },
      {
        status: 500,
      },
    );
  }
}
