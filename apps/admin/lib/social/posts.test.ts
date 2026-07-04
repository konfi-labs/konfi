import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ──────────────────────────────────────────────────────────────────────────────
// Hoist mocks before any imports that trigger server-side code
// ──────────────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const docGetFn = vi.fn();
  const docSetFn = vi.fn();
  const docUpdateFn = vi.fn();
  const docDeleteFn = vi.fn();
  const docRef = vi.fn(() => ({
    id: "generated-id",
    get: docGetFn,
    set: docSetFn,
    update: docUpdateFn,
    delete: docDeleteFn,
  }));
  const collectionFn = vi.fn(() => ({
    doc: docRef,
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    get: vi.fn(async () => ({ docs: [] })),
  }));
  const mockGetAdminDb = vi.fn(() => ({
    collection: collectionFn,
  }));

  return {
    mockGetAdminDb,
    collectionFn,
    docRef,
    docGetFn,
    docSetFn,
    docUpdateFn,
    docDeleteFn,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.mockGetAdminDb,
  getTenantContextForRequest: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  getTenantAdminScopeTenantId: vi.fn((ctx: { tenantId?: string }) =>
    ctx?.tenantId ?? undefined,
  ),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: "serverTimestamp" }),
    delete: () => ({ _type: "fieldDelete" }),
  },
  Timestamp: {
    fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
    fromMillis: (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }),
  },
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import the module under test AFTER mocks are registered
// ──────────────────────────────────────────────────────────────────────────────

import { validateSocialPost } from "./posts";

const baseDedicatedContext = {
  deploymentMode: "dedicated" as const,
  requireTenantId: false,
  tenantId: undefined as string | undefined,
};
const baseSaasContext = {
  deploymentMode: "saas" as const,
  requireTenantId: true,
  tenantId: "tenant-abc",
};

const member = { id: "user-1", name: "Alice" };

// ──────────────────────────────────────────────────────────────────────────────
// validateSocialPost
// ──────────────────────────────────────────────────────────────────────────────

