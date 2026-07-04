/**
 * Microsoft OAuth2 Callback Endpoint
 * GET /api/auth/callback/microsoft - Handle OAuth callback from Microsoft
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import {
  decryptMicrosoftAuthState,
  getMicrosoftEncryptionKey,
  MICROSOFT_JWT_ISSUER,
  MICROSOFT_OAUTH_STATE_COOKIE,
  MICROSOFT_TOKENS_JWT_AUDIENCE,
} from "@/lib/microsoft-auth";
import { exchangeCodeForTokens, getCurrentUser } from "@konfi/microsoft";
import { cookies } from "next/headers";
import { connection, NextRequest, NextResponse } from "next/server";
import { EncryptJWT } from "jose";
import { cookieName, fallbackLng, languages } from "@/i18n/settings";

// Cookie names
const MICROSOFT_TOKENS_COOKIE = "microsoft_tokens";

// Cookie configuration
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const EMAILS_REDIRECT_PATH = "/tools/emails";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function resolveLocale(
  request: NextRequest,
  cookieStore: CookieStore,
): string {
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

function buildRedirectUrl(
  request: NextRequest,
  cookieStore: CookieStore,
): URL {
  const locale = resolveLocale(request, cookieStore);
  return new URL(`/${locale}${EMAILS_REDIRECT_PATH}`, request.url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();

  await requireAdminAuth();

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const cookieStore = await cookies();

  // Handle error from Microsoft
  if (error) {
    console.error("Microsoft OAuth error:", error, errorDescription);
    // Clean up state cookie
    cookieStore.delete(MICROSOFT_OAUTH_STATE_COOKIE);
    const redirectUrl = buildRedirectUrl(request, cookieStore);
    redirectUrl.searchParams.set("error", "microsoft_auth_failed");
    redirectUrl.searchParams.set(
      "error_description",
      errorDescription || error,
    );
    return NextResponse.redirect(redirectUrl);
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("Missing code or state in Microsoft callback");
    cookieStore.delete(MICROSOFT_OAUTH_STATE_COOKIE);
    const redirectUrl = buildRedirectUrl(request, cookieStore);
    redirectUrl.searchParams.set("error", "invalid_callback");
    return NextResponse.redirect(redirectUrl);
  }

  // Verify state matches the cookie (CSRF protection)
  const encryptedState = cookieStore.get(
    MICROSOFT_OAUTH_STATE_COOKIE,
  )?.value;
  const authState = encryptedState
    ? await decryptMicrosoftAuthState(encryptedState)
    : null;
  if (!authState || authState.state !== state) {
    console.error("OAuth state mismatch - possible CSRF attack");
    cookieStore.delete(MICROSOFT_OAUTH_STATE_COOKIE);
    const redirectUrl = buildRedirectUrl(request, cookieStore);
    redirectUrl.searchParams.set("error", "state_mismatch");
    return NextResponse.redirect(redirectUrl);
  }

  // Clean up state cookie after verification
  cookieStore.delete(MICROSOFT_OAUTH_STATE_COOKIE);

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, authState);

    // Get user info to verify the token works
    const user = await getCurrentUser(tokens.accessToken);

    // Token data to encrypt
    const tokenData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      userId: user.id,
      userEmail: user.mail || user.userPrincipalName,
      userName: user.displayName,
    };

    // Encrypt token data using jose JWE
    const encryptedTokens = await new EncryptJWT({ data: tokenData })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setIssuer(MICROSOFT_JWT_ISSUER)
      .setAudience(MICROSOFT_TOKENS_JWT_AUDIENCE)
      .setExpirationTime(`${COOKIE_MAX_AGE}s`)
      .encrypt(getMicrosoftEncryptionKey());

    // Store encrypted tokens in an HTTP-only cookie
    cookieStore.set(MICROSOFT_TOKENS_COOKIE, encryptedTokens, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    // Redirect to success page
    const redirectUrl = buildRedirectUrl(request, cookieStore);
    redirectUrl.searchParams.set("success", "microsoft_connected");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Microsoft token exchange error:", error);
    const redirectUrl = buildRedirectUrl(request, cookieStore);
    redirectUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(redirectUrl);
  }
}
