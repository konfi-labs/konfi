"use server";

import { Meilisearch } from "meilisearch";
import { validateConfig } from "./config";
import { MeilisearchConfig } from "./types";

let client: Meilisearch | null = null;
let currentConfig: MeilisearchConfig | null = null;

export async function getClient(
  config?: MeilisearchConfig,
): Promise<Meilisearch | null> {
  if (
    client === null ||
    (config &&
      (!currentConfig ||
        JSON.stringify(config) !== JSON.stringify(currentConfig)))
  ) {
    await initClient(config);
  }
  if (client === null) {
    console.error("MeiliSearch client is not initialized.");
    return null;
  }
  return client;
}

async function initClient(
  config?: MeilisearchConfig,
): Promise<Meilisearch | null> {
  if (config) {
    currentConfig = config;
  } else if (!currentConfig) {
    // Use environment variables as fallback
    const envHost = process.env.MEILISEARCH_HOST;
    const envApiKey = process.env.MEILISEARCH_API_KEY;

    if (!envHost) {
      console.error("MeiliSearch host is not defined.");
      return null;
    }

    currentConfig = {
      host: envHost,
      apiKey: envApiKey,
      indexes: {
        customers: "customers",
        orders: "orders",
        products: "products",
      },
    };
  }

  if (!validateConfig(currentConfig)) {
    return null;
  }

  try {
    client = new Meilisearch({
      host: currentConfig.host,
      apiKey: currentConfig.apiKey,
    });
    return client;
  } catch (error) {
    console.error("Failed to initialize MeiliSearch client:", error);
    return null;
  }
}

export async function resetClient(): Promise<void> {
  client = null;
  currentConfig = null;
}
