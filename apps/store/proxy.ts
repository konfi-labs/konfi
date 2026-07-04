import acceptLanguage from "accept-language";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  cookieName,
  fallbackLng,
  headerName,
  languages,
} from "./app/i18n/settings";

acceptLanguage.languages(languages);

export const config = {
  matcher: [
    {
      source:
        "/((?!api|mcp(?:/.*)?|__/auth|__/firebase|_next(?:/static|/image|/webpack-hmr)?|assets|favicon\\.ico|sw\\.js|site\\.webmanifest|manifest\\.webmanifest|sitemap(?:-.*)?\\.xml|\\.well-known/(?:workflow/|oauth-protected-resource(?:/.*)?|oauth-authorization-server(?:/.*)?)|.*\\.(?:png)).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

const BOT_UA_REGEX =
  /(googlebot|bingbot|yandex|duckduckbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|crawler|spider|bot)/i;

export function proxy(req: NextRequest) {
  // Skip proxy for Server Actions
  // Server Actions are POST requests with specific headers
  if (
    req.method === "POST" &&
    (req.headers.get("next-action") ||
      req.headers.get("content-type")?.includes("multipart/form-data"))
  ) {
    return NextResponse.next();
  }

  // Ignore sitemap and paths with "icon" or "chrome"
  if (
    /^\/sitemap(?:-.*)?\.xml$/.test(req.nextUrl.pathname) ||
    req.nextUrl.pathname.indexOf("icon") > -1 ||
    req.nextUrl.pathname.indexOf("chrome") > -1
  ) {
    return NextResponse.next();
  }

  // Access request data first before crypto.randomUUID()
  const isBot = BOT_UA_REGEX.test(req.headers.get("user-agent") ?? "");

  // Now generate nonce after accessing headers
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
  const isDevelopment = process.env.NODE_ENV === "development";

  let lng: string | null = null;
  // Try to get language from cookie
  if (req.cookies.has(cookieName))
    lng = acceptLanguage.get(req.cookies.get(cookieName)?.value);
  // If no cookie, check the Accept-Language header
  if (!lng) lng = acceptLanguage.get(req.headers.get("Accept-Language"));
  // Default to fallback language if still undefined
  if (!lng) lng = fallbackLng;

  // Check if the language is already in the path
  const lngInPath = languages.find((loc) =>
    req.nextUrl.pathname.startsWith(`/${loc}`),
  );
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-konfi-pathname", req.nextUrl.pathname);
  headers.set(
    "x-konfi-request-target",
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );
  headers.set(headerName, lngInPath || lng);

  const cspHeader = [
    "default-src 'self'",
    // Keep same-origin allowlists active so prerendered/cached Next.js chunk scripts are not blocked by CSP.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://apis.google.com https://*.googleapis.com https://www.google.com https://www.gstatic.com https://www.googletagmanager.com https://geowidget.inpost.pl https://sandbox-easy-geowidget-sdk.easypack24.net https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://va.vercel-scripts.com https://geowidget.inpost.pl https://sandbox-easy-geowidget-sdk.easypack24.net",
    "img-src 'self' data: blob: https: http: https://*.googleapis.com https://*.gstatic.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss: ws: https://*.googleapis.com https://*.google.com https://www.googletagmanager.com https://*.inpost.pl https://*.easypack24.net",
    "frame-src 'self' https: https://*.google.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  // Propagate CSP to request headers so Next.js can extract the nonce and
  // apply it to inline scripts it generates (e.g. RSC payloads).
  headers.set("content-security-policy", cspHeader);

  // If the language is not in the path, redirect to include it
  if (!lngInPath && !req.nextUrl.pathname.startsWith("/_next")) {
    const targetPath = `/${lng}${req.nextUrl.pathname}${req.nextUrl.search}`;
    const url = new URL(targetPath, req.url);

    // Crawlers get an internal rewrite, browsers get a 302 redirect
    const response = isBot
      ? NextResponse.rewrite(url, {
          request: {
            headers: headers,
          },
        })
      : NextResponse.redirect(url);

    // Set CSP header with nonce
    response.headers.set("Content-Security-Policy", cspHeader);

    return response;
  }

  // If a referer exists, try to detect the language from there and set the cookie accordingly
  if (req.headers.has("referer")) {
    const refererUrl = new URL(req.headers.get("referer")!);
    const lngInReferer = languages.find((l) =>
      refererUrl.pathname.startsWith(`/${l}`),
    );
    const response = NextResponse.next({
      request: {
        headers: headers,
      },
    });
    if (lngInReferer) response.cookies.set(cookieName, lngInReferer);

    // Set CSP header with nonce
    response.headers.set("Content-Security-Policy", cspHeader);

    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: headers,
    },
  });

  // Set CSP header with nonce
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}
