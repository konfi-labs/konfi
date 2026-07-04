import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockDocumentData,
  mockDocumentExists,
  mockGetTenantContextForRequest,
  mockRender,
  mockResendConstructor,
  mockResendSend,
} = vi.hoisted(() => ({
  mockDocumentData: {
    current: undefined as Record<string, unknown> | undefined,
  },
  mockDocumentExists: { current: false },
  mockGetTenantContextForRequest: vi.fn(),
  mockRender: vi.fn(),
  mockResendConstructor: vi.fn(),
  mockResendSend: vi.fn(),
}));

vi.mock("@konfi/emails", () => ({
  render: mockRender,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: () =>
          Promise.resolve({
            data: () => mockDocumentData.current,
            exists: mockDocumentExists.current,
          }),
      }),
    }),
  }),
  getTenantContextForRequest: mockGetTenantContextForRequest,
}));

vi.mock("@/lib/integration-secret-crypto", () => ({
  decryptIntegrationSecret: ({
    encrypted,
  }: {
    encrypted: { plaintext?: string };
  }) => encrypted.plaintext ?? "",
  isEncryptedIntegrationSecret: (value: unknown) =>
    typeof value === "object" && value !== null && "plaintext" in value,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: mockResendSend,
    };

    constructor(apiKey: string) {
      mockResendConstructor(apiKey);
    }
  },
}));

import { sendEmail } from "./email";

const dedicatedContext = {
  deploymentMode: "dedicated",
  requireTenantId: false,
  tenantId: "default",
} as const;

const saasContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
} as const;

describe("store sendEmail", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SHORT_COMPANY_NAME", "Example Print");
    vi.stubEnv("NO_REPLY_EMAIL", "noreply@example.com");
    vi.stubEnv("RESEND_API_KEY", "resend_test_key");
    mockDocumentData.current = undefined;
    mockDocumentExists.current = false;
    mockGetTenantContextForRequest.mockReset();
    mockGetTenantContextForRequest.mockResolvedValue(dedicatedContext);
    mockRender.mockReset();
    mockResendConstructor.mockReset();
    mockResendSend.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends rendered JSX email HTML with env-backed credentials in dedicated mode", async () => {
    mockRender.mockResolvedValue("<p>Hello</p>");
    mockResendSend.mockResolvedValue({ error: null });

    await sendEmail({
      to: "customer@example.com",
      from: "ignored@example.com",
      subject: "Nowe zamówienie",
      template: React.createElement("div", null, "Hello"),
    });

    expect(mockResendConstructor).toHaveBeenCalledWith("resend_test_key");
    expect(mockRender).toHaveBeenCalled();
    expect(mockResendSend).toHaveBeenCalledWith({
      to: ["customer@example.com"],
      from: "Example Print <noreply@example.com>",
      subject: "Nowe zamówienie",
      html: "<p>Hello</p>",
    });
  });

  it("uses tenant-owned Resend credentials in SaaS mode", async () => {
    mockDocumentExists.current = true;
    mockDocumentData.current = {
      integrationKey: "resend",
      metadata: {
        resend: {
          encryptedApiKey: { plaintext: "tenant-resend-key" },
          fromEmail: "noreply@tenant.example",
          fromName: "Tenant Mail",
        },
      },
      status: "connected",
      tenantId: "tenant-a",
    };
    mockRender.mockResolvedValue("<p>Hello</p>");
    mockResendSend.mockResolvedValue({ error: null });

    await sendEmail({
      to: "customer@example.com",
      subject: "Nowe zamówienie",
      tenantContext: saasContext,
      template: React.createElement("div", null, "Hello"),
    });

    expect(mockResendConstructor).toHaveBeenCalledWith("tenant-resend-key");
    expect(mockResendSend).toHaveBeenCalledWith({
      to: ["customer@example.com"],
      from: "Tenant Mail <noreply@tenant.example>",
      subject: "Nowe zamówienie",
      html: "<p>Hello</p>",
    });
  });

  it("rejects SaaS sends when tenant Resend is missing", async () => {
    mockRender.mockResolvedValue("<p>Hello</p>");
    mockResendSend.mockResolvedValue({ error: null });

    await expect(
      sendEmail({
        to: "customer@example.com",
        subject: "Nowe zamówienie",
        tenantContext: saasContext,
        template: React.createElement("div", null, "Hello"),
      }),
    ).rejects.toThrow("Resend is not configured for this tenant.");

    expect(mockResendConstructor).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("ignores process-wide credentials in SaaS mode", async () => {
    vi.stubEnv("RESEND_API_KEY", "platform-resend-key");
    mockDocumentExists.current = true;
    mockDocumentData.current = {
      integrationKey: "resend",
      metadata: {
        resend: {
          encryptedApiKey: { plaintext: "tenant-resend-key" },
          fromEmail: "noreply@tenant.example",
        },
      },
      status: "connected",
      tenantId: "tenant-a",
    };
    mockRender.mockResolvedValue("<p>Hello</p>");
    mockResendSend.mockResolvedValue({ error: null });

    await sendEmail({
      to: "customer@example.com",
      subject: "Nowe zamówienie",
      tenantContext: saasContext,
      template: React.createElement("div", null, "Hello"),
    });

    expect(mockResendConstructor).toHaveBeenCalledWith("tenant-resend-key");
    expect(mockResendConstructor).not.toHaveBeenCalledWith(
      "platform-resend-key",
    );
  });

  it("falls back to a Resend template when the JSX send fails", async () => {
    mockRender.mockResolvedValue("<p>Hello</p>");
    mockResendSend
      .mockResolvedValueOnce({
        error: {
          message: "Primary send failed",
        },
      })
      .mockResolvedValueOnce({ error: null });

    await sendEmail({
      to: "customer@example.com",
      subject: "Nowe zamówienie",
      template: React.createElement("div", null, "Hello"),
      fallbackTemplate: {
        id: "tpl_customer",
        variables: {
          orderNumber: "123",
        },
      },
    });

    expect(mockResendSend).toHaveBeenNthCalledWith(2, {
      to: ["customer@example.com"],
      from: "Example Print <noreply@example.com>",
      subject: "Nowe zamówienie",
      template: {
        id: "tpl_customer",
        variables: {
          orderNumber: "123",
        },
      },
    });
  });

  it("passes an idempotency key to Resend when provided", async () => {
    mockRender.mockResolvedValue("<p>Hello</p>");
    mockResendSend.mockResolvedValue({ error: null });

    await sendEmail({
      to: "customer@example.com",
      subject: "Nowe zapytanie B2B",
      template: React.createElement("div", null, "Hello"),
      idempotencyKey: "b2b-inquiry-created-inquiry-1",
    });

    expect(mockResendSend).toHaveBeenCalledWith(
      {
        to: ["customer@example.com"],
        from: "Example Print <noreply@example.com>",
        subject: "Nowe zapytanie B2B",
        html: "<p>Hello</p>",
      },
      {
        idempotencyKey: "b2b-inquiry-created-inquiry-1",
      },
    );
  });
});
