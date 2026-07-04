import "server-only";

import type { Department } from "@konfi/fakturownia/out/client/models";
import { FakturowniaTurnoverReport, UnpaidReport } from "@konfi/emails";
import { createElement } from "react";
import { sendEmail, type EmailAttachment } from "@/lib/email";
import { getAdminStorage } from "@/lib/firebase/serverApp";
import { getFakturowniaClient } from "../client";
import {
  buildTurnoverReport,
  generateTurnoverReportPdfBuffer,
  generateTurnoverReportPdfBufferFromData,
} from "./fakturowniaTurnoverReport";
import {
  buildUnpaidReport,
  generateUnpaidReportPdfBuffer,
  generateUnpaidReportPdfBufferFromData,
} from "./fakturowniaUnpaidReport";

export interface FakturowniaReportRequest {
  from?: string;
  to?: string;
  departmentId?: string;
}

export interface FakturowniaReportResponse {
  from: string;
  to: string;
  fileName: string;
  contentType: string;
  data: string;
}

export interface ScheduledFakturowniaReportResult {
  mainFilePath: string;
  departmentFilePaths: string[];
  emailSent: boolean;
  attachmentCount: number;
}

type ReportEmailAttachment = EmailAttachment;

function getIsoDate(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function getDefaultReportRange(data: FakturowniaReportRequest) {
  const today = new Date();
  const defaultIso = getIsoDate(today);
  const fromIso =
    typeof data.from === "string" && data.from.length > 0
      ? data.from
      : defaultIso;
  const toIso =
    typeof data.to === "string" && data.to.length > 0 ? data.to : fromIso;

  return { fromIso, toIso };
}

function getReportBucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const storage = getAdminStorage();
  return bucketName ? storage.bucket(bucketName) : storage.bucket();
}

function requireReportEmailEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not defined`);
  }
  return value;
}

function getAdminReportUrl() {
  const baseUrl =
    process.env.ADMIN_URL?.trim() || process.env.NEXT_PUBLIC_ADMIN_URL?.trim();

  if (!baseUrl) {
    throw new Error("ADMIN_URL or NEXT_PUBLIC_ADMIN_URL is not defined");
  }

  return new URL("/fakturownia", `${baseUrl.replace(/\/+$/u, "")}/`).toString();
}

export async function generateFakturowniaTurnoverReportPdf(
  data: FakturowniaReportRequest,
): Promise<FakturowniaReportResponse> {
  const { fromIso, toIso } = getDefaultReportRange(data);
  const pdfBuffer = await generateTurnoverReportPdfBuffer(
    fromIso,
    toIso,
    data.departmentId,
  );
  const departmentSuffix =
    data.departmentId && data.departmentId.length > 0
      ? `-${data.departmentId}`
      : "";

  return {
    from: fromIso,
    to: toIso,
    fileName: `fakturownia-turnover-${fromIso}-${toIso}${departmentSuffix}.pdf`,
    contentType: "application/pdf",
    data: pdfBuffer.toString("base64"),
  };
}

export async function generateFakturowniaUnpaidReportPdf(
  data: FakturowniaReportRequest,
): Promise<FakturowniaReportResponse> {
  const { fromIso, toIso } = getDefaultReportRange(data);
  const pdfBuffer = await generateUnpaidReportPdfBuffer(
    fromIso,
    toIso,
    data.departmentId,
  );
  const departmentSuffix =
    data.departmentId && data.departmentId.length > 0
      ? `-${data.departmentId}`
      : "";

  return {
    from: fromIso,
    to: toIso,
    fileName: `fakturownia-unpaid-${fromIso}-${toIso}${departmentSuffix}.pdf`,
    contentType: "application/pdf",
    data: pdfBuffer.toString("base64"),
  };
}

export async function runDailyFakturowniaTurnoverReport(): Promise<ScheduledFakturowniaReportResult> {
  const now = new Date();
  const iso = getIsoDate(now);
  const bucket = getReportBucket();
  const basePath = "reports/fakturownia-turnover";
  const mainReport = await buildTurnoverReport(iso, iso);
  const mainPdfBuffer =
    await generateTurnoverReportPdfBufferFromData(mainReport);
  const mainFilePath = `${basePath}/${iso}.pdf`;

  await bucket.file(mainFilePath).save(mainPdfBuffer, {
    contentType: "application/pdf",
  });

  const departmentFilePaths: string[] = [];
  const departmentAttachments: ReportEmailAttachment[] = [];

  try {
    const client = await getFakturowniaClient();
    const fetchedDepartments = await client.departmentsJson.get();
    const departments = Array.isArray(fetchedDepartments)
      ? (fetchedDepartments as Department[])
      : [];

    for (const department of departments) {
      if (department.id === undefined || department.id === null) {
        continue;
      }

      const departmentId = String(department.id);
      const report = await buildTurnoverReport(iso, iso, departmentId);

      if (report.totalNet === 0 && report.totalGross === 0) {
        console.info(
          "fakturowniaTurnoverReportDaily: skipping department with no invoices",
          { date: iso, departmentId },
        );
        continue;
      }

      const departmentPdfBuffer =
        await generateTurnoverReportPdfBufferFromData(report);
      const departmentFilePath = `${basePath}/${iso}-department-${departmentId}.pdf`;

      await bucket.file(departmentFilePath).save(departmentPdfBuffer, {
        contentType: "application/pdf",
      });

      departmentFilePaths.push(departmentFilePath);
      departmentAttachments.push({
        content: departmentPdfBuffer.toString("base64"),
        filename: `fakturownia-turnover-${iso}-department-${departmentId}.pdf`,
        type: "application/pdf",
        disposition: "attachment",
      });
    }
  } catch (error) {
    console.error(
      "fakturowniaTurnoverReportDaily: failed to generate department reports",
      { error },
    );
  }

  const subject = `Raport obrotu Fakturownia - ${iso}`;
  const attachments: EmailAttachment[] = [
    {
      content: mainPdfBuffer.toString("base64"),
      filename: `fakturownia-turnover-${iso}.pdf`,
      type: "application/pdf",
      disposition: "attachment",
    },
    ...departmentAttachments,
  ];

  await sendEmail({
    to: requireReportEmailEnv("REPORT_EMAIL"),
    from: requireReportEmailEnv("NO_REPLY_EMAIL"),
    subject,
    template: createElement(FakturowniaTurnoverReport, {
      date: iso,
      departmentCount: departmentFilePaths.length,
      hasDepartmentReports: departmentFilePaths.length > 0,
      subject,
      url: getAdminReportUrl(),
    }),
    attachments,
  });

  return {
    mainFilePath,
    departmentFilePaths,
    emailSent: true,
    attachmentCount: attachments.length,
  };
}

export async function runWeeklyFakturowniaUnpaidReport(): Promise<ScheduledFakturowniaReportResult> {
  const now = new Date();
  const iso = getIsoDate(now);
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const fromIso = getIsoDate(oneYearAgo);
  const bucket = getReportBucket();
  const basePath = "reports/fakturownia-unpaid";
  const mainReport = await buildUnpaidReport(fromIso, iso);
  const mainPdfBuffer = await generateUnpaidReportPdfBufferFromData(mainReport);
  const mainFilePath = `${basePath}/${iso}.pdf`;

  await bucket.file(mainFilePath).save(mainPdfBuffer, {
    contentType: "application/pdf",
  });

  const departmentFilePaths: string[] = [];
  const departmentAttachments: ReportEmailAttachment[] = [];
  const noReplyEmail = requireReportEmailEnv("NO_REPLY_EMAIL");
  const reportUrl = getAdminReportUrl();

  try {
    const client = await getFakturowniaClient();
    const fetchedDepartments = await client.departmentsJson.get();
    const departments = Array.isArray(fetchedDepartments)
      ? (fetchedDepartments as Department[])
      : [];

    for (const department of departments) {
      if (department.id === undefined || department.id === null) {
        continue;
      }

      const departmentId = String(department.id);
      const departmentEmail = department.email;
      const departmentName =
        department.shortcut ?? department.name ?? departmentId;
      const report = await buildUnpaidReport(fromIso, iso, departmentId);

      if (report.groups.length === 0) {
        console.info(
          "fakturowniaUnpaidReportWeekly: skipping department with no unpaid invoices",
          { date: iso, departmentId, departmentName },
        );
        continue;
      }

      const departmentPdfBuffer =
        await generateUnpaidReportPdfBufferFromData(report);
      const departmentFilePath = `${basePath}/${iso}-department-${departmentId}.pdf`;
      const departmentFilename = `fakturownia-unpaid-${iso}-department-${departmentId}.pdf`;

      await bucket.file(departmentFilePath).save(departmentPdfBuffer, {
        contentType: "application/pdf",
      });

      departmentFilePaths.push(departmentFilePath);
      departmentAttachments.push({
        content: departmentPdfBuffer.toString("base64"),
        filename: departmentFilename,
        type: "application/pdf",
        disposition: "attachment",
      });

      if (departmentEmail && departmentEmail.trim().length > 0) {
        const subject = `Raport przeterminowanych faktur - ${departmentName} - ${iso}`;

        await sendEmail({
          to: departmentEmail.trim(),
          from: noReplyEmail,
          subject,
          template: createElement(UnpaidReport, {
            date: iso,
            departmentName,
            currency: report.currency,
            departmentCount: 0,
            fromDate: fromIso,
            hasDepartmentReports: false,
            subject,
            totalBuyers: report.groups.length,
            totalInvoices: report.groups.reduce(
              (sum, group) => sum + group.invoices.length,
              0,
            ),
            totalOutstanding: report.totalOutstanding.toLocaleString("pl-PL", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            url: reportUrl,
          }),
          attachments: [
            {
              content: departmentPdfBuffer.toString("base64"),
              filename: departmentFilename,
              type: "application/pdf",
              disposition: "attachment",
            },
          ],
        });
      }
    }
  } catch (error) {
    console.error(
      "fakturowniaUnpaidReportWeekly: failed to generate department reports",
      { error },
    );
  }

  const subject = `Raport przeterminowanych faktur - ${iso}`;
  const attachments: EmailAttachment[] = [
    {
      content: mainPdfBuffer.toString("base64"),
      filename: `fakturownia-unpaid-${iso}.pdf`,
      type: "application/pdf",
      disposition: "attachment",
    },
    ...departmentAttachments,
  ];

  await sendEmail({
    to: requireReportEmailEnv("REPORT_EMAIL"),
    from: noReplyEmail,
    subject,
    template: createElement(UnpaidReport, {
      date: iso,
      currency: mainReport.currency,
      departmentCount: departmentFilePaths.length,
      fromDate: fromIso,
      hasDepartmentReports: departmentFilePaths.length > 0,
      subject,
      totalBuyers: mainReport.groups.length,
      totalInvoices: mainReport.groups.reduce(
        (sum, group) => sum + group.invoices.length,
        0,
      ),
      totalOutstanding: mainReport.totalOutstanding.toLocaleString("pl-PL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      url: reportUrl,
    }),
    attachments,
  });

  return {
    mainFilePath,
    departmentFilePaths,
    emailSent: true,
    attachmentCount: attachments.length,
  };
}
