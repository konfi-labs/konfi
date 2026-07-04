import { getAdminAuth, getAdminDb } from "@/lib/firebase/serverApp";
import { NextRequest, NextResponse } from "next/server";

const AUTH_HEADER_PREFIX = "Bearer ";

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith(AUTH_HEADER_PREFIX)) {
    return null;
  }

  return authHeader.slice(AUTH_HEADER_PREFIX.length);
}

export async function POST(request: NextRequest) {
  const idToken = getBearerToken(request);
  if (!idToken) {
    return NextResponse.json(
      { message: "User must be authenticated." },
      { status: 401 },
    );
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);

    await getAdminDb().collection("newsletter").doc(decodedToken.uid).set(
      {
        subscribed: false,
      },
      { merge: true },
    );

    return NextResponse.json({ message: "Newsletter unsubscribed" });
  } catch (error) {
    console.error("Failed to unsubscribe from newsletter:", error);
    return NextResponse.json(
      { message: "Failed to unsubscribe from newsletter." },
      { status: 500 },
    );
  }
}
