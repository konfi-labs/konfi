"use client";

import type { FakturowniaOverdueCheckResult } from "@/actions/fakturownia";
import { useEffect, useState } from "react";

interface UseOverdueInvoicesResult {
  loading: boolean;
  error: string | null;
  overdueResult: FakturowniaOverdueCheckResult | null;
}

/**
 * Hook to fetch overdue invoices for a Fakturownia client.
 * Triggers fetch when clientId changes with 300ms debounce.
 */
export function useOverdueInvoices(
  clientId: string | undefined,
): UseOverdueInvoicesResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overdueResult, setOverdueResult] =
    useState<FakturowniaOverdueCheckResult | null>(null);

  useEffect(() => {
    const trimmedClientId = clientId?.trim();

    // Reset state when no clientId
    if (!trimmedClientId) {
      setOverdueResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchOverdueInvoices = async () => {
      setLoading(true);
      setError(null);

      try {
        const { getOverdueInvoicesForClient } =
          await import("@/actions/fakturownia");
        const result = await getOverdueInvoicesForClient(trimmedClientId);

        if (!cancelled) {
          setOverdueResult(result);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to check overdue invoices";
          setError(message);
          setOverdueResult(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    // Debounce the fetch by 300ms
    const timeoutId = setTimeout(() => {
      void fetchOverdueInvoices();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [clientId]);

  return { loading, error, overdueResult };
}
