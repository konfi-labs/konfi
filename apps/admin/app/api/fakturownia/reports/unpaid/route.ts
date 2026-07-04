import { AdminAuthError, requireAdminAuth } from "@/actions/auth-utils";
import {
  generateFakturowniaUnpaidReportPdf,
  type FakturowniaReportRequest,
} from "@/lib/fakturownia/reports/service";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth();
    const body = (await request.json()) as FakturowniaReportRequest;
    const report = await generateFakturowniaUnpaidReportPdf(body);

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to generate Fakturownia unpaid report:", error);

    if (error instanceof AdminAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate Fakturownia unpaid report.",
      },
      { status: 500 },
    );
  }
}
