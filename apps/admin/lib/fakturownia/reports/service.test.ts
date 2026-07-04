import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockBuildTurnoverReport: vi.fn(),
  mockBuildUnpaidReport: vi.fn(),
  mockGenerateTurnoverReportPdfBufferFromData: vi.fn(),
  mockGenerateUnpaidReportPdfBufferFromData: vi.fn(),
  mockGetAdminStorage: vi.fn(),
  mockGetFakturowniaClient: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mocks.mockSendEmail,
}));

vi.mock("@konfi/emails", () => ({
  FakturowniaTurnoverReport: () => null,
  UnpaidReport: () => null,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminStorage: mocks.mockGetAdminStorage,
}));

vi.mock("../client", () => ({
  getFakturowniaClient: mocks.mockGetFakturowniaClient,
}));

vi.mock("./fakturowniaTurnoverReport", () => ({
  buildTurnoverReport: mocks.mockBuildTurnoverReport,
  generateTurnoverReportPdfBuffer: vi.fn(),
  generateTurnoverReportPdfBufferFromData:
    mocks.mockGenerateTurnoverReportPdfBufferFromData,
}));

vi.mock("./fakturowniaUnpaidReport", () => ({
  buildUnpaidReport: mocks.mockBuildUnpaidReport,
  generateUnpaidReportPdfBuffer: vi.fn(),
  generateUnpaidReportPdfBufferFromData:
    mocks.mockGenerateUnpaidReportPdfBufferFromData,
}));

import {
  runDailyFakturowniaTurnoverReport,
  runWeeklyFakturowniaUnpaidReport,
} from "./service";

const originalEnv = { ...process.env };

interface SavedFile {
  content: Buffer;
  options: unknown;
  path: string;
}

function configureStorage() {
  const savedFiles: SavedFile[] = [];
  const bucket = {
    file: vi.fn((path: string) => ({
      save: vi.fn((content: Buffer, options: unknown) => {
        savedFiles.push({ content, options, path });
        return Promise.resolve();
      }),
    })),
  };

  mocks.mockGetAdminStorage.mockReturnValue({
    bucket: vi.fn(() => bucket),
  });

  return { bucket, savedFiles };
}

describe("scheduled Fakturownia report service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      ADMIN_URL: "https://admin.example.test",
      NO_REPLY_EMAIL: "noreply@example.test",
      REPORT_EMAIL: "reports@example.test",
    };

    configureStorage();
    mocks.mockGetFakturowniaClient.mockResolvedValue({
      departmentsJson: {
        get: vi.fn().mockResolvedValue([]),
      },
    });
    mocks.mockSendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("sends the daily turnover email without a Resend template id", async () => {
    const pdf = Buffer.from("turnover-pdf");
    mocks.mockBuildTurnoverReport.mockResolvedValue({
      totalGross: 123,
      totalNet: 100,
    });
    mocks.mockGenerateTurnoverReportPdfBufferFromData.mockResolvedValue(pdf);

    const result = await runDailyFakturowniaTurnoverReport();

    expect(result).toEqual({
      attachmentCount: 1,
      departmentFilePaths: [],
      emailSent: true,
      mainFilePath: "reports/fakturownia-turnover/2026-06-02.pdf",
    });
    expect(mocks.mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "fakturownia-turnover-2026-06-02.pdf",
            type: "application/pdf",
          }),
        ],
        from: "noreply@example.test",
        subject: "Raport obrotu Fakturownia - 2026-06-02",
        to: "reports@example.test",
      }),
    );
  });

  it("sends the weekly unpaid email without a Resend template id", async () => {
    const pdf = Buffer.from("unpaid-pdf");
    mocks.mockBuildUnpaidReport.mockResolvedValue({
      currency: "PLN",
      groups: [
        {
          invoices: [{ number: "FV/1/2026" }],
        },
      ],
      totalOutstanding: 246,
    });
    mocks.mockGenerateUnpaidReportPdfBufferFromData.mockResolvedValue(pdf);

    const result = await runWeeklyFakturowniaUnpaidReport();

    expect(result).toEqual({
      attachmentCount: 1,
      departmentFilePaths: [],
      emailSent: true,
      mainFilePath: "reports/fakturownia-unpaid/2026-06-02.pdf",
    });
    expect(mocks.mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "fakturownia-unpaid-2026-06-02.pdf",
            type: "application/pdf",
          }),
        ],
        from: "noreply@example.test",
        subject: "Raport przeterminowanych faktur - 2026-06-02",
        to: "reports@example.test",
      }),
    );
  });
});
