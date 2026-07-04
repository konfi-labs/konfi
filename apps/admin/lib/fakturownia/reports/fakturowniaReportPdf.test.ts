import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateTurnoverReportPdfBufferFromData,
  type TurnoverReportData,
} from "./fakturowniaTurnoverReport";
import {
  generateUnpaidReportPdfBufferFromData,
  type UnpaidReportData,
} from "./fakturowniaUnpaidReport";

const originalReadFileSync = fs.readFileSync;

function failOnPdfkitHelveticaRead(): void {
  vi.spyOn(fs, "readFileSync").mockImplementation(((pathArg, options) => {
    if (
      typeof pathArg === "string" &&
      pathArg.replaceAll("\\", "/").endsWith("/pdfkit/js/data/Helvetica.afm")
    ) {
      throw new Error("Unexpected PDFKit Helvetica.afm read");
    }

    return originalReadFileSync(pathArg, options);
  }) as typeof fs.readFileSync);
}

describe("Fakturownia report PDFs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates the turnover PDF without reading PDFKit Helvetica metrics", async () => {
    failOnPdfkitHelveticaRead();

    const report: TurnoverReportData = {
      companyName: "Konfi",
      printedAt: new Date("2026-05-31T10:00:00.000Z"),
      rangeLabel: "2026-05-30 - 2026-05-30",
      parameterLabel: "Dokumenty rozchodu w cenach sprzedaży",
      salesByDocType: [
        {
          label: "Faktura VAT",
          amount: { net: 100, gross: 123 },
        },
      ],
      salesByDocTypeFiscal: [
        {
          label: "Paragon",
          amount: { net: 50, gross: 61.5 },
        },
      ],
      salesByPayment: [
        { paymentType: "card", gross: 123, paid: 123 },
        { paymentType: "przelew", gross: 61.5, paid: 61.5 },
      ],
      totalNet: 150,
      totalGross: 184.5,
    };

    const buffer = await generateTurnoverReportPdfBufferFromData(report);

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("generates the unpaid PDF without reading PDFKit Helvetica metrics", async () => {
    failOnPdfkitHelveticaRead();

    const report: UnpaidReportData = {
      companyName: "Konfi",
      printedAt: new Date("2026-05-31T10:00:00.000Z"),
      rangeLabel: "2026-05-01 - 2026-05-31",
      groups: [
        {
          buyerName: "Acme Sp. z o.o.",
          invoices: [
            {
              number: "FV/1/2026",
              issueDate: "2026-05-01",
              paymentTo: "2026-05-15",
              overdueDays: 16,
              buyerName: "Acme Sp. z o.o.",
              priceGross: 246,
              paid: 100,
              outstanding: 146,
              currency: "PLN",
              status: "issued",
            },
          ],
          totalGross: 246,
          totalPaid: 100,
          totalOutstanding: 146,
        },
      ],
      totalGross: 246,
      totalPaid: 100,
      totalOutstanding: 146,
      currency: "PLN",
    };

    const buffer = await generateUnpaidReportPdfBufferFromData(report);

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});
