import { describe, expect, it } from "vitest";

import { moveMethod, renumberMethods } from "../draft-methods";

type SimpleMethod = { id: string; order?: number; name?: string };

describe("renumberMethods", () => {
  it("assigns order 0..n-1 to each element in sequence", () => {
    const input: SimpleMethod[] = [
      { id: "a", order: 99 },
      { id: "b", order: 5 },
      { id: "c", order: 0 },
    ];
    const result = renumberMethods(input);
    expect(result.map((m) => m.order)).toEqual([0, 1, 2]);
  });

  it("preserves all other fields unchanged", () => {
    const input: SimpleMethod[] = [
      { id: "x", order: 3, name: "foo" },
      { id: "y", order: 1, name: "bar" },
    ];
    const result = renumberMethods(input);
    expect(result[0]).toMatchObject({ id: "x", name: "foo", order: 0 });
    expect(result[1]).toMatchObject({ id: "y", name: "bar", order: 1 });
  });

  it("returns a new array (does not mutate input)", () => {
    const input: SimpleMethod[] = [{ id: "a", order: 0 }];
    const result = renumberMethods(input);
    expect(result).not.toBe(input);
  });

  it("handles an empty list", () => {
    expect(renumberMethods([])).toEqual([]);
  });
});

describe("moveMethod", () => {
  const methods: SimpleMethod[] = [
    { id: "a", order: 0 },
    { id: "b", order: 1 },
    { id: "c", order: 2 },
  ];

  it("moves an element up (direction -1) and renumbers", () => {
    const result = moveMethod(methods, "b", -1);
    expect(result.map((m) => m.id)).toEqual(["b", "a", "c"]);
    expect(result.map((m) => m.order)).toEqual([0, 1, 2]);
  });

  it("moves an element down (direction 1) and renumbers", () => {
    const result = moveMethod(methods, "b", 1);
    expect(result.map((m) => m.id)).toEqual(["a", "c", "b"]);
    expect(result.map((m) => m.order)).toEqual([0, 1, 2]);
  });

  it("is a no-op when moving first element up", () => {
    const result = moveMethod(methods, "a", -1);
    expect(result.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when moving last element down", () => {
    const result = moveMethod(methods, "c", 1);
    expect(result.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when the id is not found", () => {
    const result = moveMethod(methods, "z", 1);
    expect(result.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("handles a single-element list without error", () => {
    const single: SimpleMethod[] = [{ id: "only", order: 0 }];
    expect(moveMethod(single, "only", -1).map((m) => m.id)).toEqual(["only"]);
    expect(moveMethod(single, "only", 1).map((m) => m.id)).toEqual(["only"]);
  });

  it("handles an empty list without error", () => {
    expect(moveMethod([], "x", 1)).toEqual([]);
  });
});
