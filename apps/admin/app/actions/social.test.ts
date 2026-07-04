import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ──────────────────────────────────────────────────────────────────────────────
// Hoist mocks — must execute before any import
// ──────────────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const tenantContext = {
    deploymentMode: "saas" as const,
    requireTenantId: true,
    tenantId: "tenant-test",
  };

  const requireTenantPermission = vi.fn().mockResolvedValue({
    tenantContext,
    uid: "uid-test",
    membership: null,
  });

  const getAuthenticatedAdminMember = vi.fn().mockResolvedValue({
    uid: "uid-test",
    email: "test@example.com",
    name: "Test User",
  });

  const isSocialFeatureEnabled = vi.fn().mockReturnValue(true);

  const getAdminDb = vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        set: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  }));

  const getTenantContextForRequest = vi.fn().mockResolvedValue(tenantContext);

  // Posts helpers
  const createPost = vi.fn();
  const updatePost = vi.fn();
  const setPostSchedule = vi.fn();
  const cancelSchedule = vi.fn();
  const deletePost = vi.fn();
  const listPosts = vi.fn();
  const validateSocialPost = vi.fn().mockReturnValue([]);
  const getPost = vi.fn();

  const getMetaAppConfig = vi.fn().mockResolvedValue(null);
  const encryptIntegrationSecret = vi.fn((x: unknown) => ({ encrypted: x }));
  const isEncryptedIntegrationSecret = vi.fn().mockReturnValue(false);
  const isSharedSaasTenantRuntime = vi.fn().mockReturnValue(false);
  const loadAdminAiInstructionSettings = vi.fn().mockResolvedValue({});
  const generateAdminText = vi.fn().mockResolvedValue("generated text");
  const buildAiInstructionOverlaySection = vi.fn().mockReturnValue(null);
  const normalizeMetaTenantIntegrationMetadata = vi.fn().mockReturnValue({
    meta: { pages: [] },
  });

  return {
    tenantContext,
    requireTenantPermission,
    getAuthenticatedAdminMember,
    isSocialFeatureEnabled,
    getAdminDb,
    getTenantContextForRequest,
    createPost,
    updatePost,
    setPostSchedule,
    cancelSchedule,
    deletePost,
    listPosts,
    validateSocialPost,
    getPost,
    getMetaAppConfig,
    encryptIntegrationSecret,
    isEncryptedIntegrationSecret,
    isSharedSaasTenantRuntime,
    loadAdminAiInstructionSettings,
    generateAdminText,
    buildAiInstructionOverlaySection,
    normalizeMetaTenantIntegrationMetadata,
  };
});

vi.mock("@/actions/auth-utils", () => ({
  AdminAuthError: class AdminAuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "AdminAuthError";
      this.statusCode = statusCode;
    }
  },
  requireTenantPermission: mocks.requireTenantPermission,
  getAuthenticatedAdminMember: mocks.getAuthenticatedAdminMember,
}));

vi.mock("@/lib/social/feature-flag", () => ({
  isSocialFeatureEnabled: mocks.isSocialFeatureEnabled,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
  getTenantContextForRequest: mocks.getTenantContextForRequest,
}));

vi.mock("@/lib/social/posts", () => ({
  createPost: mocks.createPost,
  updatePost: mocks.updatePost,
  setPostSchedule: mocks.setPostSchedule,
  cancelSchedule: mocks.cancelSchedule,
  deletePost: mocks.deletePost,
  listPosts: mocks.listPosts,
  validateSocialPost: mocks.validateSocialPost,
  getPost: mocks.getPost,
}));

vi.mock("@/lib/social/meta-config", () => ({
  getMetaAppConfig: mocks.getMetaAppConfig,
}));

vi.mock("@/lib/integration-secret-crypto", () => ({
  encryptIntegrationSecret: mocks.encryptIntegrationSecret,
  isEncryptedIntegrationSecret: mocks.isEncryptedIntegrationSecret,
}));

vi.mock("@/lib/tenant-runtime", () => ({
  isSharedSaasTenantRuntime: mocks.isSharedSaasTenantRuntime,
}));

vi.mock("@/lib/ai/ai-instruction-settings.server", () => ({
  loadAdminAiInstructionSettings: mocks.loadAdminAiInstructionSettings,
}));

vi.mock("@/actions/ai", () => ({
  generateAdminText: mocks.generateAdminText,
}));

