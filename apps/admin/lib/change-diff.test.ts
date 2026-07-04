import { describe, expect, it } from "vitest";
import { detectChanges } from "./change-diff";
import type { ChangeSnapshot } from "./change-snapshot";

describe("detectChanges", () => {
  it("detects no changes when snapshots are identical", () => {
    const snapshot = { name: "John", age: 30 };

    expect(detectChanges(snapshot, snapshot)).toHaveLength(0);
  });

  it("detects simple field changes", () => {
    const before = { name: "John", age: 30 };
    const after = { name: "John", age: 31 };

    expect(detectChanges(before, after)).toEqual([
      {
        type: "CHANGE",
        path: ["age"],
        oldValue: 30,
        value: 31,
      },
    ]);
  });

  it("detects nested field changes", () => {
    const before = { user: { name: "John", age: 30 } };
    const after = { user: { name: "Jane", age: 30 } };

    expect(detectChanges(before, after)).toEqual([
      {
        type: "CHANGE",
        path: ["user", "name"],
        oldValue: "John",
        value: "Jane",
      },
    ]);
  });

  it("detects array additions", () => {
    const before = { tags: ["a", "b"] };
    const after = { tags: ["a", "b", "c"] };

    expect(detectChanges(before, after)).toEqual([
      {
        type: "CREATE",
        path: ["tags", 2],
        value: "c",
      },
    ]);
  });

  it("detects create and remove changes in the same snapshot", () => {
    const before = { name: "John", age: 30, city: "NYC" };
    const after = { name: "Jane", age: 30, country: "USA" };
    const changes = detectChanges(before, after);

    expect(changes).toContainEqual({
      type: "CHANGE",
      path: ["name"],
      oldValue: "John",
      value: "Jane",
    });
    expect(changes).toContainEqual({
      type: "REMOVE",
      path: ["city"],
      oldValue: "NYC",
    });
    expect(changes).toContainEqual({
      type: "CREATE",
      path: ["country"],
      value: "USA",
    });
  });

  it("detects whole-snapshot creation and removal", () => {
    const snapshot: ChangeSnapshot = { id: "123", name: "Jane" };

    expect(detectChanges(null, snapshot)).toEqual([
      {
        type: "CREATE",
        path: [],
        value: snapshot,
      },
    ]);
    expect(detectChanges(snapshot, null)).toEqual([
      {
        type: "REMOVE",
        path: [],
        oldValue: snapshot,
      },
    ]);
  });
});
