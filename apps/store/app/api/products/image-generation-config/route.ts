import {
  getAdminDb,
  getStoreRuntimeConfigForRequest,
} from "@/lib/firebase/serverApp";
import { isAdminProductPreviewAllowed } from "@/lib/product-preview.server";
import type { Product, ProductImageGenerationConfig } from "@konfi/types";
import {
  getProductImageGenerationConfigPath,
  isSameOriginRequest,
  normalizeProductImageGenerationConfig,
} from "@konfi/utils";
import { unstable_rethrow } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

function createForbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function createBadRequestResponse(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function getRequiredSearchParam(request: NextRequest, name: string) {
  const value = request.nextUrl.searchParams.get(name)?.trim();

  return value && !value.includes("/") ? value : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const sameOrigin = isSameOriginRequest({
      headers: request.headers,
      requestOrigin: request.nextUrl.origin,
      allowMissingHeaders: process.env.NODE_ENV !== "production",
    });

    if (!sameOrigin) {
      return createForbiddenResponse();
    }

    const channelId = getRequiredSearchParam(request, "channelId");
    const productId = getRequiredSearchParam(request, "productId");

    if (!channelId || !productId) {
      return createBadRequestResponse("Invalid product image generation query");
    }

    const allowAdminPreview = isAdminProductPreviewAllowed(request.headers);
    const runtimeConfig = await getStoreRuntimeConfigForRequest();

    if (!runtimeConfig) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    if (!allowAdminPreview && channelId !== runtimeConfig.channelId) {
      return createForbiddenResponse();
    }

    const firestore = getAdminDb();
    const productSnapshot = await firestore
      .doc(`channels/${channelId}/products/${productId}`)
      .get();

    if (!productSnapshot.exists) {
      return NextResponse.json({ config: null }, { status: 404 });
    }

    const product = productSnapshot.data() as Product;

    if (
      !allowAdminPreview &&
      (product.active === false || product.availability?.published !== true)
    ) {
      return NextResponse.json({ config: null }, { status: 404 });
    }

    const configSnapshot = await firestore
      .doc(getProductImageGenerationConfigPath(channelId, productId))
      .get();
    const config = normalizeProductImageGenerationConfig(
      configSnapshot.exists
        ? (configSnapshot.data() as ProductImageGenerationConfig)
        : undefined,
    );

    return NextResponse.json({ config: config ?? null });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error fetching product image generation config:", error);
    return NextResponse.json(
      { error: "Failed to load AI image generation settings." },
      { status: 500 },
    );
  }
}
