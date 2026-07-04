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
  mockIsSharedSaasCronRuntime: vi.fn(),
  mockRunMonthlyExternalProductPriceCheck: vi.fn(),
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

vi.mock("@/lib/external-products/monthly-price-check", () => ({
  runMonthlyExternalProductPriceCheck:
    mocks.mockRunMonthlyExternalProductPriceCheck,
}));

let GET: (typeof import("./route"))["GET"];

const originalCronSecret = process.env.CRON_SECRET;

function createRequest(authorization?: string) {
  return new NextRequest("http://localhost/api/cron/external-product-prices", {
    headers: authorization ? { authorization } : undefined,
    method: "GET",
  });
}

describe("/api/cron/external-product-prices GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret";
    mocks.mockIsSharedSaasCronRuntime.mockReturnValue(false);
    mocks.mockRunMonthlyExternalProductPriceCheck.mockResolvedValue({
      checked: 1,
      updated: 0,
    });
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = originalCronSecret;
  });

  it("returns 401 when the cron request is unauthorized", async () => {
    const response = await GET(createRequest("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(
      mocks.mockRunMonthlyExternalProductPriceCheck,
    ).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("runs the price check for a valid Vercel cron authorization header", async () => {
    const response = await GET(createRequest("Bearer super-secret"));

    expect(response.status).toBe(200);
    expect(mocks.mockRunMonthlyExternalProductPriceCheck).toHaveBeenCalledTimes(
      1,
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      checked: 1,
      updated: 0,
    });
  });

  it("skips shared SaaS runtime without running provider checks", async () => {
    mocks.mockIsSharedSaasCronRuntime.mockReturnValue(true);

    const response = await GET(createRequest("Bearer super-secret"));

    expect(response.status).toBe(200);
    expect(
      mocks.mockRunMonthlyExternalProductPriceCheck,
    ).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      mode: "saas",
      skipped: true,
      success: true,
    });
  });
});
