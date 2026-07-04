import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const {
  mockGenerateStoreImageWorkflow,
  mockGetRun,
  mockGetStoreRuntimeConfigForRequest,
  mockGetUser,
  mockGetStoreImageGenerationJobByRunId,
  mockStart,
  mockUpsertStoreImageGenerationJob,
  mockVerifyAnyIdToken,
  mockVerifyAppCheckToken,
} = vi.hoisted(() => ({
  mockGenerateStoreImageWorkflow: vi.fn(),
  mockGetRun: vi.fn(),
  mockGetStoreRuntimeConfigForRequest: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetStoreImageGenerationJobByRunId: vi.fn(),
  mockStart: vi.fn(),
  mockUpsertStoreImageGenerationJob: vi.fn(),
  mockVerifyAnyIdToken: vi.fn(),
  mockVerifyAppCheckToken: vi.fn(),
}));

vi.mock("workflow/api", () => ({
  getRun: mockGetRun,
  start: mockStart,
}));

vi.mock("../../../lib/ai/store-image-generation.workflow", () => ({
  generateStoreImageWorkflow: mockGenerateStoreImageWorkflow,
}));

vi.mock("../../../lib/firebase/config", () => ({
  firebaseConfig: {
    appId: "app-id",
  },
}));

vi.mock("../../../lib/firebase/serverApp", () => ({
  getAdminAuth: () => ({
    getUser: mockGetUser,
  }),
  getStoreRuntimeConfigForRequest: mockGetStoreRuntimeConfigForRequest,
  verifyAnyIdToken: mockVerifyAnyIdToken,
  verifyAppCheckToken: mockVerifyAppCheckToken,
}));

vi.mock("../../../lib/product-preview.server", () => ({
  isAdminProductPreviewAllowed: vi.fn(
    (headers: Pick<Headers, "get">) =>
      headers.get("cookie")?.includes("__konfi_admin_product_preview=") ??
      false,
  ),
}));

vi.mock("../../../lib/ai/store-image-generation", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/ai/store-image-generation")
  >("../../../lib/ai/store-image-generation");

  return {
    ...actual,
    getStoreImageGenerationJobByRunId: mockGetStoreImageGenerationJobByRunId,
    upsertStoreImageGenerationJob: mockUpsertStoreImageGenerationJob,
  };
});

vi.mock("@konfi/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@konfi/utils")>("@konfi/utils");

  return {
    ...actual,
    isSameOriginRequest: vi.fn(() => true),
  };
});

let GET: (typeof import("./route"))["GET"];
let POST: (typeof import("./route"))["POST"];