vi.mock("@konfi/utils", () => ({
  buildAiInstructionOverlaySection: mocks.buildAiInstructionOverlaySection,
  META_TENANT_INTEGRATION_KEY: "meta",
  normalizeMetaTenantIntegrationMetadata: mocks.normalizeMetaTenantIntegrationMetadata,
  tenantMetaIntegrationDocumentId: (id: string) => `integrations/${id}/meta`,
  TENANT_INTEGRATIONS_COLLECTION: "tenantIntegrations",
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: "serverTimestamp" }),
    delete: () => ({ _type: "fieldDelete" }),
  },
  Timestamp: {
    now: () => ({ seconds: 1_700_000_000, nanoseconds: 0 }),
    fromDate: (d: Date) => ({
      seconds: Math.floor(d.getTime() / 1000),
      nanoseconds: 0,
    }),
    fromMillis: (ms: number) => ({
      seconds: Math.floor(ms / 1000),
      nanoseconds: 0,
    }),
  },
}));

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

import type { SocialPost } from "@konfi/types";

function makeStoredPost(overrides?: Partial<SocialPost>): SocialPost {
  return {
    id: "post-001",
    tenantId: "tenant-test",
    name: "Test post",
    status: "draft",
    content: "Hello social world",
    media: [],
    targets: [
      {
        provider: "facebook",
        targetId: "page-1",
        targetName: "My Page",
        status: "pending",
      },
    ],
    createdAt: { seconds: 1700000000, nanoseconds: 0 } as unknown as SocialPost["createdAt"],
    updatedAt: { seconds: 1700000000, nanoseconds: 0 } as unknown as SocialPost["updatedAt"],
    ...overrides,
  };
}

const postInput = {
  content: "Hello social world",
  media: [],
  targets: [{ provider: "facebook" as const, targetId: "page-1", targetName: "My Page" }],
};

// ──────────────────────────────────────────────────────────────────────────────
// createSocialPost
// ──────────────────────────────────────────────────────────────────────────────

