import { MeilisearchConfig } from "./types";

export function createMeilisearchConfig(
  overrides: Partial<MeilisearchConfig> = {},
): MeilisearchConfig {
  const defaultConfig: MeilisearchConfig = {
    host: process.env.MEILISEARCH_HOST || "",
    apiKey: process.env.MEILISEARCH_API_KEY,
    indexes: {
      customers: "customers",
      orders: "orders",
      products: "products",
    },
    defaultSearchOptions: {
      attributesToRetrieve: ["_firestore_id"],
    },
  };

  return {
    ...defaultConfig,
    ...overrides,
    indexes: {
      ...defaultConfig.indexes,
      ...overrides.indexes,
    },
    defaultSearchOptions: {
      ...defaultConfig.defaultSearchOptions,
      ...overrides.defaultSearchOptions,
    },
  };
}

export function validateConfig(config: MeilisearchConfig): boolean {
  if (!config.host) {
    console.error("MeiliSearch host is not defined.");
    return false;
  }
  return true;
}
