import { firebaseConfig } from "@/lib/firebase/config";
import { verifyAppCheckToken } from "@/lib/firebase/serverApp";
import { NextRequest, NextResponse } from "next/server";
import { storefrontProductSearch } from "../../actions";
import { isSameOriginRequest } from "@konfi/utils";

const APP_CHECK_HEADER = "x-firebase-appcheck";

interface SearchBody {
  query: string;
  lng: string;
  channelId: string;
}

async function verifySearchAppCheckToken(
  req: NextRequest,
): Promise<
  { ok: true; token?: string } | { ok: false; response: NextResponse }
> {
  const appCheckToken = req.headers.get(APP_CHECK_HEADER)?.trim();

  if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    return { ok: true, token: appCheckToken };
  }

  if (!appCheckToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing App Check token." },
        { status: 401 },
      ),
    };
  }

  const verification = await verifyAppCheckToken(appCheckToken);

  if (!verification) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid App Check token." },
        { status: 401 },
      ),
    };
  }

  if (verification.appId !== firebaseConfig.appId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid App Check app." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, token: appCheckToken };
}

export async function POST(req: NextRequest) {
  try {
    const sameOrigin = isSameOriginRequest({
      headers: req.headers,
      requestOrigin: req.nextUrl.origin,
      allowMissingHeaders: process.env.NODE_ENV !== "production",
    });

    if (!sameOrigin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const appCheck = await verifySearchAppCheckToken(req);

    if (!appCheck.ok) {
      return appCheck.response;
    }

    const { query, lng, channelId } = (await req.json()) as SearchBody;

    const results = await storefrontProductSearch(
      appCheck.token,
      lng,
      query,
      channelId,
    );

    return NextResponse.json(results ?? []);
  } catch (error) {
    console.error("API /search error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
