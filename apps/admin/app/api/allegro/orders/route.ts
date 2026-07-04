/**
 * Allegro Orders API Endpoint
 * GET /api/allegro/orders - Fetch checkout forms (orders) from Allegro
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  getDevelopmentAllegroOrdersResponse,
  isDevelopmentAllegroMockEnabled,
} from "@/lib/allegro-order-mocks";
import { getAllegroAccessToken, getAllegroApiBase } from "@/lib/allegro-auth";
import { connection, NextRequest, NextResponse } from "next/server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();

    const searchParams = request.nextUrl.searchParams;

    if (isDevelopmentAllegroMockEnabled()) {
      return NextResponse.json(
        getDevelopmentAllegroOrdersResponse({
          limit: Number.parseInt(searchParams.get("limit") ?? "25", 10),
          offset: Number.parseInt(searchParams.get("offset") ?? "0", 10),
          status: searchParams.get("status"),
          fulfillmentStatus: searchParams.get("fulfillment.status"),
          fulfillmentProviderId: searchParams.get("fulfillment.provider.id"),
          lineItemsSent: searchParams.get(
            "fulfillment.shipmentSummary.lineItemsSent",
          ),
          buyerLogin: searchParams.get("buyer.login"),
          buyerEmail: searchParams.get("buyer.email"),
        }),
        { headers: noStoreHeaders },
      );
    }

    const tokenResult = await getAllegroAccessToken();
    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Allegro" },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const params = new URLSearchParams();

    // Forward supported query params
    const allowedParams = [
      "status",
      "fulfillment.status",
      "fulfillment.provider.id",
      "fulfillment.shipmentSummary.lineItemsSent",
      "limit",
      "offset",
      "sort",
      "buyer.login",
      "buyer.email",
      "updatedAt.gte",
      "updatedAt.lte",
      "lineItems.boughtAt.gte",
      "lineItems.boughtAt.lte",
    ];

    for (const param of allowedParams) {
      const value = searchParams.get(param);
      if (value) {
        params.set(param, value);
      }
    }

    // Default limit if not set
    if (!params.has("limit")) {
      params.set("limit", "25");
    }

    const apiBase = getAllegroApiBase();
    const response = await fetch(
      `${apiBase}/order/checkout-forms?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          Accept: "application/vnd.allegro.public.v1+json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: "Allegro token expired" },
          { status: 401, headers: noStoreHeaders },
        );
      }
      const errorText = await response.text();
      console.error("Allegro orders fetch failed:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to fetch orders from Allegro" },
        { status: response.status, headers: noStoreHeaders },
      );
    }

    const data: unknown = await response.json();

    return NextResponse.json(data, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Error fetching Allegro orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
