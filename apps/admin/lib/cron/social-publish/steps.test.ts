import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ──────────────────────────────────────────────────────────────────────────────
// Hoist mocks — must run before any module import
// ──────────────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const getPost = vi.fn();
  const recordTargetResult = vi.fn();
  const finalizePost = vi.fn();
  const getMetaPublishCredentials = vi.fn();
  const markMetaIntegrationNeedsAttention = vi.fn();
  const getMetaAppConfig = vi.fn();
  const publishToFacebookPage = vi.fn();
  const publishToInstagram = vi.fn();
  const getTenantContext = vi.fn((tenantId?: string | null) => ({
    deploymentMode: "saas" as const,
    requireTenantId: Boolean(tenantId),
    tenantId: tenantId ?? undefined,
  }));

  return {
    getPost,
    recordTargetResult,
    finalizePost,
    getMetaPublishCredentials,
    markMetaIntegrationNeedsAttention,
    getMetaAppConfig,
    publishToFacebookPage,
    publishToInstagram,
    getTenantContext,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getTenantContext: mocks.getTenantContext,
  getAdminDb: vi.fn(),
  getTenantContextForRequest: vi.fn(),
}));

vi.mock("@/lib/social/posts", () => ({
  getPost: mocks.getPost,
  recordTargetResult: mocks.recordTargetResult,
  finalizePost: mocks.finalizePost,
}));

vi.mock("@/lib/social/meta-credentials", () => ({
  getMetaPublishCredentials: mocks.getMetaPublishCredentials,
  markMetaIntegrationNeedsAttention: mocks.markMetaIntegrationNeedsAttention,
}));

vi.mock("@/lib/social/meta-config", () => ({
  getMetaAppConfig: mocks.getMetaAppConfig,
}));

vi.mock("@/lib/social/providers/facebook", () => ({
  publishToFacebookPage: mocks.publishToFacebookPage,
}));

vi.mock("@/lib/social/providers/instagram", () => ({
  publishToInstagram: mocks.publishToInstagram,
}));

// ──────────────────────────────────────────────────────────────────────────────
// Shared test fixtures
// ──────────────────────────────────────────────────────────────────────────────

import {
  PermanentProviderError,
  RetryableProviderError,
} from "@/lib/social/providers/types";
import type { SocialPost, SocialPostTarget } from "@konfi/types";

const TENANT_ID = "tenant-abc";
const POST_ID = "post-001";

function makeTarget(overrides?: Partial<SocialPostTarget>): SocialPostTarget {
  return {
    provider: "facebook",
    targetId: "page-1",
    targetName: "My Page",
    status: "pending",
    ...overrides,
  } as SocialPostTarget;
}

function makePost(overrides?: Partial<SocialPost>): SocialPost {
  return {
    id: POST_ID,
    tenantId: TENANT_ID,
    name: "Test post",
    status: "publishing",
    content: "Hello world",
    media: [],
    targets: [makeTarget()],
    createdAt: { seconds: 1700000000, nanoseconds: 0 } as unknown as SocialPost["createdAt"],
    updatedAt: { seconds: 1700000000, nanoseconds: 0 } as unknown as SocialPost["updatedAt"],
    ...overrides,
  };
}

const defaultContext = {
  userToken: "user-token-123",
  pages: [
    {
      id: "page-1",
      name: "My Page",
      pageToken: "page-token-abc",
      igAccount: { id: "ig-001", username: "mypage_ig" },
    },
  ],
  graphApiVersion: "v19.0",
};

// ──────────────────────────────────────────────────────────────────────────────
// publishTargetStep
// ──────────────────────────────────────────────────────────────────────────────

