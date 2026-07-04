/**
 * Meta (Facebook/Instagram) OAuth2 Callback Endpoint
 * GET /api/auth/callback/meta — Handle OAuth callback from Meta
 */

import { requireTenantPermission } from "@/actions/auth-utils";
import { isSocialFeatureEnabled } from "@/lib/social/feature-flag";
import {
  META_OAUTH_STATE_COOKIE,
  decryptMetaAuthState,
  exchangeCodeForTokens,
  exchangeForLongLivedUserToken,
  fetchPagesWithInstagramAccounts,
  persistMetaConnection,
} from "@/lib/social/meta-auth";
import { getMetaAppConfig } from "@/lib/social/meta-config";
import { getTenantContextForRequest } from "@/lib/firebase/serverApp";
import { cookieName, fallbackLng, languages } from "@/i18n/settings";
import { cookies } from "next/headers";
import { connection, NextRequest, NextResponse } from "next/server";

const META_REDIRECT_PATH = "/social";

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

function resolveLocaleFromState(
  stateLng: string | undefined,
  request: NextRequest,
  cookieStore: CookieStore,
): string {
  if (stateLng && languages.includes(stateLng)) {
    return stateLng;
  }

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
  lng: string,
  origin: string,
  params?: Record<string, string>,
): URL {
  const url = new URL(`/${lng}${META_REDIRECT_PATH}`, origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();
  if (!isSocialFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  const origin = getRequestPublicOrigin(request);

  // We need a fallback lng before we have the state
  const fallbackLocale = resolveLocaleFromState(undefined, request, cookieStore);

  try {
    const { uid } = await requireTenantPermission("marketing.social.manage");

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle error from Meta
    if (error) {
      console.error("Meta OAuth error:", error, errorDescription);
      const encryptedState = cookieStore.get(META_OAUTH_STATE_COOKIE)?.value;
      const authState = encryptedState
        ? await decryptMetaAuthState(encryptedState)
        : null;
      cookieStore.delete(META_OAUTH_STATE_COOKIE);
      const lng = resolveLocaleFromState(authState?.lng, request, cookieStore);
      const redirectUrl = buildRedirectUrl(lng, origin, { error: "meta_auth_failed" });
      return NextResponse.redirect(redirectUrl);
    }

    // Validate required parameters
    if (!code || !state) {
      console.error("Missing code or state in Meta callback");
      cookieStore.delete(META_OAUTH_STATE_COOKIE);
      const redirectUrl = buildRedirectUrl(fallbackLocale, origin, { error: "invalid_callback" });
      return NextResponse.redirect(redirectUrl);
    }

    // Verify state matches the cookie (CSRF protection)
    const encryptedState = cookieStore.get(META_OAUTH_STATE_COOKIE)?.value;
    const authState = encryptedState
      ? await decryptMetaAuthState(encryptedState)
      : null;

    if (!authState || authState.state !== state) {
      console.error("OAuth state mismatch - possible CSRF attack");
      cookieStore.delete(META_OAUTH_STATE_COOKIE);
      const redirectUrl = buildRedirectUrl(fallbackLocale, origin, { error: "state_mismatch" });
      return NextResponse.redirect(redirectUrl);
    }

    // Clean up state cookie after verification
    cookieStore.delete(META_OAUTH_STATE_COOKIE);

    const lng = resolveLocaleFromState(authState.lng, request, cookieStore);

    // Resolve app config
    const tenantContext = await getTenantContextForRequest();
    const appConfig = await getMetaAppConfig(tenantContext);
    if (!appConfig) {
      const redirectUrl = buildRedirectUrl(lng, origin, { error: "meta_not_configured" });
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange code for short-lived token
    const { accessToken: shortLivedToken } = await exchangeCodeForTokens({
      appConfig,
      code,
      redirectUri: authState.redirectUri,
    });

    // Exchange for long-lived user token
    const { accessToken: longLivedToken, expiresAt: userTokenExpiresAt } =
      await exchangeForLongLivedUserToken({ appConfig, shortLivedToken });

    // Fetch pages + IG accounts
    const pages = await fetchPagesWithInstagramAccounts({
      appConfig,
      userToken: longLivedToken,
    });

    // Persist connection to Firestore
    await persistMetaConnection({
      tenantContext,
      userToken: longLivedToken,
      userTokenExpiresAt,
      pages,
      updatedByUid: uid,
    });

    const redirectUrl = buildRedirectUrl(lng, origin, { connected: "1" });
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Meta callback error:", error);
    const encryptedState = cookieStore.get(META_OAUTH_STATE_COOKIE)?.value;
    const authState = encryptedState
      ? await decryptMetaAuthState(encryptedState)
      : null;
    cookieStore.delete(META_OAUTH_STATE_COOKIE);
    const lng = resolveLocaleFromState(authState?.lng, request, cookieStore);
    const redirectUrl = buildRedirectUrl(lng, origin, { error: "token_exchange_failed" });

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
