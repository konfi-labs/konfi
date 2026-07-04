"use server";

import { requireAdminAuth } from "@/actions/auth-utils";
import { changeInvoiceStatus } from "@/actions/fakturownia";
import { getFakturowniaClient } from "@/lib/fakturownia/client";
import type { Invoice } from "@konfi/fakturownia/out/client/models";
import { DateOnly } from "@microsoft/kiota-abstractions";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { connection, NextRequest } from "next/server";

const INVOICE_PAGE_SIZE = 100;
const MAX_PAGE_COUNT = 100;
const COMPLETED_ESTIMATE_STATUS: NonNullable<Invoice["status"]> = "completed";
const PENDING_MONTHLY_INVOICES_TAG = "fakturownia-pending-monthly-invoices";
const COMPANY_NAME_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
});
const ESTIMATE_LABEL_COLLATOR = new Intl.Collator(undefined);

type InvoiceDateValue = Invoice["issueDate"] | string | null | undefined;

type PendingMonthlyEstimateInvoice = {
  buyerEmail?: string;
  buyerFirstName?: string;
  buyerLastName?: string;
  buyerName?: string;
  cancelled?: boolean;
  clientId?: string;
  id: number;
  issueDate?: InvoiceDateValue;
  number?: string;
  sellDate?: string | null;
  status?: Invoice["status"];
  viewUrl?: string;
};

type PendingMonthlyInvoiceEstimate = {
  id: number;
  issueDate?: string;
  number?: string;
  viewUrl?: string;
};

type PendingMonthlyInvoiceCompany = {
  id: string;
  clientId?: string;
  company?: string;
  estimateCount: number;
  estimates: PendingMonthlyInvoiceEstimate[];
  latestIssueDate?: string;
};

type PendingMonthlyInvoicesResponse = {
  items: PendingMonthlyInvoiceCompany[];
  month: string;
  totalCompanies: number;
  totalEstimates: number;
};

type PendingMonthlyInvoicesBulkUpdateResponse = {
  failedCount: number;
  updatedCount: number;
};

function getCurrentMonthValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function resolveMonthParam(value: string | null): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    return value;
  }
  return getCurrentMonthValue();
}

function normalizeEstimateIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => {
      if (typeof item === "number" && Number.isInteger(item)) {
        return item;
      }

      if (typeof item === "string") {
        const parsed = Number.parseInt(item.trim(), 10);
        return Number.isInteger(parsed) ? parsed : undefined;
      }

      return undefined;
    })
    .filter((item): item is number => typeof item === "number" && item > 0);

  return [...new Set(normalized)];
}

function getMonthBounds(month: string): { dateFrom: string; dateTo: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const monthIndex = Number.parseInt(monthText ?? "", 10) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function normalizeDateValue(value: InvoiceDateValue): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    if ("toString" in value && typeof value.toString === "function") {
      const stringValue = value.toString();
      if (stringValue && stringValue !== "[object Object]") {
        return stringValue;
      }
    }

    const dateCandidate = value as {
      day?: number;
      month?: number;
      year?: number;
    };

    if (
      typeof dateCandidate.year === "number" &&
      typeof dateCandidate.month === "number" &&
      typeof dateCandidate.day === "number"
    ) {
      const year = String(dateCandidate.year).padStart(4, "0");
      const monthValue = String(dateCandidate.month).padStart(2, "0");
      const day = String(dateCandidate.day).padStart(2, "0");
      return `${year}-${monthValue}-${day}`;
    }
  }

  return undefined;
}

