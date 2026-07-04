import { NextResponse } from "next/server";

import { verifyAnyIdToken } from "@/lib/firebase/serverApp";
import {
  ADMIN_PRODUCT_PREVIEW_COOKIE,
  ADMIN_PRODUCT_PREVIEW_QUERY_PARAM,
  createAdminProductPreviewSession,
  getAdminProductPreviewCookieOptions,
} from "@/lib/product-preview.server";

function createJsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

function getSafeRedirectUrl(rawRedirect: string | null, requestUrl: URL) {
  const redirectUrl = new URL("/", requestUrl.origin);

  if (rawRedirect) {
    try {
      const parsedRedirect = new URL(rawRedirect, requestUrl.origin);

      if (parsedRedirect.origin === requestUrl.origin) {
        redirectUrl.pathname = parsedRedirect.pathname;
        redirectUrl.search = parsedRedirect.search;
        redirectUrl.hash = parsedRedirect.hash;
      }
    } catch {
      // Keep safe root fallback.
    }
  }

  redirectUrl.searchParams.set(ADMIN_PRODUCT_PREVIEW_QUERY_PARAM, "1");

  return redirectUrl;
}

function redirectWithClearedPreviewCookie(redirectUrl: URL) {
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(ADMIN_PRODUCT_PREVIEW_COOKIE, "", {
    ...getAdminProductPreviewCookieOptions(),
    maxAge: 0,
  });
  return response;
}

function getBodyStringValue(
  value: FormDataEntryValue | null | undefined,
): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

async function parsePreviewPostBody(request: Request): Promise<{
  redirect?: string;
  token?: string;
}> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      redirect?: unknown;
      token?: unknown;
    };

    return {
      redirect: typeof body.redirect === "string" ? body.redirect : undefined,
      token: typeof body.token === "string" ? body.token : undefined,
    };
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      redirect: getBodyStringValue(formData.get("redirect")),
      token: getBodyStringValue(formData.get("token")),
    };
  }

  return {};
}

async function createPreviewResponse(
  request: Request,
  redirectUrl: URL,
  explicitToken?: string,
) {
  const idToken = explicitToken ?? getBearerToken(request);

  if (!idToken) {
    return createJsonError("UNAUTHENTICATED", 401);
  }

  const decodedToken = await verifyAnyIdToken(idToken);
  if (!decodedToken) {
    return createJsonError("UNAUTHENTICATED", 401);
  }

  if (decodedToken.admin !== true) {
    return createJsonError("UNAUTHORIZED", 403);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(
    ADMIN_PRODUCT_PREVIEW_COOKIE,
    createAdminProductPreviewSession(decodedToken.uid),
    getAdminProductPreviewCookieOptions(),
  );

  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectUrl = getSafeRedirectUrl(
    requestUrl.searchParams.get("redirect"),
    requestUrl,
  );

  if (requestUrl.searchParams.get("disable") === "1") {
    return redirectWithClearedPreviewCookie(redirectUrl);
  }

  return createPreviewResponse(request, redirectUrl);
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectFromQuery = requestUrl.searchParams.get("redirect");

  try {
    const { redirect, token } = await parsePreviewPostBody(request);

    return createPreviewResponse(
      request,
      getSafeRedirectUrl(redirect ?? redirectFromQuery, requestUrl),
      token,
    );
  } catch (error) {
    console.error("Failed to parse product preview handoff request", error);
    return createJsonError("INVALID_REQUEST", 400);
  }
}
