import { firebaseConfig } from "@/lib/firebase/config";
import { verifyAppCheckToken } from "@/lib/firebase/serverApp";
import { isSameOriginRequest } from "@konfi/utils";
import { NextRequest, NextResponse } from "next/server";

const APP_CHECK_HEADER = "x-firebase-appcheck";

export async function validateStorePlacesRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const sameOrigin = isSameOriginRequest({
    headers: request.headers,
    requestOrigin: request.nextUrl.origin,
    allowMissingHeaders: process.env.NODE_ENV !== "production",
  });

  if (!sameOrigin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    return null;
  }

  const appCheckToken = request.headers.get(APP_CHECK_HEADER)?.trim();

  if (!appCheckToken) {
    return NextResponse.json(
      { error: "Missing App Check token." },
      { status: 401 },
    );
  }

  const verification = await verifyAppCheckToken(appCheckToken);

  if (!verification) {
    return NextResponse.json(
      { error: "Invalid App Check token." },
      { status: 401 },
    );
  }

  if (verification.appId !== firebaseConfig.appId) {
    return NextResponse.json(
      { error: "Invalid App Check app." },
      { status: 403 },
    );
  }

  return null;
}
