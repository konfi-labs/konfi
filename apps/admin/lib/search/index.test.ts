import { beforeEach, describe, expect, it, vi } from "vitest";
import { showSearchResults } from "./index";

const { mockOnSnapshot, mockQuery, mockUnsubscribe, mockWhere } = vi.hoisted(
  () => ({
    mockOnSnapshot: vi.fn(),
    mockQuery: vi.fn(),
    mockUnsubscribe: vi.fn(),
    mockWhere: vi.fn(),
  }),
);

vi.mock("firebase/firestore", () => ({
  onSnapshot: mockOnSnapshot,
  where: mockWhere,
}));

vi.mock("@konfi/firebase", () => ({
  db: {
    query: mockQuery,
  },
}));

describe("showSearchResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockImplementation((field, operator, value) => ({
      field,
      operator,
      value,
    }));
    mockQuery.mockReturnValue({ query: true });
    mockOnSnapshot.mockImplementation((_query, next) => {
      next({
        docs: [
          {
            data: () => ({ id: "order-1", number: 123 }),
          },
        ],
      });
      return mockUnsubscribe;
    });
  });

  it("subscribes paginated meilisearch results to Firestore updates", async () => {
    const setResults = vi.fn();
    const setLoading = vi.fn();
    const setPageIndex = vi.fn();
    const unsubscribe = await showSearchResults({
      channelId: "channel-1",
      collectionPath: "/channels/channel-1/orders",
      entityType: "ORDERS",
      firestore: {} as never,
      isVectorSearch: false,
      meilisearchFn: vi.fn().mockResolvedValue({
        results: ["order-1"],
        totalHits: 1,
      }),
      pageIndex: 0,
      pageSize: 25,
      paginationAction: "FIRST",
      searchQuery: "123",
      setLoading,
      setPageIndex,
      setResults,
      totalCount: 1,
      vectorSearchFn: vi.fn(),
    });

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(setResults).toHaveBeenCalledWith([{ id: "order-1", number: 123 }]);
    expect(setLoading).toHaveBeenLastCalledWith(false);
    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