describe("createSocialPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSocialFeatureEnabled.mockReturnValue(true);
    mocks.requireTenantPermission.mockResolvedValue({
      tenantContext: mocks.tenantContext,
      uid: "uid-test",
      membership: null,
    });
    mocks.getAuthenticatedAdminMember.mockResolvedValue({
      uid: "uid-test",
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("propagates permission rejection without calling createPost", async () => {
    const { AdminAuthError } = await import("@/actions/auth-utils");
    mocks.requireTenantPermission.mockRejectedValue(
      new AdminAuthError("Forbidden", 403),
    );

    const { createSocialPost } = await import("./social");

    await expect(createSocialPost(postInput)).rejects.toThrow("Forbidden");
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("happy path: delegates to createPost with correct arguments and returns id", async () => {
    mocks.createPost.mockResolvedValue("new-post-id");

    const { createSocialPost } = await import("./social");

    const result = await createSocialPost(postInput);

    expect(result).toEqual({ id: "new-post-id" });
    expect(mocks.createPost).toHaveBeenCalledOnce();
    expect(mocks.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantContext: mocks.tenantContext,
        content: postInput.content,
        targets: postInput.targets,
      }),
    );
  });

  it("propagates error thrown by createPost", async () => {
    mocks.createPost.mockRejectedValue(new Error("Firestore write failed"));

    const { createSocialPost } = await import("./social");

    await expect(createSocialPost(postInput)).rejects.toThrow("Firestore write failed");
  });

  it("throws AdminAuthError (404) when social feature is disabled", async () => {
    mocks.isSocialFeatureEnabled.mockReturnValue(false);

    const { createSocialPost } = await import("./social");

    await expect(createSocialPost(postInput)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.createPost).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// scheduleSocialPost
// ──────────────────────────────────────────────────────────────────────────────

describe("scheduleSocialPost", () => {
  const futureMs = Date.now() + 60 * 60 * 1000; // 1 hour from now

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSocialFeatureEnabled.mockReturnValue(true);
    mocks.requireTenantPermission.mockResolvedValue({
      tenantContext: mocks.tenantContext,
      uid: "uid-test",
      membership: null,
    });
    mocks.getAuthenticatedAdminMember.mockResolvedValue({
      uid: "uid-test",
      email: "test@example.com",
    });
  });

  it("propagates permission rejection without calling setPostSchedule", async () => {
    const { AdminAuthError } = await import("@/actions/auth-utils");
    mocks.requireTenantPermission.mockRejectedValue(
      new AdminAuthError("Forbidden", 403),
    );

    const { scheduleSocialPost } = await import("./social");

    await expect(scheduleSocialPost("post-001", futureMs)).rejects.toThrow("Forbidden");
    expect(mocks.setPostSchedule).not.toHaveBeenCalled();
  });

  it("happy path: validates post, schedules and returns { scheduled: true }", async () => {
    const post = makeStoredPost({ status: "draft" });
    mocks.getPost.mockResolvedValue(post);
    mocks.validateSocialPost.mockReturnValue([]);
    mocks.setPostSchedule.mockResolvedValue(undefined);

    const { scheduleSocialPost } = await import("./social");

    const result = await scheduleSocialPost("post-001", futureMs);

    expect(result).toEqual({ scheduled: true });
    expect(mocks.setPostSchedule).toHaveBeenCalledOnce();
  });

  it("returns { issues } when scheduledAt is in the past", async () => {
    const pastMs = Date.now() - 2 * 60 * 1000; // 2 minutes ago

    const { scheduleSocialPost } = await import("./social");

    const result = await scheduleSocialPost("post-001", pastMs);

    expect(result).toMatchObject({ issues: expect.arrayContaining([expect.any(String)]) });
    expect(mocks.setPostSchedule).not.toHaveBeenCalled();
  });

  it("returns { issues } when post is not found", async () => {
    mocks.getPost.mockResolvedValue(undefined);

    const { scheduleSocialPost } = await import("./social");

    const result = await scheduleSocialPost("post-missing", futureMs);

    expect(result).toMatchObject({ issues: expect.arrayContaining([expect.any(String)]) });
    expect(mocks.setPostSchedule).not.toHaveBeenCalled();
  });

  it("returns { issues } when validation fails on the post", async () => {
    const post = makeStoredPost({ targets: [] }); // no targets → validation fails
    mocks.getPost.mockResolvedValue(post);
    mocks.validateSocialPost.mockReturnValue([{ message: "No targets selected." }]);

    const { scheduleSocialPost } = await import("./social");

    const result = await scheduleSocialPost("post-001", futureMs);

    expect(result).toMatchObject({ issues: ["No targets selected."] });
    expect(mocks.setPostSchedule).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// listSocialPosts
// ──────────────────────────────────────────────────────────────────────────────

describe("listSocialPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSocialFeatureEnabled.mockReturnValue(true);
    mocks.requireTenantPermission.mockResolvedValue({
      tenantContext: mocks.tenantContext,
      uid: "uid-test",
      membership: null,
    });
  });

  it("propagates permission rejection without calling listPosts", async () => {
    const { AdminAuthError } = await import("@/actions/auth-utils");
    mocks.requireTenantPermission.mockRejectedValue(
      new AdminAuthError("Forbidden", 403),
    );

    const { listSocialPosts } = await import("./social");

    await expect(listSocialPosts()).rejects.toThrow("Forbidden");
    expect(mocks.listPosts).not.toHaveBeenCalled();
  });

  it("happy path: returns serialized posts from listPosts", async () => {
    const post = makeStoredPost();
    mocks.listPosts.mockResolvedValue([post]);

    const { listSocialPosts } = await import("./social");

    const result = await listSocialPosts();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "post-001",
      content: "Hello social world",
      status: "draft",
    });
    expect(mocks.listPosts).toHaveBeenCalledOnce();
    expect(mocks.listPosts).toHaveBeenCalledWith(mocks.tenantContext, undefined);
  });

  it("returns empty array when no posts exist", async () => {
    mocks.listPosts.mockResolvedValue([]);

    const { listSocialPosts } = await import("./social");

    const result = await listSocialPosts();

    expect(result).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// deleteSocialPost
// ──────────────────────────────────────────────────────────────────────────────

describe("deleteSocialPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSocialFeatureEnabled.mockReturnValue(true);
    mocks.requireTenantPermission.mockResolvedValue({
      tenantContext: mocks.tenantContext,
      uid: "uid-test",
      membership: null,
    });
    mocks.deletePost.mockResolvedValue(undefined);
  });

  it("propagates permission rejection without calling deletePost", async () => {
    const { AdminAuthError } = await import("@/actions/auth-utils");
    mocks.requireTenantPermission.mockRejectedValue(
      new AdminAuthError("Forbidden", 403),
    );

    const { deleteSocialPost } = await import("./social");

    await expect(deleteSocialPost("post-001")).rejects.toThrow("Forbidden");
    expect(mocks.deletePost).not.toHaveBeenCalled();
  });

  it("happy path: delegates to deletePost with correct arguments", async () => {
    const { deleteSocialPost } = await import("./social");

    await deleteSocialPost("post-001");

    expect(mocks.deletePost).toHaveBeenCalledOnce();
    expect(mocks.deletePost).toHaveBeenCalledWith("post-001", mocks.tenantContext);
  });

  it("propagates error thrown by deletePost", async () => {
    mocks.deletePost.mockRejectedValue(new Error("Cannot delete a published post."));

    const { deleteSocialPost } = await import("./social");

    await expect(deleteSocialPost("post-001")).rejects.toThrow("Cannot delete a published post.");
  });
});
