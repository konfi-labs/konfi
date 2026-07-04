import "server-only";

import {
  runDailyFakturowniaTurnoverReport,
  runWeeklyFakturowniaUnpaidReport,
  type ScheduledFakturowniaReportResult,
} from "./service";

export async function runDailyFakturowniaTurnoverReportStep(): Promise<ScheduledFakturowniaReportResult> {
  "use step";

  return runDailyFakturowniaTurnoverReport();
}

export async function runWeeklyFakturowniaUnpaidReportStep(): Promise<ScheduledFakturowniaReportResult> {
  "use step";

  return runWeeklyFakturowniaUnpaidReport();
}
