/**
 * Allegro Category Search API Endpoint
 * GET /api/allegro/categories?query=... - Search suggested Allegro categories.
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  getDevelopmentAllegroCategorySearchResponse,
  isDevelopmentAllegroMockEnabled,
} from "@/lib/allegro-order-mocks";
import { getAllegroAccessToken, getAllegroApiBase } from "@/lib/allegro-auth";
import type {
  AllegroCategorySearchResponse,
  AllegroCategorySuggestion,
} from "@/lib/allegro-export-preview";
import { connection, NextRequest, NextResponse } from "next/server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

interface AllegroMatchingCategoryNode {
  id?: unknown;
  name?: unknown;
  parent?: AllegroMatchingCategoryNode | null;
}

interface AllegroMatchingCategoriesResponse {
  matchingCategories?: unknown;
}

function getCategoryPath(node: AllegroMatchingCategoryNode): string[] {
  const parentPath = node.parent ? getCategoryPath(node.parent) : [];
  return typeof node.name === "string"
    ? [...parentPath, node.name]
    : parentPath;
}

function normalizeCategorySuggestion(
  node: AllegroMatchingCategoryNode,
): AllegroCategorySuggestion | undefined {
  if (typeof node.id !== "string" || typeof node.name !== "string") {
    return undefined;
  }

  return {
    id: node.id,
    name: node.name,
    path: getCategoryPath(node),
  };
}

function normalizeMatchingCategories(
  payload: AllegroMatchingCategoriesResponse,
): AllegroCategorySearchResponse {
  if (!Array.isArray(payload.matchingCategories)) {
    return { categories: [] };
  }

  return {
    categories: payload.matchingCategories.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];

      const category = normalizeCategorySuggestion(
        item as AllegroMatchingCategoryNode,
      );
      return category ? [category] : [];
    }),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();

  try {
    await requireAdminAuth();

    const query = request.nextUrl.searchParams.get("query")?.trim();
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "query must contain at least 2 characters" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (isDevelopmentAllegroMockEnabled()) {
      return NextResponse.json(
        getDevelopmentAllegroCategorySearchResponse(query),
        {
          headers: noStoreHeaders,
        },
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
      `${apiBase}/sale/matching-categories?name=${encodeURIComponent(query)}`,
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
        "Allegro category search failed:",
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: "Failed to search Allegro categories" },
        { status: response.status, headers: noStoreHeaders },
      );
    }

    const data = (await response.json()) as AllegroMatchingCategoriesResponse;
    return NextResponse.json(normalizeMatchingCategories(data), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    console.error("Error searching Allegro categories:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
