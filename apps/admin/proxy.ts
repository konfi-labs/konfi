import { ADMIN_TOOLS_CHAT, ADMIN_TOOLS_CHAT_ID } from "@konfi/utils";
import acceptLanguage from "accept-language";
import { generateId } from "ai";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  cookieName,
  fallbackLng,
  headerName,
  languages,
} from "./app/i18n/settings";
import {
  normalizeTenantContextHint,
  tenantContextQueryParam,
} from "./lib/tenant-handoff";

acceptLanguage.languages(languages);

function isRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isLocalizedRoute(pathname: string, route: string) {
  return languages.some((loc) => isRoute(pathname, `/${loc}${route}`));
}

function buildRedirectUrl(
  request: NextRequest,
  pathname: string,
  options?: { preserveSearch?: boolean },
) {
  const url = new URL(pathname, request.url);

  if (options?.preserveSearch) {
    url.search = request.nextUrl.search;
  }

  return url;
}

function buildLoginRedirectUrl(request: NextRequest, lng: string) {
  const loginUrl = buildRedirectUrl(request, `/${lng}/auth/login`);
  const tenantContextHint = normalizeTenantContextHint(
    request.nextUrl.searchParams.get(tenantContextQueryParam),
  );

  if (tenantContextHint) {
    loginUrl.searchParams.set(tenantContextQueryParam, tenantContextHint);
  }

  return loginUrl;
}

function normalizeCspHttpOrigin(target: string | undefined, fallback: string) {
  const normalizedTarget = (target?.trim() || fallback).replace(
    /^https?:\/\//,
    "",
  );

  return `http://${normalizedTarget}`;
}

function getFirebaseEmulatorConnectSources() {
  const authEmulatorHost =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ??
    process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulatorHost =
    process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ??
    process.env.FIRESTORE_EMULATOR_HOST;
  const storageEmulatorHost =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST ??
    process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const functionsEmulatorHost =
    process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST;
  const useFirebaseEmulators =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ||
    Boolean(authEmulatorHost) ||
    Boolean(firestoreEmulatorHost) ||
    Boolean(storageEmulatorHost) ||
    Boolean(functionsEmulatorHost);

  if (!useFirebaseEmulators) {
    return "";
  }

  return [
    normalizeCspHttpOrigin(authEmulatorHost, "127.0.0.1:9099"),
    normalizeCspHttpOrigin(firestoreEmulatorHost, "127.0.0.1:8080"),
    normalizeCspHttpOrigin(storageEmulatorHost, "127.0.0.1:9199"),
    normalizeCspHttpOrigin(functionsEmulatorHost, "127.0.0.1:5001"),
  ].join(" ");
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|mcp(?:/.*)?|__/auth|__/firebase|_next(?:/static|/image|/webpack-hmr)?|assets|favicon\\.ico|.*-sw\\.js|sw\\.js|workbox-.*\\.js|worker-.*\\.js|site\\.webmanifest|manifest\\.webmanifest|\\.well-known/workflow/|\\.well-known/oauth-(?:protected-resource|authorization-server)(?:/|$)|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|wasm)).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

