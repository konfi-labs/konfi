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

const mocks = vi.hoisted(() => ({
  mockIsAuthorizedCronRequest: vi.fn(),
  mockRunWeeklyWhatsNewWorkflow: vi.fn(),
  mockStart: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({
  isAuthorizedCronRequest: mocks.mockIsAuthorizedCronRequest,
}));

vi.mock("@/lib/whats-new/weekly-workflow", () => ({
  runWeeklyWhatsNewWorkflow: mocks.mockRunWeeklyWhatsNewWorkflow,
}));

vi.mock("workflow/api", () => ({
  start: mocks.mockStart,
}));

let GET: (typeof import("./route"))["GET"];

const originalCronSecret = process.env.CRON_SECRET;

function createRequest(search: string = "") {
  return new NextRequest(
    `http://localhost/api/cron/whats-new-weekly${search}`,
    {
      method: "GET",
    },
  );
}

describe("/api/cron/whats-new-weekly GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret";
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(true);
    mocks.mockStart.mockResolvedValue({ runId: "workflow-run-456" });
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = originalCronSecret;
  });

  it("starts the weekly workflow and returns an accepted response", async () => {
    const response = await GET(createRequest("?force=1"));

    expect(response.status).toBe(202);
    expect(mocks.mockIsAuthorizedCronRequest).toHaveBeenCalledTimes(1);
    expect(mocks.mockStart).toHaveBeenCalledWith(
      mocks.mockRunWeeklyWhatsNewWorkflow,
      [true],
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      force: true,
      runId: "workflow-run-456",
    });
  });

  it("returns 500 when the cron secret is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    expect(mocks.mockIsAuthorizedCronRequest).not.toHaveBeenCalled();
    expect(mocks.mockStart).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "CRON_SECRET is not configured.",
    });
  });

  it("returns 401 when the cron request is unauthorized", async () => {
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(false);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mocks.mockStart).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("returns 500 when workflow startup fails", async () => {
    mocks.mockStart.mockRejectedValue(new Error("queue unavailable"));

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "queue unavailable",
    });
  });
});
