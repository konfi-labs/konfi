import { describe, expect, it } from "vitest";
import { applyOrderItemStatusChange } from "../order-item-status";

describe("applyOrderItemStatusChange", () => {
  it("marks an item fulfilled and removes it from in progress", () => {
    const result = applyOrderItemStatusChange(
      {
        fulfilledItems: [],
        inProgressItems: ["item-1"],
        pickedUpItems: [],
        deliveredItems: [],
      },
      { itemId: "item-1", fulfilled: true },
    );

    expect(result.fulfilledItems).toEqual(["item-1"]);
    expect(result.inProgressItems).toEqual([]);
  });

  it("rejects handoff changes for items that are not fulfilled", () => {
    expect(() =>
      applyOrderItemStatusChange(
        {
          fulfilledItems: [],
          inProgressItems: ["item-1"],
          pickedUpItems: [],
          deliveredItems: [],
        },
        { itemId: "item-1", pickedUp: true },
      ),
    ).toThrow("Only fulfilled items can be marked as picked up or delivered.");
  });

  it("marks an item as picked up and clears delivered", () => {
    const result = applyOrderItemStatusChange(
      {
        fulfilledItems: ["item-1"],
        inProgressItems: [],
        pickedUpItems: [],
        deliveredItems: ["item-1"],
      },
      { itemId: "item-1", pickedUp: true },
    );

    expect(result.pickedUpItems).toEqual(["item-1"]);
    expect(result.deliveredItems).toEqual([]);
  });

  it("marks an item as delivered and clears picked up", () => {
    const result = applyOrderItemStatusChange(
      {
        fulfilledItems: ["item-1"],
        inProgressItems: [],
        pickedUpItems: ["item-1"],
        deliveredItems: [],
      },
      { itemId: "item-1", delivered: true },
    );

    expect(result.pickedUpItems).toEqual([]);
    expect(result.deliveredItems).toEqual(["item-1"]);
  });

  it("clears handoff states when item is moved back to in progress", () => {
    const result = applyOrderItemStatusChange(
      {
        fulfilledItems: ["item-1"],
        inProgressItems: [],
        pickedUpItems: ["item-1"],
        deliveredItems: [],
      },
      { itemId: "item-1", inProgress: true },
    );

    expect(result.fulfilledItems).toEqual([]);
    expect(result.inProgressItems).toEqual(["item-1"]);
    expect(result.pickedUpItems).toEqual([]);
    expect(result.deliveredItems).toEqual([]);
  });
});