import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  buildAvailabilityPayload,
  isPublicationBeforeExpirationValid,
} from "./product-availability-form";

describe("isPublicationBeforeExpirationValid", () => {
  it("returns true when expirationString is empty", () => {
    expect(
      isPublicationBeforeExpirationValid({
        publicationString: "2025-01-01",
        expirationString: "",
      }),
    ).toBe(true);
  });

  it("returns true when expirationString is absent", () => {
    expect(
      isPublicationBeforeExpirationValid({
        publicationString: "2025-01-01",
      }),
    ).toBe(true);
  });

  it("returns true when publication is before expiration", () => {
    expect(
      isPublicationBeforeExpirationValid({
        publicationString: "2025-01-01",
        expirationString: "2025-12-31",
      }),
    ).toBe(true);
  });

  it("returns true when publication equals expiration", () => {
    expect(
      isPublicationBeforeExpirationValid({
        publicationString: "2025-06-15",
        expirationString: "2025-06-15",
      }),
    ).toBe(true);
  });

  it("returns false when publication is after expiration", () => {
    expect(
      isPublicationBeforeExpirationValid({
        publicationString: "2025-12-31",
        expirationString: "2025-01-01",
      }),
    ).toBe(false);
  });

  it("returns true when publicationString is blank and expirationString is set", () => {
    expect(
      isPublicationBeforeExpirationValid({
        publicationString: "",
        expirationString: "2025-12-31",
      }),
    ).toBe(true);
  });

  it("returns true when either date is invalid", () => {
    expect(
      isPublicationBeforeExpirationValid({
        publicationString: "not-a-date",
        expirationString: "2025-12-31",
      }),
    ).toBe(true);
  });
});

describe("buildAvailabilityPayload", () => {
  it("returns expiration null when expirationString is blank", () => {
    const result = buildAvailabilityPayload({
      published: true,
      publicationString: "2025-01-01",
      availableForPurchase: true,
      expirationString: "",
    });
    expect(result.expiration).toBeNull();
  });

  it("returns expiration null when expirationString is absent", () => {
    const result = buildAvailabilityPayload({
      published: true,
      publicationString: "2025-01-01",
      availableForPurchase: false,
    });
    expect(result.expiration).toBeNull();
  });

  it("returns expiration as a Timestamp instance when expirationString is set", () => {
    const result = buildAvailabilityPayload({
      published: true,
      publicationString: "2025-01-01",
      availableForPurchase: true,
      expirationString: "2025-12-31",
    });
    expect(result.expiration).toBeInstanceOf(Timestamp);
  });

  it("returns publication as a Timestamp instance when publicationString is set", () => {
    const result = buildAvailabilityPayload({
      published: true,
      publicationString: "2025-01-01",
      availableForPurchase: true,
      expirationString: "2025-12-31",
    });
    expect(result.publication).toBeInstanceOf(Timestamp);
  });

  it("returns publication null when publicationString is blank", () => {
    const result = buildAvailabilityPayload({
      published: false,
      publicationString: "",
      availableForPurchase: false,
      expirationString: "2025-12-31",
    });
    expect(result.publication).toBeNull();
    expect(result.expiration).toBeInstanceOf(Timestamp);
  });

  it("passthrough fields are preserved", () => {
    const result = buildAvailabilityPayload({
      published: true,
      publicationString: "2025-03-01",
      availableForPurchase: false,
      expirationString: "2025-09-01",
    });
    expect(result.published).toBe(true);
    expect(result.publicationString).toBe("2025-03-01");
    expect(result.availableForPurchase).toBe(false);
    expect(result.expirationString).toBe("2025-09-01");
  });

  it("normalizes expiration to 02:00 UTC for a date-only string", () => {
    const payload = buildAvailabilityPayload({
      published: true,
      availableForPurchase: true,
      expirationString: "2026-12-31",
    });
    const d = payload.expiration!.toDate();
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(11); // December (0-indexed)
    expect(d.getUTCDate()).toBe(31);
    expect(d.getUTCHours()).toBe(2);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.toISOString()).toBe("2026-12-31T02:00:00.000Z");
  });

  it("normalizes publication to 02:00 UTC for a date-only string", () => {
    const payload = buildAvailabilityPayload({
      published: true,
      publicationString: "2026-06-15",
      availableForPurchase: true,
    });
    const d = payload.publication!.toDate();
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(2);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.toISOString()).toBe("2026-06-15T02:00:00.000Z");
  });

  it("returns expiration null when expirationString is omitted (UTC path)", () => {
    const payload = buildAvailabilityPayload({
      published: true,
      publicationString: "2026-01-01",
      availableForPurchase: true,
    });
    expect(payload.expiration).toBeNull();
  });
});
