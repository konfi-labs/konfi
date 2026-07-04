/**
 * Meta (Facebook/Instagram) OAuth2 Authorization Endpoint
 * GET /api/auth/meta — Redirect to Facebook login
 */

import { requireTenantPermission } from "@/actions/auth-utils";
import { isSocialFeatureEnabled } from "@/lib/social/feature-flag";
import {
  encryptMetaAuthState,
  buildMetaAuthorizationUrl,
  META_OAUTH_STATE_COOKIE,
  META_OAUTH_STATE_COOKIE_MAX_AGE,
} from "@/lib/social/meta-auth";
import { getMetaAppConfig } from "@/lib/social/meta-config";
import { cookieName, fallbackLng, languages } from "@/i18n/settings";
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

function resolveLocale(request: NextRequest, cookieStore: Awaited<ReturnType<typeof cookies>>): string {
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();
  if (!isSocialFeatureEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await requireTenantPermission("marketing.social.manage");

    const cookieStore = await cookies();
    const origin = getRequestPublicOrigin(request);
    const lng = resolveLocale(request, cookieStore);

    const appConfig = await getMetaAppConfig();
    if (!appConfig) {
      return NextResponse.json(
        { error: "Meta app credentials are not configured for this tenant" },
        { status: 400 },
      );
    }

    const redirectUri = new URL("/api/auth/callback/meta", origin).toString();
    const state = crypto.randomUUID();

    const encryptedState = await encryptMetaAuthState({
      state,
      redirectUri,
      createdAt: Date.now(),
      lng,
    });

    cookieStore.set(META_OAUTH_STATE_COOKIE, encryptedState, {
      httpOnly: true,
      // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: META_OAUTH_STATE_COOKIE_MAX_AGE,
      path: "/",
    });

    const url = buildMetaAuthorizationUrl({ appConfig, redirectUri, state });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Meta auth error:", error);
    return NextResponse.json(
      { error: "Failed to initialize Meta authentication" },
      { status: 500 },
    );
  }
}
