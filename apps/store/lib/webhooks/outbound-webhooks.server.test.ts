import { describe, expect, it } from "vitest";
import { createCommerceWebhookSignature } from "./signature";

describe("outbound commerce webhooks", () => {
  it("creates deterministic HMAC signatures from timestamp and body", () => {
    const signature = createCommerceWebhookSignature(
      "secret",
      "2026-05-22T15:00:00.000Z",
      JSON.stringify({ eventType: "order.created", subjectId: "order-1" }),
    );

    expect(signature).toBe(
      "41ad1c68b760a96a4fb66741cc46d070caa53baa1751ee6c2ae2093e9dc3978b",
    );
    expect(createCommerceWebhookSignature("secret", "other", "{}")).not.toBe(
      signature,
    );
  });
});
