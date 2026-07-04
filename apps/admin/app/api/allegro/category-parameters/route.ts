/**
 * Allegro Category Parameters API Endpoint
 * GET /api/allegro/category-parameters?categoryId=... - Fetch offer parameters.
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  getDevelopmentAllegroCategoryParametersResponse,
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

    const categoryId = request.nextUrl.searchParams.get("categoryId")?.trim();
    if (!categoryId) {
      return NextResponse.json(
        { error: "categoryId query parameter is required" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (isDevelopmentAllegroMockEnabled()) {
      return NextResponse.json(
        getDevelopmentAllegroCategoryParametersResponse(categoryId),
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

    const apiBase = getAllegroApiBase();
    const response = await fetch(
      `${apiBase}/sale/categories/${encodeURIComponent(categoryId)}/parameters`,
      {
        headers: {
          Accept: "application/vnd.allegro.public.v1+json",
          Authorization: `Bearer ${tokenResult.accessToken}`,
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
      console.error(
        "Allegro category parameters fetch failed:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: "Failed to fetch category parameters from Allegro" },
        { status: response.status, headers: noStoreHeaders },
      );
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Error fetching Allegro category parameters:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
