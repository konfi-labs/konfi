// Export main client
export { createEpakaClient, type EpakaClient } from "./client/epakaClient.js";

// Export error types and selected models for type-safe usage

// Re-export Kiota dependencies that consumers will need
export {
  ApiKeyAuthenticationProvider,
  ApiKeyLocation,
} from "@microsoft/kiota-abstractions";
