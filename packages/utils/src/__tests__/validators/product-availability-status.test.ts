import { Product } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { classifyProductAvailability } from "../../validators/product-availability-status";

const createTimestamp = (date: Date) => Timestamp.fromDate(date);

const NOW = new Date("2024-06-15T12:00:00.000Z");

const baseProduct = {
  active: true,
  availability: {
    availableForPurchase: true,
    published: true,
    publication: createTimestamp(new Date("2024-01-01")),
    expiration: null,
  },
} as Product;

describe("classifyProductAvailability", () => {
  it("no-expiry product: isExpired and isExpiringSoon are false, daysUntilExpiration is null", () => {
    const result = classifyProductAvailability(baseProduct, { now: NOW });

    expect(result.isExpired).toBe(false);
    expect(result.isExpiringSoon).toBe(false);
    expect(result.daysUntilExpiration).toBeNull();
  });

  it("product expiring in 10 days: isExpiringSoon is true", () => {
    const expiresIn10Days = new Date(NOW.getTime() + 10 * 86400000);
    const product = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        expiration: createTimestamp(expiresIn10Days),
      },
    } as Product;

    const result = classifyProductAvailability(product, { now: NOW });

    expect(result.isExpiringSoon).toBe(true);
    expect(result.isExpired).toBe(false);
    expect(result.daysUntilExpiration).toBe(10);
  });

  it("expired yesterday with published+availableForPurchase+past publication: isExpired true and hiddenByExpiration true", () => {
    const yesterday = new Date(NOW.getTime() - 86400000);
    const product = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        expiration: createTimestamp(yesterday),
      },
    } as Product;

    const result = classifyProductAvailability(product, { now: NOW });

    expect(result.isExpired).toBe(true);
    expect(result.hiddenByExpiration).toBe(true);
  });

  it("unpublished product: isUnpublished is true", () => {
    const product = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        published: false,
      },
    } as Product;

    const result = classifyProductAvailability(product, { now: NOW });

    expect(result.isUnpublished).toBe(true);
  });

  it("future publication: isScheduled is true", () => {
    const futureDate = new Date(NOW.getTime() + 30 * 86400000);
    const product = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        publication: createTimestamp(futureDate),
      },
    } as Product;

    const result = classifyProductAvailability(product, { now: NOW });

    expect(result.isScheduled).toBe(true);
  });
});
