import { Order } from "@konfi/types";

describe("Order with mailLink", () => {
  it("should accept Order with mailLink field", () => {
    const mockOrder: Partial<Order> = {
      id: "test-id",
      number: 12345,
      customer: "test-customer",
      mailLink: "https://mail.example.com/message/123",
      specialNotes: "Test notes",
    };

    // The mailLink field should be accessible
    expect(mockOrder.mailLink).toBe("https://mail.example.com/message/123");

    // The order should be a valid partial order type
    expect(mockOrder).toBeDefined();
    expect(typeof mockOrder.mailLink).toBe("string");
  });

  it("should accept Order without mailLink field", () => {
    const mockOrder: Partial<Order> = {
      id: "test-id",
      number: 12345,
      customer: "test-customer",
      specialNotes: "Test notes",
      // mailLink is optional, so it can be undefined
    };

    // The mailLink field should be undefined when not provided
    expect(mockOrder.mailLink).toBeUndefined();

    // The order should still be valid
    expect(mockOrder).toBeDefined();
  });

  it("should accept empty string for mailLink", () => {
    const mockOrder: Partial<Order> = {
      id: "test-id",
      number: 12345,
      customer: "test-customer",
      mailLink: "", // Empty string should be valid
      specialNotes: "Test notes",
    };

    // The mailLink field should accept empty string
    expect(mockOrder.mailLink).toBe("");
    expect(typeof mockOrder.mailLink).toBe("string");
  });
});
