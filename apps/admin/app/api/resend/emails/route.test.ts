import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockEmailsGet: vi.fn(),
  mockEmailsList: vi.fn(),
  mockGetResendRuntimeClient: vi.fn(),
  mockRequireAdminAuth: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    connection: vi.fn(),
  };
});

vi.mock("@/actions/auth-utils", () => ({
  requireAdminAuth: mocks.mockRequireAdminAuth,
}));

vi.mock("@/lib/resend/client", () => ({
  getResendRuntimeClient: mocks.mockGetResendRuntimeClient,
}));

let GET: (typeof import("./route"))["GET"];

function createRequest(search: string = "") {
  return new NextRequest(`http://localhost/api/resend/emails${search}`, {
    method: "GET",
  });
}

function createEmail(id: string, from: string) {
  return {
    bcc: null,
    cc: null,
    created_at: "2026-06-03T10:00:00.000Z",
    from,
    id,
    last_event: "delivered",
    reply_to: null,
    scheduled_at: null,
    subject: `Email ${id}`,
    to: ["customer@example.com"],
  };
}

describe("/api/resend/emails GET", () => {
  beforeAll(async () => {
    ({ GET } = await import("./route"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetResendRuntimeClient.mockResolvedValue({
      config: {
        apiKey: "resend-key",
        fromEmail: "no-reply@tenant-a.com",
      },
      resend: {
        emails: {
          get: mocks.mockEmailsGet,
          list: mocks.mockEmailsList,
        },
      },
    });
  });

  it("returns only sent emails from the configured sender domain", async () => {
    mocks.mockEmailsList.mockResolvedValue({
      data: {
        data: [
          createEmail("email-a", "Konfi <no-reply@tenant-a.com>"),
          createEmail("email-b", "Konfi <no-reply@tenant-b.com>"),
          createEmail("email-c", "alerts@tenant-a.com"),
        ],
        has_more: false,
      },
    });

    const response = await GET(createRequest("?limit=20"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      emails: [
        { from: "Konfi <no-reply@tenant-a.com>", id: "email-a" },
        { from: "alerts@tenant-a.com", id: "email-c" },
      ],
      has_more: false,
    });
    expect(mocks.mockEmailsList).toHaveBeenCalledWith({ limit: 100 });
  });

  it("continues through Resend pages until it fills the filtered page", async () => {
    mocks.mockEmailsList
      .mockResolvedValueOnce({
        data: {
          data: [
            createEmail("foreign-1", "no-reply@tenant-b.com"),
            createEmail("foreign-2", "no-reply@tenant-b.com"),
          ],
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            createEmail("tenant-1", "no-reply@tenant-a.com"),
            createEmail("tenant-2", "support@tenant-a.com"),
            createEmail("tenant-3", "billing@tenant-a.com"),
          ],
          has_more: false,
        },
      });

    const response = await GET(createRequest("?limit=2"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      emails: [{ id: "tenant-1" }, { id: "tenant-2" }],
      has_more: true,
    });
    expect(mocks.mockEmailsList).toHaveBeenNthCalledWith(1, { limit: 100 });
    expect(mocks.mockEmailsList).toHaveBeenNthCalledWith(2, {
      after: "foreign-2",
      limit: 100,
    });
  });

  it("blocks direct detail access for emails from another sender domain", async () => {
    mocks.mockEmailsGet.mockResolvedValue({
      data: createEmail("email-b", "no-reply@tenant-b.com"),
      error: null,
    });

    const response = await GET(createRequest("?id=email-b"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Email not found",
    });
  });

  it("returns detail access for emails from the configured sender domain", async () => {
    mocks.mockEmailsGet.mockResolvedValue({
      data: createEmail("email-a", "Konfi <no-reply@tenant-a.com>"),
      error: null,
    });

    const response = await GET(createRequest("?id=email-a"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      email: { id: "email-a" },
    });
  });
});
