import {
  AdminAuthError,
  getAuthenticatedAdminUid,
  requireSuperAdminAuth,
} from "@/actions/auth-utils";
import {
  AdminPaymentRefundError,
  parsePaymentProviderKey,
  requestAdminPaymentRefund,
} from "@/lib/payments/admin";
import { connection, NextRequest } from "next/server";

type RefundRequestBody = {
  orderPath?: string;
  reason?: string;
  refundAmount?: number;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  await connection();

  try {
    await requireSuperAdminAuth();
    const { provider: providerParam } = await context.params;
    const provider = parsePaymentProviderKey(providerParam);

    if (!provider) {
      return Response.json(
        { error: "Unsupported payment provider" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as RefundRequestBody;
    if (
      !body.orderPath ||
      !body.reason ||
      typeof body.refundAmount !== "number" ||
      !Number.isFinite(body.refundAmount)
    ) {
      return Response.json(
        { error: "orderPath, reason, and refundAmount are required" },
        { status: 400 },
      );
    }

    const adminUid = await getAuthenticatedAdminUid();
    const result = await requestAdminPaymentRefund({
      provider,
      orderPath: body.orderPath,
      reason: body.reason,
      refundAmount: body.refundAmount,
      requestedBy: adminUid,
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Admin payment refund API error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create refund",
      },
      {
        status:
          error instanceof AdminPaymentRefundError ||
          error instanceof AdminAuthError
            ? error.statusCode
            : 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
