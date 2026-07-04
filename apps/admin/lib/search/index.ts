import { isJSONValue } from "es-toolkit";
import type { OrdersSearchField } from "@konfi/meilisearch";
import type {
  Firestore,
  QueryConstraint,
  QueryDocumentSnapshot,
} from "firebase/firestore";

type SearchResult = {
  query: "string";
  number_of_results: number;
  results: {
    url: string;
    title: string;
    content: string;
    thumbnail: string;
    engine: string;
    template: string;
    parsed_url: string[];
    engines: string[];
    positions: number[];
    published_date: string;
    score: number;
    category: string;
  }[];
  answers: {
    url: string;
    template: string;
    engine: string;
    parsed_url: string[];
    answer: string;
  }[];
  corrections: {
    title: string;
    url: string;
  }[];
  infoboxes: {
    img_src: string;
    infobox: string;
    content: string;
    attributes: {
      label: string;
      value: string;
      image: {
        src: string;
        alt: string;
      }[];
    }[];
    urls: {
      url: string;
      title: string;
    }[];
    relatedTopics: {
      name: string;
      suggestions: {
        suggestion: string;
      }[];
    }[];
  }[];
  suggestions: string[];
  unresponsive_engines: string[];
};

export async function searchWeb(q: string): Promise<SearchResult | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SEARXNG_URL;
    const response = await fetch(
      `${url}/search?q=${encodeURIComponent(q)}&engines=${encodeURIComponent("!general")}&format=${encodeURIComponent("json")}`,
      {
        method: "POST",
      },
    );
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return null;
    }
    const data = (await response.json()) as SearchResult;
    if (isJSONValue(data)) {
      data.results = data.results.filter((result) => result.score > 2);
      return data;
    } else {
      console.error("Invalid JSON response:", data);
      return null;
    }
  } catch (error) {
    console.error("Error querying search:", error);
    return null;
  }
}

export type EntityType = "ORDERS" | "CUSTOMERS" | "PRODUCTS" | "APP";

export type SearchPaginationAction = "FIRST" | "NEXT" | "PREVIOUS" | "LAST";

type VectorSearchResult = { label: string; value: string }[] | string[];

type MeilisearchPaginatedResult = {
  results: string[];
  totalHits: number;
};

type MeilisearchSearchResult = MeilisearchPaginatedResult | string[];

export function getMeilisearchResultIds(
  searchResult: MeilisearchSearchResult | undefined,
): string[] {
  if (!searchResult) {
    return [];
  }

  if (Array.isArray(searchResult)) {
    return searchResult;
  }

  return searchResult.results;
}

export type ShowSearchResultsParams<T> = {
  // Search parameters
  entityType: EntityType;
  channelId: string;
  searchQuery: string;
  isVectorSearch: boolean;
  searchFields?: OrdersSearchField[];

  // Pagination parameters
  paginationAction: SearchPaginationAction;
  pageIndex: number;
  pageSize: number;
  totalCount: number;

  // Firebase references
  firestore: Firestore;
  collectionPath: string;

  // Search functions
  vectorSearchFn: (
    searchType: EntityType,
    channelId: string,
    query: string,
  ) => Promise<VectorSearchResult>;
  meilisearchFn: (
    type: EntityType,
    query: string,
    channelId: string,
    page?: number,
    hitsPerPage?: number,
    searchFields?: OrdersSearchField[],
  ) => Promise<MeilisearchSearchResult | undefined>;

  // Result handlers
  setResults: (results: T[] | null) => void;
  setLoading: (isLoading: boolean) => void;
  setPageIndex: (pageIndex: number) => void;
  onError?: (error: Error) => void;

  // Optional
  additionalConstraints?: QueryConstraint[];
  mapDocToEntity?: (doc: QueryDocumentSnapshot<T>) => T;
};

export async function showSearchResults<T>({
  // Search parameters
  entityType,
  channelId,
  searchQuery,
  isVectorSearch,
  searchFields,

  // Pagination parameters
  paginationAction,
  pageIndex,
  pageSize,
  totalCount,

  // Firebase references
  firestore,
  collectionPath,

  // Search functions
  vectorSearchFn,
  meilisearchFn,

  // Result handlers
  setResults,
  setLoading,
  setPageIndex,
  onError,

  // Optional
  additionalConstraints = [],
  mapDocToEntity = (doc) => doc.data() as T,
}: ShowSearchResultsParams<T>): Promise<() => void> {
  if (!searchQuery || !channelId) {
    return () => {};
  }

  // Calculate the new page index based on the pagination action
  let newPageIndex = pageIndex;
  switch (paginationAction) {
    case "NEXT":
      newPageIndex = pageIndex + 1;
      break;
    case "PREVIOUS":
      newPageIndex = Math.max(0, pageIndex - 1);
      break;
    case "FIRST":
      newPageIndex = 0;
      break;
    case "LAST":
      newPageIndex = Math.floor((totalCount - 1) / pageSize);
      break;
  }

  setPageIndex(newPageIndex);
  setLoading(true);

  try {
    if (isVectorSearch) {
      const vectorSearchResult = await vectorSearchFn(
        entityType,
        channelId,
        searchQuery,
      );

      // Calculate slice indices for pagination
      const startIndex = newPageIndex * pageSize;
      const endIndex = Math.min(
        startIndex + pageSize,
        vectorSearchResult.length,
      );
      const pageIds = vectorSearchResult.slice(startIndex, endIndex);

      if (pageIds.length > 0) {
        // Using dynamic import for Firebase types
        const { onSnapshot, where } = await import("firebase/firestore");
        const { db } = await import("@konfi/firebase");

        const unsubscribe = onSnapshot(
          db.query<T>(firestore, collectionPath, pageSize, undefined, [
            where("id", "in", pageIds),
            ...additionalConstraints,
          ]),
          (querySnap) => {
            const results = querySnap.docs.map(mapDocToEntity);
            setResults(results);
            setLoading(false);
          },
          (error) => {
            console.error(error);
            onError?.(error);
            setLoading(false);
          },
        );

        return unsubscribe;
      } else {
        setResults(null);
        setLoading(false);
        return () => {};
      }
    } else {
      // Use meilisearch for regular search
      const searchResult = await meilisearchFn(
        entityType,
        searchQuery,
        channelId,
        newPageIndex,
        pageSize,
        searchFields,
      );

      const meilisearchResult = getMeilisearchResultIds(searchResult);

      if (meilisearchResult.length > 0) {
        // Using dynamic import for Firebase types
        const { onSnapshot, where } = await import("firebase/firestore");
        const { db } = await import("@konfi/firebase");

        const unsubscribe = onSnapshot(
          db.query<T>(
            firestore,
            collectionPath,
            pageSize,
            undefined,
            [
              where("active", "==", true),
              where("id", "in", meilisearchResult),
              ...additionalConstraints,
            ],
            undefined,
            undefined,
            true,
          ),
          (querySnap) => {
            const results = querySnap.docs.map(mapDocToEntity);
            setResults(results);
            setLoading(false);
          },
          (error) => {
            console.error(error);
            onError?.(error);
            setLoading(false);
          },
        );

        return unsubscribe;
      } else {
        setResults([]);
        setLoading(false);
        return () => {};
      }
    }
  } catch (error) {
    console.error(
      `Error fetching paginated ${entityType.toLowerCase()} search results:`,
      error,
    );
    onError?.(error as Error);
    setLoading(false);
    return () => {};
  }
}
