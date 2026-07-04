"use server";

import { AdminAuthError, requireAdminAuth } from "@/actions/auth-utils";
import { lookupFakturowniaCustomerDescriptionsByNip } from "@/lib/customer-data/lookup";
import { NextRequest, NextResponse } from "next/server";

interface LookupRequestBody {
  nip?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireAdminAuth();

    const body = (await request.json()) as LookupRequestBody;
    const nip = body.nip?.trim();

    if (!nip) {
      return NextResponse.json(
        { error: "NIP is required." },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const result = await lookupFakturowniaCustomerDescriptionsByNip(nip);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Customer description lookup route error:", error);

    if (error instanceof AdminAuthError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.statusCode,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      { error: "Failed to look up customer description." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
