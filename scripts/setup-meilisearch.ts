interface Settings {
  displayedAttributes: string[];
  searchableAttributes: string[];
  filterableAttributes: string[];
  sortableAttributes: string[];
  rankingRules: string[];
  stopWords: string[];
  nonSeparatorTokens: string[];
  separatorTokens: string[];
  dictionary: string[];
  synonyms: Record<string, string[]>;
  distinctAttribute: string | null;
  proximityPrecision: string;
  typoTolerance: {
    enabled: boolean;
    minWordSizeForTypos: { oneTypo: number; twoTypos: number };
    disableOnWords: string[];
    disableOnAttributes: string[];
  };
  faceting: {
    maxValuesPerFacet: number;
    sortFacetValuesBy: Record<string, string>;
  };
  pagination: { maxTotalHits: number };
  embedders: Record<string, unknown>;
  searchCutoffMs: number | null;
  localizedAttributes: unknown;
  facetSearch: boolean;
  prefixSearch: string;
}

interface MeilisearchTaskResponse {
  taskUid?: number;
}

const host = process.env.MEILISEARCH_HOST?.trim().replace(/\/+$/, "") ?? "";
const apiKey = process.env.MEILISEARCH_API_KEY?.trim() ?? "";

if (!host || !apiKey) {
  throw new Error("Missing MEILISEARCH_HOST or MEILISEARCH_API_KEY");
}

console.log(
  `Configuring Meilisearch indexes at ${host} with API key length ${apiKey.length}.`,
);

const base: Omit<Settings, "filterableAttributes" | "rankingRules"> = {
  displayedAttributes: ["*"],
  searchableAttributes: ["*"],
  stopWords: [],
  nonSeparatorTokens: [],
  separatorTokens: [],
  dictionary: [],
  synonyms: {},
  distinctAttribute: null,
  proximityPrecision: "byWord",
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 3, twoTypos: 7 },
    disableOnWords: [],
    disableOnAttributes: [],
  },
  faceting: { maxValuesPerFacet: 100, sortFacetValuesBy: { "*": "alpha" } },
  pagination: { maxTotalHits: 1000 },
  embedders: {},
  searchCutoffMs: null,
  localizedAttributes: null,
  facetSearch: true,
  prefixSearch: "indexingTime",
  sortableAttributes: [],
};

const settings: Record<string, Settings> = {
  orders: {
    ...base,
    filterableAttributes: ["channelId", "tenantId"],
    rankingRules: [
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness",
      "createdAt._seconds:desc",
    ],
    sortableAttributes: [],
  },
  customers: {
    ...base,
    filterableAttributes: ["tenantId"],
    rankingRules: [
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness",
    ],
  },
  products: {
    ...base,
    filterableAttributes: ["channelId", "recommended", "tenantId"],
    rankingRules: [
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness",
    ],
  },
};

async function update(
  index: string,
  body: Settings,
): Promise<MeilisearchTaskResponse> {
  const res = await fetch(
    `${host}/indexes/${encodeURIComponent(index)}/settings`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      redirect: "manual",
    },
  );
  if (!res.ok) {
    const location = res.headers.get("location");
    const redirectHint = location ? ` Redirect location: ${location}` : "";
    throw new Error(
      `${index} -> ${res.status} ${await res.text()}${redirectHint}`,
    );
  }
  return (await res.json()) as MeilisearchTaskResponse;
}

(async () => {
  for (const [idx, payload] of Object.entries(settings)) {
    process.stdout.write(`Updating ${idx} ... `);
    try {
      const r = await update(idx, payload);
      console.log("OK (taskUid:", r.taskUid ?? "n/a", ")");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("FAILED:", message);
      process.exitCode = 1;
    }
  }
})();
