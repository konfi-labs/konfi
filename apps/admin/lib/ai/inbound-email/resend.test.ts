vi.mock("server-only", () => ({}));

import { describe, expect, it, vi } from "vitest";
import { verifyResendInboundWebhookPayload } from "./resend";
import type { ResendInboundWebhookEvent } from "./types";

const event: ResendInboundWebhookEvent = {
  created_at: "2026-05-05T12:00:00.000Z",
  data: {
    attachments: [],
    bcc: [],
    cc: [],
    created_at: "2026-05-05T12:00:00.000Z",
    email_id: "email-1",
    from: "Buyer <buyer@example.com>",
    message_id: "<message-1>",
    subject: "Quote request",
    to: ["admin@example.local"],
  },
  type: "email.received",
};

describe("verifyResendInboundWebhookPayload", () => {
  it("verifies raw Resend webhook payloads with svix header values", () => {
    const verifier = vi.fn(() => event);

    expect(
      verifyResendInboundWebhookPayload({
        headers: {
          id: "msg_123",
          signature: "v1,signature",
          timestamp: "1777982400",
        },
        payload: JSON.stringify(event),
        verifier,
        webhookSecret: "whsec_test",
      }),
    ).toEqual(event);
    expect(verifier).toHaveBeenCalledWith({
      headers: {
        id: "msg_123",
        signature: "v1,signature",
        timestamp: "1777982400",
      },
      payload: JSON.stringify(event),
      webhookSecret: "whsec_test",
    });
  });

  it("rejects missing webhook secrets before parsing the payload", () => {
    expect(() =>
      verifyResendInboundWebhookPayload({
        headers: {
          id: "msg_123",
          signature: "v1,signature",
          timestamp: "1777982400",
        },
        payload: JSON.stringify(event),
        verifier: vi.fn(() => event),
        webhookSecret: "",
      }),
    ).toThrow("RESEND_WEBHOOK_SECRET is not defined");
  });
});
