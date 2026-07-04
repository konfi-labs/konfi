import { requireAdminAuth } from "@/actions/auth-utils";
import { getAllegroAccessToken, getAllegroApiBase } from "@/lib/allegro-auth";
import {
  buildAllegroProductOfferPayload,
  isAllegroPublicationEnabled,
  isAllegroPublishOfferRequest,
} from "@/lib/allegro-product-offer-publication";
import { connection, NextRequest, NextResponse } from "next/server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const allegroJsonHeaders = {
  Accept: "application/vnd.allegro.public.v1+json",
  "Content-Type": "application/vnd.allegro.public.v1+json",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResponseOfferId(payload: unknown): string | null {
  if (!isObject(payload)) return null;
  return typeof payload.id === "string" ? payload.id : null;
}

function getResponsePublicationStatus(payload: unknown): string | null {
  if (!isObject(payload) || !isObject(payload.publication)) return null;
  return typeof payload.publication.status === "string"
    ? payload.publication.status
    : null;
}

async function readAllegroPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  await connection();

  try {
    await requireAdminAuth();

    const requestBody: unknown = await request.json();
    if (!isAllegroPublishOfferRequest(requestBody)) {
      return NextResponse.json(
        { error: "Invalid Allegro product offer publication payload" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (!isAllegroPublicationEnabled(requestBody.publicationSettings)) {
      return NextResponse.json(
        {
          error: "Allegro publication is disabled in Allegro settings.",
        },
        { status: 403, headers: noStoreHeaders },
      );
    }

    if (!Number.isFinite(requestBody.priceAmountMinor)) {
      return NextResponse.json(
        { error: "Offer price is required before publishing" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const tokenResult = await getAllegroAccessToken();
    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Allegro" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const payload = buildAllegroProductOfferPayload(requestBody);
    const apiBase = getAllegroApiBase();
    const existingOfferId = requestBody.allegroOfferId?.trim();
    const endpoint = existingOfferId
      ? `${apiBase}/sale/product-offers/${encodeURIComponent(existingOfferId)}`
      : `${apiBase}/sale/product-offers`;
    const response = await fetch(endpoint, {
      method: existingOfferId ? "PATCH" : "POST",
      headers: {
        ...allegroJsonHeaders,
        Authorization: `Bearer ${tokenResult.accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const responsePayload = await readAllegroPayload(response);

    if (!response.ok) {
      console.error(
        "Allegro product offer publication failed:",
        response.status,
        responsePayload,
      );
      return NextResponse.json(
        {
          error:
            response.status === 401
              ? "Allegro token expired"
              : "Failed to publish Allegro offer",
          details: responsePayload,
        },
        { status: response.status, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        offerId: getResponseOfferId(responsePayload) ?? existingOfferId ?? null,
        publicationStatus: getResponsePublicationStatus(responsePayload),
        response: responsePayload,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Error publishing Allegro product offer:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
