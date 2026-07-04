import { Product } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { isPurchasable } from "../../validators/is-product-shoppable";

// Helper to create Firestore timestamp
const createTimestamp = (date: Date) => Timestamp.fromDate(date);

describe("isPurchasable ", () => {
  // Mock current date
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-15"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const baseProduct = {
    active: true,
    availability: {
      availableForPurchase: true,
      published: true,
      publication: createTimestamp(new Date("2024-01-01")),
      expiration: null,
    },
  } as Product;

  it("should return false if product is null or undefined", () => {
    expect(isPurchasable(null as unknown as Product)).toBe(false);
    expect(isPurchasable(undefined as unknown as Product)).toBe(false);
  });

  it("should return false if product is not active", () => {
    const inactiveProduct = {
      ...baseProduct,
      active: false,
    };
    expect(isPurchasable(inactiveProduct)).toBe(false);
  });

  it("should return false if product is not available for purchase", () => {
    const unavailableProduct = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        availableForPurchase: false,
      },
    };
    expect(isPurchasable(unavailableProduct)).toBe(false);
  });

  it("should return false if product is not published", () => {
    const unpublishedProduct = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        published: false,
      },
    };
    expect(isPurchasable(unpublishedProduct)).toBe(false);
  });

  it("should return false if publication date is undefined or null", () => {
    const noPublicationDateProduct = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        publication: undefined,
      },
    };
    expect(isPurchasable(noPublicationDateProduct)).toBe(false);

    const nullPublicationDateProduct = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        publication: null,
      },
    };
    expect(isPurchasable(nullPublicationDateProduct)).toBe(false);
  });

  it("should return false if publication date is in the future", () => {
    const futurePublicationProduct = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        publication: createTimestamp(new Date("2024-03-01")),
      },
    };
    expect(isPurchasable(futurePublicationProduct)).toBe(false);
  });

  it("should return false if expiration date is in the past", () => {
    const expiredProduct = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        expiration: createTimestamp(new Date("2024-01-01")),
      },
    };
    expect(isPurchasable(expiredProduct)).toBe(false);
  });

  it("should return true for a valid, active, published product with past publication date", () => {
    expect(isPurchasable(baseProduct)).toBe(true);
  });

  it("should return true for a product with future expiration date", () => {
    const futureExpirationProduct = {
      ...baseProduct,
      availability: {
        ...baseProduct.availability,
        expiration: createTimestamp(new Date("2024-12-31")),
      },
    };
    expect(isPurchasable(futureExpirationProduct)).toBe(true);
  });
});
