/**
 * Microsoft OAuth2 Authorization Endpoint
 * GET /api/auth/microsoft - Redirect to Microsoft login
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  encryptMicrosoftAuthState,
  MICROSOFT_OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_MAX_AGE,
} from "@/lib/microsoft-auth";
import { hasTenantMicrosoftOAuthConfig } from "@/lib/tenant-oauth-integrations";
import { getAuthorizationUrl } from "@konfi/microsoft";
import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();
    if (!(await hasTenantMicrosoftOAuthConfig())) {
      return NextResponse.json(
        { error: "Microsoft Outlook is not available for this tenant" },
        { status: 403 },
      );
    }

    const { url, authState } = await getAuthorizationUrl();
    const encryptedState = await encryptMicrosoftAuthState(authState);

    // Bind state to browser via httpOnly cookie to prevent login CSRF
    const cookieStore = await cookies();
    cookieStore.set(MICROSOFT_OAUTH_STATE_COOKIE, encryptedState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
      path: "/",
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Microsoft auth error:", error);
    return NextResponse.json(
      { error: "Failed to initialize Microsoft authentication" },
      { status: 500 },
    );
  }
}
