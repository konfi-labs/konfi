import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import {
  STOREFRONT_EDITOR_COOKIE,
  verifyStorefrontEditorToken,
} from "@/lib/storefront-editor/session";
import { DEFAULT_LOCALE, Locale } from "@konfi/types";
import { NextRequest, NextResponse } from "next/server";

const supportedLocales = new Set<string>(Object.values(Locale));

const redirectLocale = (value: unknown) => {
  return typeof value === "string" && supportedLocales.has(value)
    ? value
    : DEFAULT_LOCALE;
};

const parseJsonBody = async (request: NextRequest): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const readSessionRequestBody = (body: unknown) => {
  if (!body || typeof body !== "object") {
    return {};
  }

  const candidate = body as { lng?: unknown; token?: unknown };

  return {
    lng: candidate.lng,
    token: typeof candidate.token === "string" ? candidate.token : undefined,
  };
};

export async function GET() {
  return NextResponse.json(
    { error: "Use POST to create a storefront editor session." },
    {
      headers: {
        allow: "POST",
      },
      status: 405,
    },
  );
}

export async function POST(request: NextRequest) {
  const body = readSessionRequestBody(await parseJsonBody(request));
  const token = body.token;
  const session = verifyStorefrontEditorToken(token);

  if (!session) {
    return NextResponse.json(
      { error: "Invalid preview token." },
      {
        status: 401,
      },
    );
  }

  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (
    !runtimeConfig ||
    runtimeConfig.channelId !== session.channelId ||
    runtimeConfig.tenantContext.tenantId !== session.tenantId
  ) {
    return NextResponse.json(
      { error: "Preview tenant mismatch." },
      {
        status: 403,
      },
    );
  }

  const redirectUrl = new URL(`/${redirectLocale(body.lng)}`, request.url);
  redirectUrl.searchParams.set("preview", "1");

  const response = NextResponse.json({
    ok: true,
    redirectTo: `${redirectUrl.pathname}${redirectUrl.search}`,
  });

  response.cookies.set({
    httpOnly: true,
    maxAge: Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000)),
    name: STOREFRONT_EDITOR_COOKIE,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    value: token ?? "",
  });

  return response;
}
