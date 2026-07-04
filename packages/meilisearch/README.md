# @konfi/meilisearch

A shared Meilisearch package for the Konfi monorepo, providing search functionality for both admin and store applications.

## Installation

This package is automatically included in the workspace. Add it to your app's dependencies:

```json
{
  "dependencies": {
    "@konfi/meilisearch": "workspace:1.0.0"
  }
}
```

## Usage

### Basic Setup

```typescript
import {
  searchCustomersIndex,
  searchOrdersIndex,
  searchProductsIndex,
  searchApp,
  createMeilisearchConfig,
} from "@konfi/meilisearch";

// Use default configuration (reads from environment variables)
const customers = await searchCustomersIndex("search query");

// Use custom configuration
const config = createMeilisearchConfig({
  host: "https://my-meilisearch.example.com",
  apiKey: "your-api-key",
  indexes: {
    customers: "custom-customers-index",
    orders: "custom-orders-index",
    products: "custom-products-index",
  },
});

const results = await searchCustomersIndex("search query", config);
```

### Available Functions

#### `searchCustomersIndex(query: string, config?: MeilisearchConfig): Promise<string[]>`

Search customers index and return Firestore document IDs.

#### `searchOrdersIndex(query: string, channelId: string, page?: number, hitsPerPage?: number, config?: MeilisearchConfig): Promise<PaginatedSearchResult>`

Search orders index with pagination and channel filtering.

#### `searchProductsIndex(query: string, channelId: string, config?: MeilisearchConfig): Promise<string[]>`

Search products index with channel filtering.

#### `searchApp(query: string, config?: MeilisearchConfig): Promise<AppSearchResult[]>`

Perform multi-index search across customers, orders, and products.

#### `genericSearch<T>(indexName: string, query: string, options?: SearchOptions, config?: MeilisearchConfig): Promise<T[]>`

Generic search function for custom indexes.

### Configuration

#### Environment Variables

- `MEILISEARCH_HOST` - Meilisearch server URL
- `MEILISEARCH_API_KEY` - API key for authentication

#### Custom Configuration

```typescript
interface MeilisearchConfig {
  host: string;
  apiKey?: string;
  indexes: {
    customers?: string;
    orders?: string;
    products?: string;
    [key: string]: string | undefined;
  };
  defaultSearchOptions?: SearchOptions;
}
```

## Types

The package exports all necessary TypeScript types:

- `MeilisearchConfig`
- `SearchOptions`
- `SearchResult<T>`
- `PaginatedSearchResult`
- `AppSearchResult`
- `MultiSearchQuery`
- `MultiSearchResult`

## Server Actions

All functions are server actions and must be used in server-side code or server components.

## Error Handling

The package includes comprehensive error handling and logging. Failed searches return empty arrays rather than throwing errors, ensuring application stability.

## Migration from Admin App

The package maintains backward compatibility with the existing admin app implementation. Simply update imports:

```typescript
// Old
import { searchApp } from "@/lib/meilisearch/indexes";

// New
import { searchApp } from "@konfi/meilisearch";
```
