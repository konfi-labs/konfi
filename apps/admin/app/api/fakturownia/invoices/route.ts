"use server";

import { requireAdminAuth } from "@/actions/auth-utils";
import { getClients, getInvoices } from "@/actions/fakturownia";
import type {
  Invoice,
  InvoiceKind,
} from "@konfi/fakturownia/out/client/models";
import { InvoiceKindObject } from "@konfi/fakturownia/out/client/models";
import { connection, NextRequest } from "next/server";

const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 99; // keep one slot to detect additional pages (API max is 100)
const MAX_SEARCH_PAGES = 5; // limit pages to search through when doing client-based search

const ALLOWED_INVOICE_KINDS = new Set<InvoiceKind>(
  Object.values(InvoiceKindObject),
);

type GetInvoicesParams = {
  page?: number;
  perPage?: number;
  clientId?: number;
  kind?: InvoiceKind;
  dateFrom?: string;
  dateTo?: string;
  period?: "this_month" | "last_month" | "this_year" | "last_year";
  includePositions?: boolean;
  number?: string;
};

type FakturowniaInvoicesResponse = {
  items: Invoice[];
  page: number;
  perPage: number;
  hasMore: boolean;
  totalCountHint: number;
  isSearchResult?: boolean;
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
    const kind = resolveInvoiceKind(url.searchParams.get("kind"));
    const search = url.searchParams.get("search")?.trim() || undefined;

    // If search is provided, use search logic
    if (search) {
      const searchResults = await searchInvoices(search, kind, perPage);
      const payload: FakturowniaInvoicesResponse = {
        items: searchResults,
        page: 1,
        perPage,
        hasMore: false,
        totalCountHint: searchResults.length,
        isSearchResult: true,
      };

      return Response.json(payload, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    // Regular pagination flow
    const params: GetInvoicesParams = {
      page,
      perPage: Math.min(perPage + 1, 100),
    };

    if (kind) {
      params.kind = kind;
    }

    const invoices = await getInvoices(params);
    const hasMore = invoices.length > perPage;
    const items = hasMore ? invoices.slice(0, perPage) : invoices;
    const totalCountHint = hasMore
      ? page * perPage + 1
      : (page - 1) * perPage + items.length;

    const payload: FakturowniaInvoicesResponse = {
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
    console.error("Fakturownia invoices API error:", error);
    return Response.json(
      { error: "Failed to load Fakturownia invoices" },
      { status: 500 },
    );
  }
}

/**
 * Search invoices by:
 * 1. Exact invoice number match
 * 2. Client name search (finds matching clients, then fetches their invoices)
 * 3. Local buyer name filtering on results
 */
async function searchInvoices(
  query: string,
  kind?: InvoiceKind,
  limit: number = DEFAULT_PER_PAGE,
): Promise<Invoice[]> {
  const results: Invoice[] = [];
  const seenIds = new Set<number>();
  const lowerQuery = query.toLowerCase();

  // 1. Try exact invoice number search first
  try {
    const numberMatch = await getInvoices({
      number: query,
      kind,
      perPage: limit,
    });
    for (const inv of numberMatch) {
      if (inv.id && !seenIds.has(inv.id)) {
        seenIds.add(inv.id);
        results.push(inv);
      }
    }
  } catch (error) {
    console.error("Error searching by invoice number:", error);
  }

  // If we already have enough results from exact number match, return early
  if (results.length >= limit) {
    return results.slice(0, limit);
  }

  // 2. Search for clients matching the query, then fetch their invoices
  try {
    const matchingClients = await getClients({ query });
    if (matchingClients && matchingClients.length > 0) {
      // Limit to first 5 matching clients to avoid too many API calls
      const clientsToSearch = matchingClients.slice(0, 5);

      for (const client of clientsToSearch) {
        if (results.length >= limit) break;
        if (!client.id) continue;

        try {
          const clientInvoices = await getInvoices({
            clientId: client.id,
            kind,
            perPage: Math.min(limit - results.length + 1, 50),
          });

          for (const inv of clientInvoices) {
            if (results.length >= limit) break;
            if (inv.id && !seenIds.has(inv.id)) {
              seenIds.add(inv.id);
              results.push(inv);
            }
          }
        } catch (error) {
          console.error(
            `Error fetching invoices for client ${client.id}:`,
            error,
          );
        }
      }
    }
  } catch (error) {
    console.error("Error searching clients:", error);
  }

  // If we still don't have enough results, fetch recent invoices and filter locally
  if (results.length < limit) {
    try {
      // Fetch multiple pages of recent invoices to search through
      for (
        let page = 1;
        page <= MAX_SEARCH_PAGES && results.length < limit;
        page++
      ) {
        const recentInvoices = await getInvoices({
          page,
          perPage: 100, // Fetch max per page for better search coverage
          kind,
        });

        if (!recentInvoices || recentInvoices.length === 0) break;

        for (const inv of recentInvoices) {
          if (results.length >= limit) break;
          if (inv.id && seenIds.has(inv.id)) continue;

          // Check if invoice matches search query (buyer name, email, invoice number)
          const buyerName = (inv.buyerName ?? "").toLowerCase();
          const buyerFirstName = (inv.buyerFirstName ?? "").toLowerCase();
          const buyerLastName = (inv.buyerLastName ?? "").toLowerCase();
          const buyerEmail = (inv.buyerEmail ?? "").toLowerCase();
          const invoiceNumber = (inv.number ?? "").toLowerCase();

          const matches =
            buyerName.includes(lowerQuery) ||
            buyerFirstName.includes(lowerQuery) ||
            buyerLastName.includes(lowerQuery) ||
            buyerEmail.includes(lowerQuery) ||
            invoiceNumber.includes(lowerQuery);

          if (matches) {
            seenIds.add(inv.id);
            results.push(inv);
          }
        }

        // If this page had fewer results than requested, we've reached the end
        if (recentInvoices.length < 100) break;
      }
    } catch (error) {
      console.error("Error searching through recent invoices:", error);
    }
  }

  return results.slice(0, limit);
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

function resolveInvoiceKind(value: string | null): InvoiceKind | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase() as InvoiceKind;
  return ALLOWED_INVOICE_KINDS.has(normalized) ? normalized : undefined;
}
