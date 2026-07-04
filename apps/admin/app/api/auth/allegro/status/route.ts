/**
 * Allegro Auth Status Endpoint
 * GET /api/auth/allegro/status - Check if user is connected to Allegro
 * DELETE /api/auth/allegro/status - Disconnect from Allegro
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  clearAllegroTokenCookies,
  getAllegroAccessToken,
  getMissingAllegroScopes,
} from "@/lib/allegro-auth";
import {
  getDevelopmentAllegroAuthStatus,
  isDevelopmentAllegroMockEnabled,
} from "@/lib/allegro-order-mocks";
import { connection, NextResponse } from "next/server";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();
    const tokenResult = await getAllegroAccessToken();

    if (!tokenResult) {
      if (isDevelopmentAllegroMockEnabled()) {
        return NextResponse.json(getDevelopmentAllegroAuthStatus(), {
          headers: noStoreHeaders,
        });
      }

      return NextResponse.json(
        {
          connected: false,
          user: null,
        },
        { headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        connected: true,
        missingScopes: getMissingAllegroScopes(tokenResult.tokenData.scope),
        scope: tokenResult.tokenData.scope,
        user: {
          id: tokenResult.tokenData.userId,
          login: tokenResult.tokenData.userLogin,
          email: tokenResult.tokenData.userEmail,
        },
        expiresAt: tokenResult.tokenData.expiresAt,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Error checking Allegro auth status:", error);
    return NextResponse.json(
      {
        connected: false,
        user: null,
        error: "Failed to check auth status",
      },
      { headers: noStoreHeaders },
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    await requireAdminAuth();
    await clearAllegroTokenCookies();

    return NextResponse.json({
      success: true,
      message: "Disconnected from Allegro",
    });
  } catch (error) {
    console.error("Error disconnecting from Allegro:", error);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 },
    );
  }
}
