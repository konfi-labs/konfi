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
  mockBatchDelete: vi.fn(),
  mockBatchCommit: vi.fn(),
  mockCollectionGroup: vi.fn(),
  mockGetAdminDb: vi.fn(),
  mockIsAuthorizedCronRequest: vi.fn(),
  mockQueryWhere: vi.fn(),
  mockRunForCronTenants: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({
  isAuthorizedCronRequest: mocks.mockIsAuthorizedCronRequest,
}));

vi.mock("@/lib/cron/tenant-runner", () => ({
  runForCronTenants: mocks.mockRunForCronTenants,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
}));

let GET: (typeof import("./route"))["GET"];

const originalCronSecret = process.env.CRON_SECRET;
const tenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} as const;

function createRequest() {
  return new NextRequest("http://localhost/api/cron/sanitize-carts", {
    method: "GET",
  });
}

describe("/api/cron/sanitize-carts GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "super-secret";
    mocks.mockIsAuthorizedCronRequest.mockReturnValue(true);
    mocks.mockRunForCronTenants.mockImplementation(
      async (
        runner: (context: {
          tenantContext: typeof tenantContext;
          tenantId: string;
        }) => Promise<unknown>,
      ) => [
        {
          tenantId: "tenant-a",
          status: "processed",
          result: await runner({
            tenantContext,
            tenantId: "tenant-a",
          }),
        },
      ],
    );
    const query = {
      get: vi.fn(async () => ({
        docs: [{ ref: "cart-ref" }],
        empty: false,
        size: 1,
      })),
      limit: vi.fn(),
      where: mocks.mockQueryWhere,
    };
    mocks.mockQueryWhere.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mocks.mockCollectionGroup.mockReturnValue(query);
    mocks.mockGetAdminDb.mockReturnValue({
      batch: () => ({
        commit: mocks.mockBatchCommit,
        delete: mocks.mockBatchDelete,
      }),
      collectionGroup: mocks.mockCollectionGroup,
    });
  });

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
      return;
    }

    process.env.CRON_SECRET = originalCronSecret;
  });

  it("filters cart deletion by tenant in SaaS mode", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mockCollectionGroup).toHaveBeenCalledWith("carts");
    expect(mocks.mockQueryWhere).toHaveBeenCalledWith(
      "tenantId",
      "==",
      "tenant-a",
    );
    expect(mocks.mockBatchDelete).toHaveBeenCalledWith("cart-ref");
    await expect(response.json()).resolves.toMatchObject({
      deletedCount: 1,
      success: true,
    });
  });
});
