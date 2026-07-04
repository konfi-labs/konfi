import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  MockAdminAuthError: class MockAdminAuthError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AdminAuthError";
      this.statusCode = statusCode;
    }
  },
  mockAdd: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockGet: vi.fn(),
  mockGetAdminDb: vi.fn(),
  mockGetAuthenticatedAdminMember: vi.fn(),
  mockRequireTenantAdminChannelAccess: vi.fn(),
  mockRequireTenantOwnerOrSuperAdminAuth: vi.fn(),
  mockServerTimestamp: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  AdminAuthError: mocks.MockAdminAuthError,
  getAuthenticatedAdminMember: mocks.mockGetAuthenticatedAdminMember,
  requireTenantAdminChannelAccess: mocks.mockRequireTenantAdminChannelAccess,
  requireTenantOwnerOrSuperAdminAuth:
    mocks.mockRequireTenantOwnerOrSuperAdminAuth,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
}));

vi.mock("@konfi/firebase", () => ({
  tenantFirestorePaths: {
    settingsDoc: (
      _tenantContext: unknown,
      channelId: string,
      settingsDocId: string,
    ) => `channels/${channelId}/settings/${settingsDocId}`,
  },
  withTenantId: (
    data: Record<string, unknown>,
    tenantContext: { tenantId?: string | null },
  ) => ({
    ...data,
    ...(tenantContext.tenantId ? { tenantId: tenantContext.tenantId } : {}),
  }),
}));

vi.mock("@konfi/utils", () => {
  const capabilities = [
    "adminAssistant",
    "printMethodResolution",
    "storefrontAssistant",
  ];
  const createCapability = (value: unknown) => {
    const capability =
      typeof value === "object" && value !== null
        ? (value as { enabled?: unknown; instructions?: unknown })
        : {};

    return {
      enabled: capability.enabled === true,
      instructions:
        typeof capability.instructions === "string"
          ? capability.instructions.trim()
          : "",
    };
  };

  return {
    AI_INSTRUCTIONS_SETTINGS_DOC_ID: "aiInstructions",
    normalizeAiInstructionSettings: (
      settings?: {
        capabilities?: Record<string, unknown>;
        updatedAt?: unknown;
        updatedBy?: unknown;
      } | null,
    ) => ({
      capabilities: Object.fromEntries(
        capabilities.map((capability) => [
          capability,
          createCapability(settings?.capabilities?.[capability]),
        ]),
      ),
      updatedAt: settings?.updatedAt,
      updatedBy: settings?.updatedBy,
    }),
  };
});

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mocks.mockServerTimestamp,
  },
}));

const tenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} satisfies TenantContext;

function createSnapshot(data?: Record<string, unknown>) {
  return {
    exists: Boolean(data),
    data: () => data,
  };
}

describe("AI instruction settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockServerTimestamp.mockReturnValue("server-timestamp");
    mocks.mockRequireTenantOwnerOrSuperAdminAuth.mockResolvedValue({
      membership: null,
      tenantContext,
      uid: "owner-uid",
    });
    mocks.mockRequireTenantAdminChannelAccess.mockResolvedValue("channel-a");
    mocks.mockGetAuthenticatedAdminMember.mockResolvedValue({
      id: "owner-uid",
      name: "Owner",
    });
    mocks.mockCollection.mockReturnValue({ add: mocks.mockAdd });
    mocks.mockDoc.mockImplementation((path: string) => {
      if (path === "channels/channel-a") {
        return {
          get: () => Promise.resolve(createSnapshot({ tenantId: "tenant-a" })),
        };
      }

      if (path === "channels/channel-a/settings/aiInstructions") {
        return {
          collection: mocks.mockCollection,
          get: mocks.mockGet,
          set: mocks.mockSet,
        };
      }

      throw new Error(`Unexpected doc path: ${path}`);
    });
    mocks.mockGetAdminDb.mockReturnValue({ doc: mocks.mockDoc });
  });

  it("loads settings for authorized owners and super admins", async () => {
    mocks.mockGet.mockResolvedValue(
      createSnapshot({
        capabilities: {
          adminAssistant: {
            enabled: true,
            instructions: "Use concise language.",
          },
        },
        tenantId: "tenant-a",
      }),
    );

    const { getAiInstructionSettingsAction } =
      await import("./ai-instructions");
    const result = await getAiInstructionSettingsAction("channel-a");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful AI instructions result.");
    }
    expect(result.view.settings.capabilities.adminAssistant.instructions).toBe(
      "Use concise language.",
    );
    expect(mocks.mockRequireTenantOwnerOrSuperAdminAuth).toHaveBeenCalled();
    expect(mocks.mockRequireTenantAdminChannelAccess).toHaveBeenCalledWith(
      "channel-a",
    );
  });

  it("saves settings and appends a revision", async () => {
    mocks.mockGet.mockResolvedValue(
      createSnapshot({
        capabilities: {
          adminAssistant: {
            enabled: true,
            instructions: "Use concise language.",
          },
        },
        tenantId: "tenant-a",
      }),
    );

    const { saveAiInstructionSettingsAction } =
      await import("./ai-instructions");
    const result = await saveAiInstructionSettingsAction({
      channelId: "channel-a",
      settings: {
        capabilities: {
          adminAssistant: {
            enabled: true,
            instructions: " Use concise language. ",
          },
          printMethodResolution: {
            enabled: false,
            instructions: "",
          },
          storefrontAssistant: {
            enabled: false,
            instructions: "",
          },
        },
      },
    });
    expect(result.ok).toBe(true);

    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        updatedBy: { id: "owner-uid", name: "Owner" },
      }),
      { merge: true },
    );
    expect(mocks.mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: { id: "owner-uid", name: "Owner" },
        tenantId: "tenant-a",
      }),
    );
  });

  it("returns a typed failure for expected non-owner access", async () => {
    mocks.mockRequireTenantOwnerOrSuperAdminAuth.mockRejectedValue(
      new mocks.MockAdminAuthError("Tenant owner access is required", 403),
    );

    const { getAiInstructionSettingsAction } =
      await import("./ai-instructions");

    await expect(getAiInstructionSettingsAction("channel-a")).resolves.toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Tenant owner access is required",
        statusCode: 403,
      },
    });
  });

  it("still throws unexpected authorization defects", async () => {
    mocks.mockRequireTenantOwnerOrSuperAdminAuth.mockRejectedValue(
      new mocks.MockAdminAuthError("Unexpected auth defect", 500),
    );

    const { getAiInstructionSettingsAction } =
      await import("./ai-instructions");

    await expect(getAiInstructionSettingsAction("channel-a")).rejects.toThrow(
      "Unexpected auth defect",
    );
  });
});
