"use server";

import { getAdminAuth, verifyIdToken } from "@/lib/firebase/serverApp";
import { NextRequest } from "next/server";

type AuthLookupRequest = {
  email: string;
};

type AuthLookupResponse = {
  uid?: string;
  email?: string;
  error?: string;
};

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Verify the requesting user is authenticated and an admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.slice("Bearer ".length).trim();
    if (!idToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRecord = await verifyIdToken(idToken);
    if (!userRecord) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      userRecord.customClaims?.admin !== true ||
      userRecord.customClaims.accessLevel !== 9999
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as AuthLookupRequest;
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    // Try to find user by email
    try {
      const auth = getAdminAuth();
      const user = await auth.getUserByEmail(email);
      const response: AuthLookupResponse = {
        uid: user.uid,
        email: user.email,
      };
      return Response.json(response);
    } catch (error: unknown) {
      // User not found is not an error, just return empty result
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "auth/user-not-found"
      ) {
        return Response.json({});
      }
      throw error;
    }
  } catch (error) {
    console.error("Auth lookup failed:", error);
    // Return empty response instead of error to allow graceful fallback
    return Response.json({});
  }
}
