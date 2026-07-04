import { describe, expect, it } from "vitest";
import { assertAgentRunTenantAccess } from "./agent-run-tenant-access";

describe("agent run tenant access", () => {
  it("authorizes an owned run id", () => {
    expect(() =>
      assertAgentRunTenantAccess(
        {
          runId: "run-owned",
          tenantId: "tenant-a",
        },
        "tenant-a",
      ),
    ).not.toThrow();
  });

  it("rejects a foreign run id before callers can mutate it", () => {
    expect(() =>
      assertAgentRunTenantAccess(
        {
          runId: "run-foreign",
          tenantId: "tenant-b",
        },
        "tenant-a",
      ),
    ).toThrow(
      expect.objectContaining({
        message: "Tenant agent run access is required",
        statusCode: 403,
      }),
    );
  });
});
