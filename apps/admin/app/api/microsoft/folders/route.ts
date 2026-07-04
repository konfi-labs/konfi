/**
 * Microsoft Mail Folders API Endpoint
 * GET /api/microsoft/folders - Get user's mail folders
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import { getMailFolders } from "@konfi/microsoft";
import { getMicrosoftAccessToken } from "@/lib/microsoft-auth";
import { connection, NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();
    const tokenResult = await getMicrosoftAccessToken();

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Microsoft" },
        { status: 401 },
      );
    }

    const folders = await getMailFolders(tokenResult.accessToken);

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("Error fetching Microsoft folders:", error);
    return NextResponse.json(
      { error: "Failed to fetch folders" },
      { status: 500 },
    );
  }
}
