/**
 * Microsoft Email Conversation API Endpoint
 * GET /api/microsoft/emails/conversation/[id] - Get all emails in a conversation thread
 *
 * Takes an email ID, fetches the email to get its conversationId,
 * then fetches all emails in that conversation thread.
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import { getEmail, getEmailsByConversation } from "@konfi/microsoft";
import { getMicrosoftAccessToken } from "@/lib/microsoft-auth";
import { all } from "better-all";
import { connection, NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string; }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  await connection();
  try {
    await requireAdminAuth();
    const { tokenResult, id } = await all({
      tokenResult() {
        return getMicrosoftAccessToken();
      },
      async id() {
        return (await params).id;
      },
    });

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Microsoft" },
        { status: 401 },
      );
    }

    // First, fetch the email to get its conversationId
    const email = await getEmail(tokenResult.accessToken, id, false);

    if (!email.conversationId) {
      return NextResponse.json(
        { error: "Email does not have a conversation ID" },
        { status: 400 },
      );
    }

    // Fetch all emails in the conversation
    const { emails, nextLink } = await getEmailsByConversation(
      tokenResult.accessToken,
      email.conversationId,
    );

    return NextResponse.json({
      emails,
      conversationId: email.conversationId,
      nextLink,
      count: emails.length,
    });
  } catch (error) {
    console.error("Error fetching email conversation:", error);
    return NextResponse.json(
      { error: "Failed to fetch email conversation" },
      { status: 500 },
    );
  }
}