function resolveCompanyName(
  invoice: PendingMonthlyEstimateInvoice,
): string | undefined {
  const buyerName = invoice.buyerName?.trim();
  if (buyerName) {
    return buyerName;
  }

  const composedName = [invoice.buyerFirstName, invoice.buyerLastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  if (composedName) {
    return composedName;
  }

  const buyerEmail = invoice.buyerEmail?.trim();
  if (buyerEmail) {
    return buyerEmail;
  }

  return undefined;
}

function isPendingEstimateCandidate(
  invoice: Partial<PendingMonthlyEstimateInvoice>,
): invoice is PendingMonthlyEstimateInvoice {
  return (
    typeof invoice.id === "number" &&
    invoice.cancelled !== true &&
    invoice.status !== "rejected" &&
    invoice.status !== COMPLETED_ESTIMATE_STATUS
  );
}

async function getInvoicesPage(params: {
  dateFrom?: string;
  dateTo?: string;
  page: number;
}): Promise<Array<Partial<PendingMonthlyEstimateInvoice>>> {
  const client = await getFakturowniaClient();
  const invoices = await client.invoicesJson.get({
    queryParameters: {
      page: params.page,
      perPage: INVOICE_PAGE_SIZE,
      kind: "estimate",
      dateFrom: params.dateFrom ? DateOnly.parse(params.dateFrom) : undefined,
      dateTo: params.dateTo ? DateOnly.parse(params.dateTo) : undefined,
    },
  });

  return (invoices ?? []).map((invoice) => ({
    buyerEmail: invoice.buyerEmail?.trim() || undefined,
    buyerFirstName: invoice.buyerFirstName?.trim() || undefined,
    buyerLastName: invoice.buyerLastName?.trim() || undefined,
    buyerName: invoice.buyerName?.trim() || undefined,
    cancelled: invoice.cancelled === true,
    clientId:
      typeof invoice.clientId === "string"
        ? invoice.clientId.trim() || undefined
        : typeof invoice.clientId === "number"
          ? String(invoice.clientId)
          : undefined,
    id: invoice.id ?? undefined,
    issueDate: invoice.issueDate ?? undefined,
    number: invoice.number?.trim() || undefined,
    sellDate: invoice.sellDate ?? undefined,
    status: invoice.status ?? undefined,
    viewUrl: invoice.viewUrl?.trim() || undefined,
  }));
}

async function getEstimateInvoicesForMonth(
  dateFrom: string,
  dateTo: string,
): Promise<PendingMonthlyEstimateInvoice[]> {
  const estimates: PendingMonthlyEstimateInvoice[] = [];

  for (let page = 1; page <= MAX_PAGE_COUNT; page += 1) {
    const pageItems = await getInvoicesPage({
      dateFrom,
      dateTo,
      page,
    });

    if (pageItems.length === 0) {
      break;
    }

    estimates.push(...pageItems.filter(isPendingEstimateCandidate));

    if (pageItems.length < INVOICE_PAGE_SIZE) {
      break;
    }
  }

  return estimates;
}

function groupPendingMonthlyInvoices(
  estimates: PendingMonthlyEstimateInvoice[],
): PendingMonthlyInvoiceCompany[] {
  const grouped = new Map<string, PendingMonthlyInvoiceCompany>();

  for (const estimate of estimates) {
    const clientId = estimate.clientId?.trim() || undefined;
    const company = resolveCompanyName(estimate);
    const groupKey = clientId
      ? `client:${clientId}`
      : `company:${(company ?? String(estimate.id)).toLowerCase()}`;
    const issueDate =
      normalizeDateValue(estimate.issueDate) ??
      normalizeDateValue(estimate.sellDate ?? undefined);

    const existing = grouped.get(groupKey) ?? {
      id: groupKey,
      clientId,
      company,
      estimateCount: 0,
      estimates: [],
      latestIssueDate: issueDate,
    };

    existing.estimateCount += 1;
    if (company && !existing.company) {
      existing.company = company;
    }
    if (
      issueDate &&
      (!existing.latestIssueDate || issueDate > existing.latestIssueDate)
    ) {
      existing.latestIssueDate = issueDate;
    }
    existing.estimates.push({
      id: estimate.id,
      issueDate,
      number: estimate.number ?? undefined,
      viewUrl: estimate.viewUrl?.trim() || undefined,
    });

    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      estimates:
        entry.estimates.length > 1
          ? [...entry.estimates].sort((left, right) => {
              const leftDate = left.issueDate ?? "";
              const rightDate = right.issueDate ?? "";
              if (leftDate !== rightDate) {
                return ESTIMATE_LABEL_COLLATOR.compare(leftDate, rightDate);
              }
              return ESTIMATE_LABEL_COLLATOR.compare(
                left.number ?? "",
                right.number ?? "",
              );
            })
          : entry.estimates,
    }))
    .sort((left, right) => {
      const leftLabel = left.company ?? left.clientId ?? left.id;
      const rightLabel = right.company ?? right.clientId ?? right.id;
      return COMPANY_NAME_COLLATOR.compare(leftLabel, rightLabel);
    });
}

async function getPendingMonthlyInvoicesPayload(
  month: string,
  dateFrom: string,
  dateTo: string,
): Promise<PendingMonthlyInvoicesResponse> {
  "use cache";
  cacheLife("minutes");
  cacheTag(PENDING_MONTHLY_INVOICES_TAG);

  const estimateInvoices = await getEstimateInvoicesForMonth(dateFrom, dateTo);

  if (estimateInvoices.length === 0) {
    return {
      items: [],
      month,
      totalCompanies: 0,
      totalEstimates: 0,
    };
  }

  const items = groupPendingMonthlyInvoices(estimateInvoices);

  return {
    items,
    month,
    totalCompanies: items.length,
    totalEstimates: estimateInvoices.length,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  try {
    await requireAdminAuth();

    const url = new URL(request.url);
    const month = resolveMonthParam(url.searchParams.get("month"));
    const { dateFrom, dateTo } = getMonthBounds(month);
    const payload = await getPendingMonthlyInvoicesPayload(
      month,
      dateFrom,
      dateTo,
    );

    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Fakturownia pending monthly invoices API error:", error);
    return Response.json(
      { error: "Failed to load pending monthly invoices" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireAdminAuth();

    const body = (await request.json()) as {
      estimateIds?: unknown;
    };
    const estimateIds = normalizeEstimateIds(body.estimateIds);

    if (estimateIds.length === 0) {
      return Response.json({ error: "Missing estimate IDs" }, { status: 400 });
    }

    const updateResults = await Promise.allSettled(
      estimateIds.map((estimateId) =>
        changeInvoiceStatus(String(estimateId), COMPLETED_ESTIMATE_STATUS),
      ),
    );

    const updatedCount = updateResults.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const failedCount = updateResults.length - updatedCount;

    if (updatedCount === 0) {
      return Response.json(
        {
          error: "Failed to update estimate statuses",
          failedCount,
          updatedCount,
        } satisfies PendingMonthlyInvoicesBulkUpdateResponse & {
          error: string;
        },
        { status: 500 },
      );
    }

    revalidateTag(PENDING_MONTHLY_INVOICES_TAG, "max");

    return Response.json(
      {
        failedCount,
        updatedCount,
      } satisfies PendingMonthlyInvoicesBulkUpdateResponse,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Fakturownia pending monthly invoices bulk update API error:",
      error,
    );
    return Response.json(
      { error: "Failed to update estimate statuses" },
      { status: 500 },
    );
  }
}
