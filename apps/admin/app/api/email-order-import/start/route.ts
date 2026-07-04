import { requireAdminAuth } from "@/actions/auth-utils";
import {
  createEmailOrderImportWorkflow,
  normalizeConversationEmails,
  type EmailOrderImportMode,
  type EmailOrderImportRecord,
} from "@/lib/ai/email-order-import";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { getMicrosoftAccessToken } from "@/lib/microsoft-auth";
import { getEmail, getEmailsByConversation } from "@konfi/microsoft";
import type { Attribute, NestedMember } from "@konfi/types";
import { all } from "better-all";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

interface StartEmailOrderImportBody {
  emailId: string;
  mailLink?: string;
  channelId: string;
  createdBy: NestedMember;
  attributes?: Attribute[];
  mode?: EmailOrderImportMode;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth();

    const { body, tokenResult } = await all({
      async body() {
        return request.json() as Promise<StartEmailOrderImportBody>;
      },
      tokenResult() {
        return getMicrosoftAccessToken();
      },
    });

    if (!tokenResult) {
      return NextResponse.json(
        { error: "Not authenticated with Microsoft" },
        { status: 401 },
      );
    }

    const {
      emailId,
      mailLink,
      channelId,
      createdBy,
      attributes = [],
      mode = "draft",
    } = body;

    if (!emailId || !channelId || !createdBy) {
      return NextResponse.json(
        {
          error: "Bad Request: emailId, channelId, and createdBy are required",
        },
        { status: 400 },
      );
    }

    const email = await getEmail(tokenResult.accessToken, emailId, false);

    if (!email.conversationId) {
      return NextResponse.json(
        { error: "Email does not have a conversation ID" },
        { status: 400 },
      );
    }

    const { emails } = await getEmailsByConversation(
      tokenResult.accessToken,
      email.conversationId,
    );

    const normalizedEmails = normalizeConversationEmails(emails);
    const firestore = getAdminDb();

    const importRecord: EmailOrderImportRecord = {
      conversationId: email.conversationId,
      emailId,
      mailLink: mailLink?.trim() || email.webLink || "",
      channelId,
      createdBy,
      requestedMode: mode,
      runId: null,
      status: "processing",
      subject: email.subject || normalizedEmails.at(-1)?.subject || "",
      emails: normalizedEmails,
      orderDraft: null,
      followUpEmail: null,
      error: null,
    };

    await firestore
      .collection("emailOrderImports")
      .doc(email.conversationId)
      .set(
        {
          ...importRecord,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    const run = await start(createEmailOrderImportWorkflow, [
      {
        importId: email.conversationId,
        conversationId: email.conversationId,
        emailId,
        mailLink: importRecord.mailLink,
        channelId,
        createdBy,
        requestedMode: mode,
        subject: importRecord.subject,
        emails: normalizedEmails,
      },
      {
        channelId,
        attributes,
      },
    ]);

    await firestore
      .collection("emailOrderImports")
      .doc(email.conversationId)
      .set(
        {
          runId: run.runId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return NextResponse.json({
      success: true,
      conversationId: email.conversationId,
      runId: run.runId,
    });
  } catch (error) {
    console.error("[Email Order Import Start] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start email import",
      },
      { status: 500 },
    );
  }
}