describe("/api/image-generation", () => {
  beforeAll(async () => {
    ({ GET, POST } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "");
    mockVerifyAnyIdToken.mockResolvedValue({
      admin: false,
      firebase: {
        sign_in_provider: "password",
      },
      uid: "user-1",
    });
    mockGetUser.mockResolvedValue({
      emailVerified: true,
    });
    mockGetStoreRuntimeConfigForRequest.mockResolvedValue({
      channelId: "channel-1",
      tenantContext: {
        deploymentMode: "dedicated",
        tenantId: "tenant-1",
      },
    });
    mockStart.mockResolvedValue({
      runId: "run-1",
    });
    mockGetRun.mockReturnValue({
      status: Promise.resolve("completed"),
      returnValue: Promise.resolve({
        context: {
          isLargeFormat: false,
          printSideCount: 1,
        },
        expiresAt: "2099-04-26T12:00:00.000Z",
        expiresAtMs: Date.parse("2099-04-26T12:00:00.000Z"),
        images: [
          {
            id: "single",
            imageDataUrl: "https://example.com/generated.png",
            side: "single",
          },
        ],
        remainingAttempts: 1,
      }),
    });
    mockGetStoreImageGenerationJobByRunId.mockResolvedValue({
      id: "job-1",
      data: {
        jobId: "job-1",
        runId: "run-1",
        userId: "user-1",
        status: "completed",
        result: {
          context: {
            isLargeFormat: false,
            printSideCount: 1,
          },
          expiresAt: "2099-04-26T12:00:00.000Z",
          expiresAtMs: Date.parse("2099-04-26T12:00:00.000Z"),
          images: [
            {
              id: "single",
              imageDataUrl: "https://example.com/generated.png",
              side: "single",
            },
          ],
          remainingAttempts: 1,
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts a workflow-backed image generation job", async () => {
    const formData = new FormData();
    formData.append(
      "prompt",
      "Create a premium event poster with clear hierarchy, warm neutral tones, elegant typography, strong contrast, and enough detail for a polished print-ready concept that can be used for customer-facing promotional material.",
    );
    formData.append("style", "kreatywny");
    formData.append("productId", "product-1");
    formData.append("channelId", "channel-1");

    const response = await POST(
      new NextRequest("http://localhost/api/image-generation", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
        },
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      runId: "run-1",
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith(mockGenerateStoreImageWorkflow, [
      expect.objectContaining({
        request: expect.objectContaining({
          allowAdminPreview: false,
          style: "kreatywny",
        }),
      }),
    ]);
    expect(mockUpsertStoreImageGenerationJob).toHaveBeenCalledTimes(2);
  });

  it("rejects public image generation for a foreign runtime channel", async () => {
    const formData = new FormData();
    formData.append(
      "prompt",
      "Create a premium event poster with clear hierarchy, warm neutral tones, elegant typography, strong contrast, and enough detail for a polished print-ready concept that can be used for customer-facing promotional material.",
    );
    formData.append("productId", "product-1");
    formData.append("channelId", "channel-2");

    const response = await POST(
      new NextRequest("http://localhost/api/image-generation", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
        },
        body: formData,
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockUpsertStoreImageGenerationJob).not.toHaveBeenCalled();
  });

  it("allows admin preview requests to target draft products only when the caller is an admin", async () => {
    mockVerifyAnyIdToken.mockResolvedValue({
      admin: true,
      firebase: {
        sign_in_provider: "password",
      },
      uid: "admin-1",
    });

    const formData = new FormData();
    formData.append(
      "prompt",
      "Create a premium event poster with clear hierarchy, warm neutral tones, elegant typography, strong contrast, and enough detail for a polished print-ready concept that can be used for customer-facing promotional material.",
    );
    formData.append("style", "kreatywny");
    formData.append("productId", "product-1");
    formData.append("channelId", "channel-2");

    const response = await POST(
      new NextRequest("http://localhost/api/image-generation", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          cookie: "__konfi_admin_product_preview=session-token",
        },
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockStart).toHaveBeenCalledWith(mockGenerateStoreImageWorkflow, [
      expect.objectContaining({
        request: expect.objectContaining({
          allowAdminPreview: true,
          channelId: "channel-2",
        }),
      }),
    ]);
  });

  it("returns a completed workflow result for the owning user", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/image-generation?runId=run-1", {
        method: "GET",
        headers: {
          authorization: "Bearer valid-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "completed",
      result: {
        remainingAttempts: 1,
      },
    });
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it("rejects status access when the job belongs to another user", async () => {
    mockGetStoreImageGenerationJobByRunId.mockResolvedValue({
      id: "job-1",
      data: {
        jobId: "job-1",
        runId: "run-1",
        userId: "user-2",
        status: "running",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/image-generation?runId=run-1", {
        method: "GET",
        headers: {
          authorization: "Bearer valid-token",
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Forbidden",
    });
  });

  it("returns workflow failures from status polling", async () => {
    const failure = Promise.reject(new Error("RATE_LIMIT_EXCEEDED"));
    failure.catch(() => undefined);
    mockGetRun.mockReturnValue({
      status: Promise.resolve("failed"),
      returnValue: failure,
    });
    mockGetStoreImageGenerationJobByRunId.mockResolvedValue({
      id: "job-1",
      data: {
        jobId: "job-1",
        runId: "run-1",
        userId: "user-1",
        status: "failed",
        error: "RATE_LIMIT_EXCEEDED",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/image-generation?runId=run-1", {
        method: "GET",
        headers: {
          authorization: "Bearer valid-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "failed",
      error: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("returns an expired error when the generated files are past retention", async () => {
    mockGetStoreImageGenerationJobByRunId.mockResolvedValue({
      id: "job-1",
      data: {
        jobId: "job-1",
        runId: "run-1",
        userId: "user-1",
        status: "completed",
        expiresAt: {
          toMillis: () => Date.now() - 1,
        },
        result: {
          context: {
            isLargeFormat: false,
            printSideCount: 1,
          },
          expiresAt: "2026-04-10T12:00:00.000Z",
          expiresAtMs: Date.parse("2026-04-10T12:00:00.000Z"),
          images: [
            {
              id: "single",
              imageDataUrl: "https://example.com/generated.png",
              side: "single",
            },
          ],
          remainingAttempts: 1,
        },
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/image-generation?runId=run-1", {
        method: "GET",
        headers: {
          authorization: "Bearer valid-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "failed",
      error: "IMAGE_GENERATION_EXPIRED",
    });
    expect(mockGetRun).not.toHaveBeenCalled();
  });
});
