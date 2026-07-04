/**
 * Microsoft Emails API Endpoint
 * GET /api/microsoft/emails - Get emails from user's mailbox
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import { getEmails, type GetEmailsOptions } from "@konfi/microsoft";
import { getMicrosoftAccessToken } from "@/lib/microsoft-auth";
import { connection, NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();
    const tokenResultPromise = getMicrosoftAccessToken();

    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get("folderId") || "inbox";
    const top = Math.min(parseInt(searchParams.get("top") || "25", 10), 50);
    const skip = parseInt(searchParams.get("skip") || "0", 10);
    const search = searchParams.get("search") || undefined;
    const filter = searchParams.get("filter") || undefined;

    const options: GetEmailsOptions = {
      folderId,
      top,
      skip,
      search,
      filter,
    };

    const tokenResult = await tokenResultPromise;

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Microsoft" },
        { status: 401 },
      );
    }

    const { emails, nextLink } = await getEmails(
      tokenResult.accessToken,
      options,
    );

    return NextResponse.json({
      emails,
      nextLink,
      count: emails.length,
      hasMore: !!nextLink,
    });
  } catch (error) {
    console.error("Error fetching Microsoft emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 },
    );
  }
}
