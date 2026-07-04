/**
 * Allegro OAuth2 Authorization Endpoint
 * GET /api/auth/allegro — Redirect to Allegro login
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  encryptAllegroAuthState,
  getAllegroCallbackUrl,
  getAuthorizationUrl,
  ALLEGRO_OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_MAX_AGE,
} from "@/lib/allegro-auth";
import { hasTenantAllegroOAuthConfig } from "@/lib/tenant-oauth-integrations";
import { cookies } from "next/headers";
import { connection, NextRequest, NextResponse } from "next/server";

function getRequestPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost?.split(",")[0]?.trim();
  const protocol = forwardedProto?.split(",")[0]?.trim();

  if (host && protocol) {
    return `${protocol}://${host}`;
  }

  return request.nextUrl.origin;
}

function getRequestedChannelId(request: NextRequest): string | undefined {
  const channelId = request.nextUrl.searchParams.get("channelId")?.trim();
  return channelId || undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();
    if (!(await hasTenantAllegroOAuthConfig())) {
      return NextResponse.json(
        { error: "Allegro is not available for this tenant" },
        { status: 403 },
      );
    }

    const callbackUrl = getAllegroCallbackUrl(getRequestPublicOrigin(request));
    const { url, authState } = getAuthorizationUrl({
      channelId: getRequestedChannelId(request),
      redirectUri: callbackUrl,
    });
    const encryptedState = await encryptAllegroAuthState(authState);

    const cookieStore = await cookies();
    cookieStore.set(ALLEGRO_OAUTH_STATE_COOKIE, encryptedState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
      path: "/",
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Allegro auth error:", error);
    return NextResponse.json(
      { error: "Failed to initialize Allegro authentication" },
      { status: 500 },
    );
  }
}
