import "server-only";

import { createSystemMember } from "@/lib/fulfillment/types";
import {
  syncFakturowniaCostInvoices,
  type SyncFakturowniaCostInvoicesResult,
} from "./cost-intelligence";

export async function runFakturowniaCostSyncStep(): Promise<SyncFakturowniaCostInvoicesResult> {
  "use step";

  // Incremental run: no explicit dates so syncFakturowniaCostInvoices derives
  // dateFrom from the stored per-tenant sync state (minus the overlap window).
  // Dedicated-only, mirroring estimate-invoices: no tenant scoping here.
  return syncFakturowniaCostInvoices({
    createdBy: createSystemMember(),
  });
}
