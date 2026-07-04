import {
  GetIncomeQueryParameterTypeObject,
  GetPeriodQueryParameterTypeObject,
  GetSearch_date_typeQueryParameterTypeObject,
  GetStatusQueryParameterTypeObject,
} from "@konfi/fakturownia/out/client/invoicesJson";
import {
  Department,
  Invoice,
  Invoice_statusObject,
  InvoiceKindObject,
} from "@konfi/fakturownia/out/client/models";
import { DateOnly } from "@microsoft/kiota-abstractions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatFakturowniaError, getFakturowniaClient } from "../client";

const logger = console;

export interface UnpaidInvoiceRow {
  number: string;
  issueDate: string;
  paymentTo: string;
  overdueDays: number;
  buyerName: string;
  priceGross: number;
  paid: number;
  outstanding: number;
  currency: string;
  status: string;
}

export interface UnpaidInvoiceGroup {
  buyerName: string;
  invoices: UnpaidInvoiceRow[];
  totalGross: number;
  totalPaid: number;
  totalOutstanding: number;
}

export interface UnpaidReportData {
  companyName: string;
  printedAt: Date;
  rangeLabel: string;
  departmentId?: string;
  departmentName?: string;
  groups: UnpaidInvoiceGroup[];
  totalGross: number;
  totalPaid: number;
  totalOutstanding: number;
  currency: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildReportData(
  fromIso: string,
  toIso: string,
  invoices: Invoice[],
  departmentId?: string,
  departmentName?: string,
): UnpaidReportData {
  const invoicesByBuyer = new Map<string, UnpaidInvoiceRow[]>();
  let totalGross = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let currency = "PLN";

  for (const invoice of invoices) {
    const gross = Number(invoice.priceGross) || 0;
    const paid = Number(invoice.paid) || 0;
    const outstanding = gross - paid;

    totalGross += gross;
    totalPaid += paid;
    totalOutstanding += outstanding;

    if (invoice.currency) {
      currency = invoice.currency;
    }

    const issueDate = invoice.issueDate?.toString() ?? "—";
    const paymentTo = invoice.paymentTo?.toString() ?? "—";
    const buyerName =
      invoice.buyerName ||
      [invoice.buyerFirstName, invoice.buyerLastName]
        .filter(Boolean)
        .join(" ") ||
      invoice.buyerEmail ||
      "—";

    // Calculate overdue days
    let overdueDays = 0;
    if (invoice.paymentTo) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const paymentDeadline = new Date(invoice.paymentTo.toString());
      paymentDeadline.setHours(0, 0, 0, 0);
      const diffTime = now.getTime() - paymentDeadline.getTime();
      overdueDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    }

    const row: UnpaidInvoiceRow = {
      number: invoice.number ?? "—",
      issueDate,
      paymentTo,
      overdueDays,
      buyerName,
      priceGross: gross,
      paid,
      outstanding,
      currency: invoice.currency ?? "PLN",
      status: invoice.status ?? "—",
    };

    const existingRows = invoicesByBuyer.get(buyerName);
    if (existingRows) {
      existingRows.push(row);
    } else {
      invoicesByBuyer.set(buyerName, [row]);
    }
  }

  // Build groups from the map
  const groups: UnpaidInvoiceGroup[] = [];
  for (const [buyerName, rows] of invoicesByBuyer) {
    const groupTotalGross = rows.reduce((sum, r) => sum + r.priceGross, 0);
    const groupTotalPaid = rows.reduce((sum, r) => sum + r.paid, 0);
    const groupTotalOutstanding = rows.reduce(
      (sum, r) => sum + r.outstanding,
      0,
    );

    groups.push({
      buyerName,
      invoices: rows,
      totalGross: groupTotalGross,
      totalPaid: groupTotalPaid,
      totalOutstanding: groupTotalOutstanding,
    });
  }

  // Sort groups by buyer name
  groups.sort((a, b) => a.buyerName.localeCompare(b.buyerName, "pl"));

  const rangeLabel = `${fromIso} - ${toIso}`;

  const firstInvoice = invoices[0];
  const companyName = firstInvoice?.sellerName ?? "";

  return {
    companyName,
    printedAt: new Date(),
    rangeLabel,
    departmentId,
    departmentName,
    groups,
    totalGross,
    totalPaid,
    totalOutstanding,
    currency,
  };
}

