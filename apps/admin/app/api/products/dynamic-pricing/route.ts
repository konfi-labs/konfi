import { getAdminDb, verifySessionCookie } from "@/lib/firebase/serverApp";
import {
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
} from "@konfi/utils";
import { Firestore as AdminFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "__session";

function createForbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function createBadRequestResponse(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function createDynamicPricingResolutionErrorResponse() {
  return NextResponse.json(
    {
      code: "dynamic-pricing-resolution-failed",
      error: "Failed to resolve dynamic pricing",
    },
    { status: 500 },
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCookieValue(
  headers: Pick<Headers, "get">,
  cookieName: string,
): string | undefined {
  const cookieHeader = headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookiePart of cookieHeader.split(";")) {
    const trimmedPart = cookiePart.trim();
    const separatorIndex = trimmedPart.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmedPart.slice(0, separatorIndex).trim();
    if (name === cookieName) {
      return trimmedPart.slice(separatorIndex + 1);
    }
  }

  return undefined;
}

async function isAdminDynamicPricingPreviewAllowed(request: NextRequest) {
  const sessionCookie = getCookieValue(request.headers, SESSION_COOKIE);

  if (!sessionCookie) {
    return false;
  }

  const decodedClaims = await verifySessionCookie(sessionCookie);

  return decodedClaims?.admin === true;
}

async function getDynamicPricingAttributes(
  attributes: Product["attributes"],
  firestore: AdminFirestore,
) {
  const attributeSnapshots = await Promise.all(
    Array.from(new Set(attributes)).map((attributeId) =>
      firestore.doc(`/attributes/${attributeId}`).get(),
    ),
  );

  return attributeSnapshots.flatMap((snapshot) =>
    snapshot.exists ? [snapshot.data() as Attribute] : [],
  );
}

async function getProductDynamicPricing(
  firestore: AdminFirestore,
  channelId: string,
  productId: string,
): Promise<DynamicPricingConfig | undefined> {
  const snapshot = await firestore
    .doc(`/channels/${channelId}/products/${productId}/dynamicPricing/config`)
    .get();

  return snapshot.exists
    ? (snapshot.data() as DynamicPricingConfig)
    : undefined;
}

async function getDynamicPricingPresetsByIds(
  firestore: AdminFirestore,
  channelId: string,
  presetIds: string[],
): Promise<DynamicPricingPreset[]> {
  const uniqueIds = Array.from(
    new Set(presetIds.filter((presetId) => presetId.length > 0)),
  );

  if (uniqueIds.length === 0) {
    return [];
  }

  const presetSnapshots = await Promise.all(
    uniqueIds.map((presetId) =>
      firestore
        .doc(`/channels/${channelId}/dynamicPricingPresets/${presetId}`)
        .get(),
    ),
  );

  return presetSnapshots.flatMap((snapshot) =>
    snapshot.exists ? [snapshot.data() as DynamicPricingPreset] : [],
  );
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
      contentLength > MAX_DYNAMIC_PRICING_ROUTE_BODY_BYTES
    ) {
      return createBadRequestResponse("Request body too large");
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createBadRequestResponse("Invalid JSON body");
    }

    const body = sanitizeDynamicPricingRouteBody(rawBody);
    if (!body) {
      return createBadRequestResponse("Invalid request body");
    }

    const allowAdminPreview =
      await isAdminDynamicPricingPreviewAllowed(request);
    const firestore = getAdminDb();
    const result = await resolveDynamicPricingRoutePrices({
      allowAdminPreview,
      body,
      readers: {
        getDynamicPricingAttributes: (attributes) =>
          getDynamicPricingAttributes(attributes, firestore),
        getDynamicPricingPresetsByIds: (channelId, presetIds) =>
          getDynamicPricingPresetsByIds(firestore, channelId, presetIds),
        getProduct: async (channelId, productId) => {
          const productSnapshot = await firestore
            .doc(`/channels/${channelId}/products/${productId}`)
            .get();

          return productSnapshot.exists
            ? (productSnapshot.data() as Product)
            : undefined;
        },
        getProductDynamicPricing: (channelId, productId) =>
          getProductDynamicPricing(firestore, channelId, productId),
      },
    });

    if (result.kind === "bad-request") {
      return createBadRequestResponse(result.error);
    }

    return NextResponse.json({ prices: result.prices });
  } catch (error) {
    console.error("Error resolving dynamic pricing:", {
      message: getErrorMessage(error),
      name: error instanceof Error ? error.name : typeof error,
      pathname: request.nextUrl.pathname,
    });
    return createDynamicPricingResolutionErrorResponse();
  }
}
