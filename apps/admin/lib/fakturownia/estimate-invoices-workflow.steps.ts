import "server-only";

import {
  runFakturowniaEstimateInvoices,
  type FakturowniaEstimateInvoicesResult,
} from "./estimate-invoices";

export async function runFakturowniaEstimateInvoicesStep(): Promise<FakturowniaEstimateInvoicesResult> {
  "use step";

  return runFakturowniaEstimateInvoices();
}