describe("validateSocialPost", () => {
  it("passes when content is present with no targets", () => {
    const issues = validateSocialPost({
      content: "Hello world",
      media: [],
      targets: [],
    });
    expect(issues).toHaveLength(0);
  });

  it("fails when content is empty and no media is provided", () => {
    const issues = validateSocialPost({
      content: "",
      media: [],
      targets: [],
    });
    expect(issues.some((i) => i.field === "content")).toBe(true);
  });

  it("passes when content is empty but media is present", () => {
    const issues = validateSocialPost({
      content: "",
      media: [{ storagePath: "a", downloadUrl: "b", contentType: "image/jpeg" }],
      targets: [],
    });
    expect(issues).toHaveLength(0);
  });

  it("fails for Instagram target when no image media is present", () => {
    const issues = validateSocialPost({
      content: "Hi",
      media: [{ storagePath: "v", downloadUrl: "u", contentType: "video/mp4" }],
      targets: [{ provider: "instagram", targetId: "ig1", targetName: "IG" }],
    });
    expect(issues.some((i) => i.field === "targets")).toBe(true);
  });

  it("passes for Instagram target when image media is present", () => {
    const issues = validateSocialPost({
      content: "Hi",
      media: [{ storagePath: "p", downloadUrl: "u", contentType: "image/jpeg" }],
      targets: [{ provider: "instagram", targetId: "ig1", targetName: "IG" }],
    });
    expect(issues).toHaveLength(0);
  });

  it("fails when Facebook content exceeds 63206 chars", () => {
    const issues = validateSocialPost({
      content: "x".repeat(63207),
      media: [],
      targets: [{ provider: "facebook", targetId: "fb1", targetName: "FB Page" }],
    });
    expect(issues.some((i) => i.field === "content")).toBe(true);
  });

  it("fails when Instagram caption exceeds 2200 chars", () => {
    const issues = validateSocialPost({
      content: "x".repeat(2201),
      media: [{ storagePath: "p", downloadUrl: "u", contentType: "image/jpeg" }],
      targets: [{ provider: "instagram", targetId: "ig1", targetName: "IG" }],
    });
    expect(issues.some((i) => i.field === "content")).toBe(true);
  });

  it("passes Facebook content at exactly 63206 chars", () => {
    const issues = validateSocialPost({
      content: "x".repeat(63206),
      media: [],
      targets: [{ provider: "facebook", targetId: "fb1", targetName: "FB Page" }],
    });
    expect(issues).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Status transition guards
// ──────────────────────────────────────────────────────────────────────────────

describe("status transition guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updatePost throws when status is 'publishing'", async () => {
    mocks.docGetFn.mockResolvedValueOnce({
      exists: true,
      id: "post-1",
      data: () => ({
        id: "post-1",
        status: "publishing",
        tenantId: undefined,
        content: "hello",
        media: [],
        targets: [],
      }),
    });

    const { updatePost } = await import("./posts");

    await expect(
      updatePost("post-1", baseDedicatedContext, {
        member,
        content: "new content",
        media: [],
        targets: [],
      }),
    ).rejects.toThrow(/cannot be edited/);
  });

  it("cancelSchedule throws when status is not 'scheduled'", async () => {
    mocks.docGetFn.mockResolvedValueOnce({
      exists: true,
      id: "post-2",
      data: () => ({
        id: "post-2",
        status: "draft",
        tenantId: undefined,
        content: "hello",
        media: [],
        targets: [],
      }),
    });

    const { cancelSchedule } = await import("./posts");

    await expect(cancelSchedule("post-2", baseDedicatedContext, member)).rejects.toThrow(
      /Only scheduled posts/,
    );
  });

  it("updatePost succeeds when status is 'draft'", async () => {
    mocks.docGetFn.mockResolvedValueOnce({
      exists: true,
      id: "post-3",
      data: () => ({
        id: "post-3",
        status: "draft",
        tenantId: undefined,
        content: "old content",
        media: [],
        targets: [],
      }),
    });
    mocks.docUpdateFn.mockResolvedValueOnce(undefined);

    const { updatePost } = await import("./posts");

    await expect(
      updatePost("post-3", baseDedicatedContext, {
        member,
        content: "updated content",
        media: [],
        targets: [],
      }),
    ).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tenant scoping
// ──────────────────────────────────────────────────────────────────────────────

describe("tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes tenantId when SaaS context has one", async () => {
    mocks.docSetFn.mockResolvedValueOnce(undefined);
    mocks.docRef.mockReturnValueOnce({
      id: "new-post-id",
      set: mocks.docSetFn,
    });

    // Mock getTenantAdminScopeTenantId to return a tenantId for saas
    const { getTenantAdminScopeTenantId } = await import("@/actions/auth-utils");
    vi.mocked(getTenantAdminScopeTenantId).mockReturnValueOnce("tenant-abc");

    const { createPost } = await import("./posts");

    await createPost({
      tenantContext: baseSaasContext,
      member,
      content: "SaaS post",
      media: [],
      targets: [],
    });

    expect(mocks.docSetFn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-abc" }),
    );
  });

  it("omits tenantId when dedicated context has no scope", async () => {
    mocks.docSetFn.mockResolvedValueOnce(undefined);
    mocks.docRef.mockReturnValueOnce({
      id: "new-post-id-2",
      set: mocks.docSetFn,
    });

    const { getTenantAdminScopeTenantId } = await import("@/actions/auth-utils");
    vi.mocked(getTenantAdminScopeTenantId).mockReturnValueOnce(undefined);

    const { createPost } = await import("./posts");

    await createPost({
      tenantContext: baseDedicatedContext,
      member,
      content: "Dedicated post",
      media: [],
      targets: [],
    });

    const setArg = mocks.docSetFn.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).not.toHaveProperty("tenantId");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Name derivation
// ──────────────────────────────────────────────────────────────────────────────

describe("name derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses first 40 chars of content as name", async () => {
    mocks.docSetFn.mockResolvedValueOnce(undefined);
    mocks.docRef.mockReturnValueOnce({
      id: "n1",
      set: mocks.docSetFn,
    });

    const { getTenantAdminScopeTenantId } = await import("@/actions/auth-utils");
    vi.mocked(getTenantAdminScopeTenantId).mockReturnValueOnce(undefined);

    const { createPost } = await import("./posts");

    const longContent = "A".repeat(80);
    await createPost({
      tenantContext: baseDedicatedContext,
      member,
      content: longContent,
      media: [],
      targets: [],
    });

    const setArg = mocks.docSetFn.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.name).toBe("A".repeat(40));
  });

  it("uses 'Post' as fallback when content is empty but media present", async () => {
    mocks.docSetFn.mockResolvedValueOnce(undefined);
    mocks.docRef.mockReturnValueOnce({
      id: "n2",
      set: mocks.docSetFn,
    });

    const { getTenantAdminScopeTenantId } = await import("@/actions/auth-utils");
    vi.mocked(getTenantAdminScopeTenantId).mockReturnValueOnce(undefined);

    const { createPost } = await import("./posts");

    await createPost({
      tenantContext: baseDedicatedContext,
      member,
      content: "   ",
      media: [{ storagePath: "p", downloadUrl: "u", contentType: "image/jpeg" }],
      targets: [],
    });

    const setArg = mocks.docSetFn.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.name).toBe("Post");
  });
});
