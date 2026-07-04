/**
 * Allegro OAuth2 Callback Endpoint
 * GET /api/auth/callback/allegro - Handle OAuth callback from Allegro
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  ALLEGRO_OAUTH_STATE_COOKIE,
  decryptAllegroAuthState,
  encryptAndStoreTokens,
  exchangeCodeForTokens,
  getAllegroPublicOrigin,
  getAllegroCurrentUser,
} from "@/lib/allegro-auth";
import { cookieName, fallbackLng, languages } from "@/i18n/settings";
import { cookies } from "next/headers";
import { connection, NextRequest, NextResponse } from "next/server";

const ALLEGRO_REDIRECT_PATH = "/tools/allegro";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

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

function resolveLocale(request: NextRequest, cookieStore: CookieStore): string {
  const cookieLocale = cookieStore.get(cookieName)?.value;
  if (cookieLocale && languages.includes(cookieLocale)) {
    return cookieLocale;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const localeFromReferer = languages.find((lng) =>
        refererUrl.pathname.startsWith(`/${lng}`),
      );
      if (localeFromReferer) {
        return localeFromReferer;
      }
    } catch (error) {
      console.error("Failed to parse referer for locale:", error);
    }
  }

  return fallbackLng;
}

function buildRedirectUrl(request: NextRequest, cookieStore: CookieStore): URL {
  const locale = resolveLocale(request, cookieStore);
  return new URL(
    `/${locale}${ALLEGRO_REDIRECT_PATH}`,
    getAllegroPublicOrigin(getRequestPublicOrigin(request)),
  );
}

function appendChannelId(redirectUrl: URL, channelId?: string): void {
  const trimmedChannelId = channelId?.trim();
  if (trimmedChannelId) {
    redirectUrl.searchParams.set("channelId", trimmedChannelId);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();

  const cookieStore = await cookies();
  let verifiedAuthChannelId: string | undefined;

  try {
    await requireAdminAuth();

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle error from Allegro
    if (error) {
      console.error("Allegro OAuth error:", error, errorDescription);
      const encryptedState = cookieStore.get(ALLEGRO_OAUTH_STATE_COOKIE)?.value;
      const authState = encryptedState
        ? await decryptAllegroAuthState(encryptedState)
        : null;
      cookieStore.delete(ALLEGRO_OAUTH_STATE_COOKIE);
      const redirectUrl = buildRedirectUrl(request, cookieStore);
      if (authState?.state === state) {
        appendChannelId(redirectUrl, authState.channelId);
      }
      redirectUrl.searchParams.set("error", "allegro_auth_failed");
      redirectUrl.searchParams.set(
        "error_description",
        errorDescription || error,
      );
      return NextResponse.redirect(redirectUrl);
    }

    // Validate required parameters
    if (!code || !state) {
      console.error("Missing code or state in Allegro callback");
      cookieStore.delete(ALLEGRO_OAUTH_STATE_COOKIE);
      const redirectUrl = buildRedirectUrl(request, cookieStore);
      redirectUrl.searchParams.set("error", "invalid_callback");
      return NextResponse.redirect(redirectUrl);
    }

    // Verify state matches the cookie (CSRF protection)
    const encryptedState = cookieStore.get(ALLEGRO_OAUTH_STATE_COOKIE)?.value;
    const authState = encryptedState
      ? await decryptAllegroAuthState(encryptedState)
      : null;
    if (!authState || authState.state !== state) {
      console.error("OAuth state mismatch - possible CSRF attack");
      cookieStore.delete(ALLEGRO_OAUTH_STATE_COOKIE);
      const redirectUrl = buildRedirectUrl(request, cookieStore);
      redirectUrl.searchParams.set("error", "state_mismatch");
      return NextResponse.redirect(redirectUrl);
    }
    verifiedAuthChannelId = authState.channelId;

    // Clean up state cookie after verification
    cookieStore.delete(ALLEGRO_OAUTH_STATE_COOKIE);

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, authState.redirectUri);

    // Get user info to verify the token works
    const user = await getAllegroCurrentUser(tokens.accessToken);

    // Store encrypted tokens
    await encryptAndStoreTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      userId: user.id,
      userLogin: user.login,
      userEmail: user.email ?? "",
    });

    // Redirect to success page
    const redirectUrl = buildRedirectUrl(request, cookieStore);
    appendChannelId(redirectUrl, verifiedAuthChannelId);
    redirectUrl.searchParams.set("success", "allegro_connected");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Allegro callback error:", error);
    const redirectUrl = buildRedirectUrl(request, cookieStore);
    appendChannelId(redirectUrl, verifiedAuthChannelId);
    redirectUrl.searchParams.set("error", "token_exchange_failed");

    if (
      error instanceof Error &&
      // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
      process.env.NODE_ENV !== "production"
    ) {
      redirectUrl.searchParams.set("error_description", error.message);
    }

    return NextResponse.redirect(redirectUrl);
  }
}
