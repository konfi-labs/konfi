import type { Product } from "@konfi/types";
import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  auditChannelAvailability,
  collectAtRiskEntries,
} from "./product-availability-audit";

const NOW = new Date("2024-06-15T12:00:00.000Z");

function fakeTimestamp(date: Date) {
  return { toDate: () => date } as unknown as import("firebase/firestore").Timestamp;
}

function makePastPublication() {
  return fakeTimestamp(new Date("2024-01-01T00:00:00.000Z"));
}

const baseAvailability: Product["availability"] = {
  published: true,
  availableForPurchase: true,
  publication: makePastPublication(),
  expiration: null,
};

function makeProduct(overrides: Partial<Product> & { id: string }): Product {
  return {
    active: true,
    availability: baseAvailability,
    name: overrides.id,
    ...overrides,
  } as Product;
}

describe("collectAtRiskEntries", () => {
  it("excludes a product with no expiration that is active and published", () => {
    const product = makeProduct({ id: "safe-product" });
    const result = collectAtRiskEntries(
      [{ product, sourceChannelId: "ch1" }],
      NOW,
    );
    expect(result).toHaveLength(0);
  });

  it("includes a product expiring in 10 days with isExpiringSoon true", () => {
    const expiresIn10Days = new Date(NOW.getTime() + 10 * 86400000);
    const product = makeProduct({
      id: "expires-10",
      availability: {
        ...baseAvailability,
        expiration: fakeTimestamp(expiresIn10Days),
      },
    });
    const result = collectAtRiskEntries(
      [{ product, sourceChannelId: "ch1" }],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].status.isExpiringSoon).toBe(true);
    expect(result[0].status.isExpired).toBe(false);
    expect(result[0].productId).toBe("expires-10");
  });

  it("includes a product expiring in 25 days with isExpiringSoon true", () => {
    const expiresIn25Days = new Date(NOW.getTime() + 25 * 86400000);
    const product = makeProduct({
      id: "expires-25",
      availability: {
        ...baseAvailability,
        expiration: fakeTimestamp(expiresIn25Days),
      },
    });
    const result = collectAtRiskEntries(
      [{ product, sourceChannelId: "ch1" }],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].status.isExpiringSoon).toBe(true);
  });

  it("includes a product expiring in 60 days with isExpiringSoon true", () => {
    const expiresIn60Days = new Date(NOW.getTime() + 60 * 86400000);
    const product = makeProduct({
      id: "expires-60",
      availability: {
        ...baseAvailability,
        expiration: fakeTimestamp(expiresIn60Days),
      },
    });
    const result = collectAtRiskEntries(
      [{ product, sourceChannelId: "ch1" }],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].status.isExpiringSoon).toBe(true);
  });

  it("includes an expired product with isExpired true", () => {
    const yesterday = new Date(NOW.getTime() - 86400000);
    const product = makeProduct({
      id: "expired",
      availability: {
        ...baseAvailability,
        expiration: fakeTimestamp(yesterday),
      },
    });
    const result = collectAtRiskEntries(
      [{ product, sourceChannelId: "ch1" }],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].status.isExpired).toBe(true);
  });

  it("deduplicates by sourceChannelId::productId, keeping the first entry", () => {
    const expiresIn10Days = new Date(NOW.getTime() + 10 * 86400000);
    const product = makeProduct({
      id: "dup-product",
      name: "Original",
      availability: {
        ...baseAvailability,
        expiration: fakeTimestamp(expiresIn10Days),
      },
    });
    const duplicate = makeProduct({
      id: "dup-product",
      name: "Duplicate",
      availability: {
        ...baseAvailability,
        expiration: fakeTimestamp(expiresIn10Days),
      },
    });
    const result = collectAtRiskEntries(
      [
        { product, sourceChannelId: "ch1" },
        { product: duplicate, sourceChannelId: "ch1" },
      ],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe("Original");
  });

  it("includes a linked product with a different sourceChannelId", () => {
    const expiresIn10Days = new Date(NOW.getTime() + 10 * 86400000);
    const product = makeProduct({
      id: "linked-product",
      availability: {
        ...baseAvailability,
        expiration: fakeTimestamp(expiresIn10Days),
      },
    });
    const result = collectAtRiskEntries(
      [{ product, sourceChannelId: "other-channel" }],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].sourceChannelId).toBe("other-channel");
  });
});

// ---------------------------------------------------------------------------
// auditChannelAvailability — tenant-filter gate tests
// ---------------------------------------------------------------------------

type WhereCall = [string, string, unknown];

function makeFirestoreMock() {
  const linkedGroupWhereCalls: WhereCall[] = [];

  // Builder for collectionGroup("products") — records every .where() call
  function makeGroupQueryBuilder(): ReturnType<Firestore["collectionGroup"]> {
    const builder = {
      where(field: string, op: string, value: unknown) {
        linkedGroupWhereCalls.push([field, op, value]);
        return builder;
      },
      get: async () => ({ docs: [] }),
    };
    return builder as unknown as ReturnType<Firestore["collectionGroup"]>;
  }

  const firestore = {
    collection(_path: string) {
      // channels/{channelId}/products direct query — returns empty snapshot
      return {
        doc() {
          return {
            collection() {
              return {
                where() {
                  return {
                    get: async () => ({ docs: [] }),
                  };
                },
              };
            },
          };
        },
      };
    },
    collectionGroup(name: string) {
      if (name === "products") {
        return makeGroupQueryBuilder();
      }
      return { where: () => ({ get: async () => ({ docs: [] }) }) };
    },
  } as unknown as Firestore;

  return { firestore, linkedGroupWhereCalls };
}

describe("auditChannelAvailability — tenant filter", () => {
  it("applies a tenantId filter to the group query when tenantId is provided", async () => {
    const { firestore, linkedGroupWhereCalls } = makeFirestoreMock();

    await auditChannelAvailability({
      firestore,
      channelId: "ch-1",
      tenantId: "tenant-abc",
    });

    const tenantFilter = linkedGroupWhereCalls.find(
      ([field, op]) => field === "tenantId" && op === "==",
    );
    expect(tenantFilter).toBeDefined();
    expect(tenantFilter?.[2]).toBe("tenant-abc");
  });

  it("does not apply a tenantId filter when tenantId is omitted (dedicated mode)", async () => {
    const { firestore, linkedGroupWhereCalls } = makeFirestoreMock();

    await auditChannelAvailability({
      firestore,
      channelId: "ch-1",
    });

    const tenantFilter = linkedGroupWhereCalls.find(
      ([field]) => field === "tenantId",
    );
    expect(tenantFilter).toBeUndefined();
  });
});
