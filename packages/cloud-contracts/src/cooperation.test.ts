import { describe, expect, it } from "vitest";
import {
  isProductionCooperationAppApiRequestEnvelope,
  isProductionCooperationDeliveryStatus,
  isProductionCooperationEmailNotificationStatus,
  isProductionCooperationRequestTransport,
  isProductionCooperationStatusCallbackEnvelope,
  productionCooperationAppApiPayloadVersion,
} from "./cooperation";

const payload = {
  item: {
    id: "item_123",
    name: "Window decal",
    productId: "product_123",
    quantity: 12,
  },
  order: {
    channelId: "channel_123",
    id: "order_123",
    number: "ORD-123",
  },
  sourceParticipantId: "source_123",
  targetParticipantId: "target_123",
};

describe("production cooperation contracts", () => {
  it("accepts direct app API transport and status values", () => {
    expect(isProductionCooperationRequestTransport("DEDICATED_APP_API")).toBe(
      true,
    );
    expect(isProductionCooperationDeliveryStatus("DELIVERED")).toBe(true);
    expect(
      isProductionCooperationEmailNotificationStatus("EMAIL_NOTIFICATION_SENT"),
    ).toBe(true);
  });

  it("validates direct app API request envelopes", () => {
    expect(
      isProductionCooperationAppApiRequestEnvelope({
        idempotencyKey: "idem_123",
        issuedAt: "2026-05-18T12:00:00.000Z",
        payload,
        payloadVersion: productionCooperationAppApiPayloadVersion,
        requestId: "request_123",
        sourceParticipantId: "source_123",
        targetParticipantId: "target_123",
        transport: "DEDICATED_APP_API",
      }),
    ).toBe(true);

    expect(
      isProductionCooperationAppApiRequestEnvelope({
        idempotencyKey: "idem_123",
        issuedAt: "2026-05-18T12:00:00.000Z",
        payload,
        payloadVersion: productionCooperationAppApiPayloadVersion,
        requestId: "request_123",
        sourceParticipantId: "source_123",
        targetParticipantId: "target_123",
        transport: "DEDICATED_EMAIL",
      }),
    ).toBe(false);
  });

  it("validates receiver status callback envelopes", () => {
    expect(
      isProductionCooperationStatusCallbackEnvelope({
        idempotencyKey: "request_123:ACCEPTED",
        occurredAt: "2026-05-18T12:05:00.000Z",
        requestId: "request_123",
        sourceParticipantId: "source_123",
        status: "ACCEPTED",
        targetParticipantId: "target_123",
      }),
    ).toBe(true);

    expect(
      isProductionCooperationStatusCallbackEnvelope({
        idempotencyKey: "request_123:PENDING",
        occurredAt: "2026-05-18T12:05:00.000Z",
        requestId: "request_123",
        sourceParticipantId: "source_123",
        status: "PENDING",
        targetParticipantId: "target_123",
      }),
    ).toBe(false);
  });
});
