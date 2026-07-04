import { requireAdminAuth } from "@/actions/auth-utils";
import {
  getPaymentListQueryParams,
  listAdminPayments,
  parsePaymentProviderKey,
} from "@/lib/payments/admin";
import { connection, NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  await connection();

  try {
    await requireAdminAuth();
    const { provider: providerParam } = await context.params;
    const provider = parsePaymentProviderKey(providerParam);

    if (!provider) {
      return Response.json({ error: "Unsupported payment provider" }, { status: 400 });
    }

    const payload = await listAdminPayments({
      provider,
      ...getPaymentListQueryParams(request.nextUrl.searchParams),
    });

    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Admin payments API error:", error);
    return Response.json(
      { error: "Failed to load payments" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
