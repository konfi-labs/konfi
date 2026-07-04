import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mockGetResendRuntimeClient: vi.fn(),
  mockRender: vi.fn(),
  mockResolveResendSenderAddress: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@/lib/resend/client", () => ({
  getResendRuntimeClient: mocks.mockGetResendRuntimeClient,
  resolveResendSenderAddress: mocks.mockResolveResendSenderAddress,
}));

vi.mock("@konfi/emails", () => ({
  render: mocks.mockRender,
}));

import { sendEmail } from "./email";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRender.mockResolvedValue("<p>Report</p>");
    mocks.mockResolveResendSenderAddress.mockReturnValue(
      "Konfi <noreply@example.test>",
    );
    mocks.mockSend.mockResolvedValue({ error: null });
    mocks.mockGetResendRuntimeClient.mockResolvedValue({
      config: { apiKey: "re_test", fromEmail: "noreply@example.test" },
      resend: {
        emails: {
          send: mocks.mockSend,
        },
      },
    });
  });

  it("decodes base64 attachments and maps their content type for Resend", async () => {
    await sendEmail({
      attachments: [
        {
          content: Buffer.from("pdf-content").toString("base64"),
          filename: "report.pdf",
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
      from: "noreply@example.test",
      subject: "Report",
      template: createElement("div"),
      to: "reports@example.test",
    });

    const payload = mocks.mockSend.mock.calls[0]?.[0] as
      | {
          attachments?: Array<{
            content?: unknown;
            contentType?: string;
            filename?: string;
          }>;
        }
      | undefined;

    expect(payload?.attachments).toHaveLength(1);
    expect(payload?.attachments?.[0]).toMatchObject({
      contentType: "application/pdf",
      filename: "report.pdf",
    });
    expect(Buffer.isBuffer(payload?.attachments?.[0]?.content)).toBe(true);
    expect((payload?.attachments?.[0]?.content as Buffer).toString()).toBe(
      "pdf-content",
    );
  });
});
