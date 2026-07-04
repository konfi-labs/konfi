import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockIsAuthorizedCronRequest: vi.fn(),
  mockIsSharedSaasCronRuntime: vi.fn(),
  mockRunWeeklyFakturowniaUnpaidReportWorkflow: vi.fn(),
  mockStart: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({
  isAuthorizedCronRequest: mocks.mockIsAuthorizedCronRequest,
}));

vi.mock("@/lib/cron/tenant-runner", () => ({
  isSharedSaasCronRuntime: mocks.mockIsSharedSaasCronRuntime,
  skippedSaasCronResponse: (reason: string) => ({
    mode: "saas",
    reason,
    skipped: true,
    success: true,
  }),
}));

vi.mock("@/lib/fakturownia/reports/workflow", () => ({
  runWeeklyFakturowniaUnpaidReportWorkflow:
    mocks.mockRunWeeklyFakturowniaUnpaidReportWorkflow,
}));

vi.mock("workflow/api", () => ({
  start: mocks.mockStart,
}));

let GET: (typeof import("./route"))["GET"];

const savedEnv = {
  ADMIN_URL: process.env.ADMIN_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  FAKTUROWNIA_API_KEY: process.env.FAKTUROWNIA_API_KEY,
  FAKTUROWNIA_SUBDOMAIN: process.env.FAKTUROWNIA_SUBDOMAIN,
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  NO_REPLY_EMAIL: process.env.NO_REPLY_EMAIL,
  REPORT_EMAIL: process.env.REPORT_EMAIL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
};

function restoreEnvValue(name: keyof typeof savedEnv) {
  const value = savedEnv[name];

  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function setRequiredEnv() {
  process.env.ADMIN_URL = "https://admin.example.test";
  process.env.CRON_SECRET = "super-secret";
  process.env.FAKTUROWNIA_API_KEY = "fakturownia-key";
  process.env.FAKTUROWNIA_SUBDOMAIN = "konfi-test";
  process.env.NO_REPLY_EMAIL = "noreply@example.test";
  process.env.REPORT_EMAIL = "reports@example.test";
  process.env.RESEND_API_KEY = "resend-key";
  delete process.env.NEXT_PUBLIC_ADMIN_URL;
}

function createRequest() {
  return new NextRequest(
    "http://localhost/api/cron/fakturownia-unpaid-report",
    {
      method: "GET",
    },
  );
}

describe("/api/cron/fakturownia-unpaid-report GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setRequiredEnv();
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(true);
    mocks.mockIsSharedSaasCronRuntime.mockReturnValue(false);
    mocks.mockStart.mockResolvedValue({ runId: "unpaid-run-123" });
  });

  afterAll(() => {
    for (const name of Object.keys(savedEnv) as Array<keyof typeof savedEnv>) {
      restoreEnvValue(name);
    }
  });

  it("starts the weekly unpaid workflow when dedicated report env is complete", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(202);
    expect(mocks.mockStart).toHaveBeenCalledWith(
      mocks.mockRunWeeklyFakturowniaUnpaidReportWorkflow,
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      runId: "unpaid-run-123",
    });
  });

  it("returns 500 before starting the workflow when report recipient env is missing", async () => {
    delete process.env.REPORT_EMAIL;

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    expect(mocks.mockStart).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "REPORT_EMAIL is not configured.",
    });
  });

  it("returns 500 before starting the workflow when admin URL env is missing", async () => {
    delete process.env.ADMIN_URL;
    delete process.env.NEXT_PUBLIC_ADMIN_URL;

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    expect(mocks.mockStart).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "ADMIN_URL or NEXT_PUBLIC_ADMIN_URL is not configured.",
    });
  });

  it("skips shared SaaS runtime without requiring dedicated report env", async () => {
    delete process.env.REPORT_EMAIL;
    mocks.mockIsSharedSaasCronRuntime.mockReturnValue(true);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockStart).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      mode: "saas",
      skipped: true,
      success: true,
    });
  });
});
