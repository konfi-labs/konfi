// Export main client
export {
  createFakturowniaClient,
  type FakturowniaClient,
} from "./client/fakturowniaClient.js";

// Export error types and selected models for type-safe usage
export type {
  FakturowniaGusLookupRequest,
  FakturowniaGusLookupResponse,
  FakturowniaGusLookupResult,
  Invoice,
  InvoicePosition,
  NotFoundErrorResponse,
  UnauthorizedErrorResponse,
  ValidationErrorResponse,
} from "./client/models/index.js";

// Re-export Kiota dependencies that consumers will need
export {
  ApiKeyAuthenticationProvider,
  ApiKeyLocation,
} from "@microsoft/kiota-abstractions";
export { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
