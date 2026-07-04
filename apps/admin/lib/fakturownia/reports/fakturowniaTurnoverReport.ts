import {
  GetIncomeQueryParameterTypeObject,
  GetPeriodQueryParameterTypeObject,
  GetSearch_date_typeQueryParameterTypeObject,
} from "@konfi/fakturownia/out/client/invoicesJson";
import {
  Department,
  Invoice,
  InvoiceKindObject,
} from "@konfi/fakturownia/out/client/models";
import { DateOnly } from "@microsoft/kiota-abstractions";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatFakturowniaError, getFakturowniaClient } from "../client";

const logger = console;

export interface TurnoverAmount {
  net: number;
  gross: number;
}

export interface TurnoverByDocTypeRow {
  label: string;
  amount: TurnoverAmount;
}

export interface TurnoverByPaymentRow {
  paymentType: string;
  gross: number;
  paid: number;
}

export interface GroupedTurnoverPaymentsForPdf {
  terminalRows: TurnoverByPaymentRow[];
  otherRows: TurnoverByPaymentRow[];
  terminalTotals: { gross: number; paid: number };
  overallTotals: { gross: number; paid: number };
}

export interface TurnoverReportData {
  companyName: string;
  printedAt: Date;
  rangeLabel: string;
  parameterLabel: string;
  departmentId?: string;
  departmentName?: string;
  salesByDocType: TurnoverByDocTypeRow[];
  salesByDocTypeFiscal: TurnoverByDocTypeRow[];
  salesByPayment: TurnoverByPaymentRow[];
  totalNet: number;
  totalGross: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizePaymentType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isTerminalPaymentType(paymentType: string): boolean {
  const normalized = normalizePaymentType(paymentType);
  return (
    normalized.includes("blik") ||
    normalized.includes("karta") ||
    normalized.includes("card")
  );
}

function terminalPaymentRank(paymentType: string): number {
  const normalized = normalizePaymentType(paymentType);
  if (normalized.includes("karta") || normalized.includes("card")) {
    return 0;
  }
  if (normalized.includes("blik")) {
    return 1;
  }
  return 2;
}

export function groupTurnoverPaymentsForPdf(
  rows: TurnoverByPaymentRow[],
): GroupedTurnoverPaymentsForPdf {
  const terminalRows: TurnoverByPaymentRow[] = [];
  const otherRows: TurnoverByPaymentRow[] = [];

  let terminalGross = 0;
  let terminalPaid = 0;
  let overallGross = 0;
  let overallPaid = 0;

  for (const row of rows) {
    overallGross += row.gross;
    overallPaid += row.paid;

    if (isTerminalPaymentType(row.paymentType)) {
      terminalRows.push(row);
      terminalGross += row.gross;
      terminalPaid += row.paid;
    } else {
      otherRows.push(row);
    }
  }

  terminalRows.sort((a, b) => {
    const rank =
      terminalPaymentRank(a.paymentType) - terminalPaymentRank(b.paymentType);
    if (rank !== 0) {
      return rank;
    }
    return a.paymentType.localeCompare(b.paymentType, "pl-PL");
  });

  return {
    terminalRows,
    otherRows,
    terminalTotals: { gross: terminalGross, paid: terminalPaid },
    overallTotals: { gross: overallGross, paid: overallPaid },
  };
}

function getInvoiceTotals(invoice: Invoice): TurnoverAmount {
  const net = Number(invoice.priceNet);
  const gross = Number(invoice.priceGross);

  return { net, gross };
}

function buildReportData(
  fromIso: string,
  toIso: string,
  invoices: Invoice[],
  departmentId?: string,
  departmentName?: string,
): TurnoverReportData {
  const salesByDocTypeMap: Record<string, TurnoverAmount> = {};
  const salesByDocTypeFiscalMap: Record<string, TurnoverAmount> = {};
  const salesByPaymentMap: Record<string, { gross: number; paid: number }> = {};

  let totalNet = 0;
  let totalGross = 0;

  for (const invoice of invoices) {
    const totals = getInvoiceTotals(invoice);
    totalNet += totals.net;
    totalGross += totals.gross;

    const kind = invoice.kind ?? undefined;
    const label =
      kind === InvoiceKindObject.Receipt ? "Paragon" : "Faktura VAT";
    const targetMap =
      kind === InvoiceKindObject.Receipt
        ? salesByDocTypeFiscalMap
        : salesByDocTypeMap;

    if (!targetMap[label]) {
      targetMap[label] = { net: 0, gross: 0 };
    }
    targetMap[label].net += totals.net;
    targetMap[label].gross += totals.gross;

    const paymentTypeRaw =
      invoice.paymentType && invoice.paymentType.trim().length > 0
        ? invoice.paymentType.trim()
        : "inne";
    if (!salesByPaymentMap[paymentTypeRaw]) {
      salesByPaymentMap[paymentTypeRaw] = { gross: 0, paid: 0 };
    }
    salesByPaymentMap[paymentTypeRaw].gross += totals.gross;

    const paidValue = invoice.paid ? Number.parseFloat(invoice.paid) : 0;
    if (Number.isFinite(paidValue)) {
      salesByPaymentMap[paymentTypeRaw].paid += paidValue;
    }
  }

  const salesByDocType: TurnoverByDocTypeRow[] = Object.entries(
    salesByDocTypeMap,
  ).map(([label, amount]) => ({
    label,
    amount,
  }));

  const salesByDocTypeFiscal: TurnoverByDocTypeRow[] = Object.entries(
    salesByDocTypeFiscalMap,
  ).map(([label, amount]) => ({
    label,
    amount,
  }));

  const salesByPayment: TurnoverByPaymentRow[] = Object.entries(
    salesByPaymentMap,
  ).map(([paymentType, data]) => ({
    paymentType,
    gross: data.gross,
    paid: data.paid,
  }));

  const rangeLabel = `${fromIso} - ${toIso}`;

  const firstInvoice = invoices[0];
  const companyName = firstInvoice?.sellerName ?? "";

  return {
    companyName,
    printedAt: new Date(),
    rangeLabel,
    parameterLabel: "Dokumenty rozchodu w cenach sprzedaży",
    departmentId,
    departmentName,
    salesByDocType,
    salesByDocTypeFiscal,
    salesByPayment,
    totalNet,
    totalGross,
  };
}

export async function fetchTurnoverInvoices(
  fromIso: string,
  toIso: string,
  departmentId?: string,
): Promise<Invoice[]> {
  const client = await getFakturowniaClient();
  const fromDate = DateOnly.parse(fromIso);
  const toDate = DateOnly.parse(toIso);

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
        kinds: [InvoiceKindObject.Vat, InvoiceKindObject.Receipt],
        includePositions: true,
        page,
        perPage,
        income: GetIncomeQueryParameterTypeObject.One,
        searchDateType: GetSearch_date_typeQueryParameterTypeObject.Issue_date,
      },
    });

    if (!pageResult || pageResult.length === 0) {
      break;
    }

    logger.log(
      `Fetched ${pageResult.length} invoices from Fakturownia for turnover report, page ${page}.`,
    );

    logger.log(`Filtering invoices for departmentId=${departmentId}`);

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
}

