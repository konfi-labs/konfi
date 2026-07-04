/**
 * Microsoft Send Email API Endpoint
 * POST /api/microsoft/emails/send - Send an email
 */

import { requireAdminAuth } from "@/actions/auth-utils";
import { sendEmail, type SendEmailRequest } from "@konfi/microsoft";
import { getMicrosoftAccessToken } from "@/lib/microsoft-auth";
import { all } from "better-all";
import { NextRequest, NextResponse } from "next/server";

interface SendEmailRequestBody {
  to: { name?: string; email: string; }[];
  cc?: { name?: string; email: string; }[];
  bcc?: { name?: string; email: string; }[];
  subject: string;
  body: string;
  bodyType?: "text" | "html";
  saveToSentItems?: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminAuth();
    const { tokenResult, body } = await all({
      tokenResult() {
        return getMicrosoftAccessToken();
      },
      async body() {
        return request.json() as Promise<SendEmailRequestBody>;
      },
    });

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Microsoft" },
        { status: 401 },
      );
    }

    // Validate required fields
    if (!body.to || body.to.length === 0) {
      return NextResponse.json(
        { error: "At least one recipient is required" },
        { status: 400 },
      );
    }

    if (!body.subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 },
      );
    }

    if (!body.body) {
      return NextResponse.json({ error: "Body is required" }, { status: 400 });
    }

    const emailRequest: SendEmailRequest = {
      subject: body.subject,
      body: {
        contentType: body.bodyType || "html",
        content: body.body,
      },
      toRecipients: body.to.map((r) => ({
        emailAddress: {
          name: r.name || r.email,
          address: r.email,
        },
      })),
      ccRecipients: body.cc?.map((r) => ({
        emailAddress: {
          name: r.name || r.email,
          address: r.email,
        },
      })),
      bccRecipients: body.bcc?.map((r) => ({
        emailAddress: {
          name: r.name || r.email,
          address: r.email,
        },
      })),
      saveToSentItems: body.saveToSentItems ?? true,
    };

    await sendEmail(tokenResult.accessToken, emailRequest);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending Microsoft email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
