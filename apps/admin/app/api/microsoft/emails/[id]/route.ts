/**
 * Microsoft Single Email API Endpoint
 * GET /api/microsoft/emails/[id] - Get a specific email
 * PATCH /api/microsoft/emails/[id] - Update email (mark read/unread)
 * DELETE /api/microsoft/emails/[id] - Delete email
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import { getEmail, updateEmailReadStatus, deleteEmail } from "@konfi/microsoft";
import { getMicrosoftAccessToken } from "@/lib/microsoft-auth";
import { all } from "better-all";
import { connection, NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string; }>;
}

export async function GET(
  request: NextRequest,
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

    const includeAttachments =
      request.nextUrl.searchParams.get("attachments") === "true";

    const email = await getEmail(
      tokenResult.accessToken,
      id,
      includeAttachments,
    );

    return NextResponse.json({ email });
  } catch (error) {
    console.error("Error fetching Microsoft email:", error);
    return NextResponse.json(
      { error: "Failed to fetch email" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await requireAdminAuth();
    const { tokenResult, id, body } = await all({
      tokenResult() {
        return getMicrosoftAccessToken();
      },
      async id() {
        return (await params).id;
      },
      async body() {
        return request.json() as Promise<{ isRead?: boolean; }>;
      },
    });

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Microsoft" },
        { status: 401 },
      );
    }

    if (typeof body.isRead === "boolean") {
      await updateEmailReadStatus(tokenResult.accessToken, id, body.isRead);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating Microsoft email:", error);
    return NextResponse.json(
      { error: "Failed to update email" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
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
    await deleteEmail(tokenResult.accessToken, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Microsoft email:", error);
    return NextResponse.json(
      { error: "Failed to delete email" },
      { status: 500 },
    );
  }
}