export function proxy(request: NextRequest) {
  // Skip proxy for Server Actions
  // Server Actions are POST requests with specific headers
  if (
    request.method === "POST" &&
    (request.headers.get("next-action") ||
      request.headers.get("content-type")?.includes("multipart/form-data"))
  ) {
    return NextResponse.next();
  }

  // Access request data first before crypto.randomUUID()
  const isAdmin = request.cookies.get("__isAdmin")?.value || "";
  const isCourier = request.cookies.get("__isCourier")?.value || "";
  const sessionCookie = request.cookies.get("__session")?.value || "";
  const hasSession = Boolean(sessionCookie);
  const isAdminSession = hasSession && isAdmin === "true";
  const isCourierSession = hasSession && isCourier === "true";
  const shouldClearRoleCookies =
    !hasSession &&
    (isAdmin === "true" ||
      isCourier === "true" ||
      request.cookies.has("__session"));

  // Now generate nonce after accessing cookies
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
  const nodeEnv = process.env.NODE_ENV;
  const isDevelopment = nodeEnv === "development";
  const isProduction = nodeEnv === "production";
  const emulatorConnectSources = getFirebaseEmulatorConnectSources();

  // i18n language detection
  let lng: string | null = null;
  // Try to get language from cookie
  if (request.cookies.has(cookieName))
    lng = acceptLanguage.get(request.cookies.get(cookieName)?.value);
  // If no cookie, check the Accept-Language header
  if (!lng) lng = acceptLanguage.get(request.headers.get("Accept-Language"));
  // Default to fallback language if still undefined
  if (!lng) lng = fallbackLng;

  // Check if the language is already in the path
  const lngInPath = languages.find((loc) =>
    request.nextUrl.pathname.startsWith(`/${loc}`),
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, lngInPath || lng);

  const cspHeader = [
    "default-src 'self'",
    // Keep same-origin allowlists active so prerendered/cached Next.js chunk scripts are not blocked by CSP.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://apis.google.com https://*.googleapis.com https://www.google.com https://www.gstatic.com https://geowidget.inpost.pl https://sandbox-easy-geowidget-sdk.easypack24.net`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://geowidget.inpost.pl https://sandbox-easy-geowidget-sdk.easypack24.net",
    "img-src 'self' data: blob: https: http: konfi-preview: https://*.googleapis.com https://*.gstatic.com",
    "media-src 'self' blob: https://*.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' data: https: wss: ws:${emulatorConnectSources ? ` ${emulatorConnectSources}` : ""} https://*.googleapis.com https://*.google.com https://*.inpost.pl https://*.easypack24.net`,
    "frame-src 'self' https: https://*.google.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  // Propagate CSP to request headers so Next.js can extract the nonce and
  // apply it to inline scripts it generates (e.g. RSC payloads).
  requestHeaders.set("content-security-policy", cspHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Set CSP header with nonce
  response.headers.set("Content-Security-Policy", cspHeader);

  const { pathname } = request.nextUrl;
  const normalizedPathname =
    pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  const isLoginRoute =
    isRoute(pathname, "/auth/login") ||
    isLocalizedRoute(pathname, "/auth/login");

  // Check authentication first
  if (!isAdminSession) {
    // Admin not present; check courier role
    const isCourierTrue = isCourierSession;

    // Allow access only to /delivery (localized) for courier
    const isDeliveryRoute =
      pathname === "/delivery" ||
      pathname.startsWith("/delivery/") ||
      languages.some(
        (loc) =>
          pathname === `/${loc}/delivery` ||
          pathname.startsWith(`/${loc}/delivery/`),
      );

    if (isCourierTrue) {
      // If courier tries to access anything outside delivery, redirect to delivery
      if (!isDeliveryRoute) {
        const deliveryUrl = buildRedirectUrl(request, `/${lng}/delivery`);
        return NextResponse.redirect(deliveryUrl);
      }
      // If courier on allowed route, continue
    } else {
      // Neither admin nor courier: redirect to login if not already there
      if (!isLoginRoute) {
        const loginUrl = buildLoginRedirectUrl(request, lng);
        return NextResponse.redirect(loginUrl);
      }
    }
  } else {
    // If token is valid and trying to access sign-in, redirect to dashboard with language
    if (isLoginRoute) {
      const dashboardUrl = buildRedirectUrl(request, `/${lng}`);
      return NextResponse.redirect(dashboardUrl);
    }

    const resolvedLng = lngInPath || lng;
    const chatSegments = normalizedPathname.split("/").filter(Boolean);
    const isLocalizedChat =
      chatSegments.length === 3 &&
      languages.includes(chatSegments[0]) &&
      chatSegments.slice(1).join("/") === ADMIN_TOOLS_CHAT.slice(1);

    if (normalizedPathname === ADMIN_TOOLS_CHAT) {
      const id = generateId();
      const chatUrl = buildRedirectUrl(
        request,
        `/${resolvedLng}${ADMIN_TOOLS_CHAT_ID(id)}`,
      );
      return NextResponse.redirect(chatUrl);
    }

    if (isLocalizedChat) {
      const id = generateId();
      const chatUrl = buildRedirectUrl(
        request,
        `/${chatSegments[0]}${ADMIN_TOOLS_CHAT_ID(id)}`,
      );
      return NextResponse.redirect(chatUrl);
    }
  }

  if (shouldClearRoleCookies) {
    const baseCookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as const,
      path: "/",
    };

    response.cookies.set("__session", "", { ...baseCookieOptions, maxAge: 0 });
    response.cookies.set("__isAdmin", "false", {
      ...baseCookieOptions,
      maxAge: 0,
    });
    response.cookies.set("__isCourier", "false", {
      ...baseCookieOptions,
      maxAge: 0,
    });
  }

  // Handle i18n redirects for non-admin paths
  if (
    !lngInPath &&
    !pathname.startsWith("/_next") &&
    !isRoute(pathname, "/auth/login") &&
    !isLoginRoute
  ) {
    const newPathname = `/${lng}${pathname}`;
    return NextResponse.redirect(
      new URL(`${newPathname}${request.nextUrl.search}`, request.url),
    );
  }

  if (!lngInPath && isRoute(pathname, "/auth/login")) {
    return NextResponse.redirect(
      buildRedirectUrl(request, `/${lng}${pathname}`, {
        preserveSearch: true,
      }),
    );
  }

  // If a referer exists, try to detect the language from there and set the cookie accordingly
  if (request.headers.has("referer")) {
    const refererUrl = new URL(request.headers.get("referer")!);
    const lngInReferer = languages.find((l) =>
      refererUrl.pathname.startsWith(`/${l}`),
    );
    if (lngInReferer) response.cookies.set(cookieName, lngInReferer);
  }

  return response;
}
