import { SearchSelectOption } from "@konfi/types";
import { promiseOptions } from "../../form/promise-options";

describe("promiseOptions", () => {
  it("should throw an error when searchFor is undefined", async () => {
    const searchFn = {
      products: vi.fn((searchKey: string) => Promise.resolve([])),
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await promiseOptions("test", undefined, searchFn);

    expect(consoleSpy).toHaveBeenCalledWith("Search for is not provided");
    expect(result).toEqual([]);

    consoleSpy.mockRestore();
  });

  it("should throw an error when searchFn is undefined", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await promiseOptions("test", "products", undefined);

    expect(consoleSpy).toHaveBeenCalledWith("Search functions is not provided");
    expect(result).toEqual([]);

    consoleSpy.mockRestore();
  });

  it("should return mapped results when search is successful", async () => {
    const mockResults = [
      { id: "1", name: "Product 1" },
      { id: "2", name: "Product 2" },
    ];
    const searchFn = {
      products: vi.fn((searchKey: string) => Promise.resolve(mockResults)),
    };

    const expected: SearchSelectOption<{ id: string }>[] = [
      { label: "Product 1", value: "1", object: mockResults[0] },
      { label: "Product 2", value: "2", object: mockResults[1] },
    ];

    const result = await promiseOptions("test", "products", searchFn);

    expect(searchFn.products).toHaveBeenCalledWith("test");
    expect(result).toEqual(expected);
  });
});
