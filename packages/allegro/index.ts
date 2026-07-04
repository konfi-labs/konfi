// Export main client
export { createAllegroClient, type AllegroClient } from "./client/allegroClient.js";

// Re-export Kiota dependencies that consumers will need
export { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
export { AnonymousAuthenticationProvider } from "@microsoft/kiota-abstractions";
