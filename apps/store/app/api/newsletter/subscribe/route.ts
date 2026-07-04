import { getAdminAuth, getAdminDb } from "@/lib/firebase/serverApp";
import { createNewsletterPromotionForSubscriber } from "@/lib/newsletter/newsletter-promotion.server";
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
    const user = await getAdminAuth().getUser(decodedToken.uid);
    const email = user.email?.toLowerCase();

    if (!email) {
      return NextResponse.json(
        { message: "Authenticated user has no email address." },
        { status: 400 },
      );
    }

    const newsletterRef = getAdminDb()
      .collection("newsletter")
      .doc(decodedToken.uid);
    const previousNewsletter = await newsletterRef.get();
    const wasSubscribed = previousNewsletter.data()?.subscribed === true;

    await newsletterRef.set(
      {
        email,
        subscribed: true,
      },
      { merge: true },
    );

    if (!wasSubscribed) {
      try {
        await createNewsletterPromotionForSubscriber({
          email,
          userId: decodedToken.uid,
        });
      } catch (error) {
        console.error("Failed to create newsletter promotion:", error);
      }
    }

    return NextResponse.json({ message: "Newsletter subscribed" });
  } catch (error) {
    console.error("Failed to subscribe to newsletter:", error);
    return NextResponse.json(
      { message: "Failed to subscribe to newsletter." },
      { status: 500 },
    );
  }
}