describe("publishTargetStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordTargetResult.mockResolvedValue(undefined);
    mocks.markMetaIntegrationNeedsAttention.mockResolvedValue(undefined);
  });

  it("regression: skips target when live Firestore status is 'published' even though snapshot is 'pending'", async () => {
    // Snapshot says pending, but live Firestore has already recorded published.
    const snapshotTarget = makeTarget({ status: "pending" });
    const livePost = makePost({
      targets: [makeTarget({ status: "published" })],
    });
    mocks.getPost.mockResolvedValue(livePost);

    const { publishTargetStep } = await import("./steps");

    const result = await publishTargetStep(
      POST_ID,
      TENANT_ID,
      snapshotTarget,
      "Hello world",
      [],
      defaultContext,
    );

    expect(result).toEqual({ targetId: "page-1", outcome: "skipped" });
    expect(mocks.publishToFacebookPage).not.toHaveBeenCalled();
    expect(mocks.publishToInstagram).not.toHaveBeenCalled();
    expect(mocks.recordTargetResult).not.toHaveBeenCalled();
  });

  it("happy path Facebook: publishes and records result", async () => {
    const livePost = makePost({ targets: [makeTarget({ status: "pending" })] });
    mocks.getPost.mockResolvedValue(livePost);
    mocks.publishToFacebookPage.mockResolvedValue({ externalPostId: "fb-ext-123" });

    const { publishTargetStep } = await import("./steps");

    const result = await publishTargetStep(
      POST_ID,
      TENANT_ID,
      makeTarget({ status: "pending" }),
      "Hello world",
      [],
      defaultContext,
    );

    expect(result).toEqual({ targetId: "page-1", outcome: "published" });
    expect(mocks.publishToFacebookPage).toHaveBeenCalledOnce();
    expect(mocks.recordTargetResult).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
      "page-1",
      { status: "published", externalPostId: "fb-ext-123" },
    );
  });

  it("happy path Instagram: publishes via instagram provider and records result", async () => {
    const igTarget = makeTarget({
      provider: "instagram",
      targetId: "page-1",
      status: "pending",
    });
    const livePost = makePost({ targets: [igTarget] });
    mocks.getPost.mockResolvedValue(livePost);
    mocks.publishToInstagram.mockResolvedValue({ externalPostId: "ig-ext-456" });

    const { publishTargetStep } = await import("./steps");

    const result = await publishTargetStep(
      POST_ID,
      TENANT_ID,
      igTarget,
      "Instagram caption",
      [],
      defaultContext,
    );

    expect(result).toEqual({ targetId: "page-1", outcome: "published" });
    expect(mocks.publishToInstagram).toHaveBeenCalledOnce();
    expect(mocks.recordTargetResult).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
      "page-1",
      { status: "published", externalPostId: "ig-ext-456" },
    );
  });

  it("PermanentProviderError with tokenExpired: records failed and marks needs-attention", async () => {
    const livePost = makePost({ targets: [makeTarget({ status: "pending" })] });
    mocks.getPost.mockResolvedValue(livePost);
    mocks.publishToFacebookPage.mockRejectedValue(
      new PermanentProviderError("Token expired", { tokenExpired: true }),
    );

    const { publishTargetStep } = await import("./steps");

    const result = await publishTargetStep(
      POST_ID,
      TENANT_ID,
      makeTarget({ status: "pending" }),
      "Hello world",
      [],
      defaultContext,
    );

    expect(result).toEqual({ targetId: "page-1", outcome: "failed" });
    expect(mocks.recordTargetResult).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
      "page-1",
      { status: "failed", error: "Token expired" },
    );
    expect(mocks.markMetaIntegrationNeedsAttention).toHaveBeenCalledOnce();
  });

  it("RetryableProviderError: re-throws and does NOT call recordTargetResult", async () => {
    const livePost = makePost({ targets: [makeTarget({ status: "pending" })] });
    mocks.getPost.mockResolvedValue(livePost);
    const retryErr = new RetryableProviderError("Rate limited");
    mocks.publishToFacebookPage.mockRejectedValue(retryErr);

    const { publishTargetStep } = await import("./steps");

    await expect(
      publishTargetStep(
        POST_ID,
        TENANT_ID,
        makeTarget({ status: "pending" }),
        "Hello world",
        [],
        defaultContext,
      ),
    ).rejects.toThrow(retryErr);

    expect(mocks.recordTargetResult).not.toHaveBeenCalled();
  });

  it("unknown provider: records failed outcome with 'Unknown provider' error", async () => {
    const unknownTarget = makeTarget({
      provider: "twitter" as SocialPostTarget["provider"],
      status: "pending",
    });
    const livePost = makePost({ targets: [unknownTarget] });
    mocks.getPost.mockResolvedValue(livePost);

    const { publishTargetStep } = await import("./steps");

    const result = await publishTargetStep(
      POST_ID,
      TENANT_ID,
      unknownTarget,
      "Hello world",
      [],
      defaultContext,
    );

    expect(result).toEqual({ targetId: "page-1", outcome: "failed" });
    expect(mocks.recordTargetResult).toHaveBeenCalledWith(
      POST_ID,
      expect.anything(),
      "page-1",
      expect.objectContaining({ status: "failed", error: expect.stringContaining("Unknown provider") }),
    );
  });

  it("fast path: snapshot already 'published' → skips without calling getPost", async () => {
    const alreadyPublishedTarget = makeTarget({ status: "published" });

    const { publishTargetStep } = await import("./steps");

    const result = await publishTargetStep(
      POST_ID,
      TENANT_ID,
      alreadyPublishedTarget,
      "Hello world",
      [],
      defaultContext,
    );

    expect(result).toEqual({ targetId: "page-1", outcome: "skipped" });
    // Fast path skips the getPost call entirely
    expect(mocks.getPost).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// loadPublishablePostStep
// ──────────────────────────────────────────────────────────────────────────────

describe("loadPublishablePostStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordTargetResult.mockResolvedValue(undefined);
    mocks.finalizePost.mockResolvedValue(undefined);
  });

  it("returns null when the post is missing", async () => {
    mocks.getPost.mockResolvedValue(undefined);

    const { loadPublishablePostStep } = await import("./steps");

    const result = await loadPublishablePostStep(POST_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it("returns null when post status is not 'publishing'", async () => {
    mocks.getPost.mockResolvedValue(makePost({ status: "scheduled" as SocialPost["status"] }));

    const { loadPublishablePostStep } = await import("./steps");

    const result = await loadPublishablePostStep(POST_ID, TENANT_ID);

    expect(result).toBeNull();
    expect(mocks.getMetaPublishCredentials).not.toHaveBeenCalled();
  });

  it("returns null and marks all pending targets failed when credentials are missing", async () => {
    const post = makePost({
      targets: [
        makeTarget({ targetId: "page-1", status: "pending" }),
        makeTarget({ targetId: "page-2", status: "pending" }),
      ],
    });
    mocks.getPost.mockResolvedValue(post);
    mocks.getMetaPublishCredentials.mockResolvedValue(null);
    mocks.getMetaAppConfig.mockResolvedValue(null);

    const { loadPublishablePostStep } = await import("./steps");

    const result = await loadPublishablePostStep(POST_ID, TENANT_ID);

    expect(result).toBeNull();
    expect(mocks.recordTargetResult).toHaveBeenCalledTimes(2);
    expect(mocks.finalizePost).toHaveBeenCalledOnce();
  });

  it("returns loaded context with credentials when post is publishing and credentials exist", async () => {
    const post = makePost();
    mocks.getPost.mockResolvedValue(post);
    mocks.getMetaPublishCredentials.mockResolvedValue({
      userToken: "tok-xyz",
      pages: [{ id: "page-1", name: "My Page", pageToken: "pt-abc" }],
    });
    mocks.getMetaAppConfig.mockResolvedValue({
      graphApiVersion: "v19.0",
      appId: "app-123",
    });

    const { loadPublishablePostStep } = await import("./steps");

    const result = await loadPublishablePostStep(POST_ID, TENANT_ID);

    expect(result).not.toBeNull();
    expect(result?.post).toEqual(post);
    expect(result?.userToken).toBe("tok-xyz");
    expect(result?.graphApiVersion).toBe("v19.0");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// finalizePostStep
// ──────────────────────────────────────────────────────────────────────────────

describe("finalizePostStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.finalizePost.mockResolvedValue(undefined);
  });

  it("delegates to finalizePost with a tenant context", async () => {
    const { finalizePostStep } = await import("./steps");

    await finalizePostStep(POST_ID, TENANT_ID);

    expect(mocks.finalizePost).toHaveBeenCalledOnce();
    expect(mocks.finalizePost).toHaveBeenCalledWith(
      POST_ID,
      expect.objectContaining({ tenantId: TENANT_ID }),
    );
  });
});
