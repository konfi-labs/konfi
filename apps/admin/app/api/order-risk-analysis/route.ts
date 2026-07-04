import {
  getLatestOrderRiskAnalysis,
  startOrderRiskAnalysisWorkflow,
} from "@/actions/order-risk-workflow";
import { OrderRiskAnalysisSource } from "@konfi/types";
import { NextResponse, type NextRequest } from "next/server";

type StartOrderRiskAnalysisBody = {
  channelId?: unknown;
  orderId?: unknown;
  source?: unknown;
};

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOrderRiskAnalysisSource(value: unknown): OrderRiskAnalysisSource {
  if (
    typeof value === "string" &&
    Object.values(OrderRiskAnalysisSource).includes(
      value as OrderRiskAnalysisSource,
    )
  ) {
    return value as OrderRiskAnalysisSource;
  }

  return OrderRiskAnalysisSource.MANUAL_RERUN;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const channelId = readRequiredString(
    request.nextUrl.searchParams.get("channelId"),
  );
  const orderId = readRequiredString(
    request.nextUrl.searchParams.get("orderId"),
  );

  if (!channelId || !orderId) {
    return NextResponse.json(
      { error: "channelId and orderId are required" },
      { status: 400 },
    );
  }

  const analysis = await getLatestOrderRiskAnalysis({ channelId, orderId });
  return NextResponse.json(analysis, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as StartOrderRiskAnalysisBody;
  const channelId = readRequiredString(body.channelId);
  const orderId = readRequiredString(body.orderId);

  if (!channelId || !orderId) {
    return NextResponse.json(
      { error: "channelId and orderId are required", started: false },
      { status: 400 },
    );
  }

  const result = await startOrderRiskAnalysisWorkflow({
    channelId,
    orderId,
    source: readOrderRiskAnalysisSource(body.source),
  });

  return NextResponse.json(result, {
    status: result.error ? 400 : 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
