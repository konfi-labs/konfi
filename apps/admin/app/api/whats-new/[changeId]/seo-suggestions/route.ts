import { AdminAuthError, requireAdminAuth } from "@/actions/auth-utils";
import { listMonthlySeoSuggestions } from "@/lib/whats-new/seo-suggestions";
import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ changeId: string; }>;
}

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  await connection();
  try {
    const cookieStore = await cookies();
    await requireAdminAuth(cookieStore);
    const { changeId } = await params;
    const suggestions = await listMonthlySeoSuggestions(changeId);

    return NextResponse.json(suggestions, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error loading SEO suggestions:", error);
    return NextResponse.json(
      { error: "Failed to load SEO suggestions" },
      {
        status: error instanceof AdminAuthError ? error.statusCode : 500,
      },
    );
  }
}
