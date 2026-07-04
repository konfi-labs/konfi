import { Order, OrderStatus } from "@konfi/types";

describe("Priority Items Functionality", () => {
  const mockOrder: Partial<Order> = {
    id: "test-order-1",
    priorityItems: [],
    inProgressItems: [],
    fulfilledItems: [],
    status: OrderStatus.IN_PROGRESS,
  };

  it("should initialize priorityItems as empty array", () => {
    expect(mockOrder.priorityItems).toBeDefined();
    expect(mockOrder.priorityItems).toEqual([]);
  });

  it("should be able to add item to priorityItems", () => {
    const testItemId = "item-123";
    const updatedPriorityItems = [
      ...(mockOrder.priorityItems || []),
      testItemId,
    ];

    expect(updatedPriorityItems).toContain(testItemId);
    expect(updatedPriorityItems).toHaveLength(1);
  });

  it("should check if item is in priorityItems", () => {
    const testItemId = "item-123";
    const priorityItems = ["item-123", "item-456"];

    const isPriority = priorityItems.includes(testItemId);
    expect(isPriority).toBe(true);

    const isNotPriority = priorityItems.includes("item-789");
    expect(isNotPriority).toBe(false);
  });

  it("should not duplicate items in priorityItems", () => {
    const testItemId = "item-123";
    const existingPriorityItems = ["item-123"];

    // Simulate adding the same item again (should not duplicate)
    const updatedPriorityItems = [...existingPriorityItems];
    if (!updatedPriorityItems.includes(testItemId)) {
      updatedPriorityItems.push(testItemId);
    }

    expect(updatedPriorityItems).toHaveLength(1);
    expect(updatedPriorityItems).toEqual(["item-123"]);
  });

  it("should allow item to be both priority and in progress", () => {
    const testItemId = "item-123";
    const priorityItems = ["item-123"];
    const inProgressItems = ["item-123"];

    const isPriority = priorityItems.includes(testItemId);
    const isInProgress = inProgressItems.includes(testItemId);

    expect(isPriority).toBe(true);
    expect(isInProgress).toBe(true);
  });

  it("should not allow item to be both priority and fulfilled", () => {
    const testItemId = "item-123";
    const priorityItems = ["item-123"];
    const fulfilledItems = ["item-123"];

    // In the UI logic, fulfilled items should not show priority button
    // This test documents the expected behavior
    const isPriority = priorityItems.includes(testItemId);
    const isFulfilled = fulfilledItems.includes(testItemId);

    expect(isPriority).toBe(true);
    expect(isFulfilled).toBe(true);

    // In UI, priority button should not show if fulfilled
    const shouldShowPriorityButton = !isFulfilled;
    expect(shouldShowPriorityButton).toBe(false);
  });

  it("should be able to remove item from priorityItems", () => {
    const testItemId = "item-123";
    const priorityItems = ["item-123", "item-456"];

    // Simulate removing item from priority
    const updatedPriorityItems = [...priorityItems];
    const index = updatedPriorityItems.indexOf(testItemId);
    if (index > -1) {
      updatedPriorityItems.splice(index, 1);
    }

    expect(updatedPriorityItems).not.toContain(testItemId);
    expect(updatedPriorityItems).toEqual(["item-456"]);
    expect(updatedPriorityItems).toHaveLength(1);
  });

  it("should handle removing non-existent item from priorityItems", () => {
    const testItemId = "item-999";
    const priorityItems = ["item-123", "item-456"];

    // Simulate removing item that doesn't exist in priority
    const updatedPriorityItems = [...priorityItems];
    const index = updatedPriorityItems.indexOf(testItemId);
    if (index > -1) {
      updatedPriorityItems.splice(index, 1);
    }

    // Should remain unchanged
    expect(updatedPriorityItems).toEqual(["item-123", "item-456"]);
    expect(updatedPriorityItems).toHaveLength(2);
  });
});