export async function buildTurnoverReport(
  fromIso: string,
  toIso: string,
  departmentId?: string,
): Promise<TurnoverReportData> {
  try {
    const invoices = await fetchTurnoverInvoices(fromIso, toIso, departmentId);
    logger.info("Fetched invoices from Fakturownia for turnover report.", {
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
          "Failed to load Fakturownia departments for turnover report",
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
        parameterLabel: "Dokumenty rozchodu w cenach sprzedaży",
        departmentId,
        departmentName,
        salesByDocType: [],
        salesByDocTypeFiscal: [],
        salesByPayment: [],
        totalNet: 0,
        totalGross: 0,
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
      `Failed to build Fakturownia turnover report: ${formatFakturowniaError(error)}`,
      { cause: error },
    );
  }
}

function generateTurnoverReportPdfBufferFromReport(
  report: TurnoverReportData,
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

    doc
      .font("Geist Mono Semi Bold")
      .fontSize(14)
      .text("PODSUMOWANIE OBROTU HANDLOWEGO");
    doc.font("Geist Mono");

    const { left, right } = doc.page.margins;

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

    const addRightAlignedValueLine = (
      label: string,
      value: string,
      fontSize: number,
    ): void => {
      const { left: pageLeft, right: pageRight } = doc.page.margins;
      const pageWidth = doc.page.width;
      const currentY = doc.y;

      doc.font("Geist Mono Semi Bold").fontSize(fontSize);
      const labelWidth = doc.widthOfString(label);

      doc.text(label, pageLeft, currentY, { lineBreak: false });

      doc.font("Geist Mono").fontSize(fontSize);
      const valueWidth = doc.widthOfString(value);

      let valueX = pageWidth - pageRight - valueWidth;
      const minGap = 8;
      const minValueX = pageLeft + labelWidth + minGap;
      if (valueX <= minValueX) {
        valueX = minValueX;
      }

      doc.text(value, valueX, currentY, { lineBreak: false });

      doc.moveDown(1);
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
    addInlineLabelValueLine("Parametr:", report.parameterLabel, metaFontSize);

    doc
      .moveTo(left, doc.y + 5)
      .lineTo(doc.page.width - right, doc.y + 5)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc.moveDown(3);

    doc
      .moveTo(left, doc.y - 5)
      .lineTo(doc.page.width - right, doc.y - 5)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc
      .font("Geist Mono Semi Bold")
      .fontSize(11)
      .text("Sprzedaż wg rodzaju dokumentu", left, doc.y, {
        align: "left",
        width: doc.page.width - left - right,
      });
    doc.font("Geist Mono");

    doc
      .moveTo(left, doc.y)
      .lineTo(doc.page.width - right, doc.y)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc.moveDown(1);

    if (
      report.salesByDocType.length === 0 &&
      report.salesByDocTypeFiscal.length === 0
    ) {
      doc.fontSize(9).text("Brak danych w wybranym okresie.");
    } else {
      let totalDocNet = 0;
      let totalDocGross = 0;

      for (const row of report.salesByDocType) {
        const label = `${row.label}`;
        const value = `netto ${formatCurrency(row.amount.net)} / brutto ${formatCurrency(row.amount.gross)}`;
        addRightAlignedValueLine(label, value, 9);
        totalDocNet += row.amount.net;
        totalDocGross += row.amount.gross;
      }
      for (const row of report.salesByDocTypeFiscal) {
        const labelFiscal = `${row.label} (fiskalne)`;
        const valueFiscal = `netto ${formatCurrency(row.amount.net)} / brutto ${formatCurrency(row.amount.gross)}`;
        addRightAlignedValueLine(labelFiscal, valueFiscal, 9);
        totalDocNet += row.amount.net;
        totalDocGross += row.amount.gross;
      }

      // separator line before section total
      doc
        .moveTo(left, doc.y + 6)
        .lineTo(doc.page.width - right, doc.y + 6)
        .lineWidth(0.5)
        .strokeColor("#000000")
        .stroke();

      doc.moveDown(1);

      const totalDocLabel = "Razem";
      const totalDocValue = `netto ${formatCurrency(totalDocNet)} / brutto ${formatCurrency(totalDocGross)}`;
      addRightAlignedValueLine(totalDocLabel, totalDocValue, 9);
    }

    doc.moveDown(3);

    doc
      .moveTo(left, doc.y - 5)
      .lineTo(doc.page.width - right, doc.y - 5)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc
      .font("Geist Mono Semi Bold")
      .fontSize(11)
      .text("Sprzedaż wg rodzajów płatności", left, doc.y, {
        align: "left",
        width: doc.page.width - left - right,
      });
    doc.font("Geist Mono");

    doc
      .moveTo(left, doc.y)
      .lineTo(doc.page.width - right, doc.y)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc.moveDown(1);

    if (report.salesByPayment.length === 0) {
      doc.fontSize(9).text("Brak danych o płatnościach w wybranym okresie.");
    } else {
      const grouped = groupTurnoverPaymentsForPdf(report.salesByPayment);

      const addPaymentSubheading = (label: string): void => {
        doc
          .font("Geist Mono Semi Bold")
          .fontSize(10)
          .text(label, left, doc.y, {
            align: "left",
            width: doc.page.width - left - right,
          });
        doc.font("Geist Mono");
        doc.moveDown(0.5);
      };

      if (grouped.terminalRows.length > 0) {
        addPaymentSubheading("Sprzedaż z terminalu");

        for (const row of grouped.terminalRows) {
          const label = `  ${row.paymentType}`;
          const value = `wartość brutto ${formatCurrency(row.gross)} / zapłacono ${formatCurrency(row.paid)}`;
          addRightAlignedValueLine(label, value, 9);
        }

        doc
          .moveTo(left, doc.y + 6)
          .lineTo(doc.page.width - right, doc.y + 6)
          .lineWidth(0.5)
          .strokeColor("#000000")
          .stroke();

        doc.moveDown(1);

        const terminalTotalValue = `wartość brutto ${formatCurrency(grouped.terminalTotals.gross)} / zapłacono ${formatCurrency(grouped.terminalTotals.paid)}`;
        addRightAlignedValueLine("Razem (terminal)", terminalTotalValue, 9);

        if (grouped.otherRows.length > 0) {
          doc.moveDown(0.5);
        }
      }

      for (const row of grouped.otherRows) {
        const label = `${row.paymentType}`;
        const value = `wartość brutto ${formatCurrency(row.gross)} / zapłacono ${formatCurrency(row.paid)}`;
        addRightAlignedValueLine(label, value, 9);
      }

      // separator line before payment section total
      doc
        .moveTo(left, doc.y + 6)
        .lineTo(doc.page.width - right, doc.y + 6)
        .lineWidth(0.5)
        .strokeColor("#000000")
        .stroke();

      doc.moveDown(1);

      const totalPaymentLabel = "Razem";
      const totalPaymentValue = `wartość brutto ${formatCurrency(grouped.overallTotals.gross)} / zapłacono ${formatCurrency(grouped.overallTotals.paid)}`;
      addRightAlignedValueLine(totalPaymentLabel, totalPaymentValue, 9);
    }

    doc.moveDown(3);

    doc
      .moveTo(left, doc.y - 5)
      .lineTo(doc.page.width - right, doc.y - 5)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc
      .font("Geist Mono Semi Bold")
      .fontSize(11)
      .text("WYNIKI - PODSUMOWANIE SPRZEDAŻY I OBROTU", left, doc.y, {
        align: "left",
        width: doc.page.width - left - right,
      });
    doc.font("Geist Mono");

    doc
      .moveTo(left, doc.y)
      .lineTo(doc.page.width - right, doc.y)
      .lineWidth(0.5)
      .strokeColor("#000000")
      .stroke();

    doc.moveDown(1);
    addRightAlignedValueLine("Razem netto", formatCurrency(report.totalNet), 9);
    addRightAlignedValueLine(
      "Razem brutto",
      formatCurrency(report.totalGross),
      9,
    );

    doc.end();
  });
}

export function generateTurnoverReportPdfBufferFromData(
  report: TurnoverReportData,
): Promise<Buffer> {
  return generateTurnoverReportPdfBufferFromReport(report);
}

export async function generateTurnoverReportPdfBuffer(
  fromIso: string,
  toIso: string,
  departmentId?: string,
): Promise<Buffer> {
  const report = await buildTurnoverReport(fromIso, toIso, departmentId);
  return generateTurnoverReportPdfBufferFromReport(report);
}
