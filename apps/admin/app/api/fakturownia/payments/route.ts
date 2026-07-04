"use server";

import { requireAdminAuth } from "@/actions/auth-utils";
import { getPayments } from "@/actions/fakturownia";
import type { BankingPayment } from "@konfi/fakturownia/out/client/models";
import { connection, NextRequest } from "next/server";

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 99; // keep one slot to detect additional pages (API max is 100)

export type FakturowniaPaymentsResponse = {
  items: BankingPayment[];
  page: number;
  perPage: number;
  hasMore: boolean;
  totalCountHint: number;
  error?: string;
};

export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  try {
    await requireAdminAuth();

    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const perPageInput = parsePositiveInt(
      url.searchParams.get("perPage"),
      DEFAULT_PER_PAGE,
    );
    const perPage = Math.min(Math.max(perPageInput, 1), MAX_PER_PAGE);

    // Ask Fakturownia for one extra record to detect if there is another page
    const payments = await getPayments({
      page,
      perPage: Math.min(perPage + 1, 100),
    });
    const list = payments ?? [];
    const hasMore = list.length > perPage;
    const items = hasMore ? list.slice(0, perPage) : list;
    const totalCountHint = hasMore
      ? page * perPage + 1
      : (page - 1) * perPage + items.length;

    const payload: FakturowniaPaymentsResponse = {
      items,
      page,
      perPage,
      hasMore,
      totalCountHint,
    };

    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Fakturownia payments API error:", error);
    return Response.json(
      { error: "Failed to load Fakturownia payments" },
      { status: 500 },
    );
  }
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
