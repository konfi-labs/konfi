import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeProductionCooperationAppApiRequest } from "./app-api-auth";
import { ProductionCooperationError } from "./types";

vi.mock("server-only", () => ({}));

describe("authorizeProductionCooperationAppApiRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the configured bearer secret", () => {
    vi.stubEnv("PRODUCTION_COOPERATION_APP_API_SECRET", "direct-secret");

    expect(() =>
      authorizeProductionCooperationAppApiRequest(
        new Request("https://admin.example.com/api/production-cooperation", {
          headers: {
            authorization: "Bearer direct-secret",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects missing or invalid bearer secrets", () => {
    vi.stubEnv("PRODUCTION_COOPERATION_APP_API_SECRET", "direct-secret");

    expect(() =>
      authorizeProductionCooperationAppApiRequest(
        new Request("https://admin.example.com/api/production-cooperation", {
          headers: {
            authorization: "Bearer wrong-secret",
          },
        }),
      ),
    ).toThrow(ProductionCooperationError);
  });
});
