import { describe, expect, it, vi } from "vitest";
import {
  chunkCustomerGroupMemberIds,
  orderActiveCustomerGroupMembers,
} from "./customer-groups";

vi.mock("@/lib/firebase/clientApp", () => ({
  firestore: {},
}));

vi.mock("@konfi/firebase", () => ({
  db: {
    query: vi.fn(),
  },
  get: vi.fn(),
  tenant: {
    queryConstraints: vi.fn(),
    where: vi.fn(),
  },
}));

type TestCustomer = {
  id: string;
  name: string;
  active?: boolean;
};

describe("customer group helpers", () => {
  it("chunks member ids for Firestore in queries", () => {
    const ids = Array.from({ length: 23 }, (_, index) => `customer-${index}`);

    expect(chunkCustomerGroupMemberIds(ids)).toEqual([
      ids.slice(0, 10),
      ids.slice(10, 20),
      ids.slice(20, 23),
    ]);
  });

  it("preserves stored member order while filtering missing and inactive customers", () => {
    const members: TestCustomer[] = [
      { id: "customer-b", name: "B" },
      { id: "customer-a", name: "A" },
      { id: "customer-inactive", name: "Inactive", active: false },
      { id: "customer-c", name: "C", active: true },
    ];

    expect(
      orderActiveCustomerGroupMembers(
        [
          "customer-a",
          "customer-missing",
          "customer-b",
          "customer-inactive",
          "customer-c",
        ],
        members,
      ),
    ).toEqual([
      { id: "customer-a", name: "A" },
      { id: "customer-b", name: "B" },
      { id: "customer-c", name: "C", active: true },
    ]);
  });

  it("deduplicates repeated ids before chunking and ordering", () => {
    const members: TestCustomer[] = [
      { id: "customer-a", name: "A" },
      { id: "customer-b", name: "B" },
    ];

    expect(
      chunkCustomerGroupMemberIds(["customer-a", "customer-b", "customer-a"]),
    ).toEqual([["customer-a", "customer-b"]]);
    expect(
      orderActiveCustomerGroupMembers(
        ["customer-a", "customer-b", "customer-a"],
        members,
      ),
    ).toEqual([
      { id: "customer-a", name: "A" },
      { id: "customer-b", name: "B" },
    ]);
  });

  it("returns empty results for empty member input", () => {
    expect(chunkCustomerGroupMemberIds([])).toEqual([]);
    expect(orderActiveCustomerGroupMembers([], [])).toEqual([]);
  });
});
