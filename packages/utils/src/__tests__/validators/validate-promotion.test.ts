import { Campaign, Promotion } from "@konfi/types";
import { validatePromotion } from "../../validators/validate-promotion";

describe("validatePromotion", () => {
  // Mock console.error during tests
  const originalConsoleError = console.error;

  afterEach(() => {
    console.error = originalConsoleError;
    vi.resetAllMocks();
  });

  // Helper function to create a valid promotion for testing
  const createValidPromotion = (): Promotion =>
    ({
      id: "promo123",
      name: "Test Promotion",
      active: true,
      campaignId: "campaign123",
      applicationMethod: {
        type: "PERCENTAGE",
        targetType: "ORDER",
        allocation: "ACROSS_PRODUCTS",
        value: 10,
        currencyCode: "USD",
        maxQuantity: 10,
      },
      rules: [
        {
          attribute: "minPrice",
          operator: ">",
          values: [1000],
        },
      ],
    }) as unknown as Promotion;

  // Helper function to create a valid campaign for testing
  const createValidCampaign = (): Campaign =>
    ({
      id: "campaign123",
      name: "Test Campaign",
      startsAt: new Date(Date.now() - 86400000).toISOString(), // Started 1 day ago
      endsAt: new Date(Date.now() + 86400000).toISOString(), // Ends in 1 day
      budget: {
        limit: 10000,
        used: 5000,
      },
    }) as Campaign;

  it("should validate a properly configured promotion without campaign", () => {
    const validPromotion = createValidPromotion();

    expect(validatePromotion(validPromotion)).toBe(true);
  });

  it("should validate a properly configured promotion with matching campaign", () => {
    const validPromotion = createValidPromotion();
    const validCampaign = createValidCampaign();

    expect(validatePromotion(validPromotion, validCampaign)).toBe(true);
  });

  it("should fail validation when promotion is not active", () => {
    const inactivePromotion = {
      ...createValidPromotion(),
      active: false,
    };

    expect(validatePromotion(inactivePromotion)).toBe(false);
  });

  it("should fail validation when applicationMethod is missing", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      applicationMethod: undefined,
    };

    expect(validatePromotion(invalidPromotion as Promotion)).toBe(false);
  });

  it("should fail validation when applicationMethod.type is missing", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      applicationMethod: {
        ...createValidPromotion().applicationMethod,
        type: undefined,
      },
    };

    expect(validatePromotion(invalidPromotion as Promotion)).toBe(false);
  });

  it("should fail validation when applicationMethod.targetType is missing", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      applicationMethod: {
        ...createValidPromotion().applicationMethod,
        targetType: undefined,
      },
    };

    expect(validatePromotion(invalidPromotion as Promotion)).toBe(false);
  });

  it("should fail validation when applicationMethod.allocation is missing", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      applicationMethod: {
        ...createValidPromotion().applicationMethod,
        allocation: undefined,
      },
    };

    expect(validatePromotion(invalidPromotion as Promotion)).toBe(false);
  });

  it("should fail validation when applicationMethod.value is missing", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      applicationMethod: {
        ...createValidPromotion().applicationMethod,
        value: undefined,
      },
    };

    expect(validatePromotion(invalidPromotion as Promotion)).toBe(false);
  });

  it("should fail validation when applicationMethod.currencyCode is missing", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      applicationMethod: {
        ...createValidPromotion().applicationMethod,
        currencyCode: undefined,
      },
    };

    expect(validatePromotion(invalidPromotion as Promotion)).toBe(false);
  });

  it("should fail validation when applicationMethod.maxQuantity is null", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      applicationMethod: {
        ...createValidPromotion().applicationMethod,
        maxQuantity: null,
      },
    };

    expect(validatePromotion(invalidPromotion as Promotion)).toBe(false);
  });

  it("should fail validation when campaign ID does not match promotion campaignId", () => {
    const validPromotion = createValidPromotion();
    const mismatchedCampaign = {
      ...createValidCampaign(),
      id: "different-campaign",
    };

    expect(validatePromotion(validPromotion, mismatchedCampaign)).toBe(false);
  });

  it("should fail validation when campaign has not started yet", () => {
    const validPromotion = createValidPromotion();
    const notStartedCampaign = {
      ...createValidCampaign(),
      startsAt: new Date(Date.now() + 86400000).toISOString(), // Starts in 1 day
    };

    expect(validatePromotion(validPromotion, notStartedCampaign)).toBe(false);
  });

  it("should fail validation when campaign has already ended", () => {
    const validPromotion = createValidPromotion();
    const endedCampaign = {
      ...createValidCampaign(),
      startsAt: new Date(Date.now() - 172800000).toISOString(), // Started 2 days ago
      endsAt: new Date(Date.now() - 86400000).toISOString(), // Ended 1 day ago
    };

    expect(validatePromotion(validPromotion, endedCampaign)).toBe(false);
  });

  it("should fail validation when campaign budget has been exceeded", () => {
    const validPromotion = createValidPromotion();
    const exceededBudgetCampaign = {
      ...createValidCampaign(),
      budget: {
        limit: 5000,
        used: 5000,
      },
    };

    expect(validatePromotion(validPromotion, exceededBudgetCampaign)).toBe(
      false,
    );
  });

  it("should fail validation when a promotion rule attribute is missing", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      rules: [
        {
          attribute: undefined,
          operator: ">",
          values: [1000],
        },
      ],
    };

    expect(validatePromotion(invalidPromotion as unknown as Promotion)).toBe(
      false,
    );
  });

  it("should fail validation when a promotion rule operator is empty", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      rules: [
        {
          attribute: "minPrice",
          operator: "",
          values: [1000],
        },
      ],
    };

    expect(validatePromotion(invalidPromotion as unknown as Promotion)).toBe(
      false,
    );
  });

  it("should fail validation when a promotion rule values are empty", () => {
    const invalidPromotion = {
      ...createValidPromotion(),
      rules: [
        {
          attribute: "minPrice",
          operator: ">",
          values: [],
        },
      ],
    };

    expect(validatePromotion(invalidPromotion as unknown as Promotion)).toBe(
      false,
    );
  });
});