export async function fetchUnpaidInvoices(
  fromIso: string,
  toIso: string,
  departmentId?: string,
): Promise<Invoice[]> {
  const client = await getFakturowniaClient();
  const fromDate = DateOnly.parse(fromIso);
  const toDate = DateOnly.parse(toIso);

  // Fetch invoices for each unpaid status in parallel
  const unpaidStatuses = [
    GetStatusQueryParameterTypeObject.Issued,
    GetStatusQueryParameterTypeObject.Sent,
    GetStatusQueryParameterTypeObject.Partial,
    GetStatusQueryParameterTypeObject.Rejected,
  ] as const;

  const fetchInvoicesByStatus = async (
    status: (typeof unpaidStatuses)[number],
  ): Promise<Invoice[]> => {
    const invoices: Invoice[] = [];
    const perPage = 100;
    let page = 1;

    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- sequential Fakturownia paging avoids rate-limit bursts.
      const pageResult = await client.invoicesJson.get({
        queryParameters: {
          period: GetPeriodQueryParameterTypeObject.More,
          dateFrom: fromDate,
          dateTo: toDate,
          kinds: [InvoiceKindObject.Vat],
          includePositions: false,
          page,
          perPage,
          income: GetIncomeQueryParameterTypeObject.One,
          searchDateType:
            GetSearch_date_typeQueryParameterTypeObject.Issue_date,
          status,
        },
      });

      if (!pageResult || pageResult.length === 0) {
        break;
      }

      logger.log(
        `Fetched ${pageResult.length} invoices with status "${status}" from Fakturownia, page ${page}.`,
      );

      // Filter by department if specified
      const filteredPage = departmentId
        ? pageResult.filter((invoice) => {
            if (
              invoice.departmentId === undefined ||
              invoice.departmentId === null
            ) {
              return false;
            }
            return `${invoice.departmentId}` === `${departmentId}`;
          })
        : pageResult;

      invoices.push(...filteredPage);

      if (pageResult.length < perPage) {
        break;
      }

      page += 1;
    }

    return invoices;
  };

  // Fetch all statuses in parallel
  const results = await Promise.all(
    unpaidStatuses.map((status) => fetchInvoicesByStatus(status)),
  );
  const allInvoices = results.flat();

  // Deduplicate by invoice ID (in case API returns duplicates)
  const uniqueInvoices = new Map<number, Invoice>();
  for (const invoice of allInvoices) {
    if (invoice.id !== undefined && invoice.id !== null) {
      uniqueInvoices.set(invoice.id, invoice);
    }
  }

  // Filter to only unpaid invoices (fallback in case status filter doesn't work)
  const unpaidInvoices = Array.from(uniqueInvoices.values()).filter(
    (invoice) => {
      const status = invoice.status;
      return (
        status === Invoice_statusObject.Issued ||
        status === Invoice_statusObject.Sent ||
        status === Invoice_statusObject.Partial ||
        status === Invoice_statusObject.Rejected
      );
    },
  );

  // Filter to only overdue invoices (payment deadline has passed)
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Compare dates only, not times
  const overdueInvoices = unpaidInvoices.filter((invoice) => {
    if (!invoice.paymentTo) {
      // If no payment deadline, consider it overdue (conservative approach)
      return true;
    }
    const paymentDeadline = new Date(invoice.paymentTo.toString());
    return paymentDeadline < now;
  });

  logger.info(
    `Fetched ${allInvoices.length} invoices, ${uniqueInvoices.size} unique, ${unpaidInvoices.length} unpaid, ${overdueInvoices.length} overdue.`,
  );

  return overdueInvoices;
}

export async function buildUnpaidReport(
  fromIso: string,
  toIso: string,
  departmentId?: string,
): Promise<UnpaidReportData> {
  try {
    const invoices = await fetchUnpaidInvoices(fromIso, toIso, departmentId);
    logger.info("Fetched invoices from Fakturownia for unpaid report.", {
      count: invoices.length,
      fromIso,
      toIso,
      departmentId,
    });
    let departmentName: string | undefined;

    if (departmentId) {
      try {
        const client = await getFakturowniaClient();
        const fetchedDepartments = await client.departmentsJson.get();
        const departments = Array.isArray(fetchedDepartments)
          ? (fetchedDepartments as Department[])
          : [];
        const matched = departments.find(
          (entry) =>
            entry.id !== undefined &&
            entry.id !== null &&
            String(entry.id) === departmentId,
        );
        if (matched) {
          const normalizedShortcut =
            typeof matched.shortcut === "string" &&
            matched.shortcut.trim().length > 0
              ? matched.shortcut.trim()
              : undefined;
          const normalizedName =
            typeof matched.name === "string" && matched.name.trim().length > 0
              ? matched.name.trim()
              : undefined;
          departmentName = normalizedShortcut ?? normalizedName;
        }
      } catch (error) {
        logger.error(
          "Failed to load Fakturownia departments for unpaid report",
          {
            error: formatFakturowniaError(error),
            departmentId,
          },
        );
      }
    }

    if (invoices.length === 0) {
      return {
        companyName: "",
        printedAt: new Date(),
        rangeLabel: `${fromIso} - ${toIso}`,
        departmentId,
        departmentName,
        groups: [],
        totalGross: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        currency: "PLN",
      };
    }

    return buildReportData(
      fromIso,
      toIso,
      invoices,
      departmentId,
      departmentName,
    );
  } catch (error) {
    throw new Error(
      `Failed to build Fakturownia unpaid report: ${formatFakturowniaError(error)}`,
      { cause: error },
    );
  }
}

