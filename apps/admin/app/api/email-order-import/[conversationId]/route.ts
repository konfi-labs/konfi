import { requireAdminAuth } from "@/actions/auth-utils";
import type { EmailOrderImportRecord } from "@/lib/ai/email-order-import";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getRun } from "workflow/api";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await requireAdminAuth();
    const { conversationId } = await params;
    const firestore = getAdminDb();
    const doc = await firestore
      .collection("emailOrderImports")
      .doc(conversationId)
      .get();

    if (!doc.exists) {
      return NextResponse.json(null);
    }

    const record = doc.data() as EmailOrderImportRecord;

    if (record.status === "processing" && record.runId) {
      try {
        const run = getRun(record.runId);
        const workflowStatus = await run.status;

        if (workflowStatus === "failed") {
          const errorMessage = "Email import workflow failed";
          await firestore
            .collection("emailOrderImports")
            .doc(conversationId)
            .set(
              {
                status: "failed",
                error: errorMessage,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );

          return NextResponse.json({
            ...record,
            status: "failed",
            error: errorMessage,
          });
        }

        if (workflowStatus === "completed") {
          const refreshedDoc = await firestore
            .collection("emailOrderImports")
            .doc(conversationId)
            .get();
          const refreshed = refreshedDoc.data() as EmailOrderImportRecord;

          if (refreshed?.status === "processing") {
            const errorMessage =
              "Email import completed without saving a draft or follow-up email";
            await firestore
              .collection("emailOrderImports")
              .doc(conversationId)
              .set(
                {
                  status: "failed",
                  error: errorMessage,
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true },
              );

            return NextResponse.json({
              ...refreshed,
              status: "failed",
              error: errorMessage,
            });
          }

          return NextResponse.json(refreshed);
        }
      } catch (error) {
        console.error(
          "[Email Order Import Status] Workflow status check failed:",
          error,
        );
      }
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("[Email Order Import Status] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load email import status",
      },
      { status: 500 },
    );
  }
}
