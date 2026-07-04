import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadAuthorizedChannels } from "./channels";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getAdminDb: vi.fn(),
  getTenantAdminChannelAccessContext: vi.fn(),
  getTenantAdminScopeTenantId: vi.fn(),
  requireTenantAdminAuthContext: vi.fn(),
  requireTenantAdminChannelAccess: vi.fn(),
  requireTenantPermission: vi.fn(),
  requireTenantWidePermission: vi.fn(),
  tenantAdminChannelAccessAllows: vi.fn(),
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("./auth-utils", () => ({
  getTenantAdminChannelAccessContext: mocks.getTenantAdminChannelAccessContext,
  getTenantAdminScopeTenantId: mocks.getTenantAdminScopeTenantId,
  requireTenantAdminAuthContext: mocks.requireTenantAdminAuthContext,
  requireTenantAdminChannelAccess: mocks.requireTenantAdminChannelAccess,
  requireTenantPermission: mocks.requireTenantPermission,
  requireTenantWidePermission: mocks.requireTenantWidePermission,
  tenantAdminChannelAccessAllows: mocks.tenantAdminChannelAccessAllows,
}));

class AdminTimestamp {
  private readonly _seconds: number;
  private readonly _nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this._seconds = seconds;
    this._nanoseconds = nanoseconds;
  }
}

describe("loadAuthorizedChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenantAdminChannelAccessContext.mockResolvedValue({
      channelAccess: {
        allChannels: true,
        channelIds: [],
      },
      tenantContext: {
        deploymentMode: "saas",
        requireTenantId: true,
        tenantId: "tenant-a",
      },
    });
    mocks.getTenantAdminScopeTenantId.mockReturnValue("tenant-a");
  });

  it("serializes nested Firestore timestamps before returning channels to the client", async () => {
    const timestamp = new AdminTimestamp(1_780_000_000, 758_000_000);
    const get = vi.fn().mockResolvedValue({
      docs: [
        {
          data: () => ({
            active: true,
            createdAt: timestamp,
            currency: "PLN",
            id: "channel-1",
            importMetadata: {
              importedAt: timestamp,
              importedBy: "uid-1",
              sourcePath: "channels/source",
              sourceTemplateId: "starter",
              tenantId: "tenant-a",
            },
            name: "Tenant channel",
            tenantId: "tenant-a",
            updatedAt: timestamp,
            warehouses: [],
          }),
          id: "channel-1",
        },
      ],
      size: 1,
    });
    const limit = vi.fn(() => ({ get }));
    const where = vi.fn(() => ({ limit }));
    const collection = vi.fn(() => ({ where }));
    mocks.getAdminDb.mockReturnValue({ collection });

    const channels = await loadAuthorizedChannels();

    expect(channels).toHaveLength(1);
    expect(channels[0].createdAt).toEqual({
      nanoseconds: 758_000_000,
      seconds: 1_780_000_000,
    });
    expect(
      (
        channels[0] as (typeof channels)[0] & {
          importMetadata: { importedAt: unknown };
        }
      ).importMetadata.importedAt,
    ).toEqual({
      nanoseconds: 758_000_000,
      seconds: 1_780_000_000,
    });
  });
});
