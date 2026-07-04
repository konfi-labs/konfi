import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockGetTenantContext: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
  getTenantContext: mocks.mockGetTenantContext,
}));

describe("cron tenant runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current context once for dedicated deployments", async () => {
    const dedicatedContext = {
      deploymentMode: "dedicated",
      requireTenantId: false,
      tenantId: "default",
    } as const;
    mocks.mockGetTenantContext.mockReturnValue(dedicatedContext);

    const { listCronTenantRunContexts } = await import("./tenant-runner");

    await expect(listCronTenantRunContexts()).resolves.toEqual([
      {
        tenantContext: dedicatedContext,
        tenantId: "default",
      },
    ]);
    expect(mocks.mockGetAdminDb).not.toHaveBeenCalled();
  });

  it("enumerates only active SaaS tenants", async () => {
    const baseContext = {
      deploymentMode: "saas",
      requireTenantId: true,
    } as const;
    mocks.mockGetTenantContext.mockImplementation((tenantId?: string) =>
      tenantId
        ? {
            deploymentMode: "saas",
            requireTenantId: true,
            tenantId,
          }
        : baseContext,
    );
    const get = vi.fn(async () => ({
      docs: [
        {
          id: "tenant-a",
          data: () => ({
            deploymentMode: "saas",
            status: "ACTIVE",
          }),
        },
        {
          id: "tenant-b",
          data: () => ({
            deploymentMode: "dedicated",
            status: "ACTIVE",
          }),
        },
      ],
    }));
    const secondWhere = vi.fn(() => ({ get }));
    const firstWhere = vi.fn(() => ({ where: secondWhere }));
    mocks.mockGetAdminDb.mockReturnValue({
      collection: vi.fn(() => ({ where: firstWhere })),
    });

    const { listCronTenantRunContexts } = await import("./tenant-runner");

    await expect(listCronTenantRunContexts()).resolves.toEqual([
      {
        tenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
          tenantId: "tenant-a",
        },
        tenantId: "tenant-a",
      },
    ]);
    expect(firstWhere).toHaveBeenCalledWith("status", "==", "ACTIVE");
    expect(secondWhere).toHaveBeenCalledWith("deploymentMode", "==", "saas");
  });
});
