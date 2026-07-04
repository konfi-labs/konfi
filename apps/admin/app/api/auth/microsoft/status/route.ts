/**
 * Microsoft Auth Status Endpoint
 * GET /api/auth/microsoft/status - Check if user is connected to Microsoft
 * DELETE /api/auth/microsoft/status - Disconnect from Microsoft
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  getMicrosoftAccessToken,
  MICROSOFT_TOKENS_COOKIE,
} from "@/lib/microsoft-auth";
import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();
    // Use the shared utility which handles token refresh
    const tokenResult = await getMicrosoftAccessToken();

    if (!tokenResult) {
      return NextResponse.json({
        connected: false,
        user: null,
      });
    }

    return NextResponse.json({
      connected: true,
      user: {
        id: tokenResult.tokenData.userId,
        email: tokenResult.tokenData.userEmail,
        name: tokenResult.tokenData.userName,
      },
      expiresAt: tokenResult.tokenData.expiresAt,
    });
  } catch (error) {
    console.error("Error checking Microsoft auth status:", error);
    return NextResponse.json({
      connected: false,
      user: null,
      error: "Failed to check auth status",
    });
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    await requireAdminAuth();
    const cookieStore = await cookies();
    cookieStore.delete(MICROSOFT_TOKENS_COOKIE);

    return NextResponse.json({
      success: true,
      message: "Disconnected from Microsoft",
    });
  } catch (error) {
    console.error("Error disconnecting from Microsoft:", error);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 },
    );
  }
}