function generateUnpaidReportPdfBufferFromReport(
  report: UnpaidReportData,
): Promise<Buffer> {
  const reportDir = dirname(fileURLToPath(import.meta.url));
  const fontPath = join(reportDir, "fonts", "GeistMono-Regular.ttf");
  const fontPathBold = join(reportDir, "fonts", "GeistMono-SemiBold.ttf");
  const doc = new PDFDocument({ font: fontPath, margin: 40, size: "A4" });
  const chunks: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error: Error) => reject(error));

    doc.registerFont("Geist Mono", fontPath);
    doc.registerFont("Geist Mono Semi Bold", fontPathBold);

    const { left, right, top, bottom } = doc.page.margins;
    const pageBottom = doc.page.height - bottom;
    const rowHeight = 12;

    // Column widths adjusted to fit page width (515px available) - removed buyer column since we group by it
    const colWidths = {
      number: 95,
      date: 65,
      paymentTo: 65,
      overdue: 45,
      gross: 80,
      paid: 80,
      outstanding: 85,
    };

    const drawTableHeader = (): void => {
      const headerY = doc.y;
      doc.font("Geist Mono Semi Bold").fontSize(8);

      let xPos = left;
      doc.text("Numer", xPos, headerY, {
        width: colWidths.number,
        align: "left",
      });
      xPos += colWidths.number;
      doc.text("Wystawiono", xPos, headerY, {
        width: colWidths.date,
        align: "left",
      });
      xPos += colWidths.date;
      doc.text("Termin", xPos, headerY, {
        width: colWidths.paymentTo,
        align: "left",
      });
      xPos += colWidths.paymentTo;
      doc.text("Po terminie", xPos, headerY, {
        width: colWidths.overdue,
        align: "right",
      });
      xPos += colWidths.overdue;
      doc.text("Brutto", xPos, headerY, {
        width: colWidths.gross,
        align: "right",
      });
      xPos += colWidths.gross;
      doc.text("Zapłacono", xPos, headerY, {
        width: colWidths.paid,
        align: "right",
      });
      xPos += colWidths.paid;
      doc.text("Do zapłaty", xPos, headerY, {
        width: colWidths.outstanding,
        align: "right",
      });

      doc.moveDown(1);

      doc
        .moveTo(left, doc.y)
        .lineTo(doc.page.width - right, doc.y)
        .lineWidth(0.5)
        .strokeColor("#000000")
        .stroke();

      doc.moveDown(0.5);
    };

    const drawTableRow = (row: UnpaidInvoiceRow): void => {
      const rowY = doc.y;
      doc.font("Geist Mono").fontSize(8);

      let xPos = left;
      doc.text(row.number, xPos, rowY, {
        width: colWidths.number,
        align: "left",
      });
      xPos += colWidths.number;
      doc.text(row.issueDate, xPos, rowY, {
        width: colWidths.date,
        align: "left",
      });
      xPos += colWidths.date;
      doc.text(row.paymentTo, xPos, rowY, {
        width: colWidths.paymentTo,
        align: "left",
      });
      xPos += colWidths.paymentTo;
      doc.text(row.overdueDays.toString(), xPos, rowY, {
        width: colWidths.overdue,
        align: "right",
      });
      xPos += colWidths.overdue;
      doc.text(formatCurrency(row.priceGross), xPos, rowY, {
        width: colWidths.gross,
        align: "right",
      });
      xPos += colWidths.gross;
      doc.text(formatCurrency(row.paid), xPos, rowY, {
        width: colWidths.paid,
        align: "right",
      });
      xPos += colWidths.paid;
      doc.text(formatCurrency(row.outstanding), xPos, rowY, {
        width: colWidths.outstanding,
        align: "right",
      });

      doc.moveDown(0.8);
    };

    const drawGroupHeader = (buyerName: string): void => {
      doc.font("Geist Mono Semi Bold").fontSize(9);
      const displayName =
        buyerName.length > 60 ? `${buyerName.substring(0, 57)}...` : buyerName;
      doc.text(displayName, left);
      doc.moveDown(0.5);
    };

    const drawGroupSubtotal = (group: UnpaidInvoiceGroup): void => {
      doc.font("Geist Mono Semi Bold").fontSize(8);

      const subtotalY = doc.y;
      let xPos =
        left +
        colWidths.number +
        colWidths.date +
        colWidths.paymentTo +
        colWidths.overdue;

      doc.text(formatCurrency(group.totalGross), xPos, subtotalY, {
        width: colWidths.gross,
        align: "right",
      });
      xPos += colWidths.gross;
      doc.text(formatCurrency(group.totalPaid), xPos, subtotalY, {
        width: colWidths.paid,
        align: "right",
      });
      xPos += colWidths.paid;
      doc.text(formatCurrency(group.totalOutstanding), xPos, subtotalY, {
        width: colWidths.outstanding,
        align: "right",
      });

      doc.moveDown(1.5);
    };

    // Title
    doc
      .font("Geist Mono Semi Bold")
      .fontSize(14)
      .text("FAKTURY VAT NIEZAPŁACONE I CZĘŚCIOWO ZAPŁACONE");
    doc.font("Geist Mono");

    const addInlineLabelValueLine = (
      label: string,
      value: string,
      fontSize: number,
    ): void => {
      doc
        .font("Geist Mono Semi Bold")
        .fontSize(fontSize)
        .text(`${label} `, { continued: true });
      doc.font("Geist Mono").fontSize(fontSize).text(value);
    };

    doc
      .moveTo(left, doc.y)
      .lineTo(doc.page.width - right, doc.y)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc.moveDown(1);

    const printedAt = report.printedAt.toLocaleDateString("pl-PL");
    const metaFontSize = 9;
    if (report.companyName) {
      addInlineLabelValueLine("Firma:", report.companyName, metaFontSize);
    }
    if (report.departmentName) {
      addInlineLabelValueLine("Oddział:", report.departmentName, metaFontSize);
    }
    if (report.departmentId) {
      addInlineLabelValueLine("ID:", report.departmentId, metaFontSize);
    }
    addInlineLabelValueLine("Wydrukowano dnia:", printedAt, metaFontSize);
    addInlineLabelValueLine("Zakres dat:", report.rangeLabel, metaFontSize);

    doc
      .moveTo(left, doc.y + 5)
      .lineTo(doc.page.width - right, doc.y + 5)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc.moveDown(2);

    if (report.groups.length === 0) {
      doc
        .fontSize(9)
        .text("Brak niezapłaconych faktur VAT w wybranym okresie.");
    } else {
      let totalInvoiceCount = 0;

      // Iterate through each buyer group
      for (const group of report.groups) {
        // Check if we need a new page for the group header
        if (doc.y + rowHeight * 3 > pageBottom - 20) {
          doc.addPage();
          doc.y = top;
        }

        // Draw group header (buyer name)
        drawGroupHeader(group.buyerName);
        drawTableHeader();

        // Draw invoices in this group
        for (const row of group.invoices) {
          // Check if we need a new page
          if (doc.y + rowHeight > pageBottom - 20) {
            doc.addPage();
            doc.y = top;
            drawTableHeader();
          }

          drawTableRow(row);
          totalInvoiceCount += 1;
        }

        // Draw group subtotal
        drawGroupSubtotal(group);
      }

      // Separator line before grand totals
      doc
        .moveTo(left, doc.y + 6)
        .lineTo(doc.page.width - right, doc.y + 6)
        .lineWidth(0.5)
        .strokeColor("#000000")
        .stroke();

      doc.moveDown(1.5);

      // Grand totals
      doc.font("Geist Mono Semi Bold").fontSize(9);
      doc.text("RAZEM:", left);
      doc.moveDown(0.3);

      const totalsY = doc.y;
      let xPos =
        left +
        colWidths.number +
        colWidths.date +
        colWidths.paymentTo +
        colWidths.overdue;

      doc.text(formatCurrency(report.totalGross), xPos, totalsY, {
        width: colWidths.gross,
        align: "right",
      });
      xPos += colWidths.gross;
      doc.text(formatCurrency(report.totalPaid), xPos, totalsY, {
        width: colWidths.paid,
        align: "right",
      });
      xPos += colWidths.paid;
      doc.text(formatCurrency(report.totalOutstanding), xPos, totalsY, {
        width: colWidths.outstanding,
        align: "right",
      });

      doc.moveDown(2);

      doc.font("Geist Mono").fontSize(9);
      doc.text(`Liczba nabywców: ${report.groups.length}`, left);
      doc.text(`Liczba faktur: ${totalInvoiceCount}`, left);
      doc.text(`Waluta: ${report.currency}`, left);
    }

    doc.end();
  });
}

export function generateUnpaidReportPdfBufferFromData(
  report: UnpaidReportData,
): Promise<Buffer> {
  return generateUnpaidReportPdfBufferFromReport(report);
}

export async function generateUnpaidReportPdfBuffer(
  fromIso: string,
  toIso: string,
  departmentId?: string,
): Promise<Buffer> {
  const report = await buildUnpaidReport(fromIso, toIso, departmentId);
  return generateUnpaidReportPdfBufferFromReport(report);
}
